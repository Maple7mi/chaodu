#!/usr/bin/env node
import { ensureIssue, issueFile } from '../lib/issues.mjs';
import { today } from '../lib/time.mjs';
import { CATEGORY_LABELS } from '../lib/composer.mjs';

function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const date = arg('date', today());
const force = process.argv.includes('--force');

try {
  const { issue, created } = ensureIssue(date, { force });
  const counts = {};
  let chars = 0;
  for (const a of issue.articles) {
    counts[a.category] = (counts[a.category] || 0) + 1;
    chars += a.charCount;
  }
  const avg = Math.round(chars / issue.articles.length);
  console.log(`${created ? '已生成' : '已存在'} ${date} 朝读：${issue.articles.length} 篇，平均 ${avg} 字`);
  console.log(`  类别：${Object.entries(counts).map(([k, n]) => `${CATEGORY_LABELS[k] || k} ${n}`).join(' / ')}`);
  console.log(`  核心：中国 ${issue.composition.coreCn} / 世界 ${issue.composition.coreWorld} = ${issue.composition.coreRatio}`);
  console.log(`  文件：${issueFile(issue.date)}`);
  console.log('  目录：');
  for (const a of issue.articles) {
    console.log(`    ${String(a.seq).padStart(2, '0')} [${a.categoryLabel}] ${a.title}（${a.charCount} 字）`);
  }
  const short = issue.articles.filter((a) => a.charCount < 500);
  const long = issue.articles.filter((a) => a.charCount > 760);
  if (short.length) console.warn(`  注意：${short.length} 篇少于 500 字`);
  if (long.length) console.warn(`  注意：${long.length} 篇多于 760 字`);
} catch (e) {
  console.error(`生成失败：${e.message}`);
  process.exit(1);
}
