'use client';

import { Notice, message } from '@/components/shell';
import { api } from '@sat/api-client';
import { Button, Card, Field, Input } from '@sat/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card>
        <h1 className="mb-4 text-2xl font-bold">Create an account</h1>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              const result = await api.register({
                displayName: String(form.get('displayName')),
                email: String(form.get('email')),
                password: String(form.get('password')),
              });
              if (result.verificationToken) {
                setToken(result.verificationToken);
                sessionStorage.setItem('sat.verify', result.verificationToken);
              }
              router.push('/verify');
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Display name">
            <Input name="displayName" required minLength={2} data-testid="register-name" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required data-testid="register-email" />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              required
              minLength={10}
              data-testid="register-password"
            />
          </Field>
          <Notice>{error}</Notice>
          {token ? <p data-testid="dev-token">{token}</p> : null}
          <Button type="submit" data-testid="register-submit">
            Register
          </Button>
        </form>
      </Card>
    </main>
  );
}
