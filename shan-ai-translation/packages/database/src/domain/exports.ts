import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  type DatasetSplitName,
  assignSplits,
  clusterKeys,
  escapeFormulaPrefix,
} from '@sat/contracts';
import ExcelJS from 'exceljs';
import { AppError } from '../errors';
import type { ObjectStorage } from '../storage';
import { audit } from './shared';

export interface ExportFilters {
  format: 'jsonl' | 'csv' | 'tsv' | 'xlsx';
  categoryId?: string;
  taskType?: 'sentence' | 'page';
  approvedFrom?: string;
  approvedTo?: string;
  split?: boolean;
}

const COLUMNS = [
  'task_id',
  'revision_id',
  'task_type',
  'english',
  'shan',
  'guide_version',
  'provenance',
  'permission',
  'contributor_id',
  'split',
] as const;

type ExportRow = Record<(typeof COLUMNS)[number], string>;

function csvEscape(value: string, delimiter: string): string {
  const safe = escapeFormulaPrefix(value);
  if (
    safe.includes('"') ||
    safe.includes('\n') ||
    safe.includes('\r') ||
    safe.includes(delimiter)
  ) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

export async function enqueueExport(db: PrismaClient, adminId: string, filters: ExportFilters) {
  const version = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
  const release = await db.$transaction(async (tx) => {
    const created = await tx.datasetRelease.create({
      data: {
        version,
        format: filters.format,
        filters: filters as unknown as Prisma.InputJsonValue,
        split: filters.split !== false,
        status: 'queued',
        createdById: adminId,
      },
    });
    await tx.outboxJob.create({
      data: { type: 'export.build', payload: { releaseId: created.id } },
    });
    await audit(tx, {
      actorId: adminId,
      action: 'export.enqueue',
      resourceType: 'dataset_release',
      resourceId: created.id,
      changes: { format: filters.format },
    });
    return created;
  });
  return { id: release.id, status: release.status };
}

export async function buildExport(db: PrismaClient, storage: ObjectStorage, releaseId: string) {
  const release = await db.datasetRelease.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'NOT_FOUND', 'Export not found');
  if (release.status === 'ready') return release;
  await db.datasetRelease.update({
    where: { id: release.id },
    data: { status: 'running', error: null },
  });
  try {
    await db.datasetItem.deleteMany({ where: { releaseId: release.id } });
    const filters = release.filters as unknown as ExportFilters;
    const earnings = await db.earningEntry.findMany({
      where: {
        approvalDate: {
          gte: filters.approvedFrom ? new Date(filters.approvedFrom) : undefined,
          lte: filters.approvedTo ? new Date(filters.approvedTo) : undefined,
        },
        task: {
          status: 'approved',
          excludedFromDataset: false,
          categoryId: filters.categoryId,
          type: filters.taskType,
        },
      },
      include: {
        contributor: true,
        task: { include: { document: true, batch: true } },
        revision: { include: { assignment: { include: { guideVersion: true } } } },
      },
    });
    const members = earnings.map((earning) => ({
      id: earning.taskId,
      documentId: earning.task.documentId,
      sourceHash: earning.task.sourceHash,
    }));
    const clusters = clusterKeys(members);
    const splits = assignSplits(release.id, members, release.split);
    const rows: ExportRow[] = [];
    for (const earning of earnings) {
      const split = (splits.get(earning.taskId) ?? 'na') as DatasetSplitName;
      const provenance =
        earning.task.provenanceOverride ||
        earning.task.document?.provenance ||
        earning.task.batch?.provenance ||
        '';
      const permission =
        earning.task.permissionOverride ||
        earning.task.document?.permissionRef ||
        earning.task.batch?.permissionRef ||
        '';
      const row: ExportRow = {
        task_id: earning.taskId,
        revision_id: earning.revisionId,
        task_type: earning.task.type,
        english: earning.task.englishText,
        shan: earning.revision.shanText,
        guide_version: earning.revision.assignment.guideVersion.version,
        provenance,
        permission,
        contributor_id: earning.contributor.pseudonym,
        split,
      };
      rows.push(row);
      await db.datasetItem.create({
        data: {
          releaseId: release.id,
          taskId: earning.taskId,
          revisionId: earning.revisionId,
          split,
          clusterKey: clusters.get(earning.taskId) ?? earning.taskId,
          metadata: {
            taskType: earning.task.type,
            guideVersion: row.guide_version,
            provenance,
            permission,
            contributorId: earning.contributor.pseudonym,
          },
        },
      });
    }
    const body = await render(filters.format, rows);
    const checksum = createHash('sha256').update(body).digest('hex');
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.split] = (acc[row.split] ?? 0) + 1;
      acc.total = (acc.total ?? 0) + 1;
      return acc;
    }, {});
    const card = datasetCard(release.version, filters, counts);
    const cardBytes = Buffer.from(card, 'utf8');
    const manifest = {
      version: release.version,
      releaseId: release.id,
      format: filters.format,
      counts,
      checksums: {
        data: checksum,
        card: createHash('sha256').update(cardBytes).digest('hex'),
      },
      createdAt: new Date().toISOString(),
      filters,
      note: 'Paragraph breaks are preserved. They are not sentence-level alignments.',
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const base = `exports/${release.id}`;
    const dataKey = `${base}/data.${filters.format === 'xlsx' ? 'xlsx' : filters.format}`;
    const manifestKey = `${base}/manifest.json`;
    const cardKey = `${base}/dataset-card.md`;
    await storage.put(dataKey, body, contentType(filters.format));
    await storage.put(manifestKey, manifestBytes, 'application/json');
    await storage.put(cardKey, cardBytes, 'text/markdown');
    const asset = await db.fileAsset.create({
      data: {
        objectKey: dataKey,
        checksum,
        sizeBytes: body.length,
        contentType: contentType(filters.format),
      },
    });
    return db.datasetRelease.update({
      where: { id: release.id },
      data: {
        status: 'ready',
        fileAssetId: asset.id,
        metadata: {
          ...manifest,
          files: { data: dataKey, manifest: manifestKey, card: cardKey },
          datasetCard: card,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    await db.datasetRelease.update({
      where: { id: release.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 500) : 'failed',
      },
    });
    throw error;
  }
}

function contentType(format: ExportFilters['format']): string {
  if (format === 'jsonl') return 'application/jsonl';
  if (format === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (format === 'tsv') return 'text/tab-separated-values';
  return 'text/csv';
}

async function render(format: ExportFilters['format'], rows: ExportRow[]): Promise<Buffer> {
  if (format === 'jsonl') {
    return Buffer.from(
      `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`,
      'utf8',
    );
  }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('dataset');
    sheet.addRow([...COLUMNS]);
    for (const row of rows) sheet.addRow(COLUMNS.map((column) => escapeFormulaPrefix(row[column])));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const delimiter = format === 'tsv' ? '\t' : ',';
  const lines = [COLUMNS.join(delimiter)];
  for (const row of rows)
    lines.push(COLUMNS.map((column) => csvEscape(row[column], delimiter)).join(delimiter));
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function datasetCard(
  version: string,
  filters: ExportFilters,
  counts: Record<string, number>,
): string {
  return [
    `# Shan parallel dataset ${version}`,
    '',
    'English source text paired with reviewed Shan translations.',
    'Paragraph breaks are preserved. A page pair is not sentence-aligned.',
    '',
    'Personal contact details, email addresses, and payment records are excluded.',
    'Contributor ids are pseudonyms.',
    '',
    'License and source permissions must be confirmed from the release metadata before redistribution.',
    'Replace this note with the project dataset license before a public release.',
    '',
    `- Format: ${filters.format}`,
    `- Split: ${JSON.stringify(counts)}`,
    `- Filters: ${JSON.stringify(filters)}`,
    '',
  ].join('\n');
}
