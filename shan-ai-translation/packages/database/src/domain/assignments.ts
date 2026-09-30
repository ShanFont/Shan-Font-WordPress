import type { Prisma, PrismaClient } from '@prisma/client';
import { RESERVATION_HOURS, addHours, normalizeShan } from '@sat/contracts';
import { AppError } from '../errors';
import {
  audit,
  currentGuide,
  currentRate,
  currentTerms,
  notifyIntent,
  withIdempotency,
} from './shared';

const OPEN_ASSIGNMENT = ['active', 'needs_edit'] as const;

type Reader = PrismaClient | Prisma.TransactionClient;

async function presentAssignment(db: Reader, assignmentId: string) {
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      task: true,
      draft: true,
      guideVersion: true,
      revisions: {
        orderBy: { revisionNumber: 'desc' },
        include: { reviewDecision: true },
        take: 1,
      },
    },
  });
  if (!assignment) throw new AppError(404, 'NOT_FOUND', 'Assignment not found');
  const latest = assignment.revisions[0];
  return {
    assignmentId: assignment.id,
    taskId: assignment.taskId,
    taskType: assignment.task.type,
    englishText: assignment.task.englishText,
    context: assignment.task.context,
    wordCount: assignment.task.wordCount,
    status: assignment.status,
    taskStatus: assignment.task.status,
    expiresAt: assignment.expiresAt.toISOString(),
    rateSatang: assignment.rateSatang,
    guide: {
      version: assignment.guideVersion.version,
      title: assignment.guideVersion.title,
      content: assignment.guideVersion.content,
    },
    draft: assignment.draft
      ? {
          shanText: assignment.draft.shanText,
          version: assignment.draft.version,
          savedAt: assignment.draft.savedAt.toISOString(),
        }
      : null,
    feedback:
      latest?.reviewDecision && assignment.status === 'needs_edit'
        ? { decision: latest.reviewDecision.decision, reason: latest.reviewDecision.reason }
        : null,
  };
}

export async function claimAssignment(
  db: PrismaClient,
  input: { contributorId: string; taskType: 'sentence' | 'page'; idempotencyKey?: string },
) {
  return withIdempotency(db, {
    actorId: input.contributorId,
    route: 'POST /assignments',
    key: input.idempotencyKey,
    payload: { taskType: input.taskType },
    execute: async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.contributorId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: input.contributorId } });
      if (!user || user.status !== 'active')
        throw new AppError(403, 'ACCOUNT_DISABLED', 'Account is not active');
      if (!user.emailVerifiedAt)
        throw new AppError(403, 'EMAIL_UNVERIFIED', 'Verify your email before translating');
      const terms = await currentTerms(tx);
      const accepted = await tx.termsAcceptance.findUnique({
        where: { userId_versionId: { userId: user.id, versionId: terms.id } },
      });
      if (!accepted)
        throw new AppError(403, 'TERMS_REQUIRED', 'Accept the current contribution terms first');

      const open = await tx.assignment.findFirst({
        where: { contributorId: user.id, status: { in: [...OPEN_ASSIGNMENT] } },
      });
      if (open) {
        return { statusCode: 200, body: await presentAssignment(tx, open.id) };
      }

      const now = new Date();
      const rows = await tx.$queryRaw<{ id: string }[]>`
        WITH picked AS (
          SELECT t.id
          FROM tasks t
          INNER JOIN categories c ON c.id = t.category_id
          WHERE t.status = 'available'::"TaskStatus"
            AND t.type = CAST(${input.taskType} AS "TaskType")
            AND c.status = 'active'::"CategoryStatus"
          ORDER BY random()
          FOR UPDATE OF t SKIP LOCKED
          LIMIT 1
        )
        UPDATE tasks
        SET status = 'assigned'::"TaskStatus", updated_at = NOW()
        WHERE id IN (SELECT id FROM picked)
        RETURNING id
      `;
      const taskId = rows[0]?.id;
      if (!taskId) throw new AppError(404, 'NO_TASK', 'No task of that type is available');
      const guide = await currentGuide(tx);
      const rate = await currentRate(tx, input.taskType, now);
      const assignment = await tx.assignment.create({
        data: {
          taskId,
          contributorId: user.id,
          status: 'active',
          expiresAt: addHours(now, RESERVATION_HOURS),
          rateRuleId: rate.id,
          rateSatang: rate.amountSatang,
          guideVersionId: guide.id,
          draft: { create: { shanText: '', version: 1, savedAt: now } },
        },
      });
      await audit(tx, {
        actorId: user.id,
        action: 'assignment.claim',
        resourceType: 'assignment',
        resourceId: assignment.id,
        changes: { taskId, taskType: input.taskType, rateSatang: rate.amountSatang },
      });
      return { statusCode: 201, body: await presentAssignment(tx, assignment.id) };
    },
  });
}

export async function getOwnAssignment(
  db: PrismaClient,
  contributorId: string,
  assignmentId: string,
) {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.contributorId !== contributorId) {
    throw new AppError(404, 'NOT_FOUND', 'Assignment not found');
  }
  return presentAssignment(db, assignmentId);
}

