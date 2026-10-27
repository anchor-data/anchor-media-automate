const pad = (n: number): string => String(n).padStart(2, "0");

export const WEEKDAYS_SUN_FIRST = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** Tomorrow 18:00 in the browser's zone. */
export function defaultScheduleDate(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(18, 0, 0, 0);
  return next;
}

/** ISO string with the local UTC offset (what the schedule API requires). */
export function toIsoWithOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Value for `<input type="datetime-local">`. */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `10/29(木) 19:00` */
export function formatMonthDayTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return "未定";
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS_SUN_FIRST[date.getDay()]}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `10/26 22:14` */
export function formatShortDateTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return "—";
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `10/24` */
export function formatMonthDay(iso: string | null | undefined): string {
  const date = parseDate(iso);
  return date ? `${date.getMonth() + 1}/${date.getDate()}` : "—";
}

/** "18時間前" style label for how long something has been waiting. */
export function formatWaiting(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parseDate(iso);
  if (!date) return "—";
  const hours = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3_600_000));
  if (hours < 1) return "いま";
  if (hours < 48) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export interface MonthCell {
  readonly date: Date;
  readonly inMonth: boolean;
}

/** Sunday-first weeks covering the month of `anchor`. */
export function monthWeeks(anchor: Date): readonly (readonly MonthCell[])[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weekCount = Math.ceil((first.getDay() + lastDay.getDate()) / 7);
  return Array.from({ length: weekCount }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      return { date, inMonth: date.getMonth() === anchor.getMonth() };
    })
  );
}

/** Sunday-first week containing `anchor`. */
export function weekOf(anchor: Date): readonly MonthCell[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, d) => {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    return { date, inMonth: true };
  });
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
