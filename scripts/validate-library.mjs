#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'data', 'library');
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => path.resolve(p))
  : fs.readdirSync(LIB).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(LIB, f));

const CATS = new Set(['history', 'myth', 'geography', 'psychology']);
const REGIONS = new Set(['cn', 'world', 'global']);
const cjk = (s) => (String(s).match(/[\u3400-\u9fff]/g) || []).length;
const errs = [];
const warns = [];
const ids = new Map();
const titles = new Map();
let total = 0;

function check(cond, msg) {
  if (!cond) errs.push(msg);
}
function warn(cond, msg) {
  if (!cond) warns.push(msg);
}
function len(s, min, max, label) {
  const n = cjk(s);
  check(n >= min && n <= max, `${label} 汉字数 ${n}，应在 ${min}–${max}`);
}

for (const file of files) {
  if (!fs.existsSync(file)) {
    errs.push(`文件不存在：${file}`);
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    errs.push(`${path.basename(file)} JSON 解析失败：${e.message}`);
    continue;
  }
  const list = Array.isArray(data) ? data : data.dossiers;
  check(Array.isArray(list) && list.length > 0, `${path.basename(file)} 缺少 dossiers 数组`);
  if (!Array.isArray(list)) continue;

  for (const d of list) {
    total += 1;
    const pre = `${path.basename(file)} / ${d.id || '(no id)'}`;
    check(/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(d.id || ''), `${pre}: id 必须是小写 kebab-case`);
    if (ids.has(d.id)) errs.push(`${pre}: id 与 ${ids.get(d.id)} 重复`);
    else ids.set(d.id, path.basename(file));
    check(CATS.has(d.category), `${pre}: category 非法`);
    check(REGIONS.has(d.region), `${pre}: region 非法`);
    if (d.category === 'psychology') check(d.region === 'global', `${pre}: 心理学 region 必须是 global`);
    else check(d.region !== 'global', `${pre}: 非心理学 region 必须是 cn/world`);
    len(d.title, 5, 30, `${pre}.title`);
    if (titles.has(d.title)) errs.push(`${pre}: 标题与 ${titles.get(d.title)} 重复`);
    else titles.set(d.title, path.basename(file));
    len(d.subtitle, 10, 70, `${pre}.subtitle`);
    check(Array.isArray(d.tags) && d.tags.length >= 3 && d.tags.length <= 6, `${pre}: tags 需 3–6 个`);
    check(Array.isArray(d.facts) && d.facts.length >= 10 && d.facts.length <= 12, `${pre}: facts 需 10–12 条`);
    check(Array.isArray(d.angles) && d.angles.length === 3, `${pre}: angles 必须恰好 3 个`);
    check(Array.isArray(d.terms) && d.terms.length >= 3 && d.terms.length <= 5, `${pre}: terms 需 3–5 个`);
    check(Array.isArray(d.sources) && d.sources.length >= 2 && d.sources.length <= 4, `${pre}: sources 需 2–4 个`);
    check(d.difficulty === 'high-school', `${pre}: difficulty 必须是 high-school`);
    check(!!d.story, `${pre}: story 必填（hook/setup/question）`);
    if (d.story) {
      const sh = cjk(d.story.hook || '');
      const sp = cjk(d.story.setup || '');
      const sq = cjk(d.story.question || '');
      const storyLen = sh + sp + sq;
      check(sh >= 30 && sh <= 75, `${pre}.story.hook 汉字 ${sh}，应在 35–65（容差 30–75）`);
      check(sp >= 90 && sp <= 165, `${pre}.story.setup 汉字 ${sp}，应在 100–150（容差 90–165）`);
      check(sq >= 15 && sq <= 50, `${pre}.story.question 汉字 ${sq}，应在 20–40（容差 15–50）`);
      check(storyLen >= 160 && storyLen <= 270, `${pre}.story 总长 ${storyLen}，应在 180–240（容差 160–270）`);
      warn(sh >= 35 && sh <= 65, `${pre}.story.hook 建议 35–65 字（现 ${sh}）`);
      warn(sp >= 100 && sp <= 150, `${pre}.story.setup 建议 100–150 字（现 ${sp}）`);
      warn(sq >= 20 && sq <= 40, `${pre}.story.question 建议 20–40 字（现 ${sq}）`);
      warn(storyLen >= 180 && storyLen <= 240, `${pre}.story 建议总长 180–240（现 ${storyLen}）`);
    }

    const factIds = new Set();
    for (const [i, f] of (d.facts || []).entries()) {
      check(f && typeof f.id === 'string' && f.id.length > 0, `${pre}.facts[${i}] 缺 id`);
      check(!factIds.has(f?.id), `${pre}: fact id 重复 ${f?.id}`);
      factIds.add(f?.id);
      check(typeof f?.text === 'string', `${pre}.facts[${i}] 缺 text`);
      len(f?.text || '', 50, 180, `${pre}.facts[${i}]`);
      warn(cjk(f?.text) >= 60 && cjk(f?.text) <= 140, `${pre}.facts[${i}] 建议 60–140 字（现 ${cjk(f?.text)}）`);
    }

    const angleIds = new Set();
    for (const [i, a] of (d.angles || []).entries()) {
      const ap = `${pre}.angles[${i}]`;
      check(a && typeof a.id === 'string', `${ap} 缺 id`);
      check(!angleIds.has(a?.id), `${ap}: angle id 重复`);
      angleIds.add(a?.id);
      len(a?.title || '', 5, 32, `${ap}.title`);
      check(typeof a?.altTitle === 'string' && cjk(a.altTitle) >= 5, `${ap}.altTitle 缺失或太短`);
      len(a?.thesis || '', 18, 90, `${ap}.thesis`);
      check(Array.isArray(a?.openings) && a.openings.length === 2, `${ap}: openings 必须 2 条`);
      check(Array.isArray(a?.closings) && a.closings.length === 2, `${ap}: closings 必须 2 条`);
      (a?.openings || []).forEach((s, j) => len(s, 50, 170, `${ap}.openings[${j}]`));
      (a?.closings || []).forEach((s, j) => len(s, 45, 160, `${ap}.closings[${j}]`));
      check(Array.isArray(a?.picks) && a.picks.length >= 5 && a.picks.length <= 6, `${ap}: picks 需 5–6 条`);
      check(Array.isArray(a?.altPicks) && a.altPicks.length >= 1 && a.altPicks.length <= 2, `${ap}: altPicks 需 1–2 条`);
      for (const p of [...(a?.picks || []), ...(a?.altPicks || [])]) {
        check(factIds.has(p), `${ap}: 引用了不存在的 fact ${p}`);
      }
      check(new Set(a?.picks || []).size === (a?.picks || []).length, `${ap}: picks 内有重复`);
      if (a?.misconception) len(a.misconception, 30, 110, `${ap}.misconception`);
    }
    const sigs = (d.angles || []).map((a) => (a.picks || []).join(','));
    check(new Set(sigs).size === sigs.length, `${pre}: 三个 angle 的 picks 不能完全相同`);
  }
}

for (const w of warns.slice(0, 30)) console.warn('warn  ' + w);
if (warns.length > 30) console.warn(`warn  …另有 ${warns.length - 30} 条`);
for (const e of errs) console.error('ERROR ' + e);

const byCat = {};
for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const list = Array.isArray(data) ? data : data.dossiers;
    if (!Array.isArray(list)) continue;
    byCat[path.basename(file)] = list.reduce((m, d) => ((m[d.category] = (m[d.category] || 0) + 1), m), {});
  } catch {}
}
console.log(`\n检查 ${files.length} 个文件 / ${total} 个专题，错误 ${errs.length}，提醒 ${warns.length}`);
for (const [f, m] of Object.entries(byCat)) console.log(`  ${f}: ${JSON.stringify(m)}`);
if (errs.length) process.exit(1);
