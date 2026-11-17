import { loadIssue, saveIssue } from '../lib/issues.mjs';
import { factCheckFor } from '../lib/factcheck.mjs';
import { today } from '../lib/time.mjs';

const date = process.argv[2] || today();
const issue = loadIssue(date);
if (!issue) {
  console.error(`没有 ${date} 的 issue。`);
  process.exit(1);
}

let attached = 0;
let removed = 0;
for (const article of issue.articles || []) {
  const fc = factCheckFor(article.dossierId);
  if (fc) {
    article.factCheck = fc;
    attached += 1;
  } else if (article.factCheck) {
    delete article.factCheck;
    removed += 1;
  }
}

saveIssue(issue);
console.log(`已刷新 ${date}：${issue.articles.length} 篇，附加核查 ${attached} 篇${removed ? `，移除 ${removed} 篇旧标记` : ''}。`);
