'use client';

import { Notice, message } from '@/components/shell';
import { api } from '@sat/api-client';
import { Button, Card, Field, Input } from '@sat/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function VerifyPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const saved = sessionStorage.getItem('sat.verify');
    if (saved) setToken(saved);
  }, []);
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card>
        <h1 className="mb-2 text-2xl font-bold">Verify your email</h1>
        <p className="mb-4 text-sm text-muted">
          Local development shows the token here. Production email is configured separately and is
          not invented by this app.
        </p>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await api.verify(token);
              router.push('/login');
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Verification token">
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              data-testid="verify-token"
            />
          </Field>
          <Notice>{error}</Notice>
          <Button type="submit" data-testid="verify-submit">
            Verify
          </Button>
        </form>
      </Card>
    </main>
  );
}
