#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cjkCount, readJson, writeJsonAtomic, backupFile } from '../lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'data', 'library');
const STORY = path.join(ROOT, 'data', 'story');
const strict = process.argv.includes('--strict');

const libraryFiles = fs.readdirSync(LIB).filter((f) => f.endsWith('.json')).sort();
const byId = new Map();
const fileById = new Map();
const dossiers = [];

for (const name of libraryFiles) {
  const file = path.join(LIB, name);
  const data = readJson(file);
  const list = Array.isArray(data) ? data : data?.dossiers;
  if (!Array.isArray(list)) continue;
  for (const d of list) {
    if (byId.has(d.id)) throw new Error(`专题 id 重复：${d.id}（${name} / ${fileById.get(d.id)}）`);
    dossiers.push({ d, file, name });
    byId.set(d.id, d);
    fileById.set(d.id, name);
  }
}

if (!fs.existsSync(STORY)) {
  console.error(`没有故事目录：${STORY}`);
  process.exit(1);
}

const stories = new Map();
const errors = [];
const warnings = [];
const storyFiles = fs.readdirSync(STORY).filter((f) => f.endsWith('.json')).sort();

for (const name of storyFiles) {
  const data = readJson(path.join(STORY, name));
  if (!Array.isArray(data?.stories)) {
    errors.push(`${name}: 缺少 stories 数组`);
    continue;
  }
  for (const s of data.stories) {
    if (!s || typeof s.id !== 'string') {
      errors.push(`${name}: 有一条故事缺 id`);
      continue;
    }
    if (stories.has(s.id)) errors.push(`${name}: 故事 id 重复 ${s.id}`);
    if (!byId.has(s.id)) errors.push(`${name}: 没有对应专题 ${s.id}`);
    const hook = String(s.hook || '').trim();
    const setup = String(s.setup || '').trim();
    const question = String(s.question || '').trim();
    const h = cjkCount(hook);
    const p = cjkCount(setup);
    const q = cjkCount(question);
    const total = h + p + q;
    if (h < 30 || h > 75) errors.push(`${s.id}.hook 汉字 ${h}，应在 35–65（容差 30–75）`);
    if (p < 90 || p > 165) errors.push(`${s.id}.setup 汉字 ${p}，应在 100–150（容差 90–165）`);
    if (q < 15 || q > 50) errors.push(`${s.id}.question 汉字 ${q}，应在 20–40（容差 15–50）`);
    if (total < 160 || total > 270) errors.push(`${s.id} 故事总长 ${total}，应在 180–240（容差 160–270）`);
    if (h < 35 || h > 65) warnings.push(`${s.id}.hook 偏离建议区间：${h}`);
    if (p < 100 || p > 150) warnings.push(`${s.id}.setup 偏离建议区间：${p}`);
    if (q < 20 || q > 40) warnings.push(`${s.id}.question 偏离建议区间：${q}`);
    if (total < 180 || total > 240) warnings.push(`${s.id} 总长偏离建议区间：${total}`);
    stories.set(s.id, { hook, setup, question });
  }
}

const missing = dossiers.filter(({ d }) => !stories.has(d.id)).map(({ d }) => d.id);
if (missing.length) {
  const label = `缺故事 ${missing.length}/${dossiers.length}：${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`;
  if (strict) errors.push(label);
  else warnings.push(label);
}

const dup = dossiers.length - new Set(dossiers.map(({ d }) => d.id)).size;
if (dup) errors.push(`专题 id 重复 ${dup} 个`);

if (warnings.length) for (const w of warnings.slice(0, 40)) console.warn('warn  ' + w);
if (errors.length) {
  for (const e of errors) console.error('ERROR ' + e);
  console.error(`\n故事校验失败：${errors.length} 个错误，未写入内容库。`);
  process.exit(1);
}

let changed = 0;
const touched = new Map();
for (const { d, file, name } of dossiers) {
  const s = stories.get(d.id);
  if (!s) continue;
  if (!touched.has(file)) touched.set(file, []);
  touched.get(file).push(d.id);
  const before = JSON.stringify(d.story || null);
  const after = JSON.stringify(s);
  if (before !== after) changed += 1;
  d.story = s;
}

for (const [file, ids] of touched) {
  backupFile(file, `library-before-story-${path.basename(file, '.json')}`);
  const data = readJson(file);
  const list = Array.isArray(data) ? data : data.dossiers;
  for (const d of list) {
    if (stories.has(d.id)) d.story = stories.get(d.id);
  }
  writeJsonAtomic(file, data);
  console.log(`写入 ${path.basename(file)}：${ids.length} 个故事`);
}

const lens = [...stories.values()].map((s) => cjkCount(s.hook) + cjkCount(s.setup) + cjkCount(s.question));
console.log(`\n故事 ${stories.size} 条，覆盖专题 ${stories.size}/${dossiers.length}，改动 ${changed} 条`);
if (lens.length) console.log(`总长 ${Math.min(...lens)}–${Math.max(...lens)} 汉字，警告 ${warnings.length}，错误 0`);
if (missing.length) console.log(`未覆盖：${missing.length} 个（非严格模式允许）`);
