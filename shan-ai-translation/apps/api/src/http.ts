import {
  type ArgumentsHost,
  type CanActivate,
  Catch,
  type ExceptionFilter,
  type ExecutionContext,
  HttpException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AppError, isAppError } from '@sat/database';
import type { Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { log } from './log';
import { type SessionUser, resolveUser } from './session';

export const IS_PUBLIC = 'sat:public';
export const ROLES = 'sat:roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: Array<'admin' | 'contributor'>) => SetMetadata(ROLES, roles);

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(422, 'VALIDATION', 'Validation failed', result.error.flatten());
  }
  return result.data;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    if (isPublic) return true;
    const user = await resolveUser(req);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
    const roles = this.reflector.getAllAndOverride<Array<'admin' | 'contributor'>>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.includes('admin') && user.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Admin access is required');
    }
    const mfaRequired =
      process.env.AUTH_MODE === 'supabase' || process.env.ADMIN_MFA_REQUIRED === 'true';
    if (roles?.includes('admin') && mfaRequired && user.aal !== 'aal2') {
      throw new AppError(
        403,
        'MFA_REQUIRED',
        'Admin accounts must use multi-factor authentication',
      );
    }
    req.user = user;
    return true;
  }
}

export function currentUser(req: Request & { user?: SessionUser }): SessionUser {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in again');
  return req.user;
}

export function idempotencyKey(req: Request): string | undefined {
  const value = req.header('idempotency-key');
  return value?.trim() || undefined;
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (isAppError(exception)) {
      res.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details ?? null,
        },
      });
      return;
    }
    if (exception instanceof ZodError) {
      res.status(422).json({
        error: { code: 'VALIDATION', message: 'Validation failed', details: exception.flatten() },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : 'Request failed';
      res.status(status).json({ error: { code: 'HTTP', message, details: null } });
      return;
    }
    log('error', 'unhandled error', {
      name: exception instanceof Error ? exception.name : 'unknown',
      detail:
        process.env.NODE_ENV === 'production' || !(exception instanceof Error)
          ? undefined
          : exception.message.slice(0, 200),
    });
    res
      .status(500)
      .json({ error: { code: 'INTERNAL', message: 'Something went wrong', details: null } });
  }
}
