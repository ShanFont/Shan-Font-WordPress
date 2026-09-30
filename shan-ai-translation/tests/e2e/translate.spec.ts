import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { type Page, expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

const execFileAsync = promisify(execFile);
const admin = { email: 'admin@example.com', password: 'password1234' };
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://sat:sat@127.0.0.1:5432/shan_translation';

test.setTimeout(180_000);

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/(admin|dashboard)/);
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL(/\/login/);
}

async function api<T>(
  page: Page,
  method: string,
  apiPath: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await page.request.fetch(`/api/v1${apiPath}`, {
    method,
    data: body,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok()) throw new Error(`${method} ${apiPath} ${response.status()} ${text}`);
  return data as T;
}

test('import, translate, review, pay, and export', async ({ page }) => {
  const stamp = Date.now();
  const email = `contributor-${stamp}@example.com`;
  const displayName = `Nang ${String(stamp).slice(-4)}`;
  const categoryName = `Pilot ${stamp}`;
  await page.goto('/register');
  await page.getByTestId('register-name').fill(displayName);
  await page.getByTestId('register-email').fill(email);
  await page.getByTestId('register-password').fill('password1234');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('verify-token')).not.toHaveValue('');
  await page.getByTestId('verify-submit').click();
  await login(page, email, 'password1234');
  await page.goto('/terms');
  await page.getByTestId('accept-terms').click();
  await expect(page.getByTestId('accept-terms')).toHaveText('Accepted');

  await logout(page);
  await login(page, admin.email, admin.password);
  await page.goto('/admin/categories');
  await page.getByTestId('category-name').fill(categoryName);
  await page.getByTestId('category-create').click();
  await expect(page.getByText(categoryName)).toBeVisible();

  const dir = await mkdtemp(path.join(tmpdir(), 'sat-'));
  const file = path.join(dir, 'sources.xlsx');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('sources');
  sheet.addRow(['external_id', 'source_text']);
  sheet.addRow(['s-1', 'The river is wide.']);
  await writeFile(file, Buffer.from(await book.xlsx.writeBuffer()));

  await page.goto('/admin/data');
  const pilotOption = page
    .getByTestId('import-category')
    .locator('option', { hasText: categoryName });
  await expect(pilotOption.first()).toBeAttached();
  await page
    .getByTestId('import-category')
    .selectOption(String(await pilotOption.first().getAttribute('value')));
  await page.getByTestId('import-provenance').fill('Pilot permission');
  await page.getByTestId('import-permission').fill('PERM-PILOT');
  await page.getByTestId('import-file').setInputFiles(file);
  await page.getByTestId('import-upload').click();
  await expect(page.getByTestId('import-validate')).toBeVisible();
  await page.getByTestId('import-validate').click();
  await expect(page.getByText(/validated/)).toBeVisible();
  await page.getByTestId('import-commit').click();
  await expect(page.getByText('committed')).toBeVisible({ timeout: 30_000 });

  await logout(page);
  await login(page, email, 'password1234');
  await page.goto('/translate');
  await page.getByTestId('claim-sentence').click();
  await expect(page.getByTestId('source-text')).toContainText('The river is wide.');
  await page.getByTestId('shan-editor').fill('ၼမ်ႉမႂ်ႇ');
  await page.getByTestId('submit-translation').click();
  await expect(page.getByText('Submitted for review')).toBeVisible();

  await logout(page);
  await login(page, admin.email, admin.password);
  await page.goto('/admin/review');
  const review = page.locator('section').filter({ hasText: 'ၼမ်ႉမႂ်ႇ' });
  await expect(review.getByTestId('review-shan')).toContainText('ၼမ်ႉမႂ်ႇ');
  await review.getByTestId('approve').click();
  await expect(review).toHaveCount(0);

  await logout(page);
  await login(page, email, 'password1234');
  await page.goto('/earnings');
  await expect(page.getByText('฿5')).toBeVisible();

  await logout(page);
  await login(page, admin.email, admin.password);
  const categories = await api<{ id: string; name: string }[]>(page, 'GET', '/admin/categories');
  const category = categories.find((item) => item.name === categoryName);
  if (!category) throw new Error('Pilot category was not created');

  const batchBook = new ExcelJS.Workbook();
  const batchSheet = batchBook.addWorksheet('sources');
  batchSheet.addRow(['external_id', 'source_text']);
  for (let index = 0; index < 99; index += 1) {
    batchSheet.addRow([`s-${stamp}-${index}`, `Sample sentence ${stamp} number ${index}.`]);
  }
  const batchFile = path.join(dir, 'batch.xlsx');
  await writeFile(batchFile, Buffer.from(await batchBook.xlsx.writeBuffer()));
  const uploaded = await page.request.post('/api/v1/admin/imports', {
    multipart: {
      file: {
        name: 'batch.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: await readFile(batchFile),
      },
      categoryId: category.id,
      taskType: 'sentence',
      provenance: 'Pilot permission',
      permissionRef: 'PERM-PAYOUT',
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  const batch = (await uploaded.json()) as { id: string };
  await api(page, 'POST', `/admin/imports/${batch.id}/validate`, {
    sheet: 'sources',
    mapping: { externalId: 'external_id', sourceText: 'source_text' },
  });
  await api(page, 'POST', `/admin/imports/${batch.id}/commit`);
  await expect
    .poll(
      async () => (await api<{ status: string }>(page, 'GET', `/admin/imports/${batch.id}`)).status,
      {
        timeout: 30_000,
      },
    )
    .toBe('committed');

  await logout(page);
  await login(page, email, 'password1234');
  for (let index = 0; index < 99; index += 1) {
    const claimed = await api<{
      assignmentId: string;
      draft: { version: number; shanText: string } | null;
    }>(page, 'POST', '/assignments', { taskType: 'sentence' }, { 'Idempotency-Key': randomUUID() });
    let version = claimed.draft?.version ?? 1;
    if (!claimed.draft?.shanText.trim()) {
      const saved = await api<{ version: number }>(
        page,
        'PUT',
        `/assignments/${claimed.assignmentId}/draft`,
        { shanText: `ၼမ်ႉ ${index}`, expectedVersion: version },
      );
      version = saved.version;
    }
    await api(
      page,
      'POST',
      `/assignments/${claimed.assignmentId}/submit`,
      { expectedDraftVersion: version },
      { 'Idempotency-Key': randomUUID() },
    );
  }

  await logout(page);
  await login(page, admin.email, admin.password);
  for (let round = 0; round < 5; round += 1) {
    const queue = await api<{
      items: { revisionId: string; contributor: { displayName: string } }[];
    }>(page, 'GET', '/admin/reviews?limit=100');
    const mine = queue.items.filter((item) => item.contributor.displayName === displayName);
    if (mine.length === 0) break;
    await api(
      page,
      'POST',
      '/admin/reviews/bulk-confirm',
      { items: mine.map((item) => ({ revisionId: item.revisionId, decision: 'approve' })) },
      { 'Idempotency-Key': randomUUID() },
    );
  }

  await execFileAsync('psql', [
    databaseUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE earning_entries AS earning
     SET approval_date = (date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') - interval '15 days'
     FROM users
     WHERE earning.contributor_id = users.id
       AND users.email = '${email}'
       AND earning.status = 'unpaid'`,
  ]);

  await page.goto('/admin/payments');
  await page.getByTestId('prepare-payouts').click();
  const payout = page.getByTestId('payout-card').filter({ hasText: displayName });
  await expect(payout).toBeVisible({ timeout: 20_000 });
  await expect(payout).toContainText('฿500');
  await payout.getByTestId('pay-date').fill('2026-09-15T10:00');
  await payout.getByTestId('pay-reference').fill('E2E-REF');
  await payout.getByTestId('pay-confirm').click();
  await expect(payout).toContainText('paid');

  await logout(page);
  await login(page, email, 'password1234');
  await page.goto('/earnings');
  await expect(page.getByTestId('payout-row')).toContainText('฿500');
  await expect(page.getByTestId('payout-row')).toContainText('paid');
  await expect(page.getByTestId('payout-row')).toContainText('E2E-REF');

  await logout(page);
  await login(page, admin.email, admin.password);
  await page.goto('/admin/exports');
  await page.getByTestId('export-jsonl').click();
  const release = page
    .getByTestId('export-row')
    .filter({ hasText: 'jsonl' })
    .filter({ hasText: 'ready' });
  await expect(release.first()).toBeVisible({ timeout: 20_000 });
  const releases = await api<{ id: string; format: string; status: string }[]>(
    page,
    'GET',
    '/admin/exports',
  );
  const ready = releases.find((item) => item.format === 'jsonl' && item.status === 'ready');
  if (!ready) throw new Error('JSONL export did not become ready');
  const download = await api<{ url: string }>(page, 'GET', `/admin/exports/${ready.id}/download`);
  const fileResponse = await page.request.get(download.url);
  const exported = await fileResponse.text();
  expect(fileResponse.ok(), `${fileResponse.status()} ${download.url} ${exported}`).toBeTruthy();
  expect(exported).toContain('The river is wide.');
  expect(exported).toContain('ၼမ်ႉမႂ်ႇ');
  expect(exported).not.toContain(email);
  expect(exported).not.toContain(displayName);
});
