import type { PrismaClient } from '@prisma/client';
import { AppError } from '../errors';
import { type Tx, audit, isUnique, notifyIntent, withIdempotency } from './shared';

export interface DecisionInput {
  adminId: string;
  revisionId: string;
  decision: 'approve' | 'deny' | 'needs_edit';
  reason?: string;
  disposition?: 'return' | 'archive';
  idempotencyKey?: string;
}

async function decideInTx(tx: Tx, input: DecisionInput) {
  const revision = await tx.translationRevision.findUnique({
    where: { id: input.revisionId },
    include: {
      reviewDecision: true,
      assignment: {
        include: { task: true, revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      },
    },
  });
  if (!revision) throw new AppError(404, 'NOT_FOUND', 'Revision not found');
  if (revision.assignment.contributorId === input.adminId) {
    throw new AppError(403, 'SELF_REVIEW', 'You cannot review your own translation');
  }
  const latest = revision.assignment.revisions[0];
  if (
    revision.reviewDecision ||
    latest?.id !== revision.id ||
    revision.assignment.task.status !== 'submitted'
  ) {
    throw new AppError(409, 'STALE_REVISION', 'This revision is no longer awaiting review');
  }
  if (input.decision === 'deny' && !input.disposition) {
    throw new AppError(
      422,
      'DISPOSITION_REQUIRED',
      'Choose whether to return or archive a denied task',
    );
  }
  if ((input.decision === 'deny' || input.decision === 'needs_edit') && !input.reason?.trim()) {
    throw new AppError(422, 'REASON_REQUIRED', 'A reason is required for this decision');
  }

  try {
    await tx.reviewDecision.create({
      data: {
        revisionId: revision.id,
        adminId: input.adminId,
        decision: input.decision,
        reason: input.reason ?? null,
        disposition: input.decision === 'deny' ? input.disposition : null,
      },
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(409, 'STALE_REVISION', 'This revision was already reviewed');
    throw error;
  }

  if (input.decision === 'approve') {
    await tx.assignment.update({
      where: { id: revision.assignmentId },
      data: { status: 'completed' },
    });
    await tx.task.update({
      where: { id: revision.assignment.taskId },
      data: { status: 'approved' },
    });
    await tx.earningEntry.create({
      data: {
        taskId: revision.assignment.taskId,
        revisionId: revision.id,
        contributorId: revision.assignment.contributorId,
        amountSatang: revision.assignment.rateSatang,
        approvalDate: new Date(),
        status: 'unpaid',
      },
    });
    await notifyIntent(tx, revision.assignment.contributorId, 'review.approved', revision.id);
  } else if (input.decision === 'needs_edit') {
    await tx.assignment.update({
      where: { id: revision.assignmentId },
      data: { status: 'needs_edit' },
    });
    await tx.task.update({
      where: { id: revision.assignment.taskId },
      data: { status: 'needs_edit' },
    });
    await notifyIntent(tx, revision.assignment.contributorId, 'review.needs_edit', revision.id);
  } else if (input.disposition === 'archive') {
    await tx.assignment.update({
      where: { id: revision.assignmentId },
      data: { status: 'released' },
    });
    await tx.task.update({
      where: { id: revision.assignment.taskId },
      data: { status: 'archived' },
    });
  } else {
    await tx.assignment.update({
      where: { id: revision.assignmentId },
      data: { status: 'released' },
    });
    await tx.task.update({
      where: { id: revision.assignment.taskId },
      data: { status: 'available' },
    });
  }

  await audit(tx, {
    actorId: input.adminId,
    action: `review.${input.decision}`,
    resourceType: 'translation_revision',
    resourceId: revision.id,
    changes: {
      taskId: revision.assignment.taskId,
      disposition: input.disposition ?? null,
      amountSatang: input.decision === 'approve' ? revision.assignment.rateSatang : 0,
    },
  });

  return {
    revisionId: revision.id,
    decision: input.decision,
    taskId: revision.assignment.taskId,
    earningSatang: input.decision === 'approve' ? revision.assignment.rateSatang : 0,
  };
}

export async function decideReview(db: PrismaClient, input: DecisionInput) {
  return withIdempotency(db, {
    actorId: input.adminId,
    route: `POST /admin/reviews/${input.revisionId}/decision`,
    key: input.idempotencyKey,
    payload: {
      decision: input.decision,
      reason: input.reason ?? null,
      disposition: input.disposition ?? null,
    },
    execute: async (tx) => ({ statusCode: 200, body: await decideInTx(tx, input) }),
  });
}

export async function previewBulkReview(db: PrismaClient, revisionIds: string[]) {
  const revisions = await db.translationRevision.findMany({
    where: { id: { in: revisionIds } },
    include: {
      reviewDecision: true,
      assignment: {
        include: { task: true, revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      },
    },
  });
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  return revisionIds.map((revisionId) => {
    const revision = byId.get(revisionId);
    if (!revision) return { revisionId, stale: true, reason: 'missing', earningSatang: 0 };
    const latest = revision.assignment.revisions[0];
    const stale =
      Boolean(revision.reviewDecision) ||
      latest?.id !== revision.id ||
      revision.assignment.task.status !== 'submitted';
    return {
      revisionId,
      taskId: revision.assignment.taskId,
      taskType: revision.assignment.task.type,
      stale,
      earningSatang: stale ? 0 : revision.assignment.rateSatang,
    };
  });
}

export async function confirmBulkReview(
  db: PrismaClient,
  adminId: string,
  items: DecisionInput[],
  idempotencyKey?: string,
) {
  return withIdempotency(db, {
    actorId: adminId,
    route: 'POST /admin/reviews/bulk-confirm',
    key: idempotencyKey,
    payload: items.map((item) => ({
      revisionId: item.revisionId,
      decision: item.decision,
      reason: item.reason ?? null,
      disposition: item.disposition ?? null,
    })),
    execute: async (tx) => {
      const applied = [];
      const conflicts = [];
      for (const item of items) {
        try {
          applied.push(await decideInTx(tx, { ...item, adminId }));
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.status === 409 || error.status === 403 || error.status === 422)
          ) {
            conflicts.push({
              revisionId: item.revisionId,
              code: error.code,
              message: error.message,
            });
            continue;
          }
          throw error;
        }
      }
      if (applied.length === 0 && conflicts.length > 0) {
        throw new AppError(
          409,
          'STALE_REVISION',
          'None of the selected revisions could be reviewed',
          { conflicts },
        );
      }
      return { statusCode: 200, body: { applied, conflicts } };
    },
  });
}
