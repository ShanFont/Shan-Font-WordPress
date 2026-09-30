'use client';

import { api } from '@sat/api-client';
import { Card } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Event {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
  actor: { displayName: string } | null;
}

export default function AuditPage() {
  const [rows, setRows] = useState<Event[]>([]);
  useEffect(() => {
    api.request<Event[]>('GET', '/admin/audit-events').then(setRows);
  }, []);
  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-bold">Audit</h1>
      {rows.map((row) => (
        <Card key={row.id}>
          <p className="text-sm">
            {new Date(row.createdAt).toLocaleString()} · {row.actor?.displayName || 'system'} ·{' '}
            {row.action} · {row.resourceType}
          </p>
        </Card>
      ))}
    </div>
  );
}
