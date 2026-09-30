'use client';

import { api } from '@sat/api-client';
import { Card } from '@sat/ui';
import { useEffect, useState } from 'react';

export default function CommunityPage() {
  const [stats, setStats] = useState<{
    approvedSentences: number;
    approvedPages: number;
    contributors: number;
  } | null>(null);
  const [board, setBoard] = useState<
    { displayName: string; approved: number; sentences: number; pages: number }[]
  >([]);
  useEffect(() => {
    api.request<typeof stats>('GET', '/community/stats').then(setStats);
    api.request<typeof board>('GET', '/community/leaderboard').then(setBoard);
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Community</h1>
      <Card>
        <p>{stats?.approvedSentences ?? 0} approved sentences</p>
        <p>{stats?.approvedPages ?? 0} approved pages</p>
        <p>{stats?.contributors ?? 0} contributors</p>
      </Card>
      <Card>
        <h2 className="font-semibold">Leaderboard</h2>
        <p className="text-sm text-muted">Only people who opt in. Display names only.</p>
        <ol className="mt-3 space-y-2">
          {board.map((row, index) => (
            <li key={row.displayName}>
              {index + 1}. {row.displayName} — {row.approved} approved ({row.sentences} sentences,{' '}
              {row.pages} pages)
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
