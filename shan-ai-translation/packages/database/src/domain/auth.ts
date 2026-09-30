import type { PrismaClient } from '@prisma/client';
import { AppError } from '../errors';
import { audit, hashPassword, notifyIntent, randomToken, sha256, verifyPassword } from './shared';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;

export async function registerUser(
  db: PrismaClient,
  input: { email: string; password: string; displayName: string },
) {
  const email = input.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing)
    throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
  const token = randomToken();
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        authSubject: `local:${randomToken()}`,
        emailVerifyTokenHash: sha256(token),
        emailVerifyExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        profile: { create: {} },
      },
    });
    await audit(tx, {
      actorId: created.id,
      action: 'user.register',
      resourceType: 'user',
      resourceId: created.id,
      changes: { role: created.role },
    });
    await notifyIntent(tx, created.id, 'email.verify');
    return created;
  });
  return { user, verificationToken: token };
}

export async function loginUser(db: PrismaClient, input: { email: string; password: string }) {
  const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (user.status !== 'active')
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account cannot sign in');
  return user;
}

export async function verifyEmail(db: PrismaClient, token: string) {
  const user = await db.user.findFirst({ where: { emailVerifyTokenHash: sha256(token) } });
  if (!user || !user.emailVerifyExpiresAt || user.emailVerifyExpiresAt < new Date()) {
    throw new AppError(422, 'TOKEN_INVALID', 'This verification link is invalid or expired');
  }
  await db.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null, emailVerifyExpiresAt: null },
  });
  return { id: user.id };
}

export async function requestPasswordReset(db: PrismaClient, email: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { resetToken: null as string | null };
  const token = randomToken();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: sha256(token),
        passwordResetExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await notifyIntent(tx, user.id, 'password.reset');
  });
  return { resetToken: token };
}

export async function resetPassword(db: PrismaClient, token: string, password: string) {
  const user = await db.user.findFirst({ where: { passwordResetTokenHash: sha256(token) } });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw new AppError(422, 'TOKEN_INVALID', 'This reset link is invalid or expired');
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });
}

export async function upsertExternalUser(
  db: PrismaClient,
  input: { subject: string; email: string; displayName?: string | null; emailVerified: boolean },
) {
  const email = input.email.toLowerCase();
  const existing = await db.user.findFirst({
    where: { OR: [{ authSubject: input.subject }, { email }] },
  });
  if (!existing) {
    return db.user.create({
      data: {
        authSubject: input.subject,
        email,
        displayName: input.displayName?.trim() || email.split('@')[0] || 'Contributor',
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        profile: { create: {} },
      },
    });
  }
  return db.user.update({
    where: { id: existing.id },
    data: {
      authSubject: input.subject,
      emailVerifiedAt: existing.emailVerifiedAt ?? (input.emailVerified ? new Date() : null),
    },
  });
}

export async function acceptTerms(db: PrismaClient, userId: string) {
  return db.$transaction(async (tx) => {
    const terms = await tx.termsVersion.findFirst({ where: { isCurrent: true } });
    if (!terms)
      throw new AppError(422, 'TERMS_MISSING', 'No current contribution terms are published');
    await tx.termsAcceptance.upsert({
      where: { userId_versionId: { userId, versionId: terms.id } },
      update: {},
      create: { userId, versionId: terms.id },
    });
    await audit(tx, {
      actorId: userId,
      action: 'terms.accept',
      resourceType: 'terms_version',
      resourceId: terms.id,
      changes: { version: terms.version },
    });
    return { versionId: terms.id, version: terms.version, acceptedAt: new Date().toISOString() };
  });
}

export async function updateProfile(
  db: PrismaClient,
  userId: string,
  input: {
    displayName?: string;
    contactMethod?: 'phone' | 'line' | 'facebook' | 'email' | 'other';
    contactValue?: string;
    leaderboardOptIn?: boolean;
  },
) {
  return db.$transaction(async (tx) => {
    if (input.displayName) {
      await tx.user.update({ where: { id: userId }, data: { displayName: input.displayName } });
    }
    const profile = await tx.profile.upsert({
      where: { userId },
      update: {
        contactMethod: input.contactMethod,
        contactValue: input.contactValue,
        leaderboardOptIn: input.leaderboardOptIn,
      },
      create: {
        userId,
        contactMethod: input.contactMethod ?? 'email',
        contactValue: input.contactValue ?? '',
        leaderboardOptIn: input.leaderboardOptIn ?? false,
      },
    });
    await audit(tx, {
      actorId: userId,
      action: 'profile.update',
      resourceType: 'profile',
      resourceId: userId,
      changes: { leaderboardOptIn: profile.leaderboardOptIn, contactMethod: profile.contactMethod },
    });
    return profile;
  });
}
