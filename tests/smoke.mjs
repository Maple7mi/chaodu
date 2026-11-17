#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMP = path.join(ROOT, 'tests', '.tmp-data');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;

fs.rmSync(TEMP, { recursive: true, force: true });
fs.mkdirSync(path.join(TEMP, 'library'), { recursive: true });
fs.mkdirSync(path.join(TEMP, 'issues'), { recursive: true });
fs.cpSync(path.join(ROOT, 'data', 'library'), path.join(TEMP, 'library'), { recursive: true });

const now = new Date();
const stamp = now.toISOString();
fs.writeFileSync(path.join(TEMP, 'state.json'), JSON.stringify({
  version: 1,
  createdAt: stamp,
  updatedAt: stamp,
  reads: {},
  feedback: {},
  events: [],
  issues: {},
  settings: { push: false, dailyGoal: 20 },
  meta: { lastBackupAt: null },
}, null, 2));

process.env.SCIENCE_DATA = TEMP;
const { loadLibrary } = await import('../lib/library.mjs');
const { buildIssue } = await import('../lib/selection.mjs');
const { addDays, today } = await import('../lib/time.mjs');
const { saveIssue } = await import('../lib/issues.mjs');

const lib = loadLibrary({ fresh: true });
assert.equal(lib.errors.length, 0, `内容库错误：${lib.errors.join('; ')}`);
assert.ok(lib.dossiers.length >= 20, `内容库专题太少：${lib.dossiers.length}`);

const past = addDays(today(), -1);
const issue = buildIssue(past, lib, { categories: {}, tags: {} });
assert.equal(issue.articles.length, 20);
saveIssue(issue);

const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), SCIENCE_DATA: TEMP },
  stdio: 'ignore',
  windowsHide: true,
});

async function waitHealth(ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(700) });
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('测试服务器未启动');
}

async function get(pathname) {
  const r = await fetch(BASE + pathname);
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
}

async function post(pathname, body) {
  const r = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

try {
  const health = await waitHealth();
  assert.equal(health.ok, true);
  assert.ok(health.library.dossiers >= 20);

  const index = await fetch(BASE + '/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy') || '', /default-src 'self'/);

  const boot = await get('/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.ok(boot.body.today);

  const todayRes = await get(`/api/today?date=${past}`);
  assert.equal(todayRes.status, 200);
  assert.equal(todayRes.body.issue.articles.length, 20);
  assert.equal(todayRes.body.unlocked, true);
  assert.equal(todayRes.body.daily.rated, 0);
  assert.equal(todayRes.body.daily.required, 20);
  assert.equal(todayRes.body.daily.complete, false);
  const first = todayRes.body.issue.articles[0];
  const second = todayRes.body.issue.articles[1];

  const article = await get(`/api/article/${encodeURIComponent(first.id)}`);
  assert.equal(article.status, 200);
  assert.ok(Array.isArray(article.body.article.body) && article.body.article.body.length >= 5);
  assert.ok(article.body.article.charCount >= 500);

  const read = await post('/api/read', { articleId: first.id });
  assert.equal(read.status, 200);
  assert.equal(read.body.isNew, true);
  const readAgain = await post('/api/read', { articleId: first.id });
  assert.equal(readAgain.body.isNew, false);

  const fb = await post('/api/feedback', { articleId: first.id, action: 'rate', rating: 5 });
  assert.equal(fb.status, 200);
  assert.equal(fb.body.feedback.rating, 5);
  assert.ok(fb.body.next?.id, '评分后应返回下一篇');
  assert.equal(fb.body.daily.rated, 1);
  assert.equal(fb.body.daily.remaining, 19);
  assert.equal(fb.body.daily.complete, false);

  const known = await post('/api/feedback', { articleId: second.id, action: 'known' });
  assert.equal(known.status, 200);
  assert.equal(known.body.feedback.action, 'known');
  assert.equal(known.body.daily.rated, 1);
  assert.equal(known.body.daily.known, 1);
  assert.equal(known.body.daily.complete, false);

  const archive = await get('/api/archive?pageSize=60');
  assert.equal(archive.status, 200);
  assert.equal(archive.body.total, 2);
  assert.equal(archive.body.items[0].feedback.action, 'known');

  const rated = await get('/api/archive?feedback=rated');
  assert.equal(rated.body.total, 1);
  assert.equal(rated.body.items[0].articleId, first.id);

  const stats = await get('/api/stats');
  assert.equal(stats.status, 200);
  assert.equal(stats.body.totalRead, 2);
  assert.equal(stats.body.rated, 1);
  assert.equal(stats.body.ratingDist['5'], 1);
  assert.equal(stats.body.averageRating, 5);
  assert.ok(stats.body.weights.categories.psychology !== undefined || stats.body.weights.categories.history !== undefined);

  // 把其余文章全部评星（第二篇从 known 改成 rate），验证 20 个评分才完成。
  const rest = todayRes.body.issue.articles.slice(1);
  for (let i = 0; i < rest.length; i += 1) {
    const r = await post('/api/feedback', { articleId: rest[i].id, action: 'rate', rating: (i % 5) + 1 });
    assert.equal(r.status, 200);
    assert.equal(r.body.daily.rated, i + 2);
    if (i === rest.length - 1) {
      assert.equal(r.body.daily.complete, true);
      assert.equal(r.body.daily.remaining, 0);
      assert.equal(r.body.next, null);
    } else {
      assert.equal(r.body.daily.complete, false);
    }
  }
  const done = await get(`/api/today?date=${past}`);
  assert.equal(done.body.daily.rated, 20);
  assert.equal(done.body.daily.complete, true);

  const missing = await get('/api/article/2026-01-01-nope');
  assert.equal(missing.status, 404);

  const toggle = await post('/api/settings/push', { enabled: false });
  assert.equal(toggle.status, 200);
  assert.equal(toggle.body.pushEnabled, false);

  console.log('smoke ok：health / 静态页 / bootstrap / 往期 20 篇 / 阅读 / 评分 / 20 个评分完成 / 已知不计分 / 归档 / 统计 / 404 / 推送开关');
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 250));
  try { fs.rmSync(TEMP, { recursive: true, force: true }); } catch {}
}
