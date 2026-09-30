'use client';

import { api, baht } from '@sat/api-client';
import { Button, Card, StatusPill } from '@sat/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Dashboard {
  inProgress: { assignmentId: string; taskType: string; status: string; expiresAt: string } | null;
  activity: { sentenceApproved: number; pageApproved: number; pendingReview: number };
  earnings: { unpaidSatang: number; scheduledSatang: number; paidSatang: number };
  thresholds: {
    sentences: { approvedUnpaid: number; required: number; remaining: number };
    pages: { approvedUnpaid: number; required: number; remaining: number };
  };
  badges: { id: string; label: string; earned: boolean }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => {
    api.request<Dashboard>('GET', '/me/dashboard').then(setData);
  }, []);
  if (!data) return <p>Loading dashboard…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Sentences</h2>
          <p className="mt-2 text-sm">
            {data.thresholds.sentences.approvedUnpaid} / {data.thresholds.sentences.required} unpaid
            approved
          </p>
          <div className="mt-2 h-2 rounded-full bg-paper">
            <div
              className="h-2 rounded-full bg-teal"
              style={{
                width: `${Math.min(100, (data.thresholds.sentences.approvedUnpaid / data.thresholds.sentences.required) * 100)}%`,
              }}
            />
          </div>
          <Link href="/translate" className="mt-4 inline-flex">
            <Button type="button">Translate a sentence</Button>
          </Link>
        </Card>
        <Card>
          <h2 className="font-semibold">Pages</h2>
          <p className="mt-2 text-sm">
            {data.thresholds.pages.approvedUnpaid} / {data.thresholds.pages.required} unpaid
            approved
          </p>
          <div className="mt-2 h-2 rounded-full bg-paper">
            <div
              className="h-2 rounded-full bg-teal"
              style={{
                width: `${Math.min(100, (data.thresholds.pages.approvedUnpaid / data.thresholds.pages.required) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-3 text-sm text-muted">
            Pages are 250–500 English words. ฿250 when approved.
          </p>
        </Card>
      </div>
      <Card>
        <h2 className="font-semibold">Earnings</h2>
        <ul className="mt-3 grid gap-2 text-sm md:grid-cols-3">
          <li>Unpaid {baht(data.earnings.unpaidSatang)}</li>
          <li>Scheduled {baht(data.earnings.scheduledSatang)}</li>
          <li>Paid {baht(data.earnings.paidSatang)}</li>
        </ul>
        <p className="mt-2 text-sm text-muted">{data.activity.pendingReview} waiting for review.</p>
        {data.inProgress ? (
          <p className="mt-2 text-sm">
            In progress: {data.inProgress.taskType}{' '}
            <StatusPill>{data.inProgress.status}</StatusPill>
          </p>
        ) : null}
      </Card>
      <Card>
        <h2 className="font-semibold">Milestones</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {data.badges.map((badge) => (
            <li key={badge.id}>
              <StatusPill>{badge.earned ? badge.label : `${badge.label} — not yet`}</StatusPill>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
