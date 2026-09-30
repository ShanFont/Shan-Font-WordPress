'use client';

import { Notice, message } from '@/components/shell';
import { api } from '@sat/api-client';
import { Button, Card, Field, Input } from '@sat/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card>
        <h1 className="mb-4 text-2xl font-bold">Log in</h1>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              const result = await api.login({
                email: String(form.get('email')),
                password: String(form.get('password')),
              });
              router.push(result.user.role === 'admin' ? '/admin' : '/dashboard');
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <Field label="Email">
            <Input name="email" type="email" required data-testid="login-email" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" required data-testid="login-password" />
          </Field>
          <Notice>{error}</Notice>
          <Button type="submit" data-testid="login-submit">
            Log in
          </Button>
        </form>
        <button
          className="mt-4 min-h-11 text-sm font-semibold text-teal"
          type="button"
          onClick={async () => {
            const result = await api.request<{ configured: boolean; url: string | null }>(
              'GET',
              '/auth/google',
            );
            if (result.url) window.location.href = result.url;
            else setGoogle('Google sign-in is not configured yet.');
          }}
        >
          Continue with Google
        </button>
        {google ? <p className="mt-2 text-sm text-muted">{google}</p> : null}
        <p className="mt-4 text-sm">
          <Link href="/register" className="font-semibold text-teal">
            Create an account
          </Link>
          {' · '}
          <Link href="/reset">Reset password</Link>
        </p>
      </Card>
    </main>
  );
}
