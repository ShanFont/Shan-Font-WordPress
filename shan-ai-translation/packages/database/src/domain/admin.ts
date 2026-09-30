import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  canonicalSource,
  countEnglishWords,
  isPageWordCountValid,
  sourceHash,
} from '@sat/contracts';
import { AppError } from '../errors';
import { audit, currentGuide, isUnique } from './shared';

const OPEN_TASK = ['assigned', 'submitted', 'needs_edit'] as const;

export async function createCategory(
  db: PrismaClient,
  adminId: string,
  input: { name: string; description: string },
) {
  const category = await db.category.create({ data: input });
  await db.auditEvent.create({
    data: {
      actorId: adminId,
      action: 'category.create',
      resourceType: 'category',
      resourceId: category.id,
      changes: { status: category.status },
    },
  });
  return category;
}

export async function updateCategory(
  db: PrismaClient,
  adminId: string,
  id: string,
  input: { name?: string; description?: string; status?: 'active' | 'paused' | 'archived' },
) {
  const category = await db.category.findUnique({ where: { id } });
  if (!category) throw new AppError(404, 'NOT_FOUND', 'Category not found');
  if (input.status === 'archived') {
    const outstanding = await db.task.count({
      where: { categoryId: id, status: { in: [...OPEN_TASK] } },
    });
    if (outstanding > 0) {
      throw new AppError(
        409,
        'CATEGORY_BUSY',
        'Resolve outstanding assignments and reviews before archiving',
      );
    }
  }
  const updated = await db.category.update({ where: { id }, data: input });
  await audit(db, {
    actorId: adminId,
    action: 'category.update',
    resourceType: 'category',
    resourceId: id,
    changes: { status: updated.status },
  });
  return updated;
}

export async function actOnTask(
  db: PrismaClient,
  input: {
    adminId: string;
    taskId: string;
    action: 'return' | 'pause' | 'archive' | 'release' | 'replace' | 'exclude';
    reason: string;
    englishText?: string;
  },
) {
  return db.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: input.taskId },
      include: {
        assignments: { where: { status: { in: ['active', 'needs_edit', 'submitted'] } } },
      },
    });
    if (!task) throw new AppError(404, 'NOT_FOUND', 'Task not found');
    const open = task.assignments[0];

    if (input.action === 'return') {
      if (task.status !== 'denied' && task.status !== 'paused') {
        throw new AppError(
          409,
          'INVALID_TRANSITION',
          'Only a denied or paused task can be returned',
        );
      }
      await tx.task.update({ where: { id: task.id }, data: { status: 'available' } });
    } else if (input.action === 'pause') {
      if (open)
        throw new AppError(409, 'TASK_BUSY', 'Release the current assignment before pausing');
      await tx.task.update({ where: { id: task.id }, data: { status: 'paused' } });
    } else if (input.action === 'archive') {
      if (open)
        throw new AppError(409, 'TASK_BUSY', 'Resolve the current assignment before archiving');
      await tx.task.update({ where: { id: task.id }, data: { status: 'archived' } });
    } else if (input.action === 'release') {
      if (!open || (open.status !== 'active' && open.status !== 'needs_edit')) {
        throw new AppError(409, 'INVALID_TRANSITION', 'There is no stalled assignment to release');
      }
      await tx.assignment.update({ where: { id: open.id }, data: { status: 'released' } });
      await tx.task.update({ where: { id: task.id }, data: { status: 'available' } });
    } else if (input.action === 'exclude') {
      await tx.task.update({
        where: { id: task.id },
        data: { excludedFromDataset: true, exclusionReason: input.reason },
      });
    } else {
      if (open)
        throw new AppError(
          409,
          'TASK_BUSY',
          'Release in-progress work before replacing the source',
        );
      if (!input.englishText)
        throw new AppError(422, 'TEXT_REQUIRED', 'Replacement source text is required');
      const text = canonicalSource(input.englishText);
      const words = countEnglishWords(text);
      if (task.type === 'page' && !isPageWordCountValid(words)) {
        throw new AppError(
          422,
          'PAGE_SIZE',
          `Replacement page must be 250–500 words (found ${words})`,
        );
      }
      const replacement = await tx.task.create({
        data: {
          categoryId: task.categoryId,
          batchId: task.batchId,
          documentId: task.documentId,
          externalId: `${task.externalId}-r${createHash('sha256').update(text).digest('hex').slice(0, 8)}`,
          type: task.type,
          englishText: text,
          context: task.context,
          topic: task.topic,
          wordCount: words,
          sourceHash: sourceHash(text),
          status: 'available',
          replacesTaskId: task.id,
        },
      });
      if (task.status === 'available' || task.status === 'paused' || task.status === 'denied') {
        await tx.task.update({ where: { id: task.id }, data: { status: 'archived' } });
      } else {
        await tx.task.update({
          where: { id: task.id },
          data: { excludedFromDataset: true, exclusionReason: input.reason },
        });
      }
      await audit(tx, {
        actorId: input.adminId,
        action: 'task.replace',
        resourceType: 'task',
        resourceId: replacement.id,
        changes: { replacesTaskId: task.id },
      });
      return { taskId: replacement.id, status: replacement.status };
    }

    await audit(tx, {
      actorId: input.adminId,
      action: `task.${input.action}`,
      resourceType: 'task',
      resourceId: task.id,
      changes: { status: input.action },
    });
    const updated = await tx.task.findUnique({ where: { id: task.id } });
    return { taskId: task.id, status: updated?.status };
  });
}

