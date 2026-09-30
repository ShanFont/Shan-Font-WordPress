'use client';

import { api } from '@sat/api-client';
import { Card, StatusPill } from '@sat/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Row {
  id: string;
  taskType: string;
  status: string;
  wordCount: number;
  feedback: string | null;
}

export default function TranslationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api
      .request<{ items: Row[] }>('GET', '/me/translations')
      .then((result) => setRows(result.items));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">My translations</h1>
      {rows.length === 0 ? <Card>No translations yet.</Card> : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <div className="flex items-center justify-between gap-3">
            <Link href={`/translations/${row.id}`} className="font-semibold text-teal">
              {row.taskType} · {row.wordCount} words
            </Link>
            <StatusPill>{row.status}</StatusPill>
          </div>
          {row.feedback ? <p className="mt-2 text-sm">Feedback: {row.feedback}</p> : null}
        </Card>
      ))}
    </div>
  );
}
