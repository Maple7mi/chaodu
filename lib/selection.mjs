import fs from 'node:fs';
import path from 'node:path';
import { ISSUES } from './paths.mjs';
import { composeArticle, CATEGORY_LABELS, REGION_LABELS } from './composer.mjs';
import { addDays, dayOfYear, daysBetween, unlockAt } from './time.mjs';
import { clamp, hashString, mulberry32, pickWeighted, readJson } from './util.mjs';

const CATEGORY_SEQUENCE = [
  'history', 'psychology', 'geography', 'myth',
  'history', 'psychology', 'geography', 'myth',
  'history', 'psychology', 'geography', 'history',
  'psychology', 'myth', 'geography', 'history',
  'psychology', 'geography', 'myth', 'history',
];

export function slotPlan(date) {
  const even = dayOfYear(date) % 2 === 0;
  return [
    { category: 'history', region: 'cn', n: 2 },
    { category: 'history', region: 'world', n: 4 },
    { category: 'myth', region: 'cn', n: 1 },
    { category: 'myth', region: 'world', n: 3 },
    { category: 'geography', region: 'cn', n: even ? 2 : 1 },
    { category: 'geography', region: 'world', n: even ? 3 : 4 },
    { category: 'psychology', region: 'global', n: 5 },
  ];
}

export function loadUsage(excludeDate = null) {
  const usage = new Map();
  if (!fs.existsSync(ISSUES)) return usage;
  for (const f of fs.readdirSync(ISSUES)) {
    if (!f.endsWith('.json')) continue;
    const issue = readJson(path.join(ISSUES, f), null);
    if (!issue || !Array.isArray(issue.articles)) continue;
    if (excludeDate && issue.date === excludeDate) continue;
    for (const a of issue.articles) {
      if (!a.dossierId) continue;
      let u = usage.get(a.dossierId);
      if (!u) {
        u = { lastDate: '', count: 0, variants: new Map() };
        usage.set(a.dossierId, u);
      }
      u.count += 1;
      if (a.date > u.lastDate) u.lastDate = a.date;
      const key = `${a.angleIndex ?? 0}-${a.edition ?? 0}`;
      const v = u.variants.get(key) || { count: 0, lastDate: '' };
      v.count += 1;
      if (a.date > v.lastDate) v.lastDate = a.date;
      u.variants.set(key, v);
    }
  }
  return usage;
}

function novelty(lastDate, date) {
  if (!lastDate) return 1.4;
  const d = daysBetween(date, lastDate);
  if (d >= 90) return 1.25;
  if (d >= 60) return 1.12;
  if (d >= 35) return 1;
  if (d >= 21) return 0.62;
  if (d >= 10) return 0.28;
  return 0.05;
}

function variantFresh(count) {
  return clamp(1.28 - count * 0.2, 0.3, 1.28);
}

function bestVariant(dossier, usageEntry) {
  const variants = [];
  for (let ai = 0; ai < dossier.angles.length; ai += 1) {
    for (let ed = 0; ed < 2; ed += 1) {
      const key = `${ai}-${ed}`;
      const v = usageEntry?.variants?.get(key) || { count: 0, lastDate: '' };
      variants.push({ angleIndex: ai, edition: ed, count: v.count, lastDate: v.lastDate });
    }
  }
  variants.sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    return String(a.lastDate).localeCompare(String(b.lastDate));
  });
  return variants[0];
}

function geoMeanTagWeight(tags, weights) {
  if (!tags?.length) return 1;
  let sum = 0;
  for (const t of tags) sum += Math.log(weights.tags?.[t] || 1);
  return Math.exp(sum / tags.length);
}

function overlapPenalty(tags, usedTags) {
  let n = 0;
  for (const t of tags || []) if (usedTags.has(t)) n += 1;
  return 1 / (1 + n * 0.12);
}

export function selectArticles(date, library, weights, { rngSeed = null } = {}) {
  const rng = mulberry32(hashString(`${date}|selection|${rngSeed ?? ''}`));
  const usage = loadUsage(date);
  const usedToday = new Set();
  const usedTags = new Set();
  const selected = [];
  const plan = slotPlan(date);

  for (const slot of plan) {
    const pool = (library.byCatRegion.get(`${slot.category}:${slot.region}`) || [])
      .filter((d) => !usedToday.has(d.id));
    if (!pool.length) throw new Error(`内容库缺少 ${slot.category}/${slot.region} 专题，无法编排 ${date}`);
    for (let k = 0; k < slot.n; k += 1) {
      const candidates = pool.filter((d) => !usedToday.has(d.id)).map((d) => {
        const u = usage.get(d.id);
        const v = bestVariant(d, u);
        const pref = (weights.categories?.[d.category] || 1) * geoMeanTagWeight(d.tags, weights);
        const nov = novelty(u?.lastDate || '', date);
        const fresh = variantFresh(v.count);
        const diversity = overlapPenalty(d.tags, usedTags);
        const jitter = 0.9 + rng() * 0.2;
        return { dossier: d, variant: v, score: Math.max(0.0001, pref * nov * fresh * diversity * jitter) };
      });
      if (!candidates.length) throw new Error(`内容库 ${slot.category}/${slot.region} 可用专题不足`);
      const chosen = pickWeighted(candidates, (c) => c.score * c.score, rng);
      usedToday.add(chosen.dossier.id);
      for (const t of chosen.dossier.tags || []) usedTags.add(t);
      selected.push({
        dossier: chosen.dossier,
        angleIndex: chosen.variant.angleIndex,
        edition: chosen.variant.edition,
      });
    }
  }

  const byCat = new Map();
  for (const s of selected) {
    const c = s.dossier.category;
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(s);
  }
  const ordered = [];
  for (const c of CATEGORY_SEQUENCE) {
    const bucket = byCat.get(c);
    if (bucket?.length) ordered.push(bucket.shift());
  }
  // 兜底：若还有剩余（正常不会发生），按原顺序补在后面。
  for (const bucket of byCat.values()) ordered.push(...bucket);
  if (ordered.length !== 20) throw new Error(`编排结果 ${ordered.length} 篇，预期 20 篇`);
  return ordered;
}

export function buildIssue(date, library, weights, { now = new Date() } = {}) {
  const selected = selectArticles(date, library, weights);
  const articles = selected.map((s, i) => composeArticle(s.dossier, s.angleIndex, s.edition, date, i + 1));
  const byCategory = {};
  const byRegion = {};
  for (const a of articles) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    byRegion[a.region] = (byRegion[a.region] || 0) + 1;
  }
  const core = articles.filter((a) => a.category !== 'psychology');
  const cn = core.filter((a) => a.region === 'cn').length;
  const world = core.filter((a) => a.region === 'world').length;
  return {
    version: 1,
    date,
    createdAt: now.toISOString(),
    unlockAt: unlockAt(date).toISOString(),
    composition: {
      total: articles.length,
      byCategory,
      byRegion,
      core: core.length,
      coreCn: cn,
      coreWorld: world,
      coreRatio: `${cn}:${world}`,
      coreRatioLabel: '历史 / 神话 / 地理 15 篇，中国 : 世界 = 3 : 7（两日平均）',
      psychology: byCategory.psychology || 0,
      categories: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [CATEGORY_LABELS[k] || k, v])),
      regions: Object.fromEntries(Object.entries(byRegion).map(([k, v]) => [REGION_LABELS[k] || k, v])),
    },
    articles,
  };
}

export function nextDate(date) {
  return addDays(date, 1);
}
