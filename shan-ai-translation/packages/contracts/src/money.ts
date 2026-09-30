import { PAGE_THRESHOLD, SENTENCE_THRESHOLD } from './text';

export type TaskType = 'sentence' | 'page';

export interface QualifyingEarning {
  id: string;
  taskType: TaskType;
  amountSatang: number;
  adjustmentSatang: number;
}

export function thresholdFor(taskType: TaskType): number {
  return taskType === 'sentence' ? SENTENCE_THRESHOLD : PAGE_THRESHOLD;
}

export function netSatang(amountSatang: number, adjustmentSatang: number): number {
  return amountSatang + adjustmentSatang;
}

/**
 * Sentence and page pools qualify independently by unit count.
 * Adjustments change money and never create extra units.
 * A non-positive pool is still reserved so it cannot be paid twice, clamped at 0.
 */
export function selectPayoutEarnings(earnings: QualifyingEarning[]): {
  included: QualifyingEarning[];
  amountSatang: number;
} {
  const included: QualifyingEarning[] = [];
  for (const taskType of ['sentence', 'page'] as const) {
    const pool = earnings.filter((entry) => entry.taskType === taskType);
    if (pool.length >= thresholdFor(taskType)) included.push(...pool);
  }
  const amountSatang = Math.max(
    0,
    included.reduce((sum, entry) => sum + netSatang(entry.amountSatang, entry.adjustmentSatang), 0),
  );
  return { included, amountSatang };
}
