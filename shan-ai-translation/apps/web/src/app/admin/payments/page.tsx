'use client';

import { Notice, message } from '@/components/shell';
import { api, baht, idempotencyHeaders } from '@sat/api-client';
import { Button, Card, Field, Input } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Payout {
  id: string;
  contributor: { displayName: string };
  amountSatang: number;
  status: string;
  dueAt: string;
}
interface Period {
  id: string;
  cutoffAt: string;
  dueAt: string;
  payouts: number;
  liabilitySatang: number;
}

export default function PaymentsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setPeriods(await api.request<Period[]>('GET', '/admin/payout-periods'));
    setPayouts(await api.request<Payout[]>('GET', '/admin/payouts'));
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Payments</h1>
      <Card>
        <p className="text-sm text-muted">
          Transfers happen outside the platform. Record them after the bank or QR payment.
        </p>
        <Button
          className="mt-3"
          type="button"
          data-testid="prepare-payouts"
          onClick={async () => {
            await api.request('POST', '/admin/payout-periods/prepare');
            for (let attempt = 0; attempt < 8; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              await load();
            }
          }}
        >
          Queue month-end preparation
        </Button>
      </Card>
      {periods.map((period) => (
        <Card key={period.id}>
          <p>
            Cutoff {new Date(period.cutoffAt).toLocaleString()} · due{' '}
            {new Date(period.dueAt).toLocaleDateString()} · {period.payouts} payouts ·{' '}
            {baht(period.liabilitySatang)}
          </p>
        </Card>
      ))}
      <Notice>{error}</Notice>
      {payouts.map((payout) => (
        <Card key={payout.id}>
          <div data-testid="payout-card">
            <p className="font-semibold">
              {payout.contributor.displayName} · {baht(payout.amountSatang)} · {payout.status}
            </p>
            {payout.status !== 'paid' ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await api.request(
                      'POST',
                      `/admin/payouts/${payout.id}/confirm`,
                      {
                        method: String(form.get('method')),
                        paidAt: new Date(String(form.get('paidAt'))).toISOString(),
                        reference: String(form.get('reference')),
                      },
                      idempotencyHeaders(),
                    );
                    await load();
                  } catch (caught) {
                    setError(message(caught));
                  }
                }}
              >
                <Field label="Method">
                  <select
                    name="method"
                    className="min-h-11 w-full rounded-xl border border-line px-3"
                    data-testid="pay-method"
                  >
                    <option value="thai_bank_transfer">Thai bank transfer</option>
                    <option value="thai_qr">Thai QR</option>
                  </select>
                </Field>
                <Field label="Payment date">
                  <Input name="paidAt" type="datetime-local" required data-testid="pay-date" />
                </Field>
                <Field label="Reference">
                  <Input name="reference" required data-testid="pay-reference" />
                </Field>
                <Button type="submit" data-testid="pay-confirm">
                  Confirm payment
                </Button>
              </form>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
