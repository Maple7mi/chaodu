const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const progressEl = document.getElementById('reading-progress');
const metaEl = document.getElementById('masthead-meta');
const footerStats = document.getElementById('footer-stats');

const CAT_LABEL = { history: '历史', myth: '神话', geography: '地理', psychology: '心理' };
const CAT_ORDER = ['history', 'myth', 'geography', 'psychology'];
const STAR = '★★★★★';

const state = {
  bootstrap: null,
  today: null,
  todayAt: 0,
  route: { name: 'today', id: null, date: null },
  article: null,
  archive: { query: '', category: '', feedback: '', page: 1, data: null },
  factcheck: { query: '', status: 'all', page: 1, data: null },
  stats: null,
  submitting: false,
  countdownTimer: null,
  toastTimer: null,
  routeSeq: 0,
  font: Number(localStorage.getItem('chaodu-font') || 19),
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad(n) { return String(n).padStart(2, '0'); }

function catClass(c) { return `cat-${esc(c || 'history')}`; }

function catText(a) {
  if (a.category === 'psychology') return '心理 · 亲密关系';
  return `${a.categoryLabel || CAT_LABEL[a.category] || ''} · ${a.regionLabel || ''}`;
}

function stars(n) {
  const v = Math.max(0, Math.min(5, Number(n) || 0));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
}

function dateObj(dateStr) {
  return new Date(`${dateStr}T12:00:00+08:00`);
}

function longDate(dateStr) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  }).format(dateObj(dateStr));
}

function monthDay(dateStr) {
  const d = dateObj(dateStr);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function isoMonthDay(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric',
  }).format(new Date(iso));
}

function isoYear(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(new Date(iso));
}

function toast(msg, isError = false) {
  clearTimeout(state.toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.toggle('is-error', !!isError);
  toastEl.classList.add('is-show');
  state.toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), isError ? 4200 : 2400);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function setActiveNav(name) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.nav === name);
  });
}

function updateChrome(payload) {
  if (!payload) return;
  const stats = payload.stats || state.bootstrap?.stats;
  const daily = payload.daily || stats?.daily;
  const issue = payload.issue;
  if (issue) {
    const rated = issue.articles.filter((a) => a.feedback?.action === 'rate').length;
    metaEl.textContent = `${monthDay(issue.date)} · ${rated}/${issue.articles.length} 已评`;
  } else if (payload.locked) {
    metaEl.textContent = '08:00 开卷';
  }
  if (stats) {
    footerStats.textContent = `今日完成 ${daily?.rated ?? 0}/${daily?.required ?? 20} · 连续 ${stats.streak?.current ?? 0} 天`;
  }
}

async function refreshChrome() {
  try {
    const b = await api('/api/bootstrap');
    state.bootstrap = b;
    updateChrome(b);
  } catch {
    // 顶栏与页脚只是辅助信息，刷新失败不打断阅读。
  }
}

function renderError(err, extra = '') {
  app.innerHTML = `
    <div class="empty-state">
      <div class="kicker">暂时打不开</div>
      <h2>这一页没有装订好</h2>
      <p>${esc(err?.message || err || '未知错误')}</p>
      ${extra ? `<p>${esc(extra)}</p>` : ''}
      <p>如果内容库还没就位，先在项目目录运行 <code>node scripts/generate.mjs</code>，再刷新。</p>
      <p><a class="btn" href="#/today">回到今日</a></p>
    </div>`;
}

function renderGenerationError(detail) {
  app.innerHTML = `
    <div class="empty-state">
      <div class="kicker">内容尚未生成</div>
      <h2>今天的二十篇还在路上</h2>
      <p>${esc(detail || '内容库可能还没写满，或生成时遇到问题。')}</p>
      <p>在项目目录运行 <code>node scripts/generate.mjs</code>，然后刷新本页。</p>
      <p><a class="btn btn-primary" href="#/today">重试</a></p>
    </div>`;
}

/* ---------------- today ---------------- */

function statusMark(a) {
  const fb = a.feedback;
  if (fb?.action === 'rate') return `<span class="stars-mini">${stars(fb.rating)}</span>`;
  if (fb?.action === 'known' || fb?.action === 'dislike') return '待评';
  if (a.read) return '待评';
  return '→';
}

function factBadge(a) {
  const fc = a.factCheck;
  if (!fc) return '';
  return `<a class="fc-badge is-${esc(fc.tone || 'muted')}" href="#/factcheck/${encodeURIComponent(a.dossierId)}" title="查看这篇的核查记录">事实核查 · ${esc(fc.statusLabel)}</a>`;
}

function factcheckPanel(a) {
  const fc = a.factCheck;
  if (!fc) return '';
  return `
    <section class="factcheck-note is-${esc(fc.tone || 'muted')}">
      <div class="fc-note-head">
        <span class="fc-badge is-${esc(fc.tone || 'muted')}">事实核查 · ${esc(fc.statusLabel)}</span>
        <span>${fc.issueCount ? `${fc.issueCount} 条记录` : '未发现需修正的断言'}${fc.confidence ? ` · ${fc.confidence === 'high' ? '高置信' : fc.confidence === 'low' ? '低置信' : '中置信'}` : ''}</span>
      </div>
      <p>${esc(fc.summary || '这篇的每条 fact 都已进入全库核查账本。')}</p>
      <a href="#/factcheck/${encodeURIComponent(a.dossierId)}">查看核查记录与证据 →</a>
    </section>`;
}

