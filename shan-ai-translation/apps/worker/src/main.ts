import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../../.env') });
import {
  createStorage,
  drainOutbox,
  expireReservations,
  flagOverduePayouts,
  preparePayouts,
  prisma,
} from '@sat/database';
import PgBoss from 'pg-boss';

const storage = createStorage();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const boss = new PgBoss({ connectionString, supervise: true, schedule: true });
  boss.on('error', (error: Error) => {
    console.log(JSON.stringify({ level: 'error', message: 'pg-boss error', name: error.name }));
  });
  await boss.start();
  for (const name of ['reservation-expiry', 'payout-overdue', 'payout-prepare', 'outbox-drain']) {
    await boss.createQueue(name);
  }
  await boss.schedule('reservation-expiry', '* * * * *');
  await boss.schedule('payout-overdue', '30 0 * * *', undefined, { tz: 'Asia/Bangkok' });
  await boss.schedule('payout-prepare', '5 0 1 * *', undefined, { tz: 'Asia/Bangkok' });
  await boss.schedule('outbox-drain', '* * * * *');
  await boss.work('reservation-expiry', async () => {
    await expireReservations(prisma);
  });
  await boss.work('payout-overdue', async () => {
    await flagOverduePayouts(prisma);
  });
  await boss.work('payout-prepare', async () => {
    await preparePayouts(prisma);
  });
  await boss.work('outbox-drain', async () => {
    await drainOutbox(prisma, storage);
  });
  setInterval(() => {
    drainOutbox(prisma, storage).catch((error: unknown) => {
      console.log(
        JSON.stringify({
          level: 'error',
          message: 'outbox drain failed',
          name: error instanceof Error ? error.name : 'unknown',
        }),
      );
    });
  }, 2000);
  console.log(JSON.stringify({ level: 'info', message: 'worker listening' }));
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      level: 'error',
      message: 'worker failed',
      name: error instanceof Error ? error.name : 'unknown',
    }),
  );
  process.exit(1);
});
