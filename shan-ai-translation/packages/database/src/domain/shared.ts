import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../errors';

const scrypt = promisify(scryptCb);

export type Tx = Prisma.TransactionClient;
export type DbOrTx = PrismaClient | Prisma.TransactionClient;

const REDACTED = new Set([
  'email',
  'password',
  'passwordHash',
  'token',
  'contactValue',
  'shanText',
  'englishText',
  'sourceText',
  'authorization',
]);

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function publicChanges(changes: Record<string, unknown>): Prisma.InputJsonValue {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (REDACTED.has(key)) continue;
    safe[key] = value;
  }
  return asJson(safe);
}

export async function audit(
  tx: DbOrTx,
  input: {
    actorId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    changes?: Record<string, unknown>;
  },
) {
  await tx.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      changes: input.changes ? publicChanges(input.changes) : undefined,
    },
  });
}

export async function notifyIntent(
  tx: DbOrTx,
  userId: string,
  template: string,
  resourceId?: string,
) {
  await audit(tx, {
    actorId: null,
    action: 'notification.intent',
    resourceType: 'user',
    resourceId: userId,
    changes: { template, relatedId: resourceId ?? null },
  });
}

export function requestHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(): string {
  return randomBytes(32).toString('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hex] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hex) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

export async function withIdempotency<T>(
  db: PrismaClient,
  input: {
    actorId: string;
    route: string;
    key: string | undefined;
    payload: unknown;
    execute: (tx: Tx) => Promise<{ statusCode: number; body: T }>;
  },
): Promise<T> {
  if (!input.key)
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  const hash = requestHash(input.payload);
  const existing = await db.idempotencyRecord.findUnique({
    where: { actorId_route_key: { actorId: input.actorId, route: input.route, key: input.key } },
  });
  if (existing) {
    if (existing.requestHash !== hash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This idempotency key was used with a different request',
      );
    }
    return existing.responseBody as T;
  }
  try {
    return await db.$transaction(
      async (tx) => {
        const result = await input.execute(tx);
        await tx.idempotencyRecord.create({
          data: {
            actorId: input.actorId,
            route: input.route,
            key: input.key as string,
            requestHash: hash,
            statusCode: result.statusCode,
            responseBody: result.body as Prisma.InputJsonValue,
          },
        });
        return result.body;
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    if (isUnique(error)) {
      const winner = await db.idempotencyRecord.findUnique({
        where: {
          actorId_route_key: { actorId: input.actorId, route: input.route, key: input.key },
        },
      });
      if (winner && winner.requestHash === hash) return winner.responseBody as T;
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This idempotency key was used with a different request',
      );
    }
    throw error;
  }
}

export function isUnique(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

export async function currentGuide(tx: DbOrTx) {
  const guide = await tx.guideVersion.findFirst({ where: { isCurrent: true } });
  if (!guide) throw new AppError(422, 'GUIDE_MISSING', 'No current translation guide is published');
  return guide;
}

export async function currentTerms(tx: DbOrTx) {
  const terms = await tx.termsVersion.findFirst({ where: { isCurrent: true } });
  if (!terms)
    throw new AppError(422, 'TERMS_MISSING', 'No current contribution terms are published');
  return terms;
}

export async function currentRate(tx: DbOrTx, taskType: 'sentence' | 'page', at: Date) {
  const rate = await tx.rateRule.findFirst({
    where: { taskType, effectiveAt: { lte: at } },
    orderBy: { effectiveAt: 'desc' },
  });
  if (!rate) throw new AppError(422, 'RATE_MISSING', `No rate is effective for ${taskType}`);
  return rate;
}