function articleRow(a) {
  return `
    <a class="article-row ${catClass(a.category)} ${a.read ? 'is-read' : ''}" href="#/read/${encodeURIComponent(a.id)}">
      <span class="row-no">${pad(a.seq)}</span>
      <span class="row-main">
        <span class="row-kicker">${esc(catText(a))}</span>
        <span class="row-title">${esc(a.title)}</span>
        <span class="row-dek">${esc(a.dek)}</span>
      </span>
      <span class="row-meta">约 ${a.charCount} 字<br>${a.readingMinutes} 分钟</span>
      <span class="row-mark">${statusMark(a)}</span>
    </a>`;
}

function leadCard(a, complete) {
  return `
    <a class="lead-card ${catClass(a.category)}" href="#/read/${encodeURIComponent(a.id)}">
      <div class="lead-top">
        <span class="cat-label ${catClass(a.category)}">${esc(catText(a))}</span>
        <span class="lead-seq">${pad(a.seq)} / 20</span>
      </div>
      <h2>${esc(a.title)}</h2>
      <p>${esc(a.dek)}</p>
      <div class="lead-foot">
        <span>约 ${a.charCount} 字 · ${a.readingMinutes} 分钟${a.read ? ' · 已读' : ''}</span>
        <span class="read-cta">${complete ? '重读这一篇' : a.feedback?.action === 'rate' ? '已评分' : '开始阅读'} →</span>
      </div>
    </a>`;
}

function renderIssue(payload, historical = false) {
  bodyReader(false);
  const issue = payload.issue;
  if (!issue) return renderGenerationError(payload.error);
  const articles = issue.articles || [];
  const comp = issue.composition || payload.composition || {};
  const readCount = articles.filter((a) => a.read).length;
  const ratedCount = articles.filter((a) => a.feedback?.action === 'rate').length;
  const remaining = Math.max(0, articles.length - ratedCount);
  const complete = articles.length > 0 && ratedCount >= articles.length;
  const lead = articles.find((a) => a.feedback?.action !== 'rate') || articles[0];
  const rest = articles.filter((a) => a.id !== lead?.id);
  const pct = articles.length ? Math.round((ratedCount / articles.length) * 100) : 0;
  const byCat = comp.byCategory || {};
  const dateLine = historical ? `往期 · ${longDate(issue.date)}` : longDate(issue.date);
  const catBars = CAT_ORDER.map((c) => {
    const n = byCat[c] || 0;
    return `
      <div class="bar-item ${catClass(c)}">
        <span>${CAT_LABEL[c]}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.min(100, (n / 6) * 100)}%"></span></span>
        <b>${n}</b>
      </div>`;
  }).join('');
  const dateLinks = (payload.dates || []).filter((d) => d !== issue.date).slice(0, 4).map((d) => (
    `<a class="side-link" href="#/issue/${d}">${monthDay(d)}</a>`
  )).join(' · ');

  app.innerHTML = `
    <div class="page page-today">
      <section class="issue-head">
        <div class="issue-kicker">${esc(dateLine)}</div>
        <div class="issue-title-row">
          <h1>${historical ? '往期朝读' : '今日朝读'}</h1>
          <div class="issue-count">${articles.length}<small>篇</small></div>
        </div>
        <p class="issue-dek">二十篇，给高中毕业后的好奇心。历史、神话、地理与亲密关系，每篇约六百字；今天给出 20 个 1–5 星评分，才算读完。</p>
        <div class="issue-meta">
          <span class="chip">历史 ${byCat.history || 0}</span>
          <span class="chip">神话 ${byCat.myth || 0}</span>
          <span class="chip">地理 ${byCat.geography || 0}</span>
          <span class="chip">心理 ${byCat.psychology || 0}</span>
          <span class="ratio">${esc(comp.coreRatioLabel || '')}</span>
        </div>
        <div class="daily-banner ${complete ? 'is-done' : ''}">
          <span class="daily-banner-label">${complete ? '今日完成' : '今日已评'}</span>
          <strong>${ratedCount} / ${articles.length}</strong>
          <span>${complete ? '20 个评分都打完了，明早八点见。' : `还差 ${remaining} 个 1–5 星评分；「我知道」「不感兴趣」不计入。`}</span>
        </div>
      </section>

      <div class="today-layout">
        <div class="today-main">
          ${complete ? `<div class="side-note" style="margin:0 0 18px">今天的 20 个评分都完成了。可以去 <a class="side-link" href="#/archive">已读</a> 回看，或者等明天八点。</div>` : ''}
          ${lead ? leadCard(lead, complete) : ''}
          <div class="list-head"><span>其余 ${rest.length} 篇</span><span>${historical ? '往期编排' : '今日编排'}</span></div>
          <div class="article-list">
            ${rest.map(articleRow).join('')}
          </div>
        </div>

        <aside class="today-side">
          <div class="side-block">
            <div class="side-kicker">今日完成</div>
            <div class="progress-ring ${complete ? 'is-complete' : ''}" style="--p:${pct}"><span>${ratedCount}<small> / ${articles.length}</small></span></div>
            <p class="progress-note">${complete ? '20 个评分都完成了。' : ratedCount ? `还差 ${remaining} 个评分。` : '从第一个评分开始。'}<br>打开 ${readCount} 篇；我知道 / 不感兴趣不计分。</p>
          </div>

          <div class="side-block">
            <div class="side-kicker">今日配比</div>
            <div class="bar-list">${catBars}</div>
            ${comp.coreRatio ? `<p class="progress-note" style="text-align:left;margin-top:14px">核心 ${comp.core || 15} 篇<br>中国 : 世界 = ${esc(comp.coreRatio)}</p>` : ''}
          </div>

          <div class="side-block">
            <div class="side-kicker">连续阅读</div>
            <div class="side-stat"><strong>${payload.stats?.streak?.current ?? 0}</strong><span>天</span></div>
            <p class="progress-note" style="text-align:left;margin-top:8px">最长 ${payload.stats?.streak?.longest ?? 0} 天 · 已读 ${payload.stats?.totalRead ?? 0} 篇</p>
          </div>

          ${dateLinks ? `<div class="side-block"><div class="side-kicker">往期</div><div style="display:flex;flex-wrap:wrap;gap:8px 12px">${dateLinks}</div></div>` : ''}

          <div class="side-note">
            <b>怎么用：</b>读完给 1–5 星，评分越高，之后越多类似内容；点「不感兴趣」会减少同标签推送，但不计入 20 个评分。
          </div>
        </aside>
      </div>
    </div>`;
  updateChrome(payload);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderLocked(payload) {
  bodyReader(false);
  const target = payload.nextUnlockAt ? new Date(payload.nextUnlockAt) : null;
  app.innerHTML = `
    <div class="page page-locked">
      <div class="locked-mark">08:00</div>
      <h1>今天的朝读，八点开卷</h1>
      <p>二十篇新文章正在装订。到点后会自动出现在这里；如果电脑开着，右下角的推送也会亮一下。</p>
      <div class="countdown" id="countdown"><span>--:--:--</span><small>距离解锁</small></div>
      <div class="locked-actions">
        ${payload.previous ? `<a class="btn btn-primary" href="#/issue/${payload.previous.date}">先看昨天（${payload.previous.count} 篇）</a>` : ''}
        <a class="btn" href="#/archive">打开已读</a>
      </div>
    </div>`;
  updateChrome(payload);
  startCountdown(target);
}

function startCountdown(target) {
  stopCountdown();
  const el = document.getElementById('countdown');
  if (!el || !target) return;
  const tick = () => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) {
      el.innerHTML = '<span>00:00:00</span><small>正在开卷</small>';
      stopCountdown();
      setTimeout(() => {
        state.today = null;
        route();
      }, 900);
      return;
    }
    const s = Math.floor(diff / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    el.innerHTML = `<span>${pad(hh)}:${pad(mm)}:${pad(ss)}</span><small>距离解锁</small>`;
  };
  tick();
  state.countdownTimer = setInterval(tick, 1000);
}

function stopCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = null;
}

async function routeToday(force = false) {
  setActiveNav('today');
  stopCountdown();
  bodyReader(false);
  let payload;
  try {
    if (!force && state.today && Date.now() - state.todayAt < 20000) {
      payload = state.today;
    } else {
      payload = await api('/api/today');
      state.today = payload;
      state.todayAt = Date.now();
    }
  } catch (e) {
    return renderError(e);
  }
  if (!payload.unlocked) return renderLocked(payload);
  if (!payload.issue) return renderGenerationError(payload.error);
  renderIssue(payload, false);
}

async function routeIssue(date) {
  setActiveNav('today');
  stopCountdown();
  bodyReader(false);
  app.innerHTML = `<div class="empty-state"><p>正在翻到那一天……</p></div>`;
  try {
    const payload = await api(`/api/today?date=${encodeURIComponent(date)}`);
    if (!payload.unlocked || !payload.issue) return renderGenerationError('那一天还没有朝读。');
    renderIssue(payload, date !== payload.today);
  } catch (e) {
    renderError(e);
  }
}

/* ---------------- reader ---------------- */

function bodyReader(on) {
  document.body.classList.toggle('reader-mode', !!on);
  if (!on) progressEl.style.width = '0';
}

function feedbackDock(fb, busy = false) {
  const action = fb?.action || '';
  const rating = fb?.rating || 0;
  const current = action === 'rate'
    ? `已评 <b>${stars(rating)}</b><br>可改`
    : action === 'known'
      ? '已标记：我知道'
      : action === 'dislike'
        ? '已标记：不感兴趣'
        : '评分越高<br>之后越多类似内容';
  return `
    <div class="dock-inner">
      <div class="dock-prompt">
        <strong>这篇怎么样？</strong>
        <span>反馈只影响之后的推送</span>
      </div>
      <div class="dock-actions">
        <button class="fb-btn ${action === 'known' ? 'is-active' : ''}" data-fb="known" ${busy ? 'disabled' : ''} aria-pressed="${action === 'known'}">我知道，不用看</button>
        <button class="fb-btn ${action === 'dislike' ? 'is-active' : ''}" data-fb="dislike" ${busy ? 'disabled' : ''} aria-pressed="${action === 'dislike'}">不感兴趣</button>
        <div class="stars" role="group" aria-label="给这篇文章评分">
          ${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${n}" aria-label="${n} 星" ${busy ? 'disabled' : ''} class="${action === 'rate' && rating >= n ? 'is-on' : ''}">★</button>`).join('')}
        </div>
      </div>
      <div class="dock-current">${current}</div>
    </div>`;
}

function renderArticle(data) {
  bodyReader(true);
  const a = data.article;
  const fb = data.state?.feedback || null;
  const paras = (a.body || []).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
  const terms = (a.terms || []).length ? `
    <section class="terms">
      <h2>小词条</h2>
      <div class="term-grid">
        ${a.terms.map((t) => `<div class="term"><strong>${esc(t.term)}</strong><span>${esc(t.def)}</span></div>`).join('')}
      </div>
    </section>` : '';
  const sources = (a.sources || []).length ? `
    <section class="sources">
      <h2>延伸与来源</h2>
      <ol>${a.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    </section>` : '';
  const tags = (a.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  const prev = data.prev
    ? `<a href="#/read/${encodeURIComponent(data.prev.id)}"><span>上一篇 · ${pad(data.prev.seq)}</span><strong>${esc(data.prev.title)}</strong></a>`
    : '<span></span>';
  const next = data.next
    ? `<a href="#/read/${encodeURIComponent(data.next.id)}"><span>下一篇 · ${pad(data.next.seq)}</span><strong>${esc(data.next.title)}</strong></a>`
    : '<span></span>';

  app.innerHTML = `
    <div class="page page-reader">
      <div class="reader-toolbar">
        <a class="back" href="#/today">← 返回今日</a>
        <span>${esc(catText(a))}</span>
        <span class="reader-position">${pad(data.position.index)} / ${pad(data.position.total)}</span>
        <div class="reader-controls" aria-label="字号">
          <button data-font="-1" aria-label="缩小字号">A−</button>
          <button data-font="1" aria-label="放大字号">A＋</button>
        </div>
      </div>

      <article class="reader">
        <header class="reader-head">
          <span class="cat-label ${catClass(a.category)}">${esc(catText(a))}</span>
          ${factBadge(a)}
          <h1>${esc(a.title)}</h1>
          <p class="reader-dek">${esc(a.dek)}</p>
          <div class="reader-meta">
            <span>约 ${a.charCount} 字</span>
            <span>${a.readingMinutes} 分钟</span>
            <span>高中毕业难度</span>
            ${tags}
          </div>
        </header>
        <div class="reader-body">${paras}</div>
        ${a.aside ? `<aside class="misconception"><div class="kicker">常见误解</div><p>${esc(a.aside)}</p></aside>` : ''}
        ${factcheckPanel(a)}
        ${terms}
        ${sources}
        <div class="reader-end">— 完 —</div>
      </article>

      <nav class="reader-nav" aria-label="文章导航">
        ${prev}
        ${next}
      </nav>
    </div>
    <section class="feedback-dock" id="feedback-dock" aria-label="文章反馈">${feedbackDock(fb)}</section>`;

  updateDock(fb);
  state.article = data;
  window.scrollTo({ top: 0, behavior: 'instant' });
  requestAnimationFrame(updateReadingProgress);
}

function updateDock(fb, busy = false) {
  const dock = document.getElementById('feedback-dock');
  if (!dock) return;
  dock.innerHTML = feedbackDock(fb, busy);
}

async function routeReader(id) {
  setActiveNav('today');
  stopCountdown();
  bodyReader(true);
  app.innerHTML = `<div class="empty-state"><p>正在翻页……</p></div>`;
  try {
    const data = await api(`/api/article/${encodeURIComponent(id)}`);
    renderArticle(data);
    markRead(id);
  } catch (e) {
    bodyReader(false);
    renderError(e);
  }
}

async function markRead(id) {
  try {
    await api('/api/read', { method: 'POST', body: JSON.stringify({ articleId: id }) });
    state.today = null;
    if (state.article) state.article.state.read = true;
    refreshChrome();
  } catch {
    // 阅读记录失败不打断阅读；下次打开会再记一次。
  }
}

async function submitFeedback(action, rating = null) {
  if (!state.article || state.submitting) return;
  state.submitting = true;
  updateDock(state.article.state?.feedback, true);
  try {
    const res = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ articleId: state.article.article.id, action, rating }),
    });
    state.article.state = { ...(state.article.state || {}), feedback: res.feedback, read: true };
    state.today = null;
    updateDock(res.feedback, false);
    refreshChrome();
    const daily = res.daily || {};
    const done = !!daily.complete;
    if (action === 'rate') {
      toast(done ? `已评 ${rating} 星 · 今日 20/20 完成` : `已评 ${rating} 星 · 今日 ${daily.rated ?? '?'}/20`);
    } else {
      toast(`已记录 · 还差 ${daily.remaining ?? 20} 个评分（这个不算）`);
    }
    // 只有 1–5 星评分才自动跳下一篇；我知道 / 不感兴趣留在本页，提醒仍未完成。
    if (action !== 'rate') return;
    const next = done ? null : res.next;
    setTimeout(() => {
      if (next) location.hash = `#/read/${encodeURIComponent(next.id)}`;
      else location.hash = '#/today';
    }, 520);
  } catch (e) {
    toast(e.message, true);
    updateDock(state.article.state?.feedback, false);
  } finally {
    state.submitting = false;
  }
}

