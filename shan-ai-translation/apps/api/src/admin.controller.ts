import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  adjustmentSchema,
  bulkConfirmSchema,
  bulkPreviewSchema,
  categoryCreateSchema,
  categoryPatchSchema,
  cursorQuerySchema,
  exportCreateSchema,
  guideCreateSchema,
  importCreateSchema,
  importValidateSchema,
  payoutConfirmSchema,
  rateCreateSchema,
  reportResolveSchema,
  reviewDecisionSchema,
  taskActionSchema,
  termsCreateSchema,
  userPatchSchema,
} from '@sat/contracts';
import {
  AppError,
  actOnTask,
  adjustEarning,
  adminDashboard,
  buildImportTemplate,
  confirmBulkReview,
  confirmPayout,
  createCategory,
  createRate,
  createStorage,
  decideReview,
  enqueueExport,
  enqueueImport,
  listReviewQueue,
  listSheets,
  previewBulkReview,
  prisma,
  publishGuide,
  publishTerms,
  resolveReport,
  retryJob,
  updateCategory,
  updateUserAdmin,
  validateImport,
  verifySignedToken,
} from '@sat/database';
import type { Request, Response } from 'express';
import { Public, Roles, currentUser, idempotencyKey, parseBody } from './http';

const storage = createStorage();

@Controller()
@Roles('admin')
export class AdminController {
  @Get('admin/dashboard')
  dashboard() {
    return adminDashboard(prisma);
  }

  @Get('admin/categories')
  categories() {
    return prisma.category.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('admin/categories')
  createCategory(@Req() req: Request, @Body() body: unknown) {
    return createCategory(prisma, currentUser(req).id, parseBody(categoryCreateSchema, body));
  }

  @Patch('admin/categories/:id')
  patchCategory(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return updateCategory(prisma, currentUser(req).id, id, parseBody(categoryPatchSchema, body));
  }

  @Get('admin/imports/template')
  async template(@Res() res: Response) {
    const bytes = await buildImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="shan-import-template.xlsx"');
    res.send(bytes);
  }

  @Post('admin/imports')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
  ) {
    if (!file) throw new AppError(422, 'FILE_REQUIRED', 'Choose an .xlsx file');
    const input = parseBody(importCreateSchema, body);
    return createImportBatch(req, file, input);
  }

  @Post('admin/imports/:id/validate')
  validate(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(importValidateSchema, body);
    return validateImport(prisma, storage, { batchId: id, adminId: currentUser(req).id, ...input });
  }

