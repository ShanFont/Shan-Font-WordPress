'use client';

import { Notice, message } from '@/components/shell';
import { ApiError, api, idempotencyHeaders } from '@sat/api-client';
import { Button, Card } from '@sat/ui';
import { useEffect, useRef, useState } from 'react';

interface Assignment {
  assignmentId: string;
  taskId: string;
  taskType: string;
  englishText: string;
  context: string | null;
  wordCount: number;
  status: string;
  expiresAt: string;
  rateSatang: number;
  draft: { shanText: string; version: number; savedAt: string } | null;
  feedback: { decision: string; reason: string | null } | null;
}

export default function TranslatePage() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [text, setText] = useState('');
  const [version, setVersion] = useState(1);
  const [size, setSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Not saved yet');
  const [recovery, setRecovery] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const saving = useRef<Promise<number | null> | null>(null);

  useEffect(() => {
    document.body.classList.toggle('nav-hidden', editing);
    return () => document.body.classList.remove('nav-hidden');
  }, [editing]);

  function remember(next: Assignment, local?: string) {
    setAssignment(next);
    const server = next.draft?.shanText ?? '';
    setVersion(next.draft?.version ?? 1);
    const saved = localStorage.getItem(`sat.draft.${next.assignmentId}`);
    const parsed = saved ? (JSON.parse(saved) as { text?: string }) : null;
    if (parsed?.text && parsed.text !== server && next.status !== 'expired') {
      setRecovery(parsed.text);
      setText(server);
    } else {
      setText(local ?? server);
      setRecovery(null);
    }
  }

  async function claim(taskType: 'sentence' | 'page') {
    setError(null);
    try {
      const next = await api.request<Assignment>(
        'POST',
        '/assignments',
        { taskType },
        idempotencyHeaders(),
      );
      remember(next);
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function save(nextText = text): Promise<number | null> {
    if (saving.current) return saving.current;
    const pending = persistDraft(nextText);
    saving.current = pending;
    try {
      return await pending;
    } finally {
      if (saving.current === pending) saving.current = null;
    }
  }

  async function persistDraft(nextText: string): Promise<number | null> {
    if (!assignment) return null;
    const expired =
      assignment.status === 'expired' ||
      (assignment.status === 'active' && new Date(assignment.expiresAt) <= new Date());
    if (expired) {
      setError(
        'This reservation has expired. Your unsent text stays on this device and will not be submitted.',
      );
      return null;
    }
    try {
      const saved = await api.request<{ version: number; savedAt: string; expiresAt: string }>(
        'PUT',
        `/assignments/${assignment.assignmentId}/draft`,
        { shanText: nextText, expectedVersion: version },
      );
      setVersion(saved.version);
      setAssignment({
        ...assignment,
        expiresAt: saved.expiresAt,
        draft: { shanText: nextText, version: saved.version, savedAt: saved.savedAt },
      });
      localStorage.setItem(
        `sat.draft.${assignment.assignmentId}`,
        JSON.stringify({ text: nextText, version: saved.version }),
      );
      setStatus(`Saved ${new Date(saved.savedAt).toLocaleTimeString()}`);
      setRecovery(null);
      setEditing(false);
      return saved.version;
    } catch (caught) {
      localStorage.setItem(
        `sat.draft.${assignment.assignmentId}`,
        JSON.stringify({ text: nextText, version }),
      );
      if (caught instanceof ApiError && caught.code === 'DRAFT_CONFLICT') {
        const details = caught.details as {
          serverDraft?: { shanText: string; version: number };
          rejectedText?: string;
        };
        setRecovery(details.rejectedText || nextText);
        if (details.serverDraft) {
          setText(details.serverDraft.shanText);
          setVersion(details.serverDraft.version);
        }
        setError('The server has a newer draft. Your text is kept below so you can copy it back.');
        return null;
      }
      setError(message(caught));
      setStatus('Save failed. Text kept on this device.');
      return null;
    }
  }

  async function submit() {
    if (!assignment) return;
    const savedVersion = await save();
    if (!savedVersion) {
      setError('Save the translation before submitting.');
      return;
    }
    try {
      await api.request(
        'POST',
        `/assignments/${assignment.assignmentId}/submit`,
        { expectedDraftVersion: savedVersion },
        idempotencyHeaders(),
      );
      setAssignment(null);
      setText('');
      setStatus('Submitted for review');
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Translate</h1>
      <Notice>{error}</Notice>
      {status === 'Submitted for review' ? (
        <p className="text-sm font-semibold text-teal">Submitted for review</p>
      ) : null}
      {!assignment ? (
        <Card className="flex flex-wrap gap-3">
          <Button type="button" data-testid="claim-sentence" onClick={() => claim('sentence')}>
            Claim a sentence · ฿5
          </Button>
          <Button
            type="button"
            variant="ghost"
            data-testid="claim-page"
            onClick={() => claim('page')}
          >
            Claim a page · ฿250
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold text-teal">
              {assignment.taskType} · {assignment.wordCount} words · {assignment.status}
            </p>
            <p
              className="mt-3 whitespace-pre-wrap text-lg leading-relaxed"
              data-testid="source-text"
            >
              {assignment.englishText}
            </p>
            {assignment.context ? (
              <p className="mt-3 text-sm text-muted">Context: {assignment.context}</p>
            ) : null}
            {assignment.feedback ? (
              <p className="mt-3 text-sm">
                Review feedback: {assignment.feedback.reason || assignment.feedback.decision}
              </p>
            ) : null}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-sm font-semibold" htmlFor="shan">
                Shan translation
              </label>
              <input
                aria-label="Editor size"
                type="range"
                min={18}
                max={32}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
              />
            </div>
            <textarea
              id="shan"
              data-testid="shan-editor"
              className="shan-editor min-h-64 w-full rounded-xl border border-line bg-white p-3"
              style={{ fontSize: size }}
              value={text}
              onFocus={() => setEditing(true)}
              onBlur={() => {
                void save();
              }}
              onChange={(event) => {
                setText(event.target.value);
                if (assignment)
                  localStorage.setItem(
                    `sat.draft.${assignment.assignmentId}`,
                    JSON.stringify({ text: event.target.value, version }),
                  );
              }}
            />
            <p className="mt-2 text-sm text-muted" data-testid="save-status">
              {status}. Reservation until {new Date(assignment.expiresAt).toLocaleString()}.
            </p>
            {recovery ? (
              <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
                <p className="font-semibold">Unsent text on this device</p>
                <p className="shan-editor mt-2 whitespace-pre-wrap">{recovery}</p>
                <Button
                  className="mt-2"
                  type="button"
                  variant="ghost"
                  onClick={() => setText(recovery)}
                >
                  Use this text
                </Button>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" data-testid="save-draft" onClick={() => save()}>
                Save draft
              </Button>
              <Button type="button" data-testid="submit-translation" onClick={() => submit()}>
                Submit
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={async () => {
                  await api.request('POST', `/assignments/${assignment.assignmentId}/skip`);
                  setAssignment(null);
                }}
              >
                Skip
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  const reason = window.prompt('Why is this source unsuitable?');
                  if (!reason) return;
                  await api.request('POST', '/reports', { taskId: assignment.taskId, reason });
                  setStatus('Report sent');
                }}
              >
                Report source
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
