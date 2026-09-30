import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import {
  claimSchema,
  cursorQuerySchema,
  draftSchema,
  profilePatchSchema,
  reportSchema,
  submitSchema,
} from '@sat/contracts';
import {
  acceptTerms,
  claimAssignment,
  communityStats,
  contributorDashboard,
  createReport,
  getCurrentGuide,
  getOwnAssignment,
  getOwnTranslation,
  leaderboard,
  listOwnEarnings,
  listOwnPayouts,
  listOwnTranslations,
  prisma,
  saveDraft,
  skipAssignment,
  submitAssignment,
  updateProfile,
} from '@sat/database';
import type { Request } from 'express';
import { Public, currentUser, idempotencyKey, parseBody } from './http';

@Controller()
export class ContributorController {
  @Get('me')
  async me(@Req() req: Request) {
    const session = currentUser(req);
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      include: { profile: true },
    });
    const terms = await prisma.termsVersion.findFirst({ where: { isCurrent: true } });
    const accepted = terms
      ? await prisma.termsAcceptance.findUnique({
          where: { userId_versionId: { userId: session.id, versionId: terms.id } },
        })
      : null;
    return {
      id: session.id,
      email: session.email,
      displayName: user?.displayName,
      role: session.role,
      status: session.status,
      emailVerified: Boolean(session.emailVerifiedAt),
      termsAccepted: Boolean(accepted),
      profile: user?.profile
        ? {
            contactMethod: user.profile.contactMethod,
            contactValue: user.profile.contactValue,
            leaderboardOptIn: user.profile.leaderboardOptIn,
          }
        : null,
    };
  }

  @Patch('me/profile')
  async profile(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(profilePatchSchema, body);
    const profile = await updateProfile(prisma, currentUser(req).id, input);
    return {
      contactMethod: profile.contactMethod,
      contactValue: profile.contactValue,
      leaderboardOptIn: profile.leaderboardOptIn,
    };
  }

  @Get('me/dashboard')
  dashboard(@Req() req: Request) {
    return contributorDashboard(prisma, currentUser(req).id);
  }

  @Get('guide')
  async guide() {
    const guide = await getCurrentGuide(prisma);
    return { version: guide.version, title: guide.title, content: guide.content };
  }

  @Public()
  @Get('terms')
  async terms() {
    const terms = await prisma.termsVersion.findFirst({ where: { isCurrent: true } });
    if (!terms) return { version: null, title: null, content: null };
    return { version: terms.version, title: terms.title, content: terms.content };
  }

  @Post('terms/acceptances')
  accept(@Req() req: Request) {
    return acceptTerms(prisma, currentUser(req).id);
  }

  @Post('assignments')
  claim(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(claimSchema, body);
    return claimAssignment(prisma, {
      contributorId: currentUser(req).id,
      taskType: input.taskType,
      idempotencyKey: idempotencyKey(req),
    });
  }

  @Get('assignments/:id')
  assignment(@Req() req: Request, @Param('id') id: string) {
    return getOwnAssignment(prisma, currentUser(req).id, id);
  }

  @Put('assignments/:id/draft')
  draft(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(draftSchema, body);
    return saveDraft(prisma, { contributorId: currentUser(req).id, assignmentId: id, ...input });
  }

  @Post('assignments/:id/skip')
  skip(@Req() req: Request, @Param('id') id: string) {
    return skipAssignment(prisma, currentUser(req).id, id);
  }

  @Post('assignments/:id/submit')
  submit(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(submitSchema, body);
    return submitAssignment(prisma, {
      contributorId: currentUser(req).id,
      assignmentId: id,
      expectedDraftVersion: input.expectedDraftVersion,
      idempotencyKey: idempotencyKey(req),
    });
  }

  @Get('me/translations')
  translations(@Req() req: Request, @Query() query: Record<string, string>) {
    const parsed = parseBody(cursorQuerySchema, query);
    return listOwnTranslations(prisma, currentUser(req).id, { ...parsed, status: query.status });
  }

  @Get('me/translations/:id')
  translation(@Req() req: Request, @Param('id') id: string) {
    return getOwnTranslation(prisma, currentUser(req).id, id);
  }

  @Get('me/earnings')
  earnings(@Req() req: Request) {
    return listOwnEarnings(prisma, currentUser(req).id);
  }

  @Get('me/payouts')
  payouts(@Req() req: Request) {
    return listOwnPayouts(prisma, currentUser(req).id);
  }

  @Post('reports')
  async report(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(reportSchema, body);
    const report = await createReport(prisma, currentUser(req).id, input.taskId, input.reason);
    return { id: report.id, status: report.status };
  }

  @Public()
  @Get('community/stats')
  stats() {
    return communityStats(prisma);
  }

  @Public()
  @Get('community/leaderboard')
  board() {
    return leaderboard(prisma);
  }
}