  @Get('admin/imports/:id')
  async importDetail(@Param('id') id: string) {
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: { rows: { orderBy: { rowNumber: 'asc' }, take: 100 }, fileAsset: true },
    });
    if (!batch) throw new AppError(404, 'NOT_FOUND', 'Import not found');
    const sheets =
      batch.status === 'uploaded' || batch.status === 'validated'
        ? await listSheets(storage, batch.fileAsset.objectKey).catch(() => [])
        : [];
    return {
      id: batch.id,
      status: batch.status,
      taskType: batch.taskType,
      sheetName: batch.sheetName,
      columnMapping: batch.columnMapping,
      errorSummary: batch.errorSummary,
      sheets,
      rows: batch.rows.map((row) => ({
        rowNumber: row.rowNumber,
        externalId: row.externalId,
        validationStatus: row.validationStatus,
        messages: row.messages,
      })),
    };
  }

  @Post('admin/imports/:id/commit')
  @HttpCode(202)
  commit(@Req() req: Request, @Param('id') id: string) {
    return enqueueImport(prisma, currentUser(req).id, id);
  }

  @Get('admin/tasks')
  async tasks(@Query() query: Record<string, string>) {
    const parsed = parseBody(cursorQuerySchema, query);
    const rows = await prisma.task.findMany({
      where: {
        status: query.status as never,
        type: query.type as never,
        categoryId: query.categoryId || undefined,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsed.limit,
      include: { category: { select: { id: true, name: true, status: true } } },
    });
    return {
      items: rows.map((task) => ({
        id: task.id,
        externalId: task.externalId,
        type: task.type,
        status: task.status,
        wordCount: task.wordCount,
        category: task.category,
        excludedFromDataset: task.excludedFromDataset,
        createdAt: task.createdAt.toISOString(),
      })),
    };
  }

  @Post('admin/tasks/:id/actions')
  taskAction(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(taskActionSchema, body);
    return actOnTask(prisma, { adminId: currentUser(req).id, taskId: id, ...input });
  }

  @Get('admin/users')
  async users(@Query() query: Record<string, string>) {
    const parsed = parseBody(cursorQuerySchema, query);
    const rows = await prisma.user.findMany({
      where: {
        role: query.role as never,
        status: query.status as never,
        displayName: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: parsed.limit,
      include: { profile: true },
    });
    return {
      items: rows.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        status: user.status,
        leaderboardOptIn: user.profile?.leaderboardOptIn ?? false,
        contactMethod: user.profile?.contactMethod ?? null,
        contactValue: user.profile?.contactValue ?? null,
      })),
    };
  }

  @Patch('admin/users/:id')
  patchUser(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return updateUserAdmin(prisma, currentUser(req).id, id, parseBody(userPatchSchema, body));
  }

  @Get('admin/users/:id/translations')
  async userTranslations(@Param('id') id: string) {
    const rows = await prisma.assignment.findMany({
      where: { contributorId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { task: true, revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      taskType: row.task.type,
      taskStatus: row.task.status,
      latestRevision: row.revisions[0]?.revisionNumber ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Get('admin/reviews')
  reviews(@Query() query: Record<string, string>) {
    return listReviewQueue(prisma, parseBody(cursorQuerySchema, query));
  }

  @Post('admin/reviews/bulk-preview')
  bulkPreview(@Body() body: unknown) {
    const input = parseBody(bulkPreviewSchema, body);
    return previewBulkReview(prisma, input.revisionIds);
  }

  @Post('admin/reviews/bulk-confirm')
  bulkConfirm(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(bulkConfirmSchema, body);
    return confirmBulkReview(
      prisma,
      currentUser(req).id,
      input.items.map((item) => ({ ...item, adminId: currentUser(req).id })),
      idempotencyKey(req),
    );
  }

  @Post('admin/reviews/:revisionId/decision')
  decision(@Req() req: Request, @Param('revisionId') revisionId: string, @Body() body: unknown) {
    const input = parseBody(reviewDecisionSchema, body);
    return decideReview(prisma, {
      adminId: currentUser(req).id,
      revisionId,
      ...input,
      idempotencyKey: idempotencyKey(req),
    });
  }

  @Get('admin/rates')
  rates() {
    return prisma.rateRule.findMany({ orderBy: { effectiveAt: 'desc' } });
  }

  @Post('admin/rates')
  createRate(@Req() req: Request, @Body() body: unknown) {
    return createRate(prisma, currentUser(req).id, parseBody(rateCreateSchema, body));
  }

  @Get('admin/payout-periods')
  async periods() {
    const periods = await prisma.payoutPeriod.findMany({
      orderBy: { cutoffAt: 'desc' },
      include: { payouts: true },
    });
    return periods.map((period) => ({
      id: period.id,
      periodStart: period.periodStart.toISOString(),
      cutoffAt: period.cutoffAt.toISOString(),
      dueAt: period.dueAt.toISOString(),
      status: period.status,
      payouts: period.payouts.length,
      liabilitySatang: period.payouts.reduce((sum, payout) => sum + payout.amountSatang, 0),
    }));
  }

  @Post('admin/payout-periods/prepare')
  @HttpCode(202)
  async prepare(@Req() req: Request) {
    const job = await prisma.outboxJob.create({
      data: { type: 'payout.prepare', payload: { requestedBy: currentUser(req).id } },
    });
    return { jobId: job.id, status: 'queued' };
  }

  @Get('admin/payouts')
  async payouts(@Query('status') status?: string) {
    const rows = await prisma.payout.findMany({
      where: { status: status as never },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { contributor: true, period: true, payment: true },
    });
    return rows.map((payout) => ({
      id: payout.id,
      contributor: {
        id: payout.contributorId,
        displayName: payout.contributor.displayName,
        email: payout.contributor.email,
      },
      amountSatang: payout.amountSatang,
      status: payout.status,
      dueAt: payout.period.dueAt.toISOString(),
      reference: payout.payment?.reference ?? null,
    }));
  }

  @Post('admin/payouts/:id/confirm')
  confirm(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(payoutConfirmSchema, body);
    return confirmPayout(prisma, {
      adminId: currentUser(req).id,
      payoutId: id,
      ...input,
      idempotencyKey: idempotencyKey(req),
    });
  }

  @Post('admin/earnings/:id/adjustments')
  adjust(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(adjustmentSchema, body);
    return adjustEarning(prisma, { adminId: currentUser(req).id, earningId: id, ...input });
  }

  @Post('admin/exports')
  @HttpCode(202)
  exportDataset(@Req() req: Request, @Body() body: unknown) {
    return enqueueExport(prisma, currentUser(req).id, parseBody(exportCreateSchema, body));
  }

  @Get('admin/exports')
  async exports() {
    const rows = await prisma.datasetRelease.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      format: row.format,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Get('admin/exports/:id')
  async exportDetail(@Param('id') id: string) {
    const release = await prisma.datasetRelease.findUnique({ where: { id } });
    if (!release) throw new AppError(404, 'NOT_FOUND', 'Export not found');
    return {
      id: release.id,
      version: release.version,
      format: release.format,
      status: release.status,
      filters: release.filters,
      metadata: release.metadata,
      error: release.error,
    };
  }

  @Get('admin/exports/:id/download')
  async download(@Param('id') id: string) {
    const release = await prisma.datasetRelease.findUnique({
      where: { id },
      include: { fileAsset: true },
    });
    if (!release?.fileAsset) throw new AppError(409, 'NOT_READY', 'The export is not ready');
    return {
      url: storage.signedPath(release.fileAsset.objectKey, 300),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  @Get('admin/audit-events')
  async audit(@Query() query: Record<string, string>) {
    const parsed = parseBody(cursorQuerySchema, query);
    const rows = await prisma.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: parsed.limit,
      include: { actor: { select: { id: true, displayName: true, role: true } } },
    });
    return rows.map((event) => ({
      id: event.id,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      changes: event.changes,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor
        ? { id: event.actor.id, displayName: event.actor.displayName, role: event.actor.role }
        : null,
    }));
  }

  @Get('admin/guide-versions')
  guides() {
    return prisma.guideVersion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('admin/guide-versions')
  publishGuide(@Req() req: Request, @Body() body: unknown) {
    return publishGuide(prisma, currentUser(req).id, parseBody(guideCreateSchema, body));
  }

  @Get('admin/terms-versions')
  terms() {
    return prisma.termsVersion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('admin/terms-versions')
  publishTerms(@Req() req: Request, @Body() body: unknown) {
    return publishTerms(prisma, currentUser(req).id, parseBody(termsCreateSchema, body));
  }

  @Get('admin/jobs')
  jobs(@Query('status') status = 'failed') {
    return prisma.outboxJob.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Post('admin/jobs/:id/retry')
  retry(@Req() req: Request, @Param('id') id: string) {
    return retryJob(prisma, currentUser(req).id, id);
  }

  @Get('admin/reports')
  reports() {
    return prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { task: { select: { id: true, type: true, status: true } } },
    });
  }

  @Post('admin/reports/:id/resolve')
  resolve(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(reportResolveSchema, body);
    return resolveReport(prisma, { adminId: currentUser(req).id, reportId: id, ...input });
  }
}

async function createImportBatch(
  req: Request,
  file: Express.Multer.File,
  input: {
    categoryId: string;
    taskType: 'sentence' | 'page';
    provenance: string;
    permissionRef: string;
  },
) {
  const { createImportBatch: create } = await import('@sat/database');
  return create(prisma, storage, {
    adminId: currentUser(req).id,
    filename: file.originalname,
    bytes: file.buffer,
    ...input,
  });
}

@Controller()
export class StorageController {
  @Public()
  @Get('storage/download')
  async download(@Query('token') token: string, @Res() res: Response) {
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Missing download token');
    try {
      const { key } = verifySignedToken(
        process.env.STORAGE_SIGNING_SECRET || 'dev-only-change-me',
        token,
      );
      const asset = await prisma.fileAsset.findUnique({ where: { objectKey: key } });
      const bytes = await storage.get(key);
      res.setHeader('Content-Type', asset?.contentType || 'application/octet-stream');
      res.send(bytes);
    } catch {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'This download link is invalid or expired' },
      });
    }
  }
}
