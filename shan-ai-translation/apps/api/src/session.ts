import { createHash } from 'node:crypto';
import { AppError, prisma, upsertExternalUser } from '@sat/database';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface SessionUser {
  id: string;
  role: 'contributor' | 'admin';
  aal: string;
  email: string;
  displayName: string;
  status: string;
  emailVerifiedAt: Date | null;
}

function secret(): string {
  return process.env.JWT_SECRET || 'dev-only-change-me';
}

export function signSession(user: { id: string; role: string }): string {
  return jwt.sign({ sub: user.id, role: user.role, aal: 'aal1' }, secret(), { expiresIn: '12h' });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie('sat_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('sat_session', { path: '/' });
}

function readToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = req.cookies?.sat_session;
  return typeof cookie === 'string' ? cookie : null;
}

export async function resolveUser(req: Request): Promise<SessionUser | null> {
  const token = readToken(req);
  if (!token) return null;
  if (process.env.AUTH_MODE === 'supabase') {
    const supabaseSecret = process.env.SUPABASE_JWT_SECRET;
    if (!supabaseSecret)
      throw new AppError(500, 'AUTH_MISCONFIGURED', 'Supabase JWT secret is not configured');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, supabaseSecret) as jwt.JwtPayload;
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
    }
    const email = String(payload.email || '');
    if (!payload.sub || !email) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
    const user = await upsertExternalUser(prisma, {
      subject: payload.sub,
      email,
      displayName:
        typeof payload.user_metadata === 'object' &&
        payload.user_metadata &&
        'full_name' in payload.user_metadata
          ? String((payload.user_metadata as { full_name?: string }).full_name ?? '')
          : null,
      emailVerified: Boolean(payload.email_confirmed_at || payload.email_verified),
    });
    return {
      id: user.id,
      role: user.role,
      aal: String(payload.aal || 'aal1'),
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
  try {
    const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') return null;
    return {
      id: user.id,
      role: user.role,
      aal: String(payload.aal || 'aal1'),
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  } catch {
    return null;
  }
}

export function devTokensEnabled(): boolean {
  return process.env.DEV_EXPOSE_TOKENS === 'true' && process.env.NODE_ENV !== 'production';
}

export function hashForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
