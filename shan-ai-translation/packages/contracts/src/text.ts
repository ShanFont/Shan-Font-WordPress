import { createHash } from 'node:crypto';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function countEnglishWords(text: string): number {
  const collapsed = text.trim().replace(/\s+/g, ' ');
  if (!collapsed) return 0;
  return collapsed.split(' ').length;
}

/** Canonical source identity: trim ends and normalize newlines. Internal breaks stay. */
export function canonicalSource(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function sourceHash(text: string): string {
  return createHash('sha256').update(canonicalSource(text)).digest('hex');
}

export function normalizeShan(text: string): string {
  return text.normalize('NFC');
}

export function isPageWordCountValid(count: number): boolean {
  return count >= 250 && count <= 500;
}

export function escapeFormulaPrefix(value: string): string {
  if (FORMULA_PREFIX.test(value)) return `'${value}`;
  return value;
}

export function looksLikeFormulaCell(input: { formula?: string | null; text: string }): boolean {
  return Boolean(input.formula && input.formula.trim().length > 0);
}

export const SENTENCE_THRESHOLD = 100;
export const PAGE_THRESHOLD = 5;
export const SENTENCE_RATE_SATANG = 500;
export const PAGE_RATE_SATANG = 25000;
export const RESERVATION_HOURS = 24;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;

export const BADGE_MILESTONES = {
  sentence: [1, 10, 50, 100, 500],
  page: [1, 5, 25],
} as const;
