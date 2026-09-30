import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  MAX_IMPORT_ROWS,
  canonicalSource,
  countEnglishWords,
  isPageWordCountValid,
  looksLikeFormulaCell,
  sourceHash,
} from '@sat/contracts';
import ExcelJS from 'exceljs';
import { AppError } from '../errors';
import type { ObjectStorage } from '../storage';
import { audit, isUnique } from './shared';

export interface ColumnMapping {
  externalId: string;
  sourceText: string;
  context?: string;
  documentId?: string;
  topic?: string;
  sourceReference?: string;
}

function cellText(cell: ExcelJS.Cell): { text: string; formula: string | null } {
  const value = cell.value;
  if (value && typeof value === 'object' && 'formula' in value) {
    const formula = String((value as { formula?: string }).formula ?? '');
    const result = 'result' in value ? String((value as { result?: unknown }).result ?? '') : '';
    return { text: result, formula };
  }
  if (value instanceof Date) return { text: value.toISOString(), formula: null };
  return { text: cell.text ?? '', formula: null };
}

function headerIndex(headers: string[], name?: string): number {
  if (!name) return -1;
  const wanted = name.trim().toLowerCase();
  return headers.findIndex((header) => header?.trim().toLowerCase() === wanted);
}

export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('sources');
  sheet.addRow([
    'external_id',
    'source_text',
    'context',
    'document_id',
    'topic',
    'source_reference',
  ]);
  sheet.addRow(['sent-1', 'The river is wide.', 'Example context', 'doc-1', 'nature', '']);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function createImportBatch(
  db: PrismaClient,
  storage: ObjectStorage,
  input: {
    adminId: string;
    categoryId: string;
    taskType: 'sentence' | 'page';
    provenance: string;
    permissionRef: string;
    filename: string;
    bytes: Buffer;
  },
) {
  if (input.bytes.length > 10 * 1024 * 1024) {
    throw new AppError(422, 'FILE_TOO_LARGE', 'Imports are limited to 10 MB');
  }
  const category = await db.category.findUnique({ where: { id: input.categoryId } });
  if (!category || category.status === 'archived') {
    throw new AppError(404, 'NOT_FOUND', 'Category not found');
  }
  const checksum = createHash('sha256').update(input.bytes).digest('hex');
  const key = `imports/${checksum}-${Date.now()}.xlsx`;
  await storage.put(
    key,
    input.bytes,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  return db.$transaction(async (tx) => {
    const asset = await tx.fileAsset.create({
      data: {
        objectKey: key,
        checksum,
        sizeBytes: input.bytes.length,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
    const batch = await tx.importBatch.create({
      data: {
        categoryId: input.categoryId,
        fileAssetId: asset.id,
        taskType: input.taskType,
        provenance: input.provenance,
        permissionRef: input.permissionRef,
        createdById: input.adminId,
        status: 'uploaded',
      },
    });
    await audit(tx, {
      actorId: input.adminId,
      action: 'import.upload',
      resourceType: 'import_batch',
      resourceId: batch.id,
      changes: {
        taskType: input.taskType,
        categoryId: input.categoryId,
        bytes: input.bytes.length,
      },
    });
    return { id: batch.id, status: batch.status };
  });
}

export async function listSheets(storage: ObjectStorage, objectKey: string) {
  const bytes = await storage.get(objectKey);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return workbook.worksheets.map((sheet) => sheet.name);
}

export async function validateImport(
  db: PrismaClient,
  storage: ObjectStorage,
  input: { batchId: string; adminId: string; sheet: string; mapping: ColumnMapping },
) {
  const batch = await db.importBatch.findUnique({
    where: { id: input.batchId },
    include: { fileAsset: true, category: true },
  });
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Import not found');
  if (batch.status === 'committed' || batch.status === 'committing') {
    throw new AppError(409, 'INVALID_TRANSITION', 'This import can no longer be revalidated');
  }
  const bytes = await storage.get(batch.fileAsset.objectKey);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet(input.sheet);
  if (!sheet) throw new AppError(422, 'SHEET_MISSING', 'That sheet was not found in the workbook');
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, index) => {
    headers[index] = cellText(cell).text;
  });
  const columns = {
    externalId: headerIndex(headers, input.mapping.externalId),
    sourceText: headerIndex(headers, input.mapping.sourceText),
    context: headerIndex(headers, input.mapping.context),
    documentId: headerIndex(headers, input.mapping.documentId),
    topic: headerIndex(headers, input.mapping.topic),
    sourceReference: headerIndex(headers, input.mapping.sourceReference),
  };
  if (columns.externalId < 1 || columns.sourceText < 1) {
    throw new AppError(422, 'MAPPING_INVALID', 'Map both external_id and source_text columns');
  }

  const seenIds = new Set<string>();
  const seenText = new Set<string>();
  const rows: {
    rowNumber: number;
    externalId: string;
    sourceText: string;
    context: string | null;
    documentKey: string | null;
    topic: string | null;
    sourceReference: string | null;
    validationStatus: string;
    messages: string[];
  }[] = [];

  let dataRows = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    dataRows += 1;
    if (dataRows > MAX_IMPORT_ROWS) return;
    const read = (index: number) =>
      index > 0 ? cellText(row.getCell(index)) : { text: '', formula: null };
    const external = read(columns.externalId);
    const source = read(columns.sourceText);
    const messages: string[] = [];
    let status = 'valid';
    if (looksLikeFormulaCell(external) || looksLikeFormulaCell(source)) {
      status = 'error';
      messages.push('Cells must contain literal text, not formulas');
    }
    const externalId = external.text.trim();
    const sourceText = canonicalSource(source.text);
    if (!externalId) {
      status = 'error';
      messages.push('external_id is required');
    }
    if (!sourceText) {
      status = 'error';
      messages.push('source_text is required');
    }
    if (externalId && seenIds.has(externalId)) {
      status = 'error';
      messages.push('Duplicate external_id in this file');
    }
    if (externalId) seenIds.add(externalId);
    const hash = sourceText ? sourceHash(sourceText) : '';
    if (sourceText && seenText.has(hash)) {
      status = 'skipped';
      messages.push('Duplicate source text in this file');
    }
    if (hash) seenText.add(hash);
    const words = countEnglishWords(sourceText);
    if (status !== 'error' && batch.taskType === 'page' && !isPageWordCountValid(words)) {
      status = 'error';
      messages.push(`Page must be 250–500 words (found ${words})`);
    }
    if (status !== 'error' && batch.taskType === 'sentence' && words < 1) {
      status = 'error';
      messages.push('Sentence is empty');
    }
    rows.push({
      rowNumber,
      externalId,
      sourceText,
      context: columns.context > 0 ? canonicalSource(read(columns.context).text) || null : null,
      documentKey: columns.documentId > 0 ? read(columns.documentId).text.trim() || null : null,
      topic: columns.topic > 0 ? read(columns.topic).text.trim() || null : null,
      sourceReference:
        columns.sourceReference > 0 ? read(columns.sourceReference).text.trim() || null : null,
      validationStatus: status,
      messages,
    });
  });

  if (dataRows > MAX_IMPORT_ROWS) {
    throw new AppError(422, 'TOO_MANY_ROWS', `Imports are limited to ${MAX_IMPORT_ROWS} rows`);
  }

  const existingTasks = await db.task.findMany({
    where: {
      OR: [
        {
          categoryId: batch.categoryId,
          externalId: { in: rows.map((row) => row.externalId).filter(Boolean) },
        },
        {
          sourceHash: {
            in: rows.map((row) => sourceHash(row.sourceText)).filter((hash) => hash.length === 64),
          },
        },
      ],
    },
    select: { categoryId: true, externalId: true, sourceHash: true },
  });
  const externalInCategory = new Set(
    existingTasks
      .filter((task) => task.categoryId === batch.categoryId)
      .map((task) => task.externalId),
  );
  const hashInCategory = new Set(
    existingTasks
      .filter((task) => task.categoryId === batch.categoryId)
      .map((task) => task.sourceHash),
  );
  const hashElsewhere = new Set(
    existingTasks
      .filter((task) => task.categoryId !== batch.categoryId)
      .map((task) => task.sourceHash),
  );

  for (const row of rows) {
    if (!row.sourceText || row.validationStatus === 'error') continue;
    const hash = sourceHash(row.sourceText);
    if (externalInCategory.has(row.externalId)) {
      row.validationStatus = 'error';
      row.messages.push('external_id already exists in this category');
    } else if (hashInCategory.has(hash)) {
      row.validationStatus = 'skipped';
      row.messages.push('Exact duplicate source text in this category will be skipped');
    } else if (hashElsewhere.has(hash) && row.validationStatus === 'valid') {
      row.validationStatus = 'warning';
      row.messages.push('Same source text exists in another category and will be linked by hash');
    }
  }

  await db.$transaction(async (tx) => {
    await tx.importRow.deleteMany({ where: { batchId: batch.id } });
    for (let i = 0; i < rows.length; i += 500) {
      await tx.importRow.createMany({
        data: rows
          .slice(i, i + 500)
          .map((row) => ({ ...row, batchId: batch.id, messages: row.messages })),
      });
    }
    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: 'validated',
        sheetName: input.sheet,
        columnMapping: input.mapping as unknown as Prisma.InputJsonValue,
      },
    });
    await audit(tx, {
      actorId: input.adminId,
      action: 'import.validate',
      resourceType: 'import_batch',
      resourceId: batch.id,
      changes: {
        rows: rows.length,
        errors: rows.filter((row) => row.validationStatus === 'error').length,
        skipped: rows.filter((row) => row.validationStatus === 'skipped').length,
      },
    });
  });

  return summarize(rows);
}

