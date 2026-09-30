import { DateTime } from 'luxon';

export const BANGKOK = 'Asia/Bangkok';

export function bangkok(date: Date): DateTime {
  return DateTime.fromJSDate(date, { zone: BANGKOK });
}

/** Exclusive cutoff: 00:00 Asia/Bangkok on the first day of the month containing `now`. */
export function monthCutoff(now: Date): Date {
  const start = bangkok(now).startOf('month');
  return start.toUTC().toJSDate();
}

/** Period covered by a payout run at `now` is the previous calendar month in Bangkok. */
export function payoutWindow(now: Date): { periodStart: Date; cutoffAt: Date; dueAt: Date } {
  const local = bangkok(now);
  const cutoff = local.startOf('month');
  const periodStart = cutoff.minus({ months: 1 });
  const due = cutoff.set({ day: 10, hour: 23, minute: 59, second: 59, millisecond: 999 });
  return {
    periodStart: periodStart.toUTC().toJSDate(),
    cutoffAt: cutoff.toUTC().toJSDate(),
    dueAt: due.toUTC().toJSDate(),
  };
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
