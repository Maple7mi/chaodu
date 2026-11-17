import fs from 'node:fs';
import path from 'node:path';
import { loadLibrary } from '../lib/library.mjs';
import { LIBRARY } from '../lib/paths.mjs';
import { cjkCount, writeJsonAtomic, backupFile } from '../lib/util.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const all = args.includes('--all');
const auditFile = path.resolve('data/factcheck/audit.json');
if (!fs.existsSync(auditFile)) throw new Error('缺少 data/factcheck/audit.json；先跑 factcheck-merge.mjs');
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const lib = loadLibrary({ fresh: true });

const byFile = new Map();
for (const d of lib.dossiers) {
  if (!byFile.has(d._file)) byFile.set(d._file, []);
  byFile.get(d._file).push(d);
}

const wanted = [];
for (const d of Object.values(audit.dossiers)) {
  for (const issue of d.issues || []) {
    if (!issue.correction) continue;
    if (!all && issue.verdict !== 'wrong' && issue.severity !== 'critical') continue;
    wanted.push({ ...issue, dossierId: d.id, batch: d.batch });
  }
}

console.log(`候选修正 ${wanted.length} 条（${all ? '所有带 correction 的 issue' : 'wrong/critical'}）`);
let applied = 0;
let skipped = 0;
for (const issue of wanted) {
  const dossier = lib.byId.get(issue.dossierId);
  if (!dossier) { skipped++; console.log(`SKIP ${issue.dossierId}: 找不到专题`); continue; }
  const fact = dossier.facts.find((f) => f.id === issue.factId);
  if (!fact) { skipped++; console.log(`SKIP ${issue.dossierId}/${issue.factId}: 找不到 fact`); continue; }
  const next = String(issue.correction).trim();
  const len = cjkCount(next);
  if (len < 50 || len > 180) {
    skipped++;
    console.log(`SKIP ${issue.dossierId}/${issue.factId}: 修正长度 ${len}`);
    continue;
  }
  if (next === fact.text) { skipped++; continue; }
  applied++;
  console.log(`\n[${issue.dossierId}/${issue.factId}] ${issue.verdict || issue.severity}`);
  console.log(`- 旧：${fact.text}`);
  console.log(`+ 新：${next}`);
  if (!dry) {
    fact.text = next;
  }
}

if (!dry) {
  for (const [file, dossiers] of byFile) {
    const filePath = path.join(LIBRARY, file);
    backupFile(filePath, `library-pre-factcheck-${file.replace(/\.json$/, '')}`);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.dossiers;
    for (const d of dossiers) {
      const target = list.find((x) => x.id === d.id);
      if (!target) continue;
      for (const fact of d.facts) {
        const targetFact = target.facts?.find((x) => x.id === fact.id);
        if (targetFact && targetFact.text !== fact.text) targetFact.text = fact.text;
      }
      const auditDossier = audit.dossiers[d.id];
      if (auditDossier) {
        target.factCheck = {
          status: auditDossier.status,
          confidence: auditDossier.confidence,
          batch: auditDossier.batch,
          checkedAt: auditDossier.checkedAt,
          issueCount: auditDossier.issueCount,
          appliedAt: new Date().toISOString(),
          summary: auditDossier.summary,
        };
      }
    }
    writeJsonAtomic(filePath, raw);
  }
  console.log(`\n写入 ${applied} 条修正，跳过 ${skipped} 条。`);
} else {
  console.log(`\nDRY RUN：将写入 ${applied} 条，跳过 ${skipped} 条。`);
}
