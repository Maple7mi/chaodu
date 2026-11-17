import { CATEGORY_LABELS } from './composer.mjs';
import { ensureIssue, findArticle, issueView, latestPreviousIssue, listIssueDates, loadIssue } from './issues.mjs';
import { librarySummary } from './library.mjs';
import { isUnlocked, today, unlockAt } from './time.mjs';
import { archive, computeWeights, dailyProgress, getFeedback, getRead, getStats, markRead, setPushEnabled, stateSummary, submitFeedback } from './store.mjs';
import { schedulerStatus } from './scheduler.mjs';

function articleState(article) {
  const read = getRead(article.id);
  const fb = getFeedback(article.id);
  return {
    read: !!read,
    readAt: read?.lastReadAt || null,
    feedback: fb ? { action: fb.action, rating: fb.rating, at: fb.at } : null,
  };
}

function decorate(issue) {
  const view = issueView(issue);
  if (!view) return null;
  view.articles = view.articles.map((a) => ({ ...a, ...articleState(a) }));
  return view;
}

function dailyFor(issue) {
  if (!issue) return null;
  return dailyProgress(issue.date, (issue.articles || []).map((a) => a.id));
}

function nextPending(issue, currentId) {
  const list = issue.articles || [];
  const idx = list.findIndex((a) => a.id === currentId);
  const after = idx >= 0 ? list.slice(idx + 1) : list;
  const pending = (a) => getFeedback(a.id)?.action !== 'rate';
  // 先向后找，找不到再从头找：今日完成不要求按顺序评。
  const candidate = after.find(pending) || list.find(pending) || null;
  return candidate ? { id: candidate.id, seq: candidate.seq, title: candidate.title, category: candidate.categoryLabel } : null;
}

export function buildTodayPayload(date = today(), now = new Date()) {
  const todayStr = today(now);
  const target = date || todayStr;
  const past = target < todayStr;
  const unlocked = past || isUnlocked(target, now);
  let issue = loadIssue(target);
  let error = null;
  if (unlocked && !issue) {
    try {
      issue = ensureIssue(target, { now }).issue;
    } catch (e) {
      error = e.message;
    }
  }
  const prev = unlocked ? null : latestPreviousIssue(target);
  const stats = getStats(now);
  return {
    date: target,
    today: todayStr,
    now: now.toISOString(),
    unlocked,
    locked: !unlocked,
    nextUnlockAt: unlocked ? null : unlockAt(target).toISOString(),
    issue: unlocked ? decorate(issue) : null,
    error,
    daily: unlocked ? dailyFor(issue) : null,
    previous: prev ? {
      date: prev.date,
      count: prev.articles.length,
      title: `昨天的朝读 · ${prev.articles.length} 篇`,
    } : null,
    dates: listIssueDates().slice(-8).reverse(),
    composition: issue?.composition || null,
    stats,
    settings: { pushEnabled: stats.pushEnabled },
  };
}

export function buildBootstrap(now = new Date()) {
  const payload = buildTodayPayload(today(now), now);
  return {
    ...payload,
    library: librarySummary(),
    scheduler: schedulerStatus(now),
    state: stateSummary(),
    categoryLabels: CATEGORY_LABELS,
    serverTime: now.toISOString(),
  };
}

export function buildArticle(articleId, now = new Date()) {
  const found = findArticle(articleId);
  if (!found) return null;
  const { article, issue } = found;
  const idx = issue.articles.findIndex((a) => a.id === article.id);
  const prev = idx > 0 ? issue.articles[idx - 1] : null;
  const next = idx >= 0 && idx < issue.articles.length - 1 ? issue.articles[idx + 1] : null;
  const brief = (a) => (a ? { id: a.id, seq: a.seq, title: a.title, category: a.categoryLabel } : null);
  return {
    article: { ...article, issueDate: issue.date },
    state: articleState(article),
    position: { index: idx + 1, total: issue.articles.length },
    prev: brief(prev),
    next: brief(next),
    issueDate: issue.date,
    daily: dailyFor(issue),
    locked: !isUnlocked(issue.date, now) && issue.date >= today(now),
  };
}

export function doRead(articleId) {
  const found = findArticle(articleId);
  if (!found) return null;
  const { read, isNew } = markRead(found.article, found.issue.date);
  return { read, isNew, state: articleState(found.article) };
}

export function doFeedback(articleId, action, rating) {
  const found = findArticle(articleId);
  if (!found) return null;
  const record = submitFeedback({
    articleId,
    action,
    rating,
    article: found.article,
    issueDate: found.issue.date,
  });
  return {
    feedback: record,
    state: articleState(found.article),
    next: nextPending(found.issue, articleId),
    daily: dailyFor(found.issue),
  };
}

export function buildArchive(query) {
  return archive(query);
}

export function buildStats(now = new Date()) {
  const stats = getStats(now);
  const date = today(now);
  const issue = loadIssue(date);
  return {
    ...stats,
    daily: issue ? dailyProgress(date, issue.articles.map((a) => a.id)) : stats.daily,
    weights: computeWeights(now),
    dates: listIssueDates().slice(-14).reverse(),
  };
}

export function togglePush(enabled) {
  return { pushEnabled: setPushEnabled(enabled) };
}
