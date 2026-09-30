import { PAGE_RATE_SATANG, SENTENCE_RATE_SATANG } from '@sat/contracts';
import { prisma } from '../src/client';
import { hashPassword } from '../src/domain/shared';

const PLACEHOLDER = 'REPLACE BEFORE LAUNCH';

async function main() {
  const guide = await prisma.guideVersion.findFirst({ where: { isCurrent: true } });
  if (!guide) {
    await prisma.guideVersion.create({
      data: {
        version: '0.0.0-placeholder',
        title: PLACEHOLDER,
        content:
          'This placeholder translation guide must be replaced with the project translation guide before launch. It is not production content.',
        isCurrent: true,
      },
    });
  }
  const terms = await prisma.termsVersion.findFirst({ where: { isCurrent: true } });
  if (!terms) {
    await prisma.termsVersion.create({
      data: {
        version: '0.0.0-placeholder',
        title: PLACEHOLDER,
        content:
          'These placeholder contribution terms must be replaced with the project terms before launch. They are not production content.',
        isCurrent: true,
      },
    });
  }
  const sentenceRate = await prisma.rateRule.findFirst({ where: { taskType: 'sentence' } });
  if (!sentenceRate) {
    await prisma.rateRule.create({
      data: {
        taskType: 'sentence',
        amountSatang: SENTENCE_RATE_SATANG,
        effectiveAt: new Date('2020-01-01T00:00:00Z'),
      },
    });
  }
  const pageRate = await prisma.rateRule.findFirst({ where: { taskType: 'page' } });
  if (!pageRate) {
    await prisma.rateRule.create({
      data: {
        taskType: 'page',
        amountSatang: PAGE_RATE_SATANG,
        effectiveAt: new Date('2020-01-01T00:00:00Z'),
      },
    });
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          displayName: 'Admin',
          role: 'admin',
          authSubject: `local:${email}`,
          passwordHash: await hashPassword(process.env.ADMIN_PASSWORD),
          emailVerifiedAt: new Date(),
          profile: { create: {} },
        },
      });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