function changeFont(delta) {
  state.font = Math.max(17, Math.min(23, state.font + delta));
  localStorage.setItem('chaodu-font', String(state.font));
  applyFont();
}

function applyFont() {
  document.documentElement.style.setProperty('--reader-size', `${state.font}px`);
}

function updateReadingProgress() {
  if (state.route.name !== 'read') return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
  progressEl.style.width = `${p}%`;
}

/* ---------------- archive ---------------- */

function archiveShell() {
  return `
    <div class="page page-archive">
      <header class="page-head">
        <div class="kicker">已读</div>
        <h1>读过的，都在这里</h1>
        <p>打开过的文章会自动收进这一栏，按最近阅读排序。搜索标题、摘要或标签，也可以按反馈筛选。</p>
      </header>
      <div class="archive-tools">
        <div class="search-box">
          <input id="archive-search" type="search" placeholder="搜标题、摘要、标签……" autocomplete="off" value="${esc(state.archive.query)}">
        </div>
        <div class="filters" aria-label="类别筛选">
          ${['', 'history', 'myth', 'geography', 'psychology'].map((c) => `<button class="filter-btn ${state.archive.category === c ? 'is-active' : ''}" data-filter-cat="${c}">${c ? CAT_LABEL[c] : '全部'}</button>`).join('')}
        </div>
        <div class="filters" aria-label="反馈筛选">
          ${[['', '全部'], ['rated', '评过分'], ['known', '我知道'], ['dislike', '不感兴趣'], ['unrated', '未反馈']].map(([v, t]) => `<button class="filter-btn ${state.archive.feedback === v ? 'is-active' : ''}" data-filter-fb="${v}">${t}</button>`).join('')}
        </div>
        <span class="archive-total" id="archive-total">—</span>
      </div>
      <div class="archive-list" id="archive-list"><div class="empty-state"><p>正在找……</p></div></div>
      <div class="pager" id="archive-pager"></div>
    </div>`;
}

