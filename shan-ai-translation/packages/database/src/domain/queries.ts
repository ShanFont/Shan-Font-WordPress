import type { Prisma, PrismaClient } from '@prisma/client';
import { PAGE_THRESHOLD, SENTENCE_THRESHOLD, milestoneBadges } from '@sat/contracts';
import { decodeCursor } from '../cursor';
import { AppError } from '../errors';

function cursorWhere(cursor?: string): Prisma.AssignmentWhereInput {
  const decoded = decodeCursor(cursor);
  if (!decoded) return {};
  return {
    OR: [
      { createdAt: { lt: decoded.t } },
      { AND: [{ createdAt: decoded.t }, { id: { lt: decoded.id } }] },
    ],
  };
}

export async function contributorDashboard(db: PrismaClient, userId: string) {
  const [inProgress, sentenceApproved, pageApproved, pending, earnings] = await Promise.all([
    db.assignment.findFirst({
      where: { contributorId: userId, status: { in: ['active', 'needs_edit'] } },
      include: { task: true, draft: true },
    }),
    db.earningEntry.count({ where: { contributorId: userId, task: { type: 'sentence' } } }),
    db.earningEntry.count({ where: { contributorId: userId, task: { type: 'page' } } }),
    db.assignment.count({ where: { contributorId: userId, status: 'submitted' } }),
    db.earningEntry.findMany({
      where: { contributorId: userId },
      include: { adjustments: true, task: true },
    }),
  ]);
  const sum = (status: 'unpaid' | 'scheduled' | 'paid') =>
    earnings
      .filter((entry) => entry.status === status)
      .reduce(
        (total, entry) =>
          total +
          entry.amountSatang +
          entry.adjustments.reduce((inner, item) => inner + item.amountSatang, 0),
        0,
      );
  const unpaidSentences = earnings.filter(
    (entry) => entry.status === 'unpaid' && entry.task.type === 'sentence',
  ).length;
  const unpaidPages = earnings.filter(
    (entry) => entry.status === 'unpaid' && entry.task.type === 'page',
  ).length;
  return {
    inProgress: inProgress
      ? {
          assignmentId: inProgress.id,
          taskType: inProgress.task.type,
          expiresAt: inProgress.expiresAt.toISOString(),
          status: inProgress.status,
        }
      : null,
    activity: { sentenceApproved, pageApproved, pendingReview: pending },
    earnings: {
      unpaidSatang: sum('unpaid'),
      scheduledSatang: sum('scheduled'),
      paidSatang: sum('paid'),
    },
    thresholds: {
      sentences: {
        approvedUnpaid: unpaidSentences,
        required: SENTENCE_THRESHOLD,
        remaining: Math.max(0, SENTENCE_THRESHOLD - unpaidSentences),
      },
      pages: {
        approvedUnpaid: unpaidPages,
        required: PAGE_THRESHOLD,
        remaining: Math.max(0, PAGE_THRESHOLD - unpaidPages),
      },
    },
    badges: milestoneBadges(sentenceApproved, pageApproved),
  };
}

export async function listOwnTranslations(
  db: PrismaClient,
  userId: string,
  query: { cursor?: string; limit: number; status?: string },
) {
  const rows = await db.assignment.findMany({
    where: {
      contributorId: userId,
      ...(query.status
        ? { status: query.status as Prisma.EnumAssignmentStatusFilter['equals'] }
        : {}),
      ...cursorWhere(query.cursor),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    include: {
      task: true,
      revisions: {
        orderBy: { revisionNumber: 'desc' },
        take: 1,
        include: { reviewDecision: true },
      },
    },
  });
  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    taskType: row.task.type,
    status: row.status,
    wordCount: row.task.wordCount,
    latestRevision: row.revisions[0]?.revisionNumber ?? null,
    feedback: row.revisions[0]?.reviewDecision?.reason ?? null,
  }));
  const last = rows[Math.min(rows.length, query.limit) - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? Buffer.from(JSON.stringify({ t: last.createdAt.toISOString(), id: last.id })).toString(
            'base64url',
          )
        : null,
  };
}

export async function getOwnTranslation(db: PrismaClient, userId: string, assignmentId: string) {
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      task: true,
      revisions: { orderBy: { revisionNumber: 'asc' }, include: { reviewDecision: true } },
    },
  });
  if (!assignment || assignment.contributorId !== userId)
    throw new AppError(404, 'NOT_FOUND', 'Translation not found');
  return {
    id: assignment.id,
    taskType: assignment.task.type,
    englishText: assignment.task.englishText,
    context: assignment.task.context,
    status: assignment.status,
    revisions: assignment.revisions.map((revision) => ({
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      shanText: revision.shanText,
      submittedAt: revision.submittedAt.toISOString(),
      feedback: revision.reviewDecision
        ? { decision: revision.reviewDecision.decision, reason: revision.reviewDecision.reason }
        : null,
    })),
  };
}

