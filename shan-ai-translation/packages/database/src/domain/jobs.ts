import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../errors';
import type { ObjectStorage } from '../storage';
import { buildExport } from './exports';
import { commitImport } from './imports';
import { flagOverduePayouts, preparePayouts } from './payouts';

interface OutboxRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  max_attempts: number;
}

export async function expireReservations(db: PrismaClient, now = new Date()) {
  const expired = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; task_id: string }[]>`
      UPDATE assignments
      SET status = 'expired'::"AssignmentStatus", updated_at = NOW()
      WHERE status = 'active'::"AssignmentStatus" AND expires_at < ${now}
      RETURNING id, task_id
    `;
    if (rows.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: rows.map((row) => row.task_id) }, status: 'assigned' },
        data: { status: 'available' },
      });
    }
    return rows.length;
  });
  return { expired };
}

export async function drainOutbox(db: PrismaClient, storage: ObjectStorage, limit = 5) {
  const jobs = await db.$queryRaw<OutboxRow[]>`
    WITH picked AS (
      SELECT id FROM outbox_jobs
      WHERE status = 'pending' AND run_at <= NOW()
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE outbox_jobs AS job
    SET status = 'processing', attempts = job.attempts + 1, updated_at = NOW()
    FROM picked
    WHERE job.id = picked.id
    RETURNING job.id, job.type, job.payload, job.attempts, job.max_attempts
  `;
  for (const job of jobs) {
    try {
      await runJob(db, storage, job);
      await db.outboxJob.update({
        where: { id: job.id },
        data: { status: 'completed', lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'failed';
      const failed = job.attempts >= job.max_attempts;
      const delaySeconds = Math.min(300, 2 ** job.attempts);
      await db.outboxJob.update({
        where: { id: job.id },
        data: {
          status: failed ? 'failed' : 'pending',
          lastError: message,
          runAt: new Date(Date.now() + delaySeconds * 1000),
        },
      });
    }
  }
  return { processed: jobs.length };
}

async function runJob(db: PrismaClient, storage: ObjectStorage, job: OutboxRow) {
  const payload = job.payload as { batchId?: string; releaseId?: string };
  if (job.type === 'import.commit' && payload.batchId) {
    await commitImport(db, payload.batchId);
    return;
  }
  if (job.type === 'export.build' && payload.releaseId) {
    await buildExport(db, storage, payload.releaseId);
    return;
  }
  if (job.type === 'payout.prepare') {
    await preparePayouts(db);
    return;
  }
  throw new Error(`Unknown job ${job.type}`);
}

export async function retryJob(db: PrismaClient, adminId: string, jobId: string) {
  const job = await db.outboxJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, 'NOT_FOUND', 'Job not found');
  if (job.status !== 'failed')
    throw new AppError(409, 'INVALID_TRANSITION', 'Only a failed job can be retried');
  await db.outboxJob.update({
    where: { id: jobId },
    data: { status: 'pending', attempts: 0, lastError: null, runAt: new Date() },
  });
  await db.auditEvent.create({
    data: {
      actorId: adminId,
      action: 'job.retry',
      resourceType: 'outbox_job',
      resourceId: jobId,
      changes: { type: job.type },
    },
  });
  return { id: jobId, status: 'pending' as const };
}

export async function runMaintenance(db: PrismaClient, now = new Date()) {
  const reservations = await expireReservations(db, now);
  const payouts = await preparePayouts(db, now);
  const overdue = await flagOverduePayouts(db, now);
  return { reservations, payouts, overdue };
}
