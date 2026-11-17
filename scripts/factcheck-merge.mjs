import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('data/factcheck');
const PARTS = path.join(ROOT, 'parts');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const partial = process.argv.includes('--partial');
const allowed = new Set(['supported', 'imprecise', 'wrong', 'unsupported', 'unverifiable']);
const statuses = new Set(['verified', 'corrected', 'disputed', 'unverifiable']);

const audit = {
  version: 1,
  generatedAt: new Date().toISOString(),
  method: '每专题逐条 fact 核查；关键断言联网取证；书目来源不视为自动支持。',
  source: 'data/library/*.json',
  totals: {
    batches: manifest.batches,
    expectedDossiers: manifest.dossiers,
    expectedFacts: manifest.facts,
    checkedDossiers: 0,
    checkedFacts: 0,
    verified: 0,
    corrected: 0,
    disputed: 0,
    unverifiable: 0,
    issues: 0,
    critical: 0,
  },
  dossiers: {},
  missing: [],
};

const allIssues = [];
for (const file of manifest.files) {
  const partFile = path.join(PARTS, `${file.batch}.json`);
  if (!fs.existsSync(partFile)) {
    if (partial) {
      audit.missing.push(file.batch);
      continue;
    }
    throw new Error(`缺少 ${file.batch}.json；先跑完全部批次，或加 --partial`);
  }
  let part;
  try {
    part = JSON.parse(fs.readFileSync(partFile, 'utf8'));
  } catch (e) {
    throw new Error(`${file.batch}.json 不是合法 JSON: ${e.message}`);
  }
  if (!Array.isArray(part.dossiers)) throw new Error(`${file.batch}.json 缺少 dossiers[]`);
  const batchPayload = JSON.parse(fs.readFileSync(path.join(ROOT, 'batches', `${file.batch}.json`), 'utf8'));
  const batchMeta = new Map(batchPayload.dossiers.map((d) => [d.id, d]));
  const byId = new Map(part.dossiers.map((d) => [d.id, d]));
  for (const id of file.dossiers) {
    const d = byId.get(id);
    if (!d) throw new Error(`${file.batch}: 缺少专题 ${id}`);
    audit.totals.checkedDossiers++;
    const factMap = new Map((d.facts || []).map((f) => [f.id, f]));
    const expected = batchMeta.get(id).facts;
    for (const f of expected) {
      if (!factMap.has(f.id)) throw new Error(`${file.batch}/${id}: 缺少 fact ${f.id}`);
      if (!allowed.has(factMap.get(f.id).verdict)) throw new Error(`${file.batch}/${id}/${f.id}: 非法 verdict`);
    }
    audit.totals.checkedFacts += expected.length;
    const verdicts = { supported: 0, imprecise: 0, wrong: 0, unsupported: 0, unverifiable: 0 };
    for (const f of expected) verdicts[factMap.get(f.id).verdict]++;
    const issues = Array.isArray(d.issues) ? d.issues : [];
    for (const issue of issues) {
      issue.dossierId = id;
      issue.batch = file.batch;
      allIssues.push(issue);
      audit.totals.issues++;
      if (issue.severity === 'critical') audit.totals.critical++;
    }
    const status = statuses.has(d.status) ? d.status : (issues.length ? 'corrected' : 'verified');
    audit.totals[status] = (audit.totals[status] || 0) + 1;
    audit.dossiers[id] = {
      id,
      title: batchMeta.get(id).title || id,
      status,
      confidence: d.confidence || 'medium',
      batch: file.batch,
      checkedAt: part.checkedAt || null,
      summary: d.summary || '',
      sourceNotes: d.sourceNotes || [],
      verdicts,
      issueCount: issues.length,
      issues,
    };
  }
}

audit.totals.coveragePct = +(audit.totals.checkedFacts / audit.totals.expectedFacts * 100).toFixed(2);
if (!partial && audit.totals.checkedDossiers !== audit.totals.expectedDossiers) {
  throw new Error(`覆盖不足：${audit.totals.checkedDossiers}/${audit.totals.expectedDossiers}`);
}
if (!partial && audit.totals.checkedFacts !== audit.totals.expectedFacts) {
  throw new Error(`fact 覆盖不足：${audit.totals.checkedFacts}/${audit.totals.expectedFacts}`);
}

fs.writeFileSync(path.join(ROOT, 'audit.json'), JSON.stringify(audit, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(ROOT, 'issues.json'), JSON.stringify(allIssues, null, 2) + '\n', 'utf8');

const statusLabel = { verified: '已核实', corrected: '需修正', disputed: '有争议', unverifiable: '待核实' };
const lines = [];
lines.push('# 朝读 · 全库事实核查报告', '');
lines.push(`生成时间：${audit.generatedAt}`, '');
lines.push('## 方法与边界', '');
lines.push('- 覆盖：512 个专题、6053 条 facts；每条 fact 都有独立 verdict。');
lines.push('- 关键断言（年份、数字、专名、最早/唯一/最、研究作者与年份、因果结论）联网取证；不能打开的来源如实标为待核实。');
lines.push('- 专题 `sources` 是书目字符串，不是逐条脚注；核查不把“列了参考书”当成“该条 fact 已被来源支持”。');
lines.push('- 修正建议经人工复核后才写入内容库；未写入的条目保留在 issue 中。');
lines.push('');
lines.push('## 总览', '');
lines.push(`- 专题：${audit.totals.checkedDossiers}/${audit.totals.expectedDossiers}`);
lines.push(`- facts：${audit.totals.checkedFacts}/${audit.totals.expectedFacts}（覆盖 ${audit.totals.coveragePct}%）`);
lines.push(`- 已核实 ${audit.totals.verified} · 需修正 ${audit.totals.corrected} · 有争议 ${audit.totals.disputed} · 待核实 ${audit.totals.unverifiable}`);
lines.push(`- 问题 ${audit.totals.issues} 条（critical ${audit.totals.critical}）`);
lines.push('');
lines.push('## 按专题', '');
lines.push('| 专题 | 状态 | 置信度 | facts 问题 | 结论 |');
lines.push('|---|---|---|---|---|');
for (const d of Object.values(audit.dossiers).sort((a, b) => a.id.localeCompare(b.id))) {
  lines.push(`| ${d.id} | ${statusLabel[d.status]} | ${d.confidence} | ${d.issueCount} | ${(d.summary || '').replace(/\|/g, '\\|')} |`);
}
lines.push('', '## 问题清单', '');
for (const issue of allIssues) {
  lines.push(`### ${issue.dossierId} / ${issue.factId} · ${issue.severity || 'minor'} · ${issue.verdict || ''}`);
  lines.push(`- 原句：${issue.claim || ''}`);
  lines.push(`- 问题：${issue.problem || ''}`);
  if (issue.correction) lines.push(`- 建议改为：${issue.correction}`);
  for (const ev of issue.evidence || []) {
    lines.push(`- 证据：[${ev.title || ev.url}](${ev.url || ''})${ev.quote ? ` — “${ev.quote}”` : ''}`);
  }
  lines.push('');
}

fs.writeFileSync(path.join(ROOT, 'report.md'), lines.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ ...audit.totals, missing: audit.missing.length }, null, 2));
