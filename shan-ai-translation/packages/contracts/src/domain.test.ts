import { describe, expect, it } from 'vitest';
import { milestoneBadges } from './badges';
import { netSatang, selectPayoutEarnings } from './money';
import { assignSplits, clusterKeys } from './split';
import {
  canonicalSource,
  countEnglishWords,
  escapeFormulaPrefix,
  isPageWordCountValid,
  sourceHash,
} from './text';
import { monthCutoff, payoutWindow } from './time';

describe('english word count', () => {
  it('trims and collapses whitespace', () => {
    expect(countEnglishWords('  one   two \n three  ')).toBe(3);
    expect(countEnglishWords('   ')).toBe(0);
  });

  it('accepts page sizes on the inclusive boundary', () => {
    expect(isPageWordCountValid(250)).toBe(true);
    expect(isPageWordCountValid(500)).toBe(true);
    expect(isPageWordCountValid(249)).toBe(false);
    expect(isPageWordCountValid(501)).toBe(false);
  });
});

describe('source identity', () => {
  it('preserves paragraph breaks and ignores newline style', () => {
    expect(canonicalSource('a\r\n\r\nb  ')).toBe('a\n\nb');
    expect(sourceHash('a\r\nb')).toBe(sourceHash('a\nb'));
    expect(sourceHash('a b')).not.toBe(sourceHash('ab'));
  });

  it('escapes spreadsheet formula prefixes', () => {
    expect(escapeFormulaPrefix('=cmd')).toBe("'=cmd");
    expect(escapeFormulaPrefix('+1')).toBe("'+1");
    expect(escapeFormulaPrefix('Hello')).toBe('Hello');
  });
});

describe('payout selection', () => {
  const sentence = (id: string, adjustment = 0) => ({
    id,
    taskType: 'sentence' as const,
    amountSatang: 500,
    adjustmentSatang: adjustment,
  });
  const page = (id: string) => ({
    id,
    taskType: 'page' as const,
    amountSatang: 25000,
    adjustmentSatang: 0,
  });

  it('holds 99 sentences and releases 100', () => {
    expect(
      selectPayoutEarnings(Array.from({ length: 99 }, (_, i) => sentence(String(i)))).included,
    ).toHaveLength(0);
    const qualified = selectPayoutEarnings(
      Array.from({ length: 100 }, (_, i) => sentence(String(i))),
    );
    expect(qualified.included).toHaveLength(100);
    expect(qualified.amountSatang).toBe(50000);
  });

  it('holds 4 pages and releases 5, independent of sentences', () => {
    const mixed = [
      ...Array.from({ length: 100 }, (_, i) => sentence(`s${i}`)),
      ...Array.from({ length: 4 }, (_, i) => page(`p${i}`)),
    ];
    const result = selectPayoutEarnings(mixed);
    expect(result.included.every((entry) => entry.taskType === 'sentence')).toBe(true);
    expect(
      selectPayoutEarnings(Array.from({ length: 5 }, (_, i) => page(String(i)))).included,
    ).toHaveLength(5);
  });

  it('lets adjustments reduce the amount without adding units', () => {
    const earnings = [
      ...Array.from({ length: 99 }, (_, i) => sentence(String(i))),
      sentence('last', -500),
    ];
    const result = selectPayoutEarnings(earnings);
    expect(result.included).toHaveLength(100);
    expect(result.amountSatang).toBe(99 * 500);
    expect(netSatang(500, -500)).toBe(0);
  });

  it('clamps a negative pool at zero', () => {
    const earnings = Array.from({ length: 100 }, (_, i) => sentence(String(i), -1000));
    expect(selectPayoutEarnings(earnings).amountSatang).toBe(0);
  });
});

describe('Bangkok month boundary', () => {
  it('cuts off at 00:00 on the first in Thailand', () => {
    const justBefore = new Date('2026-09-30T16:59:59.000Z');
    const atCutoff = new Date('2026-09-30T17:00:00.000Z');
    const run = new Date('2026-09-30T17:05:00.000Z');
    const cutoff = monthCutoff(run);
    expect(cutoff.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(justBefore < cutoff).toBe(true);
    expect(atCutoff < cutoff).toBe(false);
    const window = payoutWindow(run);
    expect(window.periodStart.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(window.dueAt.toISOString()).toBe('2026-10-10T16:59:59.999Z');
  });
});

describe('dataset clusters', () => {
  it('keeps a document and its duplicate hash in one split', () => {
    const items = [
      { id: 'a', documentId: 'doc-1', sourceHash: 'h1' },
      { id: 'b', documentId: 'doc-1', sourceHash: 'h2' },
      { id: 'c', documentId: 'doc-2', sourceHash: 'h2' },
      { id: 'd', documentId: null, sourceHash: 'h9' },
    ];
    const keys = clusterKeys(items);
    expect(keys.get('a')).toBe(keys.get('b'));
    expect(keys.get('b')).toBe(keys.get('c'));
    expect(keys.get('d')).not.toBe(keys.get('a'));
    const splits = assignSplits('release-1', items, true);
    expect(splits.get('a')).toBe(splits.get('c'));
    expect(assignSplits('release-1', items, false).get('d')).toBe('na');
  });
});

describe('badges', () => {
  it('marks milestones from approved counts', () => {
    const badges = milestoneBadges(10, 0);
    expect(badges.find((badge) => badge.id === 'sentences-10')?.earned).toBe(true);
    expect(badges.find((badge) => badge.id === 'sentences-50')?.earned).toBe(false);
    expect(badges.find((badge) => badge.id === 'pages-1')?.earned).toBe(false);
  });
});
