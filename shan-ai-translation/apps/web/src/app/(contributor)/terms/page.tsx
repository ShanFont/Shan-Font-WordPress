'use client';

import { api } from '@sat/api-client';
import { Button, Card } from '@sat/ui';
import { useEffect, useState } from 'react';

export default function TermsPage() {
  const [terms, setTerms] = useState<{
    title: string | null;
    version: string | null;
    content: string | null;
  } | null>(null);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    api
      .request<{ title: string | null; version: string | null; content: string | null }>(
        'GET',
        '/terms',
      )
      .then(setTerms);
  }, []);
  if (!terms) return <p>Loading terms…</p>;
  return (
    <Card>
      <h1 className="text-3xl font-bold">{terms.title}</h1>
      <p className="mt-1 text-sm text-muted">Version {terms.version}</p>
      <p className="mt-4 whitespace-pre-wrap">{terms.content}</p>
      <Button
        className="mt-4"
        type="button"
        data-testid="accept-terms"
        onClick={async () => {
          await api.request('POST', '/terms/acceptances');
          setAccepted(true);
        }}
      >
        {accepted ? 'Accepted' : 'Accept terms'}
      </Button>
    </Card>
  );
}
