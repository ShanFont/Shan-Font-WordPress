'use client';

import { Notice, message } from '@/components/shell';
import { api } from '@sat/api-client';
import { Button, Card, Field, Input } from '@sat/ui';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    contactMethod: 'phone',
    contactValue: '',
    leaderboardOptIn: false,
  });
  useEffect(() => {
    api.me().then((me) => {
      setForm({
        displayName: me.displayName,
        contactMethod: me.profile?.contactMethod || 'phone',
        contactValue: me.profile?.contactValue || '',
        leaderboardOptIn: me.profile?.leaderboardOptIn || false,
      });
    });
  }, []);
  return (
    <Card>
      <h1 className="mb-4 text-3xl font-bold">Profile</h1>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api.request('PATCH', '/me/profile', form);
            setSaved(true);
          } catch (caught) {
            setError(message(caught));
          }
        }}
      >
        <Field label="Display name">
          <Input
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </Field>
        <Field label="Contact method">
          <select
            className="min-h-11 w-full rounded-xl border border-line px-3"
            value={form.contactMethod}
            onChange={(event) => setForm({ ...form, contactMethod: event.target.value })}
          >
            {['phone', 'line', 'facebook', 'email', 'other'].map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </Field>
        <Field label="Contact detail (private)">
          <Input
            value={form.contactValue}
            onChange={(event) => setForm({ ...form, contactValue: event.target.value })}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.leaderboardOptIn}
            onChange={(event) => setForm({ ...form, leaderboardOptIn: event.target.checked })}
          />
          Show my display name on the leaderboard
        </label>
        <Notice>{error}</Notice>
        {saved ? <p className="text-sm">Saved.</p> : null}
        <Button type="submit">Save profile</Button>
      </form>
    </Card>
  );
}
