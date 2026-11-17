import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './paths.mjs';
import { chineseDate } from './time.mjs';

const SEND = process.env.SCIENCE_PUSH_SEND || path.resolve(ROOT, '..', 'push', 'send.mjs');

function send({ title, body, key, level = 'info', tag = '朝读' }) {
  if (!fs.existsSync(SEND)) {
    return { ok: false, error: `推送脚本不存在：${SEND}` };
  }
  const args = [
    SEND,
    '--source', 'science',
    '--level', level,
    '--title', title,
    '--body', body,
    '--link', 'http://127.0.0.1:4321/#/today',
    '--link-label', '打开朝读',
    '--tag', tag,
    '--key', key,
  ];
  try {
    const out = execFileSync(process.execPath, args, {
      cwd: path.dirname(SEND),
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    return { ok: true, output: String(out).trim(), send: SEND };
  } catch (e) {
    const msg = [e?.stderr, e?.stdout, e?.message].filter(Boolean).join(' ').trim();
    return { ok: false, error: msg.slice(0, 500), send: SEND };
  }
}

export function pushIssue(issue) {
  const c = issue.composition;
  const body = `今日 ${c.total} 篇 · 历史 ${c.byCategory.history} / 神话 ${c.byCategory.myth} / 地理 ${c.byCategory.geography} / 心理 ${c.byCategory.psychology} · ${c.coreRatioLabel}。完成 20 个 1–5 星评分后，今日才算完成。`;
  return send({
    level: 'info',
    title: `朝读 · ${chineseDate(issue.date)} · 20 篇新科普`,
    body,
    key: `science-daily-${issue.date}`,
  });
}

// 20 个评分全部完成时单独发一条；key 与初次推送分开，避免被去重。
export function pushCompletion(issue, progress) {
  return send({
    level: 'info',
    title: `朝读 · ${chineseDate(issue.date)} · 今日完成 ${progress.rated}/${progress.required}`,
    body: `今天的 ${progress.required} 个评分都打完了。明天早上八点，新的二十篇见。`,
    key: `science-complete-${issue.date}`,
  });
}
