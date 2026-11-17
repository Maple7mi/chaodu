#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC, ROOT } from './lib/paths.mjs';
import { buildArchive, buildArticle, buildBootstrap, buildStats, buildTodayPayload, doFeedback, doRead, togglePush } from './lib/api.mjs';
import { librarySummary } from './lib/library.mjs';
import { auditSummary, getAuditDossier, listAudits } from './lib/factcheck.mjs';
import { schedulerStatus, startScheduler, tick } from './lib/scheduler.mjs';
import { stateSummary } from './lib/store.mjs';
import { today } from './lib/time.mjs';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const safe = path.normalize(rel).replace(/^([/\\])+/, '');
  const file = path.resolve(PUBLIC, safe);
  if (!file.startsWith(PUBLIC + path.sep) && file !== PUBLIC) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  let stat;
  try { stat = fs.statSync(file); } catch { return sendJson(res, 404, { error: 'not found' }); }
  if (!stat.isFile()) return sendJson(res, 404, { error: 'not found' });
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const noCache = pathname === '/' || /\.(html|js|css)$/i.test(pathname);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

function withCsp(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

function dateParam(url) {
  const d = url.searchParams.get('date');
  if (!d) return today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('日期格式应为 YYYY-MM-DD');
  return d;
}

const server = http.createServer(async (req, res) => {
  withCsp(res);
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;
  try {
    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        date: today(),
        root: ROOT,
        library: librarySummary(),
        scheduler: schedulerStatus(),
        state: stateSummary(),
        factcheck: auditSummary(),
      });
    }

    if (pathname === '/api/bootstrap' && req.method === 'GET') {
      return sendJson(res, 200, buildBootstrap());
    }

    if (pathname === '/api/today' && req.method === 'GET') {
      const payload = buildTodayPayload(dateParam(url));
      if (!payload.issue && payload.unlocked) {
        return sendJson(res, 503, {
          error: '今日内容尚未生成。请确认内容库已就位，然后运行 node scripts/generate.mjs。',
          detail: payload.error || null,
        });
      }
      return sendJson(res, 200, payload);
    }

    if (pathname.startsWith('/api/article/') && req.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/article/'.length));
      const value = buildArticle(id);
      if (!value) return sendJson(res, 404, { error: '文章不存在' });
      return sendJson(res, 200, value);
    }

    if (pathname === '/api/read' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.articleId) return sendJson(res, 400, { error: '缺少 articleId' });
      const value = doRead(String(body.articleId));
      if (!value) return sendJson(res, 404, { error: '文章不存在' });
      return sendJson(res, 200, value);
    }

    if (pathname === '/api/feedback' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.articleId) return sendJson(res, 400, { error: '缺少 articleId' });
      const value = doFeedback(String(body.articleId), String(body.action || ''), body.rating);
      if (!value) return sendJson(res, 404, { error: '文章不存在' });
      return sendJson(res, 200, value);
    }

    if (pathname === '/api/archive' && req.method === 'GET') {
      return sendJson(res, 200, buildArchive({
        query: url.searchParams.get('query') || '',
        category: url.searchParams.get('category') || '',
        feedback: url.searchParams.get('feedback') || '',
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 24),
      }));
    }

    if (pathname === '/api/stats' && req.method === 'GET') {
      return sendJson(res, 200, buildStats());
    }

    if (pathname === '/api/settings/push' && req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, togglePush(!!body.enabled));
    }

    if (pathname === '/api/tick' && req.method === 'POST') {
      const result = tick();
      return sendJson(res, 200, { result, status: schedulerStatus() });
    }

    if (pathname === '/api/factcheck' && req.method === 'GET') {
      return sendJson(res, 200, {
        summary: auditSummary(),
        list: listAudits({
          status: url.searchParams.get('status') || 'all',
          query: url.searchParams.get('query') || '',
          page: Number(url.searchParams.get('page') || 1),
          pageSize: Number(url.searchParams.get('pageSize') || 30),
        }),
      });
    }

    if (pathname.startsWith('/api/factcheck/') && req.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/factcheck/'.length));
      const value = getAuditDossier(id);
      if (!value) return sendJson(res, 404, { error: '核查记录不存在' });
      return sendJson(res, 200, value);
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: '未知接口' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'method not allowed' });
    }
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(`[朝读] ${req.method} ${pathname} -> ${e.message}`);
    if (!res.headersSent) return sendJson(res, 500, { error: e.message || '服务器错误' });
    return res.end();
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。先关闭占用进程，或设置 PORT 环境变量。`);
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`朝读 · http://${HOST}:${PORT}`);
  startScheduler();
});

process.on('SIGINT', () => {
  console.log('\n朝读已停止。');
  process.exit(0);
});
