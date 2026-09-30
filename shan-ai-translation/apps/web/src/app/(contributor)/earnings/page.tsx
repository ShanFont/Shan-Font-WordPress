'use client';

import { api, baht } from '@sat/api-client';
import { Card, StatusPill } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Earnings {
  unpaid: Entry[];
  scheduled: Entry[];
  paid: Entry[];
  adjustments: { id: string; amountSatang: number; reason: string }[];
}
interface Entry {
  id: string;
  taskType: string;
  amountSatang: number;
  status: string;
}
interface Payout {
  id: string;
  amountSatang: number;
  status: string;
  dueAt: string;
  paidAt: string | null;
  reference: string | null;
  method: string | null;
}

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  useEffect(() => {
    api.request<Earnings>('GET', '/me/earnings').then(setEarnings);
    api.request<Payout[]>('GET', '/me/payouts').then(setPayouts);
  }, []);
  if (!earnings) return <p>Loading earnings…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Earnings</h1>
      {(['unpaid', 'scheduled', 'paid'] as const).map((key) => (
        <Card key={key}>
          <h2 className="font-semibold capitalize">{key}</h2>
          {earnings[key].length === 0 ? <p className="mt-2 text-sm text-muted">None</p> : null}
          <ul className="mt-2 space-y-2">
            {earnings[key].map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span>
                  {entry.taskType} · {baht(entry.amountSatang)}
                </span>
                <StatusPill>{entry.status}</StatusPill>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Card>
        <h2 className="font-semibold">Adjustments</h2>
        {earnings.adjustments.map((item) => (
          <p key={item.id} className="mt-2 text-sm">
            {baht(item.amountSatang)} — {item.reason}
          </p>
        ))}
      </Card>
      <Card>
        <h2 className="font-semibold">Payouts</h2>
        {payouts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No payouts yet. Below-threshold earnings carry forward.
          </p>
        ) : null}
        {payouts.map((payout) => (
          <p key={payout.id} className="mt-2 text-sm" data-testid="payout-row">
            {baht(payout.amountSatang)} · {payout.status}
            {payout.reference ? ` · ${payout.reference}` : ''} · due{' '}
            {new Date(payout.dueAt).toLocaleDateString()}
          </p>
        ))}
      </Card>
    </div>
  );
}
