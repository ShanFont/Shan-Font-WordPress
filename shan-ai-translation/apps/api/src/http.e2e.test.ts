import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { hashPassword, prisma } from '@sat/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppModule } from './app.module';

let app: INestApplication;

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      dataset_items, dataset_releases, payment_records, payout_items, payouts, payout_periods,
      earning_adjustments, earning_entries, review_decisions, translation_revisions, drafts,
      assignments, reports, tasks, source_documents, import_rows, import_batches, file_assets,
      categories, rate_rules, terms_acceptances, terms_versions, guide_versions,
      audit_events, idempotency_records, outbox_jobs, profiles, users
    RESTART IDENTITY CASCADE
  `);
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  await app.init();
});

afterAll(async () => {
  await app.close();
});

it('keeps contributors out of admin data and other people records', async () => {
  const email = `${randomUUID()}@example.com`;
  const password = 'password1234';
  const registered = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, displayName: 'Contributor' });
  expect(registered.status).toBe(201);
  await request(app.getHttpServer())
    .post('/api/v1/auth/verify-email')
    .send({ token: registered.body.verificationToken })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);
  const token = login.body.token as string;
  await request(app.getHttpServer())
    .get('/api/v1/admin/dashboard')
    .set('Authorization', `Bearer ${token}`)
    .expect(403);

  const other = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      displayName: 'Other',
      authSubject: `local:${randomUUID()}`,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      profile: { create: { contactValue: 'hidden-contact' } },
    },
  });
  const guide = await prisma.guideVersion.create({
    data: { version: 'g', title: 'g', content: 'g', isCurrent: true },
  });
  const rate = await prisma.rateRule.create({
    data: { taskType: 'sentence', amountSatang: 500, effectiveAt: new Date('2020-01-01Z') },
  });
  const category = await prisma.category.create({ data: { name: 'C', description: '' } });
  const task = await prisma.task.create({
    data: {
      categoryId: category.id,
      externalId: 'e',
      type: 'sentence',
      englishText: 'Private source',
      wordCount: 2,
      sourceHash: 'd'.repeat(64),
      status: 'assigned',
    },
  });
  const assignment = await prisma.assignment.create({
    data: {
      taskId: task.id,
      contributorId: other.id,
      status: 'active',
      expiresAt: new Date(Date.now() + 3600_000),
      rateRuleId: rate.id,
      rateSatang: 500,
      guideVersionId: guide.id,
    },
  });
  const hidden = await request(app.getHttpServer())
    .get(`/api/v1/me/translations/${assignment.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(hidden.status).toBe(404);
  expect(JSON.stringify(hidden.body)).not.toContain('hidden-contact');
});
