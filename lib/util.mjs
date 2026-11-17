import fs from 'node:fs';
import path from 'node:path';
import { BACKUPS } from './paths.mjs';

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function writeTextAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

export function cjkCount(s) {
  return (String(s || '').match(/[\u3400-\u9fff]/g) || []).length;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted(items, weightOf, rng) {
  let total = 0;
  const weights = items.map((it) => {
    const w = Math.max(0, Number(weightOf(it)) || 0);
    total += w;
    return w;
  });
  if (total <= 0) return items[Math.floor(rng() * items.length)] || null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function backupFile(file, prefix) {
  try {
    if (!fs.existsSync(file)) return null;
    fs.mkdirSync(BACKUPS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUPS, `${prefix}-${stamp}.json`);
    fs.copyFileSync(file, dest);
    pruneDir(BACKUPS, 180);
    return dest;
  } catch {
    return null;
  }
}

export function pruneDir(dir, keep) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json') || f.endsWith('.bak'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const x of files.slice(keep)) {
      try { fs.unlinkSync(path.join(dir, x.f)); } catch {}
    }
  } catch {}
}