function summarize(rows: { validationStatus: string }[]) {
  return {
    rows: rows.length,
    valid: rows.filter((row) => row.validationStatus === 'valid').length,
    warnings: rows.filter((row) => row.validationStatus === 'warning').length,
    errors: rows.filter((row) => row.validationStatus === 'error').length,
    skipped: rows.filter((row) => row.validationStatus === 'skipped').length,
  };
}

export async function commitImport(db: PrismaClient, batchId: string) {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Import not found');
  if (batch.status === 'committed') return { created: 0, already: true };
  if (batch.status !== 'validated' && batch.status !== 'committing' && batch.status !== 'failed') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Validate the import before committing');
  }
  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: 'committing', errorSummary: null },
  });
  const importRows = await db.importRow.findMany({
    where: { batchId: batch.id, validationStatus: { in: ['valid', 'warning'] } },
    orderBy: { rowNumber: 'asc' },
  });
  let created = 0;
  try {
    for (const row of importRows) {
      const text = canonicalSource(row.sourceText);
      const hash = sourceHash(text);
      let documentId: string | null = null;
      if (row.documentKey) {
        const document = await db.sourceDocument.upsert({
          where: {
            categoryId_externalKey: { categoryId: batch.categoryId, externalKey: row.documentKey },
          },
          update: {},
          create: {
            categoryId: batch.categoryId,
            externalKey: row.documentKey,
            title: row.documentKey,
            provenance: row.sourceReference || batch.provenance,
            permissionRef: row.sourceReference || batch.permissionRef,
          },
        });
        documentId = document.id;
      }
      try {
        await db.task.create({
          data: {
            categoryId: batch.categoryId,
            batchId: batch.id,
            documentId,
            externalId: row.externalId,
            type: batch.taskType,
            englishText: text,
            context: row.context,
            topic: row.topic,
            wordCount: countEnglishWords(text),
            sourceHash: hash,
            provenanceOverride: row.sourceReference,
            permissionOverride: row.sourceReference,
            status: 'available',
          },
        });
        created += 1;
      } catch (error) {
        if (!isUnique(error)) throw error;
      }
    }
    await db.importBatch.update({ where: { id: batch.id }, data: { status: 'committed' } });
    return { created, already: false };
  } catch (error) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: 'failed',
        errorSummary: error instanceof Error ? error.message.slice(0, 500) : 'failed',
      },
    });
    throw error;
  }
}

export async function enqueueImport(db: PrismaClient, adminId: string, batchId: string) {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Import not found');
  if (batch.status !== 'validated' && batch.status !== 'failed') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Validate the import before committing');
  }
  const job = await db.$transaction(async (tx) => {
    const created = await tx.outboxJob.create({
      data: { type: 'import.commit', payload: { batchId } },
    });
    await audit(tx, {
      actorId: adminId,
      action: 'import.commit.enqueue',
      resourceType: 'import_batch',
      resourceId: batchId,
      changes: { jobId: created.id },
    });
    return created;
  });
  return { jobId: job.id, status: 'queued' as const };
}
