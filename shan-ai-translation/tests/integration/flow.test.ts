import { randomUUID } from 'node:crypto';
import { sourceHash } from '@sat/contracts';
import {
  actOnTask,
  adjustEarning,
  buildExport,
  claimAssignment,
  commitImport,
  confirmBulkReview,
  confirmPayout,
  createCategory,
  createImportBatch,
  createReport,
  createStorage,
  decideReview,
  drainOutbox,
  enqueueImport,
  expireReservations,
  flagOverduePayouts,
  getOwnTranslation,
  hashPassword,
  preparePayouts,
  previewBulkReview,
  prisma,
  saveDraft,
  skipAssignment,
  submitAssignment,
  updateCategory,
  validateImport,
} from '@sat/database';
import ExcelJS from 'exceljs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const storage = createStorage();

async function reset() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      dataset_items, dataset_releases, payment_records, payout_items, payouts, payout_periods,
      earning_adjustments, earning_entries, review_decisions, translation_revisions, drafts,
      assignments, reports, tasks, source_documents, import_rows, import_batches, file_assets,
      categories, rate_rules, terms_acceptances, terms_versions, guide_versions,
      audit_events, idempotency_records, outbox_jobs, profiles, users
    RESTART IDENTITY CASCADE
  `);
  await prisma.guideVersion.create({
    data: { version: 'guide-1', title: 'Guide', content: 'Translate faithfully.', isCurrent: true },
  });
  await prisma.termsVersion.create({
    data: { version: 'terms-1', title: 'Terms', content: 'Be accurate.', isCurrent: true },
  });
  await prisma.rateRule.createMany({
    data: [
      { taskType: 'sentence', amountSatang: 500, effectiveAt: new Date('2020-01-01T00:00:00Z') },
      { taskType: 'page', amountSatang: 25000, effectiveAt: new Date('2020-01-01T00:00:00Z') },
    ],
  });
}

async function user(
  role: 'contributor' | 'admin' = 'contributor',
  email = `${randomUUID()}@example.com`,
) {
  const created = await prisma.user.create({
    data: {
      email,
      displayName: role === 'admin' ? 'Admin' : 'Nang',
      role,
      authSubject: `local:${randomUUID()}`,
      passwordHash: await hashPassword('password1234'),
      emailVerifiedAt: new Date(),
      profile: { create: { contactValue: 'secret-phone', contactMethod: 'phone' } },
    },
  });
  const terms = await prisma.termsVersion.findFirstOrThrow({ where: { isCurrent: true } });
  await prisma.termsAcceptance.create({ data: { userId: created.id, versionId: terms.id } });
  return created;
}

async function category(name = 'Stories') {
  const admin = await user('admin');
  return { admin, category: await createCategory(prisma, admin.id, { name, description: '' }) };
}

async function task(
  categoryId: string,
  text = 'The river is wide.',
  type: 'sentence' | 'page' = 'sentence',
) {
  return prisma.task.create({
    data: {
      categoryId,
      externalId: randomUUID(),
      type,
      englishText: text,
      wordCount: text.split(/\s+/).length,
      sourceHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      status: 'available',
    },
  });
}

async function workbook(rows: string[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('sources');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

beforeEach(reset);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('assignment locking', () => {
  it('does not reserve one task for two contributors', async () => {
    const { category: cat } = await category();
    await task(cat.id);
    const a = await user();
    const b = await user();
    const results = await Promise.allSettled([
      claimAssignment(prisma, {
        contributorId: a.id,
        taskType: 'sentence',
        idempotencyKey: randomUUID(),
      }),
      claimAssignment(prisma, {
        contributorId: b.id,
        taskType: 'sentence',
        idempotencyKey: randomUUID(),
      }),
    ]);
    const ok = results.filter((result) => result.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    const open = await prisma.assignment.count({ where: { status: 'active' } });
    expect(open).toBe(1);
  });

  it('returns the current assignment instead of taking a second task', async () => {
    const { category: cat } = await category();
    await task(cat.id, 'One.');
    await task(cat.id, 'Two.');
    const contributor = await user();
    const first = await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    const second = await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    expect(second.assignmentId).toBe(first.assignmentId);
    expect(
      await prisma.assignment.count({ where: { contributorId: contributor.id, status: 'active' } }),
    ).toBe(1);
  });

  it('blocks submit after skip or expiry', async () => {
    const { category: cat } = await category();
    await task(cat.id);
    const contributor = await user();
    const claimed = await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    await saveDraft(prisma, {
      contributorId: contributor.id,
      assignmentId: claimed.assignmentId,
      shanText: 'တီႈ',
      expectedVersion: 1,
    });
    await skipAssignment(prisma, contributor.id, claimed.assignmentId);
    await expect(
      submitAssignment(prisma, {
        contributorId: contributor.id,
        assignmentId: claimed.assignmentId,
        expectedDraftVersion: 2,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    await task(cat.id, 'Another sentence.');
    const again = await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    await prisma.assignment.update({
      where: { id: again.assignmentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      submitAssignment(prisma, {
        contributorId: contributor.id,
        assignmentId: again.assignmentId,
        expectedDraftVersion: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_EXPIRED' });
    expect((await expireReservations(prisma)).expired).toBe(1);
    const expired = await prisma.assignment.findUniqueOrThrow({
      where: { id: again.assignmentId },
    });
    expect(expired.status).toBe('expired');
  });

  it('keeps both copies when a draft version conflicts', async () => {
    const { category: cat } = await category();
    await task(cat.id);
    const contributor = await user();
    const claimed = await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    await saveDraft(prisma, {
      contributorId: contributor.id,
      assignmentId: claimed.assignmentId,
      shanText: 'server',
      expectedVersion: 1,
    });
    await expect(
      saveDraft(prisma, {
        contributorId: contributor.id,
        assignmentId: claimed.assignmentId,
        shanText: 'local recovery',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: 'DRAFT_CONFLICT',
      details: { rejectedText: 'local recovery' },
    });
    const draft = await prisma.draft.findUniqueOrThrow({
      where: { assignmentId: claimed.assignmentId },
    });
    expect(draft.shanText).toBe('server');
  });
});

describe('review and earnings', () => {
  async function submitted() {
    const { admin, category: cat } = await category();
    await task(cat.id);
    const contributor = await user();
    const claimed = await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    await saveDraft(prisma, {
      contributorId: contributor.id,
      assignmentId: claimed.assignmentId,
      shanText: '  ၵူၼ်း e\u0301  ',
      expectedVersion: 1,
    });
    const submission = await submitAssignment(prisma, {
      contributorId: contributor.id,
      assignmentId: claimed.assignmentId,
      expectedDraftVersion: 2,
      idempotencyKey: randomUUID(),
    });
    return { admin, contributor, claimed, submission };
  }

  it('approves once and stores the exact Shan text', async () => {
    const { admin, contributor, submission } = await submitted();
    const key = randomUUID();
    const decision = await decideReview(prisma, {
      adminId: admin.id,
      revisionId: submission.revisionId,
      decision: 'approve',
      idempotencyKey: key,
    });
    const replay = await decideReview(prisma, {
      adminId: admin.id,
      revisionId: submission.revisionId,
      decision: 'approve',
      idempotencyKey: key,
    });
    expect(replay).toEqual(decision);
    expect(await prisma.earningEntry.count()).toBe(1);
    expect(await prisma.translationRevision.count()).toBe(1);
    const revision = await prisma.translationRevision.findUniqueOrThrow({
      where: { id: submission.revisionId },
    });
    expect(revision.shanText).toBe('  ၵူၼ်း e\u0301  ');
    expect(revision.shanTextNormalized).not.toBe(revision.shanText);
    const earning = await prisma.earningEntry.findFirstOrThrow();
    expect(earning.amountSatang).toBe(500);
    expect(earning.contributorId).toBe(contributor.id);
  });

  it('rejects a second admin decision and keeps needs-edit with the translator', async () => {
    const { admin, contributor, claimed, submission } = await submitted();
    const otherAdmin = await user('admin');
    await decideReview(prisma, {
      adminId: admin.id,
      revisionId: submission.revisionId,
      decision: 'needs_edit',
      reason: 'Check the tone',
      idempotencyKey: randomUUID(),
    });
    await expect(
      decideReview(prisma, {
        adminId: otherAdmin.id,
        revisionId: submission.revisionId,
        decision: 'approve',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const assignment = await prisma.assignment.findUniqueOrThrow({
      where: { id: claimed.assignmentId },
    });
    expect(assignment.contributorId).toBe(contributor.id);
    expect(assignment.status).toBe('needs_edit');
    await expect(
      claimAssignment(prisma, {
        contributorId: contributor.id,
        taskType: 'sentence',
        idempotencyKey: randomUUID(),
      }),
    ).resolves.toMatchObject({ assignmentId: claimed.assignmentId });
  });

  it('stops an admin reviewing their own translation', async () => {
    const { category: cat } = await category();
    await task(cat.id);
    const admin = await user('admin');
    const claimed = await claimAssignment(prisma, {
      contributorId: admin.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    await saveDraft(prisma, {
      contributorId: admin.id,
      assignmentId: claimed.assignmentId,
      shanText: 'self',
      expectedVersion: 1,
    });
    const submission = await submitAssignment(prisma, {
      contributorId: admin.id,
      assignmentId: claimed.assignmentId,
      expectedDraftVersion: 2,
      idempotencyKey: randomUUID(),
    });
    await expect(
      decideReview(prisma, {
        adminId: admin.id,
        revisionId: submission.revisionId,
        decision: 'approve',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SELF_REVIEW' });
  });

  it('previews bulk earning impact and skips stale rows', async () => {
    const first = await submitted();
    const second = await submitted();
    const preview = await previewBulkReview(prisma, [
      first.submission.revisionId,
      second.submission.revisionId,
    ]);
    expect(preview.every((item) => item.earningSatang === 500 && item.stale === false)).toBe(true);
    await decideReview(prisma, {
      adminId: first.admin.id,
      revisionId: first.submission.revisionId,
      decision: 'approve',
      idempotencyKey: randomUUID(),
    });
    const result = await confirmBulkReview(
      prisma,
      second.admin.id,
      [
        { adminId: second.admin.id, revisionId: first.submission.revisionId, decision: 'approve' },
        { adminId: second.admin.id, revisionId: second.submission.revisionId, decision: 'approve' },
      ],
      randomUUID(),
    );
    expect(result.applied).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(await prisma.earningEntry.count()).toBe(2);
  });
});

describe('imports and categories', () => {
  it('flags invalid pages and duplicate source text, and commit is idempotent', async () => {
    const { admin, category: cat } = await category();
    const other = await createCategory(prisma, admin.id, { name: 'Other', description: '' });
    await prisma.task.create({
      data: {
        categoryId: other.id,
        externalId: 'elsewhere',
        type: 'sentence',
        englishText: 'Shared line.',
        wordCount: 2,
        sourceHash: sourceHash('Shared line.'),
        status: 'available',
      },
    });
    const bytes = await workbook([
      ['external_id', 'source_text', 'document_id'],
      ['s1', 'Hello world.', 'doc-1'],
      ['s1', 'A different sentence.', 'doc-1'],
      ['s2', 'Hello world.', 'doc-1'],
      ['s3', 'Shared line.', 'doc-2'],
      ['s4', '', ''],
    ]);
    const batch = await createImportBatch(prisma, storage, {
      adminId: admin.id,
      categoryId: cat.id,
      taskType: 'sentence',
      provenance: 'Author permission on file',
      permissionRef: 'PERM-1',
      filename: 'sources.xlsx',
      bytes,
    });
    const summary = await validateImport(prisma, storage, {
      batchId: batch.id,
      adminId: admin.id,
      sheet: 'sources',
      mapping: { externalId: 'external_id', sourceText: 'source_text', documentId: 'document_id' },
    });
    expect(summary.errors).toBeGreaterThan(0);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(summary.warnings).toBeGreaterThan(0);
    const shortPage = Array.from({ length: 249 }, () => 'word').join(' ');
    const pageBytes = await workbook([
      ['external_id', 'source_text'],
      ['p-short', shortPage],
      ['p-ok', `${shortPage} extra`],
    ]);
    const pageBatch = await createImportBatch(prisma, storage, {
      adminId: admin.id,
      categoryId: cat.id,
      taskType: 'page',
      provenance: 'Author permission on file',
      permissionRef: 'PERM-1',
      filename: 'pages.xlsx',
      bytes: pageBytes,
    });
    const pageSummary = await validateImport(prisma, storage, {
      batchId: pageBatch.id,
      adminId: admin.id,
      sheet: 'sources',
      mapping: { externalId: 'external_id', sourceText: 'source_text' },
    });
    expect(pageSummary.errors).toBe(1);
    expect(pageSummary.valid).toBe(1);
    const queued = await enqueueImport(prisma, admin.id, batch.id);
    expect(queued.status).toBe('queued');
    await drainOutbox(prisma, storage);
    const firstCount = await prisma.task.count({ where: { categoryId: cat.id } });
    await commitImport(prisma, batch.id);
    expect(await prisma.task.count({ where: { categoryId: cat.id } })).toBe(firstCount);
    expect(firstCount).toBe(2);

    await updateCategory(prisma, admin.id, cat.id, { status: 'paused' });
    await updateCategory(prisma, admin.id, other.id, { status: 'paused' });
    const contributor = await user();
    await expect(
      claimAssignment(prisma, {
        contributorId: contributor.id,
        taskType: 'sentence',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NO_TASK' });
  });

  it('lets an existing assignment finish after the category is paused', async () => {
    const { admin, category: cat } = await category();
    await task(cat.id);
    const contributor = await user();
    const claimed = await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    await updateCategory(prisma, admin.id, cat.id, { status: 'paused' });
    await saveDraft(prisma, {
      contributorId: contributor.id,
      assignmentId: claimed.assignmentId,
      shanText: 'done',
      expectedVersion: 1,
    });
    await expect(
      submitAssignment(prisma, {
        contributorId: contributor.id,
        assignmentId: claimed.assignmentId,
        expectedDraftVersion: 2,
        idempotencyKey: randomUUID(),
      }),
    ).resolves.toMatchObject({ revisionNumber: 1 });
  });
});

describe('payouts', () => {
  it('pays 100 sentences across categories and carries 4 pages', async () => {
    const contributor = await user();
    const { admin, category: first } = await category();
    const second = await createCategory(prisma, admin.id, { name: 'More', description: '' });
    async function add(categoryId: string, type: 'sentence' | 'page', count: number, when: Date) {
      for (let index = 0; index < count; index += 1) {
        const created = await prisma.task.create({
          data: {
            categoryId,
            externalId: randomUUID(),
            type,
            englishText: `${type} ${index} ${randomUUID()}`,
            wordCount: type === 'page' ? 300 : 2,
            sourceHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
            status: 'approved',
          },
        });
        const assignment = await prisma.assignment.create({
          data: {
            taskId: created.id,
            contributorId: contributor.id,
            status: 'completed',
            expiresAt: new Date(),
            rateRuleId: (await prisma.rateRule.findFirstOrThrow({ where: { taskType: type } })).id,
            rateSatang: type === 'page' ? 25000 : 500,
            guideVersionId: (await prisma.guideVersion.findFirstOrThrow()).id,
          },
        });
        const revision = await prisma.translationRevision.create({
          data: {
            assignmentId: assignment.id,
            revisionNumber: 1,
            shanText: 'x',
            shanTextNormalized: 'x',
          },
        });
        await prisma.earningEntry.create({
          data: {
            taskId: created.id,
            revisionId: revision.id,
            contributorId: contributor.id,
            amountSatang: type === 'page' ? 25000 : 500,
            approvalDate: when,
            status: 'unpaid',
          },
        });
      }
    }
    const september = new Date('2026-09-15T00:00:00Z');
    await add(first.id, 'sentence', 60, september);
    await add(second.id, 'sentence', 39, september);
    await add(first.id, 'page', 4, september);
    const earlyRun = new Date('2026-09-30T17:05:00.000Z');
    expect((await preparePayouts(prisma, earlyRun)).payouts).toBe(0);
    await add(first.id, 'sentence', 1, september);
    expect((await preparePayouts(prisma, earlyRun)).payouts).toBe(1);
    expect((await preparePayouts(prisma, earlyRun)).payouts).toBe(0);
    const payout = await prisma.payout.findFirstOrThrow({ include: { items: true } });
    expect(payout.amountSatang).toBe(100 * 500);
    expect(payout.items).toHaveLength(100);
    expect(
      await prisma.earningEntry.count({ where: { status: 'unpaid', task: { type: 'page' } } }),
    ).toBe(4);
    const confirmKey = randomUUID();
    await confirmPayout(prisma, {
      adminId: admin.id,
      payoutId: payout.id,
      method: 'thai_bank_transfer',
      paidAt: '2026-10-05T00:00:00.000Z',
      reference: 'BANK-1',
      idempotencyKey: confirmKey,
    });
    await confirmPayout(prisma, {
      adminId: admin.id,
      payoutId: payout.id,
      method: 'thai_bank_transfer',
      paidAt: '2026-10-05T00:00:00.000Z',
      reference: 'BANK-1',
      idempotencyKey: confirmKey,
    });
    expect(await prisma.paymentRecord.count()).toBe(1);
    expect(await prisma.earningEntry.count({ where: { status: 'paid' } })).toBe(100);
  });

  it('uses the Bangkok month boundary and flags overdue payouts without duplicating them', async () => {
    const contributor = await user();
    const { admin, category: cat } = await category();
    const guide = await prisma.guideVersion.findFirstOrThrow();
    const rate = await prisma.rateRule.findFirstOrThrow({ where: { taskType: 'sentence' } });
    const before = new Date('2026-09-30T16:59:59.000Z');
    const after = new Date('2026-09-30T17:00:00.000Z');
    for (const [when, count] of [
      [before, 100],
      [after, 100],
    ] as const) {
      for (let index = 0; index < count; index += 1) {
        const created = await prisma.task.create({
          data: {
            categoryId: cat.id,
            externalId: randomUUID(),
            type: 'sentence',
            englishText: `${when.toISOString()} ${index}`,
            wordCount: 2,
            sourceHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
            status: 'approved',
          },
        });
        const assignment = await prisma.assignment.create({
          data: {
            taskId: created.id,
            contributorId: contributor.id,
            status: 'completed',
            expiresAt: new Date(),
            rateRuleId: rate.id,
            rateSatang: 500,
            guideVersionId: guide.id,
          },
        });
        const revision = await prisma.translationRevision.create({
          data: {
            assignmentId: assignment.id,
            revisionNumber: 1,
            shanText: 'x',
            shanTextNormalized: 'x',
          },
        });
        await prisma.earningEntry.create({
          data: {
            taskId: created.id,
            revisionId: revision.id,
            contributorId: contributor.id,
            amountSatang: 500,
            approvalDate: when,
            status: 'unpaid',
          },
        });
      }
    }
    await preparePayouts(prisma, new Date('2026-09-30T17:05:00.000Z'));
    const payout = await prisma.payout.findFirstOrThrow();
    expect(payout.amountSatang).toBe(50000);
    await prisma.payoutPeriod.update({
      where: { id: payout.periodId },
      data: { dueAt: new Date('2026-10-01T00:00:00Z') },
    });
    expect((await flagOverduePayouts(prisma, new Date('2026-10-02T00:00:00Z'))).updated).toBe(1);
    await preparePayouts(prisma, new Date('2026-10-31T18:00:00.000Z'));
    expect(await prisma.payout.count()).toBe(2);
    const overdue = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
    expect(overdue.status).toBe('overdue');
    const adjustmentTarget = await prisma.earningEntry.findFirstOrThrow({
      where: { status: 'scheduled' },
    });
    await adjustEarning(prisma, {
      adminId: admin.id,
      earningId: adjustmentTarget.id,
      amountSatang: -100,
      reason: 'Correct a rate',
    });
    const updated = await prisma.payout.findFirstOrThrow({ where: { status: 'scheduled' } });
    expect(updated.amountSatang).toBe(50000 - 100);
  });
});

describe('exports and privacy', () => {
  it('excludes unapproved rows and personal data, and keeps related items in one split', async () => {
    const contributor = await user('contributor', 'private@example.com');
    const { admin, category: cat } = await category();
    const document = await prisma.sourceDocument.create({
      data: {
        categoryId: cat.id,
        externalKey: 'doc',
        provenance: 'Public domain',
        permissionRef: 'PD',
      },
    });
    const guide = await prisma.guideVersion.findFirstOrThrow();
    const rate = await prisma.rateRule.findFirstOrThrow({ where: { taskType: 'sentence' } });
    const hashes = ['a'.repeat(64), 'a'.repeat(64), 'b'.repeat(64)];
    for (const [index, hash] of hashes.entries()) {
      const created = await prisma.task.create({
        data: {
          categoryId: cat.id,
          documentId: index < 2 ? document.id : null,
          externalId: `e-${index}`,
          type: 'sentence',
          englishText: index === 2 ? 'Different.' : 'Same source.',
          wordCount: 2,
          sourceHash: hash,
          status: 'approved',
          excludedFromDataset: index === 2,
        },
      });
      const assignment = await prisma.assignment.create({
        data: {
          taskId: created.id,
          contributorId: contributor.id,
          status: 'completed',
          expiresAt: new Date(),
          rateRuleId: rate.id,
          rateSatang: 500,
          guideVersionId: guide.id,
        },
      });
      const revision = await prisma.translationRevision.create({
        data: {
          assignmentId: assignment.id,
          revisionNumber: 1,
          shanText: 'ၽိုၼ်',
          shanTextNormalized: 'ၽိုၼ်',
        },
      });
      if (index < 2) {
        await prisma.earningEntry.create({
          data: {
            taskId: created.id,
            revisionId: revision.id,
            contributorId: contributor.id,
            amountSatang: 500,
            approvalDate: new Date('2026-09-01T00:00:00Z'),
            status: 'unpaid',
          },
        });
      }
    }
    await prisma.task.create({
      data: {
        categoryId: cat.id,
        externalId: 'pending',
        type: 'sentence',
        englishText: 'Not approved.',
        wordCount: 2,
        sourceHash: 'c'.repeat(64),
        status: 'submitted',
      },
    });
    const release = await prisma.datasetRelease.create({
      data: {
        version: '2026.09.30',
        format: 'jsonl',
        filters: { format: 'jsonl', split: true },
        split: true,
        createdById: admin.id,
      },
    });
    await buildExport(prisma, storage, release.id);
    const ready = await prisma.datasetRelease.findUniqueOrThrow({
      where: { id: release.id },
      include: { fileAsset: true },
    });
    const body = (await storage.get(ready.fileAsset!.objectKey)).toString('utf8');
    expect(body).not.toContain('private@example.com');
    expect(body).not.toContain('secret-phone');
    expect(body).not.toContain('Not approved.');
    expect(body).toContain('Same source.');
    const items = await prisma.datasetItem.findMany({ where: { releaseId: release.id } });
    expect(items).toHaveLength(2);
    expect(items[0]?.split).toBe(items[1]?.split);
    expect(new Set(items.map((item) => item.clusterKey)).size).toBe(1);
    const detail = await getOwnTranslation(
      prisma,
      contributor.id,
      (await prisma.assignment.findFirstOrThrow()).id,
    );
    expect(JSON.stringify(detail)).not.toContain(admin.email);
    await expect(
      createReport(
        prisma,
        (await user()).id,
        items[0] ? (await prisma.task.findFirstOrThrow()).id : '',
        'bad source text',
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('task actions', () => {
  it('releases stalled work and archives only when nothing is outstanding', async () => {
    const { admin, category: cat } = await category();
    const created = await task(cat.id);
    const contributor = await user();
    await claimAssignment(prisma, {
      contributorId: contributor.id,
      taskType: 'sentence',
      idempotencyKey: randomUUID(),
    });
    await expect(
      updateCategory(prisma, admin.id, cat.id, { status: 'archived' }),
    ).rejects.toMatchObject({ code: 'CATEGORY_BUSY' });
    await actOnTask(prisma, {
      adminId: admin.id,
      taskId: created.id,
      action: 'release',
      reason: 'Stalled draft',
    });
    const released = await prisma.task.findUniqueOrThrow({ where: { id: created.id } });
    expect(released.status).toBe('available');
    await actOnTask(prisma, {
      adminId: admin.id,
      taskId: created.id,
      action: 'archive',
      reason: 'Out of scope',
    });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      'archived',
    );
  });
});