export async function updateUserAdmin(
  db: PrismaClient,
  adminId: string,
  userId: string,
  input: {
    displayName?: string;
    role?: 'contributor' | 'admin';
    status?: 'active' | 'suspended' | 'disabled';
    contactMethod?: 'phone' | 'line' | 'facebook' | 'email' | 'other';
    contactValue?: string;
    leaderboardOptIn?: boolean;
  },
) {
  if (input.role && input.role !== 'admin') {
    const admins = await db.user.count({
      where: { role: 'admin', status: 'active', NOT: { id: userId } },
    });
    const target = await db.user.findUnique({ where: { id: userId } });
    if (target?.role === 'admin' && admins === 0) {
      throw new AppError(409, 'LAST_ADMIN', 'The last admin cannot be removed');
    }
  }
  const user = await db.user.update({
    where: { id: userId },
    data: { displayName: input.displayName, role: input.role, status: input.status },
  });
  if (
    input.contactMethod ||
    input.contactValue !== undefined ||
    input.leaderboardOptIn !== undefined
  ) {
    await db.profile.upsert({
      where: { userId },
      update: {
        contactMethod: input.contactMethod,
        contactValue: input.contactValue,
        leaderboardOptIn: input.leaderboardOptIn,
      },
      create: { userId },
    });
  }
  await db.auditEvent.create({
    data: {
      actorId: adminId,
      action: 'user.update',
      resourceType: 'user',
      resourceId: userId,
      changes: { role: user.role, status: user.status },
    },
  });
  return user;
}

export async function publishGuide(
  db: PrismaClient,
  adminId: string,
  input: { version: string; title: string; content: string },
) {
  try {
    return await db.$transaction(async (tx) => {
      await tx.guideVersion.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const guide = await tx.guideVersion.create({
        data: { ...input, isCurrent: true, createdById: adminId },
      });
      await audit(tx, {
        actorId: adminId,
        action: 'guide.publish',
        resourceType: 'guide_version',
        resourceId: guide.id,
        changes: { version: guide.version },
      });
      return guide;
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(409, 'VERSION_EXISTS', 'That guide version already exists');
    throw error;
  }
}

export async function publishTerms(
  db: PrismaClient,
  adminId: string,
  input: { version: string; title: string; content: string },
) {
  try {
    return await db.$transaction(async (tx) => {
      await tx.termsVersion.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const terms = await tx.termsVersion.create({
        data: { ...input, isCurrent: true, createdById: adminId },
      });
      await audit(tx, {
        actorId: adminId,
        action: 'terms.publish',
        resourceType: 'terms_version',
        resourceId: terms.id,
        changes: { version: terms.version },
      });
      return terms;
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(409, 'VERSION_EXISTS', 'That terms version already exists');
    throw error;
  }
}

export async function createRate(
  db: PrismaClient,
  adminId: string,
  input: { taskType: 'sentence' | 'page'; amountSatang: number; effectiveAt: string },
) {
  const effectiveAt = new Date(input.effectiveAt);
  if (effectiveAt <= new Date()) {
    throw new AppError(422, 'RATE_NOT_FUTURE', 'New rates must take effect in the future');
  }
  const rate = await db.rateRule.create({
    data: {
      taskType: input.taskType,
      amountSatang: input.amountSatang,
      effectiveAt,
      createdById: adminId,
    },
  });
  await db.auditEvent.create({
    data: {
      actorId: adminId,
      action: 'rate.create',
      resourceType: 'rate_rule',
      resourceId: rate.id,
      changes: { taskType: rate.taskType, amountSatang: rate.amountSatang },
    },
  });
  return rate;
}

export async function getCurrentGuide(db: PrismaClient) {
  return currentGuide(db);
}

export async function resolveReport(
  db: PrismaClient,
  input: {
    adminId: string;
    reportId: string;
    status: 'resolved' | 'dismissed';
    resolution: string;
  },
) {
  const report = await db.report.update({
    where: { id: input.reportId },
    data: {
      status: input.status,
      resolution: input.resolution,
      resolvedById: input.adminId,
      resolvedAt: new Date(),
    },
  });
  await db.auditEvent.create({
    data: {
      actorId: input.adminId,
      action: 'report.resolve',
      resourceType: 'report',
      resourceId: report.id,
      changes: { status: input.status },
    },
  });
  return report;
}
