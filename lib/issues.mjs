import fs from 'node:fs';
import path from 'node:path';
import { ISSUES } from './paths.mjs';
import { buildIssue } from './selection.mjs';
import { loadLibrary } from './library.mjs';
import { readJson, writeJsonAtomic } from './util.mjs';
import { computeWeights, markIssueGenerated } from './store.mjs';

export function issueFile(date) {
  return path.join(ISSUES, `${date}.json`);
}

export function loadIssue(date) {
  return readJson(issueFile(date), null);
}

export function saveIssue(issue) {
  writeJsonAtomic(issueFile(issue.date), issue);
}

export function listIssueDates() {
  if (!fs.existsSync(ISSUES)) return [];
  return fs.readdirSync(ISSUES)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function findArticle(articleId) {
  const m = String(articleId || '').match(/^(\d{4}-\d{2}-\d{2})-/);
  if (!m) return null;
  const issue = loadIssue(m[1]);
  if (!issue) return null;
  const article = (issue.articles || []).find((a) => a.id === articleId);
  return article ? { article, issue } : null;
}

export function latestPreviousIssue(date) {
  const dates = listIssueDates().filter((d) => d < date);
  if (!dates.length) return null;
  return loadIssue(dates[dates.length - 1]);
}

export function ensureIssue(date, { force = false, now = new Date() } = {}) {
  const existing = loadIssue(date);
  if (existing && !force) return { issue: existing, created: false };
  const library = loadLibrary();
  if (library.errors.length) {
    throw new Error(`内容库有问题：${library.errors.slice(0, 3).join('；')}`);
  }
  if (library.dossiers.length < 70) {
    throw new Error(`内容库专题不足（当前 ${library.dossiers.length} 个，至少需要 70 个）`);
  }
  const weights = computeWeights(now);
  const issue = buildIssue(date, library, weights, { now });
  saveIssue(issue);
  markIssueGenerated(date, issue.articles.length, now);
  return { issue, created: true };
}

export function issueView(issue) {
  if (!issue) return null;
  return {
    date: issue.date,
    createdAt: issue.createdAt,
    unlockAt: issue.unlockAt,
    composition: issue.composition,
    articles: issue.articles.map((a) => ({
      id: a.id,
      seq: a.seq,
      title: a.title,
      dek: a.dek,
      category: a.category,
      categoryLabel: a.categoryLabel,
      region: a.region,
      regionLabel: a.regionLabel,
      tags: a.tags,
      charCount: a.charCount,
      readingMinutes: a.readingMinutes,
    })),
  };
}