function archiveItem(it) {
  const fb = it.feedback;
  const badge = fb?.action === 'rate'
    ? `<span class="fb-badge is-star">${stars(fb.rating)}</span>`
    : fb?.action === 'known'
      ? '<span class="fb-badge is-known">我知道</span>'
      : fb?.action === 'dislike'
        ? '<span class="fb-badge is-dislike">不感兴趣</span>'
        : '<span class="fb-badge">未反馈</span>';
  return `
    <a class="archive-item" href="#/read/${encodeURIComponent(it.articleId)}">
      <div class="archive-date">
        <strong>${esc(isoMonthDay(it.firstReadAt))}</strong>
        <span>${esc(isoYear(it.firstReadAt))} · 读于 ${esc(isoMonthDay(it.lastReadAt))}</span>
      </div>
      <div class="archive-main">
        <span class="cat-label ${catClass(it.category)}">${esc(it.categoryLabel || CAT_LABEL[it.category] || '')}${it.region === 'cn' ? ' · 中国' : it.region === 'world' ? ' · 世界' : ''}</span>
        <h3>${esc(it.title)}</h3>
        <p>${esc(it.dek)}</p>
        <div class="archive-tags">${(it.tags || []).slice(0, 5).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="archive-fb">
        ${badge}
        <span class="archive-open">重读 →</span>
      </div>
    </a>`;
}

