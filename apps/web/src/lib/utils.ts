import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "Now" is pinned to the capture date so server and client render identically
 * and every relative label is stable. docs/SPEC.md §11.
 */
export const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);

/** The original renders absolute stamps in GMT-4. Pinned, never local. */
const DISPLAY_OFFSET_MINUTES = -4 * 60;
const DISPLAY_OFFSET_LABEL = "GMT-4";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shifted(ts: number) {
  return new Date(ts + DISPLAY_OFFSET_MINUTES * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `~20 hours ago`, `1 day ago`. Note the tilde on sub-day values. §11 */
export function relativeTime(ts: number, now: number = NOW): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `~${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** `17 Aug 2026, 22:22 GMT-4` — the PR row's title attribute. §11 */
export function absoluteStamp(ts: number): string {
  const d = shifted(ts);
  return (
    `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${DISPLAY_OFFSET_LABEL}`
  );
}

/** `31 Aug 2026` — billing copy. §11 */
export function shortDate(ts: number): string {
  const d = shifted(ts);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `Aug 17` — usage chart ticks. §8.10 */
export function monthDay(ts: number): string {
  const d = shifted(ts);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** `17th Aug – 31st Aug, 2026` — the usage range select. §8.10 */
export function ordinalRange(from: number, to: number): string {
  const a = shifted(from);
  const b = shifted(to);
  return (
    `${ordinal(a.getUTCDate())} ${MONTHS[a.getUTCMonth()]} – ` +
    `${ordinal(b.getUTCDate())} ${MONTHS[b.getUTCMonth()]}, ${b.getUTCFullYear()}`
  );
}

/** `8.6d`, `0.0d`, `5.7d`. §11 */
export function days(value: number): string {
  return `${value.toFixed(1)}d`;
}

/** `0%` — integers only, as the original renders them. §11 */
export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

/** `1–10 of 30`, en dash. §7.1 */
export function rangeLabel(page: number, perPage: number, total: number) {
  if (total === 0) return `0 of 0`;
  const start = page * perPage + 1;
  const end = Math.min(total, (page + 1) * perPage);
  return `${start}–${end} of ${total}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Deterministic PRNG. Never Math.random(): SSR and CSR must agree. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)];
}

export const DAY_MS = 86_400_000;

/**
 * Period starts, all in the pinned display timezone. Computing these in UTC
 * shifts every window four hours and leaks a stray bucket from the previous
 * period onto the x-axis, so they go through `shifted` first.
 */
function fromDisplayParts(y: number, m: number, d: number): number {
  return Date.UTC(y, m, d) - DISPLAY_OFFSET_MINUTES * 60_000;
}

export function startOfDay(ts: number): number {
  const d = shifted(ts);
  return fromDisplayParts(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function startOfWeek(ts: number): number {
  const d = shifted(ts);
  return (
    fromDisplayParts(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
    d.getUTCDay() * DAY_MS
  );
}

export function startOfMonth(ts: number): number {
  const d = shifted(ts);
  return fromDisplayParts(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function startOfQuarter(ts: number): number {
  const d = shifted(ts);
  return fromDisplayParts(
    d.getUTCFullYear(),
    Math.floor(d.getUTCMonth() / 3) * 3,
    1,
  );
}

export function startOfYear(ts: number): number {
  const d = shifted(ts);
  return fromDisplayParts(d.getUTCFullYear(), 0, 1);
}
