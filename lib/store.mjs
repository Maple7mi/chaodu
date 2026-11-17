import fs from 'node:fs';
import path from 'node:path';
import { STATE_FILE, BACKUPS } from './paths.mjs';
import { dateInTz, today } from './time.mjs';
import { backupFile, clamp, readJson, writeJsonAtomic } from './util.mjs';

let state = null;
let lastBackupAt = 0;

function nowIso(now = new Date()) {
  return now.toISOString();
}

function defaultState(now = new Date()) {
  return {
    version: 1,
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    reads: {},
    feedback: {},
    events: [],
    issues: {},
    settings: {
      push: true,
      dailyGoal: 20,
    },
    meta: {
      lastBackupAt: null,
    },
  };
}

export function loadState() {
  if (state) return state;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  let loaded = null;
  if (fs.existsSync(STATE_FILE)) {
    loaded = readJson(STATE_FILE, null);
    if (!loaded || typeof loaded !== 'object') {
      const corrupt = `${STATE_FILE}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(STATE_FILE, corrupt); } catch {}
      loaded = null;
    }
  }
  state = loaded ? normalizeState(loaded) : defaultState();
  if (!loaded) saveState();
  return state;
}

function normalizeState(s) {
  const base = defaultState();
  return {
    ...base,
    ...s,
    reads: s.reads && typeof s.reads === 'object' ? s.reads : {},
    feedback: s.feedback && typeof s.feedback === 'object' ? s.feedback : {},
    events: Array.isArray(s.events) ? s.events : [],
    issues: s.issues && typeof s.issues === 'object' ? s.issues : {},
    settings: { ...base.settings, ...(s.settings || {}) },
    meta: { ...base.meta, ...(s.meta || {}) },
  };
}

export function saveState() {
  if (!state) return;
  const now = new Date();
  state.updatedAt = nowIso(now);
  const last = lastBackupAt || (state.meta.lastBackupAt ? Date.parse(state.meta.lastBackupAt) : 0);
  if (fs.existsSync(STATE_FILE) && Date.now() - last > 6 * 3600 * 1000) {
    backupFile(STATE_FILE, 'state');
    lastBackupAt = Date.now();
    state.meta.lastBackupAt = nowIso(now);
    pruneBackups(120);
  }
  writeJsonAtomic(STATE_FILE, state);
}

function pruneBackups(keep) {
  try {
    const files = fs.readdirSync(BACKUPS)
      .filter((f) => f.startsWith('state-') && f.endsWith('.json'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const x of files.slice(keep)) {
      try { fs.unlinkSync(path.join(BACKUPS, x.f)); } catch {}
    }
  } catch {}
}

function pushEvent(event) {
  state.events.push(event);
  if (state.events.length > 8000) state.events.splice(0, state.events.length - 8000);
}

function snapshot(article, issueDate, at) {
  return {
    articleId: article.id,
    issueDate,
    seq: article.seq ?? null,
    title: article.title,
    dek: article.dek || '',
    category: article.category,
    categoryLabel: article.categoryLabel,
    region: article.region,
    regionLabel: article.regionLabel,
    tags: Array.isArray(article.tags) ? article.tags.slice(0, 8) : [],
    dossierId: article.dossierId || null,
    firstReadAt: at,
    lastReadAt: at,
    readCount: 1,
  };
}

export function markRead(article, issueDate, now = new Date()) {
  loadState();
  const at = nowIso(now);
  const existing = state.reads[article.id];
  if (existing) {
    existing.lastReadAt = at;
    existing.readCount = (existing.readCount || 1) + 1;
    existing.title = article.title || existing.title;
    existing.dek = article.dek || existing.dek;
    existing.category = article.category || existing.category;
    existing.categoryLabel = article.categoryLabel || existing.categoryLabel;
    existing.region = article.region || existing.region;
    existing.regionLabel = article.regionLabel || existing.regionLabel;
    existing.tags = Array.isArray(article.tags) ? article.tags.slice(0, 8) : existing.tags;
    saveState();
    return { read: existing, isNew: false };
  }
  const read = snapshot(article, issueDate, at);
  state.reads[article.id] = read;
  pushEvent({
    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    type: 'read',
    articleId: article.id,
    issueDate,
    category: article.category,
    tags: read.tags,
  });
  saveState();
  return { read, isNew: true };
}

export function getRead(articleId) {
  loadState();
  return state.reads[articleId] || null;
}

export function getFeedback(articleId) {
  loadState();
  return state.feedback[articleId] || null;
}

const ACTIONS = new Set(['known', 'dislike', 'rate']);

export function submitFeedback({ articleId, action, rating = null, article = null, issueDate = null, now = new Date() }) {
  loadState();
  if (!ACTIONS.has(action)) throw new Error('未知反馈类型');
  let read = state.reads[articleId];
  if (!read) {
    if (!article) throw new Error('文章尚未打开，无法反馈');
    read = snapshot(article, issueDate || article.date || today(now), nowIso(now));
    state.reads[articleId] = read;
    pushEvent({
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: nowIso(now),
      type: 'read',
      articleId,
      issueDate: read.issueDate,
      category: read.category,
      tags: read.tags,
    });
  }
  let cleanRating = null;
  if (action === 'rate') {
    cleanRating = Math.round(Number(rating));
    if (!Number.isFinite(cleanRating) || cleanRating < 1 || cleanRating > 5) {
      throw new Error('评分需为 1–5 星');
    }
  }
  const at = nowIso(now);
  const prev = state.feedback[articleId];
  const history = Array.isArray(prev?.history) ? prev.history.slice(-19) : [];
  if (prev) {
    history.push({ action: prev.action, rating: prev.rating ?? null, at: prev.at });
  }
  const record = {
    articleId,
    action,
    rating: cleanRating,
    at,
    issueDate: read.issueDate,
    title: read.title,
    category: read.category,
    categoryLabel: read.categoryLabel,
    region: read.region,
    tags: read.tags || [],
    history,
  };
  state.feedback[articleId] = record;
  pushEvent({
    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    type: 'feedback',
    articleId,
    issueDate: read.issueDate,
    category: read.category,
    tags: read.tags || [],
    action,
    rating: cleanRating,
  });
  saveState();
  return record;
}

function decay(at, now) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 0.2;
  const days = Math.max(0, (now.getTime() - t) / 86400000);
  return Math.max(0.12, 0.5 ** (days / 90));
}

const SIGNALS = {
  known: { cat: -0.06, tag: -0.09 },
  dislike: { cat: -0.24, tag: -0.4 },
  rate: {
    1: { cat: -0.28, tag: -0.42 },
    2: { cat: -0.14, tag: -0.2 },
    3: { cat: 0, tag: 0 },
    4: { cat: 0.1, tag: 0.14 },
    5: { cat: 0.2, tag: 0.28 },
  },
};

export function computeWeights(now = new Date()) {
  loadState();
  const catLog = new Map();
  const tagLog = new Map();
  let signals = 0;
  for (const fb of Object.values(state.feedback)) {
    const s = fb.action === 'rate' ? SIGNALS.rate[fb.rating] : SIGNALS[fb.action];
    if (!s) continue;
    const d = decay(fb.at, now);
    signals += 1;
    if (fb.category) catLog.set(fb.category, (catLog.get(fb.category) || 0) + s.cat * d);
    for (const tag of fb.tags || []) tagLog.set(tag, (tagLog.get(tag) || 0) + s.tag * d);
  }
  const categories = {};
  for (const [k, v] of catLog) categories[k] = +Math.exp(clamp(v, -1.25, 0.85)).toFixed(3);
  const tags = {};
  for (const [k, v] of tagLog) tags[k] = +Math.exp(clamp(v, -1.35, 0.9)).toFixed(3);
  return {
    categories,
    tags,
    signals,
    updatedAt: nowIso(now),
  };
}

export function readDates() {
  loadState();
  const set = new Set();
  for (const r of Object.values(state.reads)) {
    const d = r.firstReadAt ? dateInTz(new Date(r.firstReadAt)) : '';
    if (d) set.add(d);
  }
  return [...set].sort();
}

function streakInfo(now = new Date()) {
  const dates = new Set(readDates());
  const todayStr = today(now);
  const yesterday = new Date(`${todayStr}T12:00:00+08:00`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStr = dateInTz(yesterday);
  let cursor = dates.has(todayStr) ? todayStr : dates.has(yStr) ? yStr : null;
  let current = 0;
  while (cursor && dates.has(cursor)) {
    current += 1;
    const d = new Date(`${cursor}T12:00:00+08:00`);
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = dateInTz(d);
  }
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of [...dates].sort()) {
    if (prev) {
      const pd = new Date(`${prev}T12:00:00+08:00`);
      pd.setUTCDate(pd.getUTCDate() + 1);
      run = dateInTz(pd) === d ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, todayRead: dates.has(todayStr), lastReadDate: [...dates].sort().pop() || null };
}

export const DAILY_REQUIRED = 20;

// 今日完成只认 1–5 星评分：同一篇文章改评只算一次，
// 「我知道」「不感兴趣」仍会保存并影响推荐，但不计入 20 个评分。
export function dailyProgress(date, articleIds = null) {
  loadState();
  const allowed = articleIds ? new Set(articleIds) : null;
  const rated = new Set();
  const known = new Set();
  const dislike = new Set();
  for (const [id, fb] of Object.entries(state.feedback)) {
    if (fb.issueDate !== date) continue;
    if (allowed && !allowed.has(id)) continue;
    if (fb.action === 'rate' && Number.isInteger(fb.rating) && fb.rating >= 1 && fb.rating <= 5) {
      rated.add(id);
    } else if (fb.action === 'known') {
      known.add(id);
    } else if (fb.action === 'dislike') {
      dislike.add(id);
    }
  }
  let read = 0;
  for (const id of Object.keys(state.reads)) {
    if (allowed && !allowed.has(id)) continue;
    if (state.reads[id]?.issueDate === date) read += 1;
  }
  const required = DAILY_REQUIRED;
  return {
    date,
    required,
    rated: rated.size,
    remaining: Math.max(0, required - rated.size),
    complete: rated.size >= required,
    known: known.size,
    dislike: dislike.size,
    read,
  };
}

export function getStats(now = new Date()) {
  loadState();
  const reads = Object.values(state.reads);
  const feedback = Object.values(state.feedback);
  const ratings = feedback.filter((f) => f.action === 'rate' && f.rating);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  for (const f of ratings) {
    dist[f.rating] += 1;
    ratingSum += f.rating;
  }
  const catCount = {};
  const tagCount = {};
  for (const r of reads) {
    catCount[r.category] = (catCount[r.category] || 0) + 1;
    for (const t of r.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  const sortObj = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const dayCounts = {};
  for (const r of reads) {
    const d = r.firstReadAt ? dateInTz(new Date(r.firstReadAt)) : '';
    if (d) dayCounts[d] = (dayCounts[d] || 0) + 1;
  }
  const recent = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(`${today(now)}T12:00:00+08:00`);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = dateInTz(d);
    recent.push({ date: ds, count: dayCounts[ds] || 0 });
  }
  return {
    totalRead: reads.length,
    uniqueDossiers: new Set(reads.map((r) => r.dossierId).filter(Boolean)).size,
    rated: ratings.length,
    averageRating: ratings.length ? +(ratingSum / ratings.length).toFixed(2) : null,
    ratingDist: dist,
    known: feedback.filter((f) => f.action === 'known').length,
    dislike: feedback.filter((f) => f.action === 'dislike').length,
    unrated: Math.max(0, reads.length - feedback.length),
    streak: streakInfo(now),
    daily: dailyProgress(today(now), null),
    recent,
    topCategories: sortObj(catCount).map(([k, n]) => ({ key: k, count: n })),
    topTags: sortObj(tagCount).slice(0, 12).map(([k, n]) => ({ tag: k, count: n })),
    weights: computeWeights(now),
    pushEnabled: !!state.settings.push,
  };
}

export function archive({ query = '', category = '', feedback = '', page = 1, pageSize = 24 } = {}) {
  loadState();
  const q = String(query || '').trim().toLowerCase();
  const items = Object.values(state.reads)
    .map((r) => {
      const fb = state.feedback[r.articleId] || null;
      return {
        articleId: r.articleId,
        issueDate: r.issueDate,
        title: r.title,
        dek: r.dek,
        category: r.category,
        categoryLabel: r.categoryLabel,
        region: r.region,
        regionLabel: r.regionLabel,
        tags: r.tags || [],
        firstReadAt: r.firstReadAt,
        lastReadAt: r.lastReadAt,
        readCount: r.readCount || 1,
        feedback: fb ? { action: fb.action, rating: fb.rating, at: fb.at } : null,
      };
    })
    .filter((it) => {
      if (category && it.category !== category) return false;
      if (feedback === 'known' && it.feedback?.action !== 'known') return false;
      if (feedback === 'dislike' && it.feedback?.action !== 'dislike') return false;
      if (feedback === 'rated' && it.feedback?.action !== 'rate') return false;
      if (feedback === 'unrated' && it.feedback) return false;
      if (q) {
        const hay = `${it.title} ${it.dek} ${(it.tags || []).join(' ')} ${it.categoryLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => String(b.lastReadAt).localeCompare(String(a.lastReadAt)));
  const p = Math.max(1, Number(page) || 1);
  const ps = clamp(Number(pageSize) || 24, 1, 60);
  return {
    total: items.length,
    page: p,
    pageSize: ps,
    pages: Math.max(1, Math.ceil(items.length / ps)),
    items: items.slice((p - 1) * ps, p * ps),
  };
}

export function markIssueGenerated(date, count, now = new Date()) {
  loadState();
  const log = state.issues[date] || {};
  state.issues[date] = { ...log, generatedAt: log.generatedAt || nowIso(now), count };
  saveState();
}

export function markIssuePushed(date, detail = {}, now = new Date()) {
  loadState();
  const log = state.issues[date] || {};
  state.issues[date] = { ...log, pushedAt: nowIso(now), push: detail };
  saveState();
}

export function shouldPush(date) {
  loadState();
  return !!state.settings.push && !state.issues[date]?.pushedAt;
}

export function shouldPushCompletion(date) {
  loadState();
  return !!state.settings.push && !state.issues[date]?.completionPushedAt;
}

export function markCompletionPushed(date, detail = {}, now = new Date()) {
  loadState();
  const log = state.issues[date] || {};
  state.issues[date] = { ...log, completionPushedAt: nowIso(now), completionPush: detail };
  saveState();
}

export function setPushEnabled(enabled) {
  loadState();
  state.settings.push = !!enabled;
  saveState();
  return state.settings.push;
}

export function stateSummary() {
  loadState();
  return {
    reads: Object.keys(state.reads).length,
    feedback: Object.keys(state.feedback).length,
    events: state.events.length,
    issues: Object.keys(state.issues).length,
    settings: state.settings,
  };
}
