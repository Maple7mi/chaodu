import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';

const AUDIT_FILE = path.join(ROOT, 'data', 'factcheck', 'audit.json');
const LABELS = {
  verified: '已核实',
  corrected: '有修正',
  disputed: '有争议',
  unverifiable: '待核实',
};
const TONES = {
  verified: 'ok',
  corrected: 'warn',
  disputed: 'alert',
  unverifiable: 'muted',
};

let cache = { mtime: 0, audit: null };

export function loadAudit({ fresh = false } = {}) {
  try {
    const stat = fs.statSync(AUDIT_FILE);
    if (!fresh && cache.audit && cache.mtime === stat.mtimeMs) return cache.audit;
    const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    cache = { mtime: stat.mtimeMs, audit };
    return audit;
  } catch {
    return null;
  }
}

export function factCheckFor(id) {
  const audit = loadAudit();
  const d = audit?.dossiers?.[id];
  if (!d) return null;
  return {
    status: d.status,
    statusLabel: LABELS[d.status] || d.status,
    tone: TONES[d.status] || 'muted',
    confidence: d.confidence,
    checkedAt: d.checkedAt,
    summary: d.summary,
    issueCount: d.issueCount,
    issues: (d.issues || []).map((i) => ({
      factId: i.factId,
      severity: i.severity || 'minor',
      verdict: i.verdict || '',
      problem: i.problem || '',
      correction: i.correction || null,
      evidence: (i.evidence || []).filter((e) => e.url).map((e) => ({ title: e.title || e.url, url: e.url })),
    })),
  };
}

export function getAuditDossier(id) {
  const audit = loadAudit();
  return audit?.dossiers?.[id] || null;
}

export function auditSummary() {
  const audit = loadAudit();
  if (!audit) return null;
  return {
    generatedAt: audit.generatedAt,
    totals: audit.totals,
    method: audit.method,
    coverage: {
      dossiers: audit.totals.checkedDossiers,
      facts: audit.totals.checkedFacts,
      expectedDossiers: audit.totals.expectedDossiers,
      expectedFacts: audit.totals.expectedFacts,
      pct: audit.totals.coveragePct,
    },
  };
}

export function listAudits({ status = 'all', query = '', page = 1, pageSize = 30 } = {}) {
  const audit = loadAudit();
  if (!audit) return { total: 0, page: 1, pageSize, items: [] };
  let rows = Object.values(audit.dossiers);
  if (status && status !== 'all') rows = rows.filter((d) => d.status === status);
  if (query) {
    const q = String(query).toLowerCase();
    rows = rows.filter((d) => d.id.toLowerCase().includes(q) || (d.summary || '').toLowerCase().includes(q));
  }
  rows.sort((a, b) => (a.status === b.status ? a.id.localeCompare(b.id) : a.status.localeCompare(b.status)));
  const size = Math.min(100, Math.max(5, Number(pageSize) || 30));
  const p = Math.max(1, Number(page) || 1);
  return {
    total: rows.length,
    page: p,
    pageSize: size,
    pages: Math.max(1, Math.ceil(rows.length / size)),
    items: rows.slice((p - 1) * size, p * size).map((d) => ({
      id: d.id,
      title: d.title || d.id,
      status: d.status,
      statusLabel: LABELS[d.status] || d.status,
      tone: TONES[d.status] || 'muted',
      confidence: d.confidence,
      summary: d.summary,
      issueCount: d.issueCount,
      checkedAt: d.checkedAt,
    })),
  };
}

export { LABELS, TONES };
