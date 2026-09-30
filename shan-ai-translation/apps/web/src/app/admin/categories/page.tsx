'use client';

import { Notice, message } from '@/components/shell';
import { api } from '@sat/api-client';
import { Button, Card, Field, Input, StatusPill } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Category {
  id: string;
  name: string;
  description: string;
  status: string;
}

export default function CategoriesPage() {
  const [rows, setRows] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setRows(await api.request<Category[]>('GET', '/admin/categories'));
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Categories</h1>
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            try {
              await api.request('POST', '/admin/categories', {
                name: String(form.get('name')),
                description: String(form.get('description') || ''),
              });
              formElement.reset();
              await load();
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Name">
            <Input name="name" required data-testid="category-name" />
          </Field>
          <Field label="Description">
            <Input name="description" />
          </Field>
          <Notice>{error}</Notice>
          <Button type="submit" data-testid="category-create">
            Create category
          </Button>
        </form>
      </Card>
      {rows.map((row) => (
        <Card key={row.id} className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{row.name}</p>
            <p className="text-sm text-muted">{row.description}</p>
          </div>
          <div className="flex gap-2">
            <StatusPill>{row.status}</StatusPill>
            {row.status === 'active' ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  api
                    .request('PATCH', `/admin/categories/${row.id}`, { status: 'paused' })
                    .then(load)
                }
              >
                Pause
              </Button>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
