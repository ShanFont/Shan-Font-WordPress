'use client';

import { api } from '@sat/api-client';
import { Button, Card } from '@sat/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<{ id: string; status: string; taskType: string }[]>([]);
  useEffect(() => {
    api.request<typeof rows>('GET', `/admin/users/${params.id}/translations`).then(setRows);
  }, [params.id]);
  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-bold">Contributor</h1>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => api.request('PATCH', `/admin/users/${params.id}`, { status: 'suspended' })}
        >
          Suspend
        </Button>
        <Button
          type="button"
          onClick={() => api.request('PATCH', `/admin/users/${params.id}`, { status: 'active' })}
        >
          Reactivate
        </Button>
      </div>
      {rows.map((row) => (
        <Card key={row.id}>
          {row.taskType} · {row.status}
        </Card>
      ))}
    </div>
  );
}