export async function listOwnEarnings(db: PrismaClient, userId: string) {
  const earnings = await db.earningEntry.findMany({
    where: { contributorId: userId },
    include: { adjustments: true, task: true },
    orderBy: { approvalDate: 'desc' },
  });
  const map = (status: 'unpaid' | 'scheduled' | 'paid') =>
    earnings
      .filter((entry) => entry.status === status)
      .map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        taskType: entry.task.type,
        amountSatang: entry.amountSatang,
        approvalDate: entry.approvalDate.toISOString(),
        status: entry.status,
      }));
  return {
    unpaid: map('unpaid'),
    scheduled: map('scheduled'),
    paid: map('paid'),
    adjustments: earnings.flatMap((entry) =>
      entry.adjustments.map((adjustment) => ({
        id: adjustment.id,
        earningId: entry.id,
        amountSatang: adjustment.amountSatang,
        reason: adjustment.reason,
        createdAt: adjustment.createdAt.toISOString(),
      })),
    ),
  };
}

export async function listOwnPayouts(db: PrismaClient, userId: string) {
  const payouts = await db.payout.findMany({
    where: { contributorId: userId },
    include: { period: true, payment: true },
    orderBy: { createdAt: 'desc' },
  });
  return payouts.map((payout) => ({
    id: payout.id,
    amountSatang: payout.amountSatang,
    status: payout.status,
    method: payout.paymentMethod,
    dueAt: payout.period.dueAt.toISOString(),
    paidAt: payout.payment?.paidAt.toISOString() ?? null,
    reference: payout.payment?.reference ?? null,
  }));
}

export async function communityStats(db: PrismaClient) {
  const [contributors, approvedSentences, approvedPages, pendingReviews] = await Promise.all([
    db.user.count({ where: { role: 'contributor', status: 'active' } }),
    db.earningEntry.count({ where: { task: { type: 'sentence' } } }),
    db.earningEntry.count({ where: { task: { type: 'page' } } }),
    db.task.count({ where: { status: 'submitted' } }),
  ]);
  return { contributors, approvedSentences, approvedPages, pendingReviews };
}

export async function leaderboard(db: PrismaClient) {
  const users = await db.user.findMany({
    where: { status: 'active', profile: { leaderboardOptIn: true } },
    select: {
      displayName: true,
      _count: { select: { earningEntries: true } },
      earningEntries: { select: { task: { select: { type: true } } } },
    },
  });
  return users
    .map((user) => ({
      displayName: user.displayName,
      approved: user._count.earningEntries,
      sentences: user.earningEntries.filter((entry) => entry.task.type === 'sentence').length,
      pages: user.earningEntries.filter((entry) => entry.task.type === 'page').length,
    }))
    .sort((a, b) => b.approved - a.approved || a.displayName.localeCompare(b.displayName));
}

export async function adminDashboard(db: PrismaClient) {
  const [tasks, unpaid, scheduled, paid, reviewBacklog, overduePayouts, failedJobs] =
    await Promise.all([
      db.task.groupBy({ by: ['status'], _count: true }),
      db.earningEntry.aggregate({ where: { status: 'unpaid' }, _sum: { amountSatang: true } }),
      db.earningEntry.aggregate({ where: { status: 'scheduled' }, _sum: { amountSatang: true } }),
      db.earningEntry.aggregate({ where: { status: 'paid' }, _sum: { amountSatang: true } }),
      db.task.count({ where: { status: 'submitted' } }),
      db.payout.count({ where: { status: 'overdue' } }),
      db.outboxJob.count({ where: { status: 'failed' } }),
    ]);
  const byStatus = Object.fromEntries(tasks.map((row) => [row.status, row._count]));
  return {
    tasks: {
      available: byStatus.available ?? 0,
      assigned: byStatus.assigned ?? 0,
      submitted: byStatus.submitted ?? 0,
      needsEdit: byStatus.needs_edit ?? 0,
      approved: byStatus.approved ?? 0,
    },
    earnings: {
      unpaidSatang: unpaid._sum.amountSatang ?? 0,
      scheduledSatang: scheduled._sum.amountSatang ?? 0,
      paidSatang: paid._sum.amountSatang ?? 0,
    },
    reviewBacklog,
    overduePayouts,
    failedJobs,
  };
}

export async function createReport(
  db: PrismaClient,
  contributorId: string,
  taskId: string,
  reason: string,
) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AppError(404, 'NOT_FOUND', 'Task not found');
  const owned = await db.assignment.findFirst({ where: { taskId, contributorId } });
  if (!owned) throw new AppError(403, 'FORBIDDEN', 'You can report a task assigned to you');
  return db.report.create({ data: { taskId, contributorId, reason } });
}

export async function listReviewQueue(db: PrismaClient, query: { cursor?: string; limit: number }) {
  const decoded = decodeCursor(query.cursor);
  const rows = await db.translationRevision.findMany({
    where: {
      reviewDecision: null,
      assignment: { task: { status: 'submitted' } },
      ...(decoded
        ? {
            OR: [
              { submittedAt: { lt: decoded.t } },
              { submittedAt: decoded.t, id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    include: { assignment: { include: { task: true, contributor: true } } },
  });
  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
    revisionId: row.id,
    submittedAt: row.submittedAt.toISOString(),
    taskId: row.assignment.taskId,
    taskType: row.assignment.task.type,
    englishText: row.assignment.task.englishText,
    shanText: row.shanText,
    wordCount: row.assignment.task.wordCount,
    contributor: {
      id: row.assignment.contributorId,
      displayName: row.assignment.contributor.displayName,
    },
    rateSatang: row.assignment.rateSatang,
  }));
  const last = rows[Math.min(rows.length, query.limit) - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? Buffer.from(JSON.stringify({ t: last.submittedAt.toISOString(), id: last.id })).toString(
            'base64url',
          )
        : null,
  };
}
