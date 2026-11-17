import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY } from './paths.mjs';
import { readJson } from './util.mjs';

let cache = null;
let cacheSig = '';

function signature(files) {
  return files.map((f) => {
    const s = fs.statSync(f);
    return `${f}:${s.size}:${s.mtimeMs}`;
  }).join('|');
}

export function loadLibrary({ fresh = false } = {}) {
  fs.mkdirSync(LIBRARY, { recursive: true });
  const files = fs.readdirSync(LIBRARY).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(LIBRARY, f));
  const sig = signature(files);
  if (!fresh && cache && sig === cacheSig) return cache;

  const dossiers = [];
  const errors = [];
  for (const file of files) {
    const data = readJson(file, null);
    if (!data) {
      errors.push(`${path.basename(file)}: JSON 解析失败`);
      continue;
    }
    const list = Array.isArray(data) ? data : data.dossiers;
    if (!Array.isArray(list)) {
      errors.push(`${path.basename(file)}: 缺少 dossiers`);
      continue;
    }
    for (const d of list) {
      if (!d || !d.id || !Array.isArray(d.angles) || !Array.isArray(d.facts)) {
        errors.push(`${path.basename(file)}: 专题结构不完整`);
        continue;
      }
      dossiers.push({ ...d, _file: path.basename(file) });
    }
  }

  const byId = new Map();
  for (const d of dossiers) {
    if (byId.has(d.id)) errors.push(`专题 id 重复：${d.id}`);
    byId.set(d.id, d);
  }

  const byCatRegion = new Map();
  for (const d of dossiers) {
    const key = `${d.category}:${d.region}`;
    if (!byCatRegion.has(key)) byCatRegion.set(key, []);
    byCatRegion.get(key).push(d);
  }

  const counts = dossiers.reduce((m, d) => {
    const key = `${d.category}:${d.region}`;
    m[key] = (m[key] || 0) + 1;
    return m;
  }, {});

  cache = {
    dossiers,
    byId,
    byCatRegion,
    counts,
    files: files.map((f) => path.basename(f)),
    errors,
    variantCount: dossiers.reduce((n, d) => n + d.angles.length * 2, 0),
    loadedAt: new Date().toISOString(),
  };
  cacheSig = sig;
  return cache;
}

export function librarySummary() {
  const lib = loadLibrary();
  return {
    dossiers: lib.dossiers.length,
    variants: lib.variantCount,
    files: lib.files.length,
    counts: lib.counts,
    errors: lib.errors,
  };
}
