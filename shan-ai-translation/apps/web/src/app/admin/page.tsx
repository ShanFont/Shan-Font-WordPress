'use client';

import { api, baht } from '@sat/api-client';
import { Button, Card } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Dash {
  tasks: {
    available: number;
    assigned: number;
    submitted: number;
    needsEdit: number;
    approved: number;
  };
  earnings: { unpaidSatang: number; scheduledSatang: number; paidSatang: number };
  reviewBacklog: number;
  overduePayouts: number;
  failedJobs: number;
}

export default function AdminHome() {
  const [data, setData] = useState<Dash | null>(null);
  const [jobs, setJobs] = useState<{ id: string; type: string; lastError: string | null }[]>([]);
  useEffect(() => {
    api.request<Dash>('GET', '/admin/dashboard').then(setData);
    api.request<typeof jobs>('GET', '/admin/jobs?status=failed').then(setJobs);
  }, []);
  if (!data) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Operations</h1>
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p>Submitted {data.tasks.submitted}</p>
          <p>Approved {data.tasks.approved}</p>
          <p>Needs edit {data.tasks.needsEdit}</p>
        </Card>
        <Card>
          <p>Unpaid {baht(data.earnings.unpaidSatang)}</p>
          <p>Scheduled {baht(data.earnings.scheduledSatang)}</p>
          <p>Paid {baht(data.earnings.paidSatang)}</p>
        </Card>
        <Card>
          <p>Review backlog {data.reviewBacklog}</p>
          <p>Overdue payouts {data.overduePayouts}</p>
          <p>Failed jobs {data.failedJobs}</p>
        </Card>
      </div>
      {jobs.map((job) => (
        <Card key={job.id}>
          <p className="text-sm">
            {job.type}: {job.lastError}
          </p>
          <Button
            className="mt-2"
            type="button"
            onClick={() => api.request('POST', `/admin/jobs/${job.id}/retry`)}
          >
            Retry job
          </Button>
        </Card>
      ))}
    </div>
  );
}
