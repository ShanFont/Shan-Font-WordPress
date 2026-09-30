'use client';

import { Notice, message } from '@/components/shell';
import { api, baht } from '@sat/api-client';
import { Button, Card, Field, Input, Textarea } from '@sat/ui';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [rates, setRates] = useState<
    { id: string; taskType: string; amountSatang: number; effectiveAt: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.request<typeof rates>('GET', '/admin/rates').then(setRates);
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Card>
        <h2 className="font-semibold">Rates</h2>
        {rates.map((rate) => (
          <p key={rate.id} className="mt-2 text-sm">
            {rate.taskType} {baht(rate.amountSatang)} from{' '}
            {new Date(rate.effectiveAt).toLocaleString()}
          </p>
        ))}
        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await api.request('POST', '/admin/rates', {
                taskType: String(form.get('taskType')),
                amountSatang: Number(form.get('amount')) * 100,
                effectiveAt: new Date(String(form.get('effectiveAt'))).toISOString(),
              });
              setRates(await api.request('GET', '/admin/rates'));
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Future rate (baht)">
            <Input name="amount" type="number" min={1} required />
          </Field>
          <Field label="Task type">
            <select name="taskType" className="min-h-11 w-full rounded-xl border border-line px-3">
              <option value="sentence">Sentence</option>
              <option value="page">Page</option>
            </select>
          </Field>
          <Field label="Effective at">
            <Input name="effectiveAt" type="datetime-local" required />
          </Field>
          <Button type="submit">Schedule rate</Button>
        </form>
      </Card>
      <Publish title="Translation guide" path="/admin/guide-versions" />
      <Publish title="Contribution terms" path="/admin/terms-versions" />
      <Notice>{error}</Notice>
    </div>
  );
}

function Publish({ title, path }: { title: string; path: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          try {
            await api.request('POST', path, {
              version: String(form.get('version')),
              title: String(form.get('title')),
              content: String(form.get('content')),
            });
            formElement.reset();
          } catch (caught) {
            setError(message(caught));
          }
        }}
      >
        <Field label="Version">
          <Input name="version" required />
        </Field>
        <Field label="Title">
          <Input name="title" required />
        </Field>
        <Field label="Content">
          <Textarea name="content" required className="min-h-32" />
        </Field>
        <Notice>{error}</Notice>
        <Button type="submit">Publish</Button>
      </form>
    </Card>
  );
}
