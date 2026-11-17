import { isUnlocked, today } from './time.mjs';
import { ensureIssue, loadIssue } from './issues.mjs';
import { dailyProgress, markCompletionPushed, markIssuePushed, shouldPush, shouldPushCompletion } from './store.mjs';
import { pushCompletion, pushIssue } from './notify.mjs';

let timer = null;
let running = false;
let last = null;
const reported = new Set();

export function tick(now = new Date()) {
  const date = today(now);
  if (!isUnlocked(date, now)) {
    return { date, locked: true, nextUnlockAt: `${date}T08:00:00+08:00` };
  }
  if (running) return last || { date, busy: true };
  running = true;
  try {
    const { issue, created } = ensureIssue(date, { now });
    let pushed = null;
    if (shouldPush(date)) {
      pushed = pushIssue(issue);
      markIssuePushed(date, pushed, now);
      if (!pushed.ok && !reported.has(date)) {
        reported.add(date);
        console.error(`[朝读] 推送失败：${pushed.error}`);
      }
    }
    const progress = dailyProgress(date, issue.articles.map((a) => a.id));
    let completed = null;
    if (progress.complete && shouldPushCompletion(date)) {
      completed = pushCompletion(issue, progress);
      markCompletionPushed(date, completed, now);
      if (!completed.ok && !reported.has(`${date}:complete`)) {
        reported.add(`${date}:complete`);
        console.error(`[朝读] 完成推送失败：${completed.error}`);
      }
    }
    last = { date, created, pushed, completed, progress, ok: true };
    return last;
  } catch (e) {
    last = { date, ok: false, error: e.message };
    if (!reported.has(`${date}:error`)) {
      reported.add(`${date}:error`);
      console.error(`[朝读] 生成失败：${e.message}`);
    }
    return last;
  } finally {
    running = false;
  }
}

export function startScheduler({ intervalMs = 30000 } = {}) {
  if (timer) return;
  tick();
  timer = setInterval(() => tick(), intervalMs);
  timer.unref?.();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function schedulerStatus(now = new Date()) {
  const date = today(now);
  const issue = loadIssue(date);
  return {
    date,
    unlocked: isUnlocked(date, now),
    hasIssue: !!issue,
    last,
  };
}
