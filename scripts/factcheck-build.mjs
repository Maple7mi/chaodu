import fs from 'node:fs';
import path from 'node:path';
import { loadLibrary } from '../lib/library.mjs';

const ROOT = path.resolve('data/factcheck');
const BATCHES = path.join(ROOT, 'batches');
const PARTS = path.join(ROOT, 'parts');
fs.rmSync(BATCHES, { recursive: true, force: true });
fs.mkdirSync(BATCHES, { recursive: true });
fs.mkdirSync(PARTS, { recursive: true });

const lib = loadLibrary({ fresh: true });
const flags = [
  ['year', /(公元前|公元|前\d{2,4}|\d{3,4}\s*年)/],
  ['number', /[一二三四五六七八九十百千万亿零〇两\d]+(万|亿|公里|千米|米|年|月|日|%|％|倍|种|个|条|座|层|度|岁|人|户)/],
  ['absolute', /(最早|最先|首次|第一个|唯一|全部|所有|从未|绝不|一定|必然|最大|最小|最高|最低|最重|最轻|最古老|最年轻)/],
  ['study', /(研究|实验|调查|论文|元分析|统计|数据|样本|心理学家|社会学家|经济学家|历史学家|考古学家|学者)/],
  ['citation', /(发现|证明|表明|显示|认为|指出|提出)/],
];

const rows = lib.dossiers.map((d) => {
  const fs2 = d.facts.map((f) => {
    const fg = flags.filter(([, re]) => re.test(f.text)).map(([k]) => k);
    return { id: f.id, text: f.text, flags: fg };
  });
  const score = fs2.reduce((n, f) => n + f.flags.length, 0);
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    region: d.region,
    score,
    dossier: {
      id: d.id,
      title: d.title,
      dek: d.angles?.[0]?.thesis || '',
      category: d.category,
      region: d.region,
      facts: fs2,
      story: d.story,
      sources: d.sources,
    },
  };
});

// Highest-risk dossiers are spread round-robin across batches (serpentine).
rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
const BATCH_COUNT = 64;
const SIZE = 8;
const buckets = Array.from({ length: BATCH_COUNT }, () => []);
rows.forEach((row, i) => {
  const round = Math.floor(i / BATCH_COUNT);
  const pos = i % BATCH_COUNT;
  const b = round % 2 === 0 ? pos : BATCH_COUNT - 1 - pos;
  buckets[b].push(row.dossier);
});

let totalFacts = 0;
const manifest = [];
for (let i = 0; i < BATCH_COUNT; i++) {
  const no = String(i + 1).padStart(2, '0');
  const dossiers = buckets[i];
  const facts = dossiers.reduce((n, d) => n + d.facts.length, 0);
  totalFacts += facts;
  const payload = {
    batch: `batch-${no}`,
    generatedAt: new Date().toISOString(),
    instructions: 'See data/factcheck/PROTOCOL.md. Check every fact; write only the issues you can support with web evidence.',
    totalDossiers: dossiers.length,
    totalFacts: facts,
    dossiers,
  };
  fs.writeFileSync(path.join(BATCHES, `batch-${no}.json`), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  manifest.push({ batch: `batch-${no}`, dossiers: dossiers.map((d) => d.id), facts });
}

fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'data/library/*.json',
  dossiers: lib.dossiers.length,
  facts: totalFacts,
  batches: BATCH_COUNT,
  batchSize: SIZE,
  files: manifest,
}, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({ dossiers: lib.dossiers.length, facts: totalFacts, batches: BATCH_COUNT, parts: PARTS }, null, 2));