function renderArchivePager(data) {
  const el = document.getElementById('archive-pager');
  if (!el) return;
  if (data.pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''} aria-label="上一页">←</button>
    <span>${data.page} / ${data.pages}</span>
    <button data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''} aria-label="下一页">→</button>`;
}

async function loadArchive(page = 1) {
  state.archive.page = page;
  const q = new URLSearchParams({
    query: state.archive.query,
    category: state.archive.category,
    feedback: state.archive.feedback,
    page: String(page),
    pageSize: '24',
  });
  const list = document.getElementById('archive-list');
  try {
    const data = await api(`/api/archive?${q}`);
    state.archive.data = data;
    const total = document.getElementById('archive-total');
    if (total) total.textContent = `共 ${data.total} 篇`;
    if (!list) return;
    list.innerHTML = data.items.length
      ? data.items.map(archiveItem).join('')
      : `<div class="empty-state"><h2>这里还空着</h2><p>${state.archive.query || state.archive.category || state.archive.feedback ? '换个筛选条件试试，或者' : '去读今天的第一篇，'} <a class="side-link" href="#/today">回到今日</a>。</p></div>`;
    renderArchivePager(data);
  } catch (e) {
    if (list) list.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

async function routeArchive() {
  setActiveNav('archive');
  stopCountdown();
  bodyReader(false);
  state.archive = { ...state.archive, query: '', category: '', feedback: '', page: 1, data: null };
  app.innerHTML = archiveShell();
  window.scrollTo({ top: 0, behavior: 'instant' });
  loadArchive(1);
  const input = document.getElementById('archive-search');
  let timer = null;
  input?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.archive.query = input.value.trim();
      loadArchive(1);
    }, 260);
  });
}

function selectArchiveFilter(kind, value) {
  state.archive[kind] = value;
  document.querySelectorAll(kind === 'category' ? '[data-filter-cat]' : '[data-filter-fb]').forEach((el) => {
    const active = el.dataset[kind === 'category' ? 'filterCat' : 'filterFb'] === value;
    el.classList.toggle('is-active', active);
  });
  loadArchive(1);
}

/* ---------------- stats ---------------- */

function statsShell(data) {
  const s = data;
  const d = s.daily || { rated: 0, required: 20, remaining: 20, complete: false };
  const dist = s.ratingDist || {};
  const maxDist = Math.max(1, ...Object.values(dist));
  const distRows = [5, 4, 3, 2, 1].map((n) => {
    const count = dist[n] || dist[String(n)] || 0;
    return `
      <div class="dist-row">
        <span class="stars-mini">${'★'.repeat(n)}</span>
        <span class="dist-track"><span class="dist-fill" style="width:${(count / maxDist) * 100}%"></span></span>
        <b>${count}</b>
      </div>`;
  }).join('');
  const recent = s.recent || [];
  const maxRecent = Math.max(1, ...recent.map((r) => r.count));
  const spark = recent.map((r) => `
    <div class="spark-col" title="${r.date}：${r.count} 篇">
      <span class="spark-count">${r.count || ''}</span>
      <span class="spark-bar" style="height:${Math.max(2, (r.count / maxRecent) * 88)}%"></span>
      <span class="spark-label">${r.date.slice(5)}</span>
    </div>`).join('');
  const cats = s.topCategories || [];
  const maxCat = Math.max(1, ...cats.map((c) => c.count));
  const catBars = CAT_ORDER.map((c) => {
    const n = cats.find((x) => x.key === c)?.count || 0;
    return `
      <div class="cat-bar ${catClass(c)}">
        <span>${CAT_LABEL[c]}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(n / maxCat) * 100}%"></span></span>
        <b>${n}</b>
      </div>`;
  }).join('');
  const entries = Object.entries(s.weights?.tags || {});
  const up = entries.filter(([, w]) => w > 1.03).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const down = entries.filter(([, w]) => w < 0.97).sort((a, b) => a[1] - b[1]).slice(0, 8);
  const weightTags = (list, cls) => list.length
    ? list.map(([t, w]) => `<span class="weight-tag ${cls}">${esc(t)}<em>×${w.toFixed(2)}</em></span>`).join('')
    : '<span class="panel-note">还没有足够的反馈。</span>';
  const topTags = (s.topTags || []).slice(0, 10);

  return `
    <div class="page page-stats">
      <header class="page-head">
        <div class="kicker">口味</div>
        <h1>你读出了什么偏好</h1>
        <p>这里只统计你自己的阅读与反馈，全部保存在本机。评分越高，之后同类内容出现得越多；「不感兴趣」会压低相关标签。</p>
      </header>

      <div class="completion-card ${d.complete ? 'is-done' : ''}">
        <div>
          <span>今日完成</span>
          <strong>${d.rated}<small> / ${d.required}</small></strong>
        </div>
        <p>${d.complete
          ? '今天的 20 个评分都打完了。'
          : `还差 ${d.remaining} 个 1–5 星评分；「我知道」「不感兴趣」不计入今日完成。`}</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><span>累计已读</span><strong>${s.totalRead}</strong><small>篇</small><p>${s.uniqueDossiers} 个专题</p></div>
        <div class="stat-card"><span>连续阅读</span><strong>${s.streak?.current ?? 0}</strong><small>天</small><p>最长 ${s.streak?.longest ?? 0} 天</p></div>
        <div class="stat-card"><span>已评分</span><strong>${s.rated}</strong><small>篇</small><p>我知道 ${s.known} · 不感兴趣 ${s.dislike}</p></div>
        <div class="stat-card"><span>平均评分</span><strong>${s.averageRating ?? '—'}</strong><small>${s.averageRating ? '星' : ''}</small><p>${s.unrated} 篇未反馈</p></div>
      </div>

      <div class="stats-columns">
        <section class="panel">
          <h2>评分分布</h2>
          <div class="dist">${distRows}</div>
          <p class="panel-note">从 1 星到 5 星。3 星视为中性，不额外调整。</p>
        </section>
        <section class="panel">
          <h2>最近 14 天</h2>
          <div class="spark">${spark}</div>
          <p class="panel-note">每天首次打开的文章数，重复打开不重复计。</p>
        </section>
      </div>

      <div class="stats-columns">
        <section class="panel">
          <h2>常读类别</h2>
          <div class="cat-bars">${catBars}</div>
          <p class="panel-note">按首次阅读计数。心理类的 5 篇单独统计，不计入历史/神话/地理的三比七。</p>
        </section>
        <section class="panel">
          <h2>常读标签</h2>
          <div class="weight-tags">${topTags.length ? topTags.map((t) => `<span class="weight-tag">${esc(t.tag)}<em>${t.count}</em></span>`).join('') : '<span class="panel-note">读几篇之后，这里会出现你的高频标签。</span>'}</div>
        </section>
      </div>

      <div class="stats-columns">
        <section class="panel">
          <h2>推送权重</h2>
          <div class="weight-groups">
            <div class="weight-group"><h3>之后会多推</h3><div class="weight-tags">${weightTags(up, 'up')}</div></div>
            <div class="weight-group"><h3>之后会少推</h3><div class="weight-tags">${weightTags(down, 'down')}</div></div>
          </div>
          <p class="panel-note">权重按 90 天半衰期衰减；只影响未来编排，不改写已经生成的今日列表。</p>
        </section>
        <section class="panel">
          <h2>推送设置</h2>
          <div class="setting-row">
            <div>
              <strong>每天 08:00 推送</strong>
              <p>通过本机推送托盘弹出；托盘不在时留在收件箱，登录后再汇总。</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="push-toggle" ${s.pushEnabled ? 'checked' : ''} aria-label="每天八点推送">
              <span></span>
            </label>
          </div>
          <div class="setting-row">
            <div>
              <strong>阅读数据</strong>
              <p>已读 ${s.totalRead} 篇，反馈 ${s.rated + s.known + s.dislike} 次。数据在 data/state.json，不上传。</p>
            </div>
          </div>
          <p class="panel-note">明天早上八点，如果电脑开着，会收到一条「朝读」推送，点开就是当天二十篇。</p>
        </section>
      </div>
    </div>`;
}

async function routeStats() {
  setActiveNav('stats');
  stopCountdown();
  bodyReader(false);
  app.innerHTML = `<div class="empty-state"><p>正在整理你的口味……</p></div>`;
  try {
    const data = await api('/api/stats');
    state.stats = data;
    app.innerHTML = statsShell(data);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('push-toggle')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        const res = await api('/api/settings/push', { method: 'POST', body: JSON.stringify({ enabled }) });
        toast(res.pushEnabled ? '已开启每天八点推送' : '已关闭推送');
      } catch (err) {
        e.target.checked = !enabled;
        toast(err.message, true);
      }
    });
  } catch (e) {
    renderError(e);
  }
}

/* ---------------- factcheck ---------------- */

const FC_STATUS = [
  ['all', '全部'],
  ['verified', '已核实'],
  ['corrected', '有修正'],
  ['disputed', '有争议'],
  ['unverifiable', '待核实'],
];

function fcTone(status) {
  return status === 'verified' ? 'ok' : status === 'corrected' ? 'warn' : status === 'disputed' ? 'alert' : 'muted';
}

function fcStatusLabel(status) {
  return FC_STATUS.find(([v]) => v === status)?.[1] || status;
}

function factcheckShell(summary) {
  const t = summary?.totals;
  const total = t?.checkedDossiers || 0;
  const count = (k) => t?.[k] || 0;
  return `
    <div class="page page-factcheck">
      <header class="page-head">
        <div class="kicker">核查</div>
        <h1>每句话，都查过</h1>
        <p>全库 ${t?.expectedDossiers || 512} 个专题、${t?.expectedFacts || 6053} 条 facts，逐条进入核查账本。关键断言（年份、数字、专名、研究结论）联网取证；找不到可靠来源的，不写成肯定句。</p>
      </header>
      <div class="fc-summary">
        <div class="fc-stat is-ok"><span>已核实</span><strong>${count('verified')}</strong></div>
        <div class="fc-stat is-warn"><span>有修正</span><strong>${count('corrected')}</strong></div>
        <div class="fc-stat is-alert"><span>有争议</span><strong>${count('disputed')}</strong></div>
        <div class="fc-stat is-muted"><span>待核实</span><strong>${count('unverifiable')}</strong></div>
        <div class="fc-stat"><span>覆盖</span><strong>${total}<small> / ${t?.expectedDossiers || 512}</small></strong></div>
      </div>
      <div class="fc-method">
        <strong>怎么查的</strong>
        <p>${esc(summary?.method || '每条 fact 单独判定；专题书目只作线索，不自动等于来源支持。')} 修正建议经复核后才写入内容库；未解决的条目保留“有争议/待核实”，不冒充已核实。</p>
      </div>
      <div class="archive-tools fc-tools">
        <div class="search-box">
          <input id="fc-search" type="search" placeholder="搜专题 id 或结论……" autocomplete="off" value="${esc(state.factcheck.query)}">
        </div>
        <div class="filters" aria-label="核查状态筛选">
          ${FC_STATUS.map(([v, t2]) => `<button class="filter-btn ${state.factcheck.status === v ? 'is-active' : ''}" data-fc-status="${v}">${t2}</button>`).join('')}
        </div>
        <span class="archive-total" id="fc-total">—</span>
      </div>
      <div class="fc-list" id="fc-list"><div class="empty-state"><p>正在翻账本……</p></div></div>
      <div class="pager" id="fc-pager"></div>
    </div>`;
}

function factcheckItem(it) {
  const tone = it.tone || fcTone(it.status);
  return `
    <a class="fc-item" href="#/factcheck/${encodeURIComponent(it.id)}">
      <span class="fc-item-status is-${tone}">${esc(it.statusLabel || fcStatusLabel(it.status))}</span>
      <span class="fc-item-main">
        <strong>${esc(it.title || it.id)}</strong>
        <small>${esc(it.id)} · ${esc(it.confidence || 'medium')} 置信</small>
        <span>${esc(it.summary || '这条专题已进入核查账本。')}</span>
      </span>
      <span class="fc-item-count">${it.issueCount ? `${it.issueCount} 条记录` : '无待改'}</span>
    </a>`;
}

function renderFactcheckPager(data) {
  const el = document.getElementById('fc-pager');
  if (!el) return;
  if (!data.pages || data.pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button data-fc-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''} aria-label="上一页">←</button>
    <span>${data.page} / ${data.pages}</span>
    <button data-fc-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''} aria-label="下一页">→</button>`;
}

