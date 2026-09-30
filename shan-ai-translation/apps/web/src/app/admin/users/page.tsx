'use client';

import { api } from '@sat/api-client';
import { Card, StatusPill } from '@sat/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  useEffect(() => {
    api
      .request<{ items: UserRow[] }>('GET', '/admin/users')
      .then((result) => setRows(result.items));
  }, []);
  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-bold">Users</h1>
      {rows.map((row) => (
        <Card key={row.id} className="flex items-center justify-between">
          <div>
            <Link href={`/admin/users/${row.id}`} className="font-semibold text-teal">
              {row.displayName}
            </Link>
            <p className="text-sm text-muted">{row.email}</p>
          </div>
          <div className="flex gap-2">
            <StatusPill>{row.role}</StatusPill>
            <StatusPill>{row.status}</StatusPill>
          </div>
        </Card>
      ))}
    </div>
  );
}
