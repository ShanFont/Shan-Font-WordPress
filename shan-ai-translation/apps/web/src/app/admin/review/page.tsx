'use client';

import { Notice, message } from '@/components/shell';
import { api, baht, idempotencyHeaders } from '@sat/api-client';
import { Button, Card } from '@sat/ui';
import { useEffect, useState } from 'react';

interface Item {
  revisionId: string;
  taskType: string;
  englishText: string;
  shanText: string;
  contributor: { displayName: string };
  rateSatang: number;
}

export default function ReviewPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const result = await api.request<{ items: Item[] }>('GET', '/admin/reviews');
    setItems(result.items);
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Review</h1>
      <Notice>{error}</Notice>
      {preview ? <Card>{preview}</Card> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            const result = await api.request<
              { revisionId: string; stale: boolean; earningSatang: number }[]
            >('POST', '/admin/reviews/bulk-preview', { revisionIds: selected });
            const total = result.reduce((sum, item) => sum + item.earningSatang, 0);
            setPreview(
              `${result.length} selected, ${result.filter((item) => item.stale).length} stale, earning impact ${baht(total)}.`,
            );
          }}
        >
          Preview {selected.length} selected
        </Button>
        <Button
          type="button"
          onClick={async () => {
            try {
              await api.request(
                'POST',
                '/admin/reviews/bulk-confirm',
                { items: selected.map((revisionId) => ({ revisionId, decision: 'approve' })) },
                idempotencyHeaders(),
              );
              setSelected([]);
              await load();
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          Approve selected
        </Button>
      </div>
      {items.map((item) => (
        <Card key={item.revisionId}>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={selected.includes(item.revisionId)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, item.revisionId]
                    : selected.filter((id) => id !== item.revisionId),
                )
              }
            />
            {item.taskType} · {item.contributor.displayName} · {baht(item.rateSatang)}
          </label>
          <p className="mt-3 whitespace-pre-wrap">{item.englishText}</p>
          <p className="shan-editor mt-3 whitespace-pre-wrap" data-testid="review-shan">
            {item.shanText}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="approve"
              onClick={async () => {
                await api.request(
                  'POST',
                  `/admin/reviews/${item.revisionId}/decision`,
                  { decision: 'approve' },
                  idempotencyHeaders(),
                );
                await load();
              }}
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                const reason = window.prompt('What should change?');
                if (!reason) return;
                await api.request(
                  'POST',
                  `/admin/reviews/${item.revisionId}/decision`,
                  { decision: 'needs_edit', reason },
                  idempotencyHeaders(),
                );
                await load();
              }}
            >
              Request edit
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                const reason = window.prompt('Why deny this?');
                if (!reason) return;
                await api.request(
                  'POST',
                  `/admin/reviews/${item.revisionId}/decision`,
                  { decision: 'deny', reason, disposition: 'return' },
                  idempotencyHeaders(),
                );
                await load();
              }}
            >
              Deny and return
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
