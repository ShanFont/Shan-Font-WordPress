'use client';

import { api } from '@sat/api-client';
import { Button, Card, StatusPill } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Release {
  id: string;
  version: string;
  format: string;
  status: string;
}

export default function ExportsPage() {
  const [rows, setRows] = useState<Release[]>([]);
  async function load() {
    setRows(await api.request<Release[]>('GET', '/admin/exports'));
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Dataset exports</h1>
      <div className="flex flex-wrap gap-2">
        {(['jsonl', 'csv', 'tsv', 'xlsx'] as const).map((format) => (
          <Button
            key={format}
            type="button"
            data-testid={`export-${format}`}
            onClick={async () => {
              await api.request('POST', '/admin/exports', { format, split: true });
              for (let attempt = 0; attempt < 10; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await load();
              }
            }}
          >
            Export {format}
          </Button>
        ))}
      </div>
      {rows.map((row) => (
        <Card key={row.id} className="flex items-center justify-between">
          <p data-testid="export-row">
            {row.version} {row.format} <StatusPill>{row.status}</StatusPill>
          </p>
          {row.status === 'ready' ? (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                const result = await api.request<{ url: string }>(
                  'GET',
                  `/admin/exports/${row.id}/download`,
                );
                window.location.href = result.url;
              }}
            >
              Download
            </Button>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
