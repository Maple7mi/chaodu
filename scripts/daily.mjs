#!/usr/bin/env node
// 每天 08:00 的入口：确保当天 issue 已生成、站点已启动、且只推送一次。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, DATA } from '../lib/paths.mjs';
import { ensureIssue } from '../lib/issues.mjs';
import { markIssuePushed, shouldPush } from '../lib/store.mjs';
import { pushIssue } from '../lib/notify.mjs';
import { isUnlocked, today } from '../lib/time.mjs';

function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const date = arg('date', today());
const noPush = process.argv.includes('--no-push');
const noServer = process.argv.includes('--no-server');
const PORT = process.env.PORT || '4321';
const base = `http://127.0.0.1:${PORT}`;

async function healthy() {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(900) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitHealthy(ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await healthy()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startServer() {
  fs.mkdirSync(DATA, { recursive: true });
  const log = fs.openSync(path.join(DATA, 'server.log'), 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: { ...process.env },
  });
  child.unref();
  return child.pid;
}

(async () => {
  if (!isUnlocked(date)) {
    console.log(`${date} 还没到 08:00，跳过。`);
    return;
  }
  let issue;
  try {
    const result = ensureIssue(date);
    issue = result.issue;
    console.log(`${result.created ? '生成' : '读取'} ${date}：${issue.articles.length} 篇`);
  } catch (e) {
    console.error(`生成失败：${e.message}`);
    process.exit(1);
  }

  if (!noServer && !(await healthy())) {
    const pid = startServer();
    console.log(`已启动朝读服务（pid ${pid}）`);
    if (!(await waitHealthy())) {
      console.error('服务启动后健康检查失败，请查看 data/server.log');
      process.exit(1);
    }
    console.log(`服务就绪：${base}`);
  }

  if (noPush) {
    console.log('已指定 --no-push，不推送。');
    return;
  }
  if (!shouldPush(date)) {
    console.log('今天已经推送过，跳过。');
    return;
  }
  const result = pushIssue(issue);
  markIssuePushed(date, result);
  if (!result.ok) {
    console.error(`推送失败：${result.error}`);
    process.exit(1);
  }
  console.log(`已推送：${result.output || 'ok'}`);
})();
