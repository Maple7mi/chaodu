import { cjkCount, hashString, mulberry32 } from './util.mjs';
import { unlockAt } from './time.mjs';
import { factCheckFor } from './factcheck.mjs';

export const CATEGORY_LABELS = {
  history: '历史',
  myth: '神话',
  geography: '地理',
  psychology: '心理',
};

export const REGION_LABELS = {
  cn: '中国',
  world: '世界',
  global: '关系',
};

export const CATEGORY_ORDER = ['history', 'myth', 'geography', 'psychology'];

const TERM_LEADS = ['先记住一个词：', '理解这件事，需要一个小概念：', '这里有个关键词：'];

function factMap(dossier) {
  return new Map(dossier.facts.map((f) => [f.id, f]));
}

function uniquePush(arr, item) {
  if (item && !arr.includes(item)) arr.push(item);
}

function bigrams(text) {
  const out = new Set();
  const s = String(text || '').replace(/[^\u3400-\u9fff]/g, '');
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

// 故事版开头常常已经交代了某条事实（尤其心理学的研究背景）。
// 如果一条 picks 与故事的重合度过高，就跳过它，避免开篇刚说完、下一段又说一遍。
function overlapsStory(factText, storyText) {
  const a = bigrams(factText);
  const b = bigrams(storyText);
  if (a.size < 20 || b.size < 20) return false;
  let hit = 0;
  for (const g of a) if (b.has(g)) hit += 1;
  return hit / a.size >= 0.3;
}

export function composeArticle(dossier, angleIndex, edition, date, seq) {
  const angle = dossier.angles[angleIndex];
  if (!angle) throw new Error(`angle ${angleIndex} 不存在：${dossier.id}`);
  const fm = factMap(dossier);
  const rng = mulberry32(hashString(`${date}|${dossier.id}|${angleIndex}|${edition}`));

  let picks = angle.picks.slice(0, 6);
  if (edition === 1) {
    const alt = angle.altPicks?.[0];
    if (alt && fm.has(alt) && !picks.includes(alt)) {
      picks[Math.min(2, picks.length - 1)] = alt;
    }
    if (picks.length < 6) {
      for (const extra of angle.altPicks || []) uniquePush(picks, extra);
    }
  }

  const opening = angle.openings[edition % angle.openings.length];
  const closing = angle.closings[edition % angle.closings.length];
  const story = dossier.story;
  const storyText = story ? [story.hook, story.setup, story.question].join('') : '';

  if (story) {
    const kept = picks.filter((id) => {
      const text = fm.get(id)?.text || '';
      return !overlapsStory(text, storyText);
    });
    if (kept.length >= 2) picks = kept;
  }

  const used = new Set(picks);
  const unusedFacts = dossier.facts
    .map((f) => f.id)
    .filter((id) => !used.has(id))
    .filter((id) => !story || !overlapsStory(fm.get(id)?.text || '', storyText));

  // 故事版先用 hook / setup / question 铺好画面、人物身份与矛盾，再进事实。
  // 没有 story 的旧专题仍走原来的 opening，保证内容库渐进升级时不中断。
  const openingParts = story
    ? [story.hook, story.setup, story.question].filter(Boolean)
    : [opening];
  const main = [...openingParts, ...picks.map((id) => fm.get(id)?.text).filter(Boolean)];
  let aside = angle.misconception || '';

  // 收束也算进目标字数，避免“检查时刚好、加上结尾就超长”。
  const count = () => cjkCount([...main, closing].join('') + aside);
  let guard = 0;

  // 太短：先补未使用的事实，再补一个术语解释。
  while (count() < 560 && unusedFacts.length && guard < 6) {
    guard += 1;
    const id = unusedFacts.shift();
    const idx = Math.min(main.length - 1, 2 + (guard % 2));
    main.splice(idx, 0, fm.get(id).text);
  }
  if (count() < 560 && dossier.terms?.length) {
    const t = dossier.terms[Math.floor(rng() * dossier.terms.length)];
    const lead = TERM_LEADS[Math.floor(rng() * TERM_LEADS.length)];
    main.splice(main.length - 1, 0, `${lead}${t.term}。${t.def}`);
  }

  // 太长：先去掉“常见误解”，再删中间事实，保留开场和收束。
  if (count() > 680 && aside) {
    aside = '';
  }
  while (count() > 680 && main.length > 4) {
    const idx = Math.max(2, main.length - 2);
    main.splice(idx, 1);
  }

  main.push(closing);
  const body = main.filter(Boolean);
  const allText = body.join('') + aside;
  const chars = cjkCount(allText);

  const id = `${date}-${String(seq).padStart(2, '0')}-${dossier.id}-a${angleIndex + 1}e${edition + 1}`;
  return {
    id,
    date,
    seq,
    dossierId: dossier.id,
    dossierTitle: dossier.title,
    angleIndex,
    edition,
    title: edition === 1 && angle.altTitle ? angle.altTitle : angle.title,
    dek: angle.thesis,
    category: dossier.category,
    categoryLabel: CATEGORY_LABELS[dossier.category] || dossier.category,
    region: dossier.region,
    regionLabel: REGION_LABELS[dossier.region] || dossier.region,
    tags: dossier.tags || [],
    body,
    aside,
    terms: (dossier.terms || []).slice(0, 4),
    sources: dossier.sources || [],
    charCount: chars,
    readingMinutes: Math.max(1, Math.ceil(chars / 300)),
    publishedAt: unlockAt(date).toISOString(),
    difficulty: 'high-school',
    factCheck: factCheckFor(dossier.id),
  };
}
