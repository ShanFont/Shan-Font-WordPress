import type { PrismaClient } from '@prisma/client';
import { payoutWindow, selectPayoutEarnings } from '@sat/contracts';
import { AppError } from '../errors';
import { audit, isUnique, notifyIntent, withIdempotency } from './shared';

export async function preparePayouts(db: PrismaClient, now = new Date()) {
  const window = payoutWindow(now);
  const period = await db.payoutPeriod.upsert({
    where: { cutoffAt: window.cutoffAt },
    update: {},
    create: {
      periodStart: window.periodStart,
      cutoffAt: window.cutoffAt,
      dueAt: window.dueAt,
      status: 'ready',
    },
  });
  const contributors = await db.earningEntry.findMany({
    where: { status: 'unpaid', approvalDate: { lt: window.cutoffAt } },
    distinct: ['contributorId'],
    select: { contributorId: true },
  });
  let created = 0;
  for (const { contributorId } of contributors) {
    const made = await db.$transaction(async (tx) => {
      const existing = await tx.payout.findUnique({
        where: { contributorId_periodId: { contributorId, periodId: period.id } },
      });
      if (existing) return false;
      await tx.$queryRaw`
        SELECT id FROM earning_entries
        WHERE contributor_id = ${contributorId}::uuid
          AND status = 'unpaid'::"EarningStatus"
          AND approval_date < ${window.cutoffAt}
        FOR UPDATE
      `;
      const earnings = await tx.earningEntry.findMany({
        where: {
          contributorId,
          status: 'unpaid',
          approvalDate: { lt: window.cutoffAt },
          payoutItems: { none: { releasedAt: null } },
        },
        include: { task: true, adjustments: true },
      });
      const selected = selectPayoutEarnings(
        earnings.map((earning) => ({
          id: earning.id,
          taskType: earning.task.type,
          amountSatang: earning.amountSatang,
          adjustmentSatang: earning.adjustments.reduce((sum, item) => sum + item.amountSatang, 0),
        })),
      );
      if (selected.included.length === 0) return false;
      try {
        const payout = await tx.payout.create({
          data: {
            contributorId,
            periodId: period.id,
            amountSatang: selected.amountSatang,
            status: 'scheduled',
          },
        });
        await tx.payoutItem.createMany({
          data: selected.included.map((entry) => ({
            payoutId: payout.id,
            earningEntryId: entry.id,
          })),
        });
        await tx.earningEntry.updateMany({
          where: { id: { in: selected.included.map((entry) => entry.id) } },
          data: { status: 'scheduled' },
        });
        await audit(tx, {
          actorId: null,
          action: 'payout.prepare',
          resourceType: 'payout',
          resourceId: payout.id,
          changes: {
            contributorId,
            amountSatang: selected.amountSatang,
            units: selected.included.length,
          },
        });
        await notifyIntent(tx, contributorId, 'payout.scheduled', payout.id);
        return true;
      } catch (error) {
        if (isUnique(error)) return false;
        throw error;
      }
    });
    if (made) created += 1;
  }
  return { periodId: period.id, payouts: created, cutoffAt: window.cutoffAt.toISOString() };
}

export async function flagOverduePayouts(db: PrismaClient, now = new Date()) {
  const overdue = await db.payout.findMany({
    where: { status: 'scheduled', period: { dueAt: { lt: now } } },
    select: { id: true },
  });
  if (overdue.length === 0) return { updated: 0 };
  await db.payout.updateMany({
    where: { id: { in: overdue.map((payout) => payout.id) } },
    data: { status: 'overdue' },
  });
  return { updated: overdue.length };
}

async function recomputePayout(
  tx: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  payoutId: string,
) {
  const items = await tx.payoutItem.findMany({
    where: { payoutId, releasedAt: null },
    include: { earning: { include: { adjustments: true } } },
  });
  const amountSatang = Math.max(
    0,
    items.reduce(
      (sum, item) =>
        sum +
        item.earning.amountSatang +
        item.earning.adjustments.reduce((inner, adj) => inner + adj.amountSatang, 0),
      0,
    ),
  );
  await tx.payout.update({ where: { id: payoutId }, data: { amountSatang } });
}

export async function confirmPayout(
  db: PrismaClient,
  input: {
    adminId: string;
    payoutId: string;
    method: 'thai_bank_transfer' | 'thai_qr';
    paidAt: string;
    reference: string;
    idempotencyKey?: string;
  },
) {
  return withIdempotency(db, {
    actorId: input.adminId,
    route: `POST /admin/payouts/${input.payoutId}/confirm`,
    key: input.idempotencyKey,
    payload: { method: input.method, paidAt: input.paidAt, reference: input.reference },
    execute: async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { id: input.payoutId },
        include: { payment: true, items: true },
      });
      if (!payout) throw new AppError(404, 'NOT_FOUND', 'Payout not found');
      if (payout.payment) {
        return {
          statusCode: 200,
          body: {
            payoutId: payout.id,
            status: 'paid' as const,
            reference: payout.payment.reference,
            paidAt: payout.payment.paidAt.toISOString(),
          },
        };
      }
      if (payout.status !== 'scheduled' && payout.status !== 'overdue') {
        throw new AppError(409, 'INVALID_TRANSITION', 'This payout cannot be confirmed');
      }
      const paidAt = new Date(input.paidAt);
      await tx.paymentRecord.create({
        data: {
          payoutId: payout.id,
          paidAt,
          adminId: input.adminId,
          reference: input.reference,
          method: input.method,
        },
      });
      await tx.payout.update({
        where: { id: payout.id },
        data: { status: 'paid', paymentMethod: input.method },
      });
      await tx.earningEntry.updateMany({
        where: {
          id: {
            in: payout.items.filter((item) => !item.releasedAt).map((item) => item.earningEntryId),
          },
        },
        data: { status: 'paid' },
      });
      await audit(tx, {
        actorId: input.adminId,
        action: 'payout.confirm',
        resourceType: 'payout',
        resourceId: payout.id,
        changes: { method: input.method, amountSatang: payout.amountSatang },
      });
      await notifyIntent(tx, payout.contributorId, 'payout.paid', payout.id);
      return {
        statusCode: 200,
        body: {
          payoutId: payout.id,
          status: 'paid' as const,
          reference: input.reference,
          paidAt: paidAt.toISOString(),
        },
      };
    },
  });
}

export async function adjustEarning(
  db: PrismaClient,
  input: { adminId: string; earningId: string; amountSatang: number; reason: string },
) {
  return db.$transaction(async (tx) => {
    const earning = await tx.earningEntry.findUnique({ where: { id: input.earningId } });
    if (!earning) throw new AppError(404, 'NOT_FOUND', 'Earning not found');
    const adjustment = await tx.earningAdjustment.create({
      data: {
        earningEntryId: earning.id,
        amountSatang: input.amountSatang,
        reason: input.reason,
        adminId: input.adminId,
      },
    });
    const item = await tx.payoutItem.findFirst({
      where: { earningEntryId: earning.id, releasedAt: null },
      include: { payout: true },
    });
    let appliedToPayout = false;
    if (item && (item.payout.status === 'scheduled' || item.payout.status === 'overdue')) {
      await recomputePayout(tx, item.payoutId);
      appliedToPayout = true;
    }
    await audit(tx, {
      actorId: input.adminId,
      action: 'earning.adjust',
      resourceType: 'earning_entry',
      resourceId: earning.id,
      changes: { amountSatang: input.amountSatang, appliedToPayout },
    });
    return { id: adjustment.id, appliedToPayout };
  });
}
