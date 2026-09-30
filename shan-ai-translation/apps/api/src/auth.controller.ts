import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@sat/contracts';
import {
  loginUser,
  prisma,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '@sat/database';
import type { Request, Response } from 'express';
import { Public, currentUser, parseBody } from './http';
import { clearSessionCookie, devTokensEnabled, setSessionCookie, signSession } from './session';

@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class AuthController {
  @Public()
  @Post('register')
  async register(@Body() body: unknown) {
    const input = parseBody(registerSchema, body);
    const result = await registerUser(prisma, input);
    return {
      id: result.user.id,
      email: result.user.email,
      verificationToken: devTokensEnabled() ? result.verificationToken : null,
    };
  }

  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(loginSchema, body);
    const user = await loginUser(prisma, input);
    const token = signSession(user);
    setSessionCookie(res, token);
    return {
      token,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res);
    return { ok: true };
  }

  @Public()
  @Post('verify-email')
  async verify(@Body() body: unknown) {
    const input = parseBody(verifyEmailSchema, body);
    await verifyEmail(prisma, input.token);
    return { ok: true };
  }

  @Public()
  @Post('forgot-password')
  async forgot(@Body() body: unknown) {
    const input = parseBody(forgotPasswordSchema, body);
    const result = await requestPasswordReset(prisma, input.email);
    return { ok: true, resetToken: devTokensEnabled() ? result.resetToken : null };
  }

  @Public()
  @Post('reset-password')
  async reset(@Body() body: unknown) {
    const input = parseBody(resetPasswordSchema, body);
    await resetPassword(prisma, input.token, input.password);
    return { ok: true };
  }

  @Public()
  @Get('google')
  google() {
    if (!process.env.SUPABASE_URL || !process.env.WEB_ORIGIN) {
      return { configured: false, url: null };
    }
    const redirect = `${process.env.WEB_ORIGIN}/auth/callback`;
    const url = `${process.env.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
    return { configured: true, url };
  }

  @Get('session')
  session(@Req() req: Request) {
    const user = currentUser(req);
    return { id: user.id, role: user.role, displayName: user.displayName };
  }
}
