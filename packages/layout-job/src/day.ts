declare const utcDayBrand: unique symbol;

export type UtcDay = string & { readonly [utcDayBrand]: "UtcDay" };

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(value: string): { year: number; month: number; date: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, date));
  if (instant.toISOString().slice(0, 10) !== value) return undefined;
  return { year, month, date };
}

function brand(value: string): UtcDay {
  return value as UtcDay;
}

export function parseUtcDay(value: string): UtcDay | undefined {
  if (parts(value) === undefined) return undefined;
  return brand(value);
}

export function utcDay(instant: Date): UtcDay {
  const value = instant.toISOString().slice(0, 10);
  const parsed = parseUtcDay(value);
  if (parsed === undefined) throw new Error("clock");
  return parsed;
}

export function yesterday(instant: Date): UtcDay {
  return utcDay(new Date(instant.getTime() - DAY_MS));
}

export function previousUtcDay(day: UtcDay): UtcDay {
  const read = parts(day);
  if (read === undefined) throw new Error("bad day");
  const instant = new Date(Date.UTC(read.year, read.month - 1, read.date));
  instant.setUTCDate(instant.getUTCDate() - 1);
  return utcDay(instant);
}

export function epochSeconds(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error("bad clock");
  return Math.floor(ms / 1000);
}

export function ttlSeconds(iso: string, days: number): number {
  return epochSeconds(iso) + days * 24 * 60 * 60;
}
