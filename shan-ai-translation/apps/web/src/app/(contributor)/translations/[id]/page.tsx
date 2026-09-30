'use client';

import { api } from '@sat/api-client';
import { Card, StatusPill } from '@sat/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Detail {
  englishText: string;
  status: string;
  taskType: string;
  revisions: {
    id: string;
    revisionNumber: number;
    shanText: string;
    submittedAt: string;
    feedback: { decision: string; reason: string | null } | null;
  }[];
}

export default function TranslationDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => {
    api.request<Detail>('GET', `/me/translations/${params.id}`).then(setDetail);
  }, [params.id]);
  if (!detail) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">
        {detail.taskType} <StatusPill>{detail.status}</StatusPill>
      </h1>
      <Card>
        <p className="whitespace-pre-wrap">{detail.englishText}</p>
      </Card>
      {detail.revisions.map((revision) => (
        <Card key={revision.id}>
          <p className="text-sm font-semibold">Revision {revision.revisionNumber}</p>
          <p className="shan-editor mt-2 whitespace-pre-wrap">{revision.shanText}</p>
          {revision.feedback ? (
            <p className="mt-2 text-sm">
              Feedback: {revision.feedback.reason || revision.feedback.decision}
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
