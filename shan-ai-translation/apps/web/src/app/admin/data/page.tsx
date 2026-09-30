'use client';

import { Notice, message } from '@/components/shell';
import { api } from '@sat/api-client';
import { Button, Card, Field, Input, StatusPill } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Category {
  id: string;
  name: string;
}
interface ImportDetail {
  id: string;
  status: string;
  sheets: string[];
  rows: { rowNumber: number; externalId: string; validationStatus: string; messages: string[] }[];
}

export default function DataPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<
    { id: string; externalId: string; type: string; status: string; wordCount: number }[]
  >([]);
  useEffect(() => {
    api.request<Category[]>('GET', '/admin/categories').then(setCategories);
    api
      .request<{ items: typeof tasks }>('GET', '/admin/tasks')
      .then((result) => setTasks(result.items));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Source data</h1>
      <Card>
        <a className="text-sm font-semibold text-teal" href="/api/v1/admin/imports/template">
          Download Excel template
        </a>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const file = form.get('file');
            if (!(file instanceof File)) return;
            const body = new FormData();
            body.set('file', file);
            body.set('categoryId', String(form.get('categoryId')));
            body.set('taskType', String(form.get('taskType')));
            body.set('provenance', String(form.get('provenance')));
            body.set('permissionRef', String(form.get('permissionRef')));
            try {
              const created = await api.request<{ id: string }>('POST', '/admin/imports', body);
              const next = await api.request<ImportDetail>('GET', `/admin/imports/${created.id}`);
              setDetail(next);
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Category">
            <select
              name="categoryId"
              className="min-h-11 w-full rounded-xl border border-line px-3"
              data-testid="import-category"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Task type">
            <select
              name="taskType"
              className="min-h-11 w-full rounded-xl border border-line px-3"
              data-testid="import-type"
            >
              <option value="sentence">Sentence</option>
              <option value="page">Page</option>
            </select>
          </Field>
          <Field label="Provenance">
            <Input name="provenance" required data-testid="import-provenance" />
          </Field>
          <Field label="Permission reference">
            <Input name="permissionRef" required data-testid="import-permission" />
          </Field>
          <Field label="Workbook">
            <Input name="file" type="file" accept=".xlsx" required data-testid="import-file" />
          </Field>
          <Notice>{error}</Notice>
          <Button type="submit" data-testid="import-upload">
            Upload
          </Button>
        </form>
      </Card>
      {detail ? (
        <Card>
          <p>
            Import <StatusPill>{detail.status}</StatusPill>
          </p>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const summary = await api.request<{
                rows: number;
                errors: number;
                warnings: number;
                skipped: number;
              }>('POST', `/admin/imports/${detail.id}/validate`, {
                sheet: String(form.get('sheet')),
                mapping: {
                  externalId: 'external_id',
                  sourceText: 'source_text',
                  context: 'context',
                  documentId: 'document_id',
                  topic: 'topic',
                  sourceReference: 'source_reference',
                },
              });
              const next = await api.request<ImportDetail>('GET', `/admin/imports/${detail.id}`);
              setDetail({
                ...next,
                status: `validated (${summary.rows} rows, ${summary.errors} errors)`,
              });
            }}
          >
            <Field label="Sheet">
              <select
                name="sheet"
                className="min-h-11 w-full rounded-xl border border-line px-3"
                data-testid="import-sheet"
              >
                {detail.sheets.map((sheet) => (
                  <option key={sheet}>{sheet}</option>
                ))}
              </select>
            </Field>
            <Button type="submit" data-testid="import-validate">
              Validate mapping
            </Button>
          </form>
          <ul className="mt-3 space-y-1 text-sm">
            {detail.rows.map((row) => (
              <li key={row.rowNumber}>
                Row {row.rowNumber} {row.externalId}: {row.validationStatus}{' '}
                {row.messages.join('; ')}
              </li>
            ))}
          </ul>
          <Button
            className="mt-3"
            type="button"
            data-testid="import-commit"
            onClick={async () => {
              await api.request('POST', `/admin/imports/${detail.id}/commit`);
              const started = Date.now();
              while (Date.now() - started < 20000) {
                const next = await api.request<ImportDetail>('GET', `/admin/imports/${detail.id}`);
                setDetail(next);
                if (next.status === 'committed' || next.status === 'failed') break;
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }}
          >
            Commit import
          </Button>
        </Card>
      ) : null}
      <Card>
        <h2 className="font-semibold">Tasks</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2">
              <span>
                {task.externalId} · {task.type} · {task.wordCount} words
              </span>
              <StatusPill>{task.status}</StatusPill>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
