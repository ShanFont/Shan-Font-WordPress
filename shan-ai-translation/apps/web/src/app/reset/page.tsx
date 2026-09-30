'use client';

import { Notice, message } from '@/components/shell';
import { api } from '@sat/api-client';
import { Button, Card, Field, Input } from '@sat/ui';
import { useState } from 'react';

export default function ResetPage() {
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [done, setDone] = useState(false);
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-16">
      <Card>
        <h1 className="mb-4 text-2xl font-bold">Reset password</h1>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              const result = await api.forgot(String(form.get('email')));
              setToken(result.resetToken || '');
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Button type="submit">Send reset</Button>
        </form>
      </Card>
      <Card>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await api.reset(token, String(form.get('password')));
              setDone(true);
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Reset token">
            <Input value={token} onChange={(event) => setToken(event.target.value)} />
          </Field>
          <Field label="New password">
            <Input name="password" type="password" minLength={10} required />
          </Field>
          <Notice>{error}</Notice>
          {done ? <p>Password updated. You can log in.</p> : null}
          <Button type="submit">Update password</Button>
        </form>
      </Card>
    </main>
  );
}