export async function saveDraft(
  db: PrismaClient,
  input: { contributorId: string; assignmentId: string; shanText: string; expectedVersion: number },
) {
  try {
    return await db.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: input.assignmentId },
        include: { draft: true },
      });
      if (!assignment || assignment.contributorId !== input.contributorId) {
        throw new AppError(404, 'NOT_FOUND', 'Assignment not found');
      }
      if (assignment.status !== 'active' && assignment.status !== 'needs_edit') {
        throw new AppError(409, 'ASSIGNMENT_CLOSED', 'This assignment can no longer be edited');
      }
      if (assignment.expiresAt <= new Date() && assignment.status === 'active') {
        throw new AppError(409, 'ASSIGNMENT_EXPIRED', 'This reservation has expired');
      }
      if (!assignment.draft) throw new AppError(409, 'DRAFT_MISSING', 'Draft is missing');
      const savedAt = new Date();
      const updated = await tx.draft.updateMany({
        where: { assignmentId: assignment.id, version: input.expectedVersion },
        data: {
          shanText: input.shanText,
          version: { increment: 1 },
          savedAt,
        },
      });
      if (updated.count !== 1) {
        const current = await tx.draft.findUnique({ where: { assignmentId: assignment.id } });
        throw new AppError(409, 'DRAFT_CONFLICT', 'The draft was saved somewhere else', {
          serverDraft: current && {
            shanText: current.shanText,
            version: current.version,
            savedAt: current.savedAt.toISOString(),
          },
          rejectedText: input.shanText,
        });
      }
      const expiresAt = addHours(savedAt, RESERVATION_HOURS);
      await tx.assignment.update({ where: { id: assignment.id }, data: { expiresAt } });
      return {
        version: input.expectedVersion + 1,
        savedAt: savedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'DRAFT_CONFLICT') throw error;
    throw error;
  }
}

export async function skipAssignment(
  db: PrismaClient,
  contributorId: string,
  assignmentId: string,
) {
  return db.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment || assignment.contributorId !== contributorId) {
      throw new AppError(404, 'NOT_FOUND', 'Assignment not found');
    }
    if (assignment.status !== 'active') {
      throw new AppError(409, 'INVALID_TRANSITION', 'Only an active reservation can be skipped');
    }
    await tx.assignment.update({ where: { id: assignment.id }, data: { status: 'skipped' } });
    await tx.task.updateMany({
      where: { id: assignment.taskId, status: 'assigned' },
      data: { status: 'available' },
    });
    await audit(tx, {
      actorId: contributorId,
      action: 'assignment.skip',
      resourceType: 'assignment',
      resourceId: assignment.id,
      changes: { taskId: assignment.taskId },
    });
    return { status: 'skipped' as const };
  });
}

export async function submitAssignment(
  db: PrismaClient,
  input: {
    contributorId: string;
    assignmentId: string;
    expectedDraftVersion: number;
    idempotencyKey?: string;
  },
) {
  return withIdempotency(db, {
    actorId: input.contributorId,
    route: `POST /assignments/${input.assignmentId}/submit`,
    key: input.idempotencyKey,
    payload: { expectedDraftVersion: input.expectedDraftVersion },
    execute: async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: input.assignmentId },
        include: { draft: true, revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      });
      if (!assignment || assignment.contributorId !== input.contributorId) {
        throw new AppError(404, 'NOT_FOUND', 'Assignment not found');
      }
      if (assignment.status !== 'active' && assignment.status !== 'needs_edit') {
        throw new AppError(409, 'INVALID_TRANSITION', 'This assignment cannot be submitted');
      }
      if (assignment.status === 'active' && assignment.expiresAt <= new Date()) {
        throw new AppError(409, 'ASSIGNMENT_EXPIRED', 'This reservation has expired');
      }
      if (!assignment.draft || assignment.draft.version !== input.expectedDraftVersion) {
        throw new AppError(409, 'DRAFT_CONFLICT', 'Save the latest draft before submitting', {
          serverDraft: assignment.draft && {
            shanText: assignment.draft.shanText,
            version: assignment.draft.version,
            savedAt: assignment.draft.savedAt.toISOString(),
          },
        });
      }
      const shanText = assignment.draft.shanText;
      if (!shanText.trim())
        throw new AppError(422, 'EMPTY_TRANSLATION', 'Write a translation before submitting');
      const revisionNumber = (assignment.revisions[0]?.revisionNumber ?? 0) + 1;
      const revision = await tx.translationRevision.create({
        data: {
          assignmentId: assignment.id,
          revisionNumber,
          shanText,
          shanTextNormalized: normalizeShan(shanText),
        },
      });
      await tx.assignment.update({ where: { id: assignment.id }, data: { status: 'submitted' } });
      await tx.task.update({ where: { id: assignment.taskId }, data: { status: 'submitted' } });
      await audit(tx, {
        actorId: input.contributorId,
        action: 'translation.submit',
        resourceType: 'translation_revision',
        resourceId: revision.id,
        changes: { revisionNumber, assignmentId: assignment.id },
      });
      await notifyIntent(tx, input.contributorId, 'translation.submitted', revision.id);
      return {
        statusCode: 201,
        body: {
          revisionId: revision.id,
          revisionNumber,
          submittedAt: revision.submittedAt.toISOString(),
        },
      };
    },
  });
}

export { presentAssignment };
