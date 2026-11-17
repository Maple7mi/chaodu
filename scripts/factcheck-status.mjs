import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('data/factcheck');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
let dossiers = 0;
let facts = 0;
let issues = 0;
const verdicts = { supported: 0, imprecise: 0, wrong: 0, unsupported: 0, unverifiable: 0 };
const missing = [];
const invalid = [];
for (const file of manifest.files) {
  const p = path.join(ROOT, 'parts', `${file.batch}.json`);
  if (!fs.existsSync(p)) { missing.push(file.batch); continue; }
  try {
    const part = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const d of part.dossiers || []) {
      dossiers++;
      for (const f of d.facts || []) {
        if (verdicts[f.verdict] === undefined) invalid.push(`${file.batch}/${d.id}/${f.id}: ${f.verdict}`);
        else verdicts[f.verdict]++;
        facts++;
      }
      issues += (d.issues || []).length;
    }
  } catch (e) {
    invalid.push(`${file.batch}: ${e.message}`);
  }
}
console.log(JSON.stringify({
  batches: `${manifest.batches - missing.length}/${manifest.batches}`,
  dossiers: `${dossiers}/${manifest.dossiers}`,
  facts: `${facts}/${manifest.facts}`,
  issues,
  verdicts,
  missing,
  invalid,
}, null, 2));
