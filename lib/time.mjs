import { TZ, UNLOCK_HOUR } from './paths.mjs';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const weekdayFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, weekday: 'short' });

export function dateInTz(date = new Date()) {
  const p = Object.fromEntries(dateFmt.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function partsInTz(date = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

export function unlockAt(dateStr) {
  return new Date(`${dateStr}T${String(UNLOCK_HOUR).padStart(2, '0')}:00:00+08:00`);
}

export function isUnlocked(dateStr, now = new Date()) {
  return now.getTime() >= unlockAt(dateStr).getTime();
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return dateInTz(d);
}

export function daysBetween(a, b) {
  const ta = new Date(`${a}T00:00:00+08:00`).getTime();
  const tb = new Date(`${b}T00:00:00+08:00`).getTime();
  return Math.round((ta - tb) / 86400000);
}

export function chineseDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  const p = partsInTz(d);
  return `${p.month} 月 ${p.day} 日`;
}

export function weekday(dateStr) {
  return weekdayFmt.format(new Date(`${dateStr}T12:00:00+08:00`));
}

export function longChineseDate(dateStr) {
  return `${chineseDate(dateStr)} · ${weekday(dateStr)}`;
}

export function nowIso(now = new Date()) {
  return now.toISOString();
}

export function dayOfYear(dateStr) {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  const start = new Date(`${d.getUTCFullYear()}-01-01T12:00:00+08:00`);
  return Math.floor((d - start) / 86400000) + 1;
}

export function today(now = new Date()) {
  return dateInTz(now);
}