async function loadFactcheck(page = 1) {
  state.factcheck.page = page;
  const q = new URLSearchParams({
    status: state.factcheck.status,
    query: state.factcheck.query,
    page: String(page),
    pageSize: '24',
  });
  const list = document.getElementById('fc-list');
  try {
    const data = await api(`/api/factcheck?${q}`);
    state.factcheck.data = data;
    const total = document.getElementById('fc-total');
    if (total) total.textContent = `共 ${data.list.total} 个专题`;
    if (!list) return;
    list.innerHTML = data.list.items.length
      ? data.list.items.map(factcheckItem).join('')
      : `<div class="empty-state"><h2>这个筛选下还没有记录</h2><p>换个状态看看，或者 <a class="side-link" href="#/factcheck">查看全部</a>。</p></div>`;
    renderFactcheckPager(data.list);
  } catch (e) {
    if (list) list.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

async function routeFactcheck(id = null) {
  setActiveNav('factcheck');
  stopCountdown();
  bodyReader(false);
  if (id) {
    app.innerHTML = `<div class="empty-state"><p>正在翻核查记录……</p></div>`;
    try {
      const d = await api(`/api/factcheck/${encodeURIComponent(id)}`);
      const issues = d.issues || [];
      const detail = issues.length
        ? issues.map((i) => `
          <div class="fc-issue">
            <div class="fc-issue-head"><span>${esc(i.factId)}</span><strong>${esc(i.severity || 'minor')} · ${esc(i.verdict || '')}</strong></div>
            <p class="fc-claim">原句：${esc(i.claim || '')}</p>
            <p>${esc(i.problem || '')}</p>
            ${i.correction ? `<p class="fc-correction">建议改为：${esc(i.correction)}</p>` : ''}
            ${(i.evidence || []).map((e) => `<a class="fc-evidence" href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.title || e.url)}</a>`).join('')}
          </div>`).join('')
        : `<div class="fc-empty">没有发现需要修正的断言。</div>`;
      app.innerHTML = `
        <div class="page page-factcheck">
          <div class="reader-toolbar">
            <a class="back" href="#/factcheck">← 核查账本</a>
            <span>${esc(d.id)}</span>
          </div>
          <header class="page-head fc-detail-head">
            <div class="kicker">核查记录</div>
            <h1>${esc(d.title || d.id)}</h1>
            <p>${esc(d.summary || '这个专题已进入全库核查账本。')}</p>
            <div class="reader-meta">
              <span class="fc-badge is-${esc(fcTone(d.status))}">${esc(fcStatusLabel(d.status))}</span>
              <span>${esc(d.confidence || 'medium')} 置信</span>
              <span>${d.issueCount || 0} 条记录</span>
              ${d.checkedAt ? `<span>${esc(String(d.checkedAt).slice(0, 10))}</span>` : ''}
            </div>
          </header>
          <div class="fc-detail-meta">
            <span>逐条判定：支持 ${d.verdicts?.supported || 0}</span>
            <span>不精确 ${d.verdicts?.imprecise || 0}</span>
            <span>错误 ${d.verdicts?.wrong || 0}</span>
            <span>无来源 ${d.verdicts?.unsupported || 0}</span>
            <span>待核实 ${d.verdicts?.unverifiable || 0}</span>
          </div>
          ${(d.sourceNotes || []).length ? `<div class="fc-source-notes"><strong>来源与边界</strong><ul>${d.sourceNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
          <div class="fc-issues">${detail}</div>
        </div>`;
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (e) {
      renderError(e);
    }
    return;
  }
  state.factcheck = { query: '', status: 'all', page: 1, data: null };
  let summary = null;
  try { summary = (await api('/api/factcheck')).summary; } catch { /* page still renders */ }
  app.innerHTML = factcheckShell(summary);
  window.scrollTo({ top: 0, behavior: 'instant' });
  loadFactcheck(1);
  const input = document.getElementById('fc-search');
  let timer = null;
  input?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.factcheck.query = input.value.trim();
      loadFactcheck(1);
    }, 260);
  });
}

/* ---------------- router ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/today';
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 'read' && parts[1]) return { name: 'read', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'issue' && parts[1]) return { name: 'issue', date: parts[1] };
  if (parts[0] === 'archive') return { name: 'archive' };
  if (parts[0] === 'stats') return { name: 'stats' };
  if (parts[0] === 'factcheck') return { name: 'factcheck', id: parts[1] ? decodeURIComponent(parts[1]) : null };
  return { name: 'today' };
}

async function route() {
  const seq = ++state.routeSeq;
  const parsed = parseHash();
  state.route = parsed;
  applyFont();
  try {
    if (parsed.name === 'read') await routeReader(parsed.id);
    else if (parsed.name === 'issue') await routeIssue(parsed.date);
    else if (parsed.name === 'archive') await routeArchive();
    else if (parsed.name === 'stats') await routeStats();
    else if (parsed.name === 'factcheck') await routeFactcheck(parsed.id);
    else await routeToday();
  } catch (e) {
    if (seq === state.routeSeq) renderError(e);
  }
}

app.addEventListener('click', (e) => {
  const fb = e.target.closest('[data-fb]');
  if (fb) {
    e.preventDefault();
    submitFeedback(fb.dataset.fb, null);
    return;
  }
  const rate = e.target.closest('[data-rate]');
  if (rate) {
    e.preventDefault();
    submitFeedback('rate', Number(rate.dataset.rate));
    return;
  }
  const font = e.target.closest('[data-font]');
  if (font) {
    e.preventDefault();
    changeFont(Number(font.dataset.font));
    return;
  }
  const cat = e.target.closest('[data-filter-cat]');
  if (cat) {
    e.preventDefault();
    selectArchiveFilter('category', cat.dataset.filterCat);
    return;
  }
  const fbFilter = e.target.closest('[data-filter-fb]');
  if (fbFilter) {
    e.preventDefault();
    selectArchiveFilter('feedback', fbFilter.dataset.filterFb);
    return;
  }
  const page = e.target.closest('[data-page]');
  if (page && !page.disabled) {
    e.preventDefault();
    loadArchive(Number(page.dataset.page));
    return;
  }
  const fcStatus = e.target.closest('[data-fc-status]');
  if (fcStatus) {
    e.preventDefault();
    state.factcheck.status = fcStatus.dataset.fcStatus;
    document.querySelectorAll('[data-fc-status]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.fcStatus === state.factcheck.status);
    });
    loadFactcheck(1);
    return;
  }
  const fcPage = e.target.closest('[data-fc-page]');
  if (fcPage && !fcPage.disabled) {
    e.preventDefault();
    loadFactcheck(Number(fcPage.dataset.fcPage));
  }
});

app.addEventListener('pointerover', (e) => {
  const star = e.target.closest('[data-rate]');
  if (!star) return;
  const n = Number(star.dataset.rate);
  document.querySelectorAll('[data-rate]').forEach((el) => {
    el.classList.toggle('is-hover', Number(el.dataset.rate) <= n);
  });
});

app.addEventListener('pointerout', (e) => {
  if (!e.target.closest('.stars')) return;
  document.querySelectorAll('[data-rate]').forEach((el) => el.classList.remove('is-hover'));
});

document.addEventListener('keydown', (e) => {
  if (state.route.name !== 'read') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'Escape') { location.hash = '#/today'; return; }
  if (e.key === 'n' && state.article?.next) { location.hash = `#/read/${encodeURIComponent(state.article.next.id)}`; return; }
  if (/^[1-5]$/.test(e.key)) { submitFeedback('rate', Number(e.key)); }
  if (e.key === 'k') submitFeedback('known', null);
  if (e.key === 'd') submitFeedback('dislike', null);
});

window.addEventListener('hashchange', route);
window.addEventListener('scroll', updateReadingProgress, { passive: true });

async function boot() {
  applyFont();
  if (!location.hash) history.replaceState(null, '', '#/today');
  try {
    const b = await api('/api/bootstrap');
    state.bootstrap = b;
    state.today = b;
    state.todayAt = Date.now();
    updateChrome(b);
  } catch {
    // 首页请求会再次尝试，并把错误显示出来。
  }
  await route();
}

boot();
