'use client';

import { api } from '@sat/api-client';
import { Card } from '@sat/ui';
import { useEffect, useState } from 'react';

export default function GuidePage() {
  const [guide, setGuide] = useState<{ title: string; version: string; content: string } | null>(
    null,
  );
  useEffect(() => {
    api
      .request<{ title: string; version: string; content: string }>('GET', '/guide')
      .then(setGuide);
  }, []);
  if (!guide) return <p>Loading guide…</p>;
  return (
    <Card>
      <h1 className="text-3xl font-bold">{guide.title}</h1>
      <p className="mt-1 text-sm text-muted">Version {guide.version}</p>
      <p className="mt-4 whitespace-pre-wrap">{guide.content}</p>
    </Card>
  );
}
