/**
 * main.js
 * Loads tips + pre-fetched results, calculates scores, renders leaderboard.
 */

import { loadResults } from './api.js';
import { calcAllScores } from './scoring.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MONTH_NUM   = { juni: 5, juli: 6 };   // 0-indexed for Date()
const MONTH_ORDER = { juni: 6, juli: 7 };   // for sort key

let tipsData      = null;
let teamNames     = null;
let playerAliases = {};
let currentScores = [];
let sortField    = 'totalt';
let sortDir      = 1;    // 1 = desc (b-a), -1 = asc (a-b)
let firstLoad    = true;

// ── Static data ─────────────────────────────────────────────

async function loadStaticData() {
  const [tipsRes, namesRes, aliasRes] = await Promise.all([
    fetch('./data/tips.json'),
    fetch('./data/team-names.json'),
    fetch('./data/player-aliases.json'),
  ]);
  tipsData      = await tipsRes.json();
  teamNames     = await namesRes.json();
  playerAliases = await aliasRes.json();
}

// ── Utilities ────────────────────────────────────────────────

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'status error' : 'status';
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Live banner ──────────────────────────────────────────────

function renderLiveBanner(liveMatches) {
  let banner = document.getElementById('live-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'live-banner';
    document.querySelector('.table-wrap').before(banner);
  }
  if (!liveMatches || liveMatches.length === 0) {
    banner.className = 'live-banner live-banner--idle';
    banner.innerHTML = `<span class="live-dot live-dot--idle"></span>Inga matcher pågår just nu`;
    return;
  }
  const matchList = liveMatches
    .map(m => `<span class="live-match">${m.home} ${m.score} ${m.away}${m.minute ? ' <em>' + m.minute + '\'</em>' : ''}</span>`)
    .join('');
  banner.className = 'live-banner';
  banner.innerHTML = `<span class="live-dot"></span><strong>LIVE</strong> – Pågående match(er): ${matchList} · Poängen kan fluktuera`;
}

// ── Leaderboard table ────────────────────────────────────────

function getSortedScores() {
  return [...currentScores].sort((a, b) => sortDir * ((b[sortField] ?? 0) - (a[sortField] ?? 0)));
}

function renderTable() {
  const sorted = getSortedScores();
  const tbody  = document.querySelector('#leaderboard tbody');
  tbody.innerHTML = '';

  sorted.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.classList.add('clickable');
    if (i === 0) tr.classList.add('rank-1');
    else if (i === 1) tr.classList.add('rank-2');
    else if (i === 2) tr.classList.add('rank-3');
    tr.innerHTML = `
      <td class="rank">${i + 1}</td>
      <td class="name">${escHtml(row.name)}</td>
      <td class="num bold count-up">${row.totalt}</td>
      <td class="num hide-mobile count-up">${row.krysset}</td>
      <td class="num hide-mobile count-up">${row.antalMal}</td>
      <td class="num count-up">${row.malskyttar}</td>
    `;
    tr.addEventListener('click', () => openDetailModal(row));
    tbody.appendChild(tr);
  });

  // Update sort arrow indicators
  document.querySelectorAll('#leaderboard thead th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortField) {
      th.classList.add(sortDir === 1 ? 'sort-desc' : 'sort-asc');
    }
  });
}

function initSortHandlers() {
  document.querySelectorAll('#leaderboard thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) {
        sortDir *= -1;
      } else {
        sortField = field;
        sortDir   = 1;   // start descending on new column
      }
      renderTable();
    });
  });
}

// ── Count-up animation ────────────────────────────────────────

function animateCountUp() {
  const cells = document.querySelectorAll('#leaderboard .count-up');
  const DURATION = 700;
  const start = performance.now();
  const targets = Array.from(cells).map(c => parseInt(c.textContent, 10) || 0);

  function step(now) {
    const t = Math.min((now - start) / DURATION, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    cells.forEach((c, i) => { c.textContent = Math.round(ease * targets[i]); });
    if (t < 1) requestAnimationFrame(step);
    else cells.forEach((c, i) => { c.textContent = targets[i]; });
  }
  requestAnimationFrame(step);
}

// ── Upcoming matches ─────────────────────────────────────────

function parseMatchDate(label) {
  const m = label.match(/^(\d+)\s+(\w+),\s+([\d.]+)/);
  if (!m) return null;
  const parts = m[3].split('.').map(Number);
  return new Date(2026, MONTH_NUM[m[2]] ?? 5, parseInt(m[1], 10), parts[0], parts[1] ?? 0);
}

function parseMatchTeams(label) {
  const m = label.match(/[\d.]+ \w+, [\d.]+\s+(.+?)\s*-\s*(.+?)\s*\(([A-L])\)/);
  return m ? { home: m[1].trim(), away: m[2].trim(), group: m[3] } : null;
}

function renderUpcoming() {
  const container = document.getElementById('upcoming');
  if (!container || !tipsData?.matchList) return;

  const now = new Date();
  const upcoming = tipsData.matchList
    .map(label => ({ date: parseMatchDate(label), teams: parseMatchTeams(label) }))
    .filter(m => m.date && m.date > now && m.teams)
    .sort((a, b) => a.date - b.date)
    .slice(0, 5);

  if (upcoming.length === 0) {
    container.innerHTML = '';
    return;
  }

  const MO = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  const items = upcoming.map(m => {
    const time = m.date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    return `<div class="upcoming-match">
      <span class="upcoming-date">${m.date.getDate()} ${MO[m.date.getMonth()]} ${time}</span>
      <span class="upcoming-teams">${escHtml(m.teams.home)} – ${escHtml(m.teams.away)}</span>
      <span class="upcoming-group">Grupp ${m.teams.group}</span>
    </div>`;
  }).join('');

  container.innerHTML = `<h3 class="upcoming-title">Kommande matcher</h3><div class="upcoming-list">${items}</div>`;
}

// ── Detail modal ─────────────────────────────────────────────

function openDetailModal(scoreRow) {
  const modal = document.getElementById('detail-modal');
  document.getElementById('modal-title').textContent = `⚽ ${scoreRow.name}`;
  document.getElementById('modal-body').innerHTML   = buildModalBody(scoreRow);
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const params = new URLSearchParams(window.location.search);
  params.set('player', scoreRow.sheetName);
  history.pushState({}, '', `?${params}`);
}

function closeDetailModal() {
  const modal = document.getElementById('detail-modal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  const params = new URLSearchParams(window.location.search);
  params.delete('player');
  const qs = params.toString();
  history.pushState({}, '', qs ? `?${qs}` : window.location.pathname);
}

function buildModalBody(row) {
  const { breakdown } = row;
  return [
    buildGroupSection(breakdown.groupMatches),
    buildKnockoutSection(breakdown.knockout),
    buildGoalscorerSection(breakdown.goalscorers),
    buildStatsSection(row),
  ].join('');
}

// ── Group matches section ─────────────────────────────────────

function matchSortKey(label) {
  const m = label.match(/^(\d+)\s+(\w+),\s+([\d.]+)/);
  if (!m) return 0;
  return (MONTH_ORDER[m[2]] ?? 0) * 10000 + parseInt(m[1], 10) * 100 + parseFloat(m[3]);
}

function parseMatchDisplay(label) {
  const m = label.match(/^(\d+)\s+(\w+),\s+([\d.]+)\s+(.+?)\s*-\s*(.+?)\s*\([A-L]\)/);
  if (!m) return { dateStr: label, matchStr: '' };
  return {
    dateStr:  `${m[1]} ${m[2]} ${m[3].replace('.', ':')}`,
    matchStr: `${m[4].trim()} – ${m[5].trim()}`,
  };
}

function buildGroupSection(matches) {
  if (!matches || matches.length === 0) return '';

  const played = matches
    .filter(m => m.actualResult != null)
    .sort((a, b) => matchSortKey(a.match) - matchSortKey(b.match));
  if (played.length === 0) return '';

  const rows = played.map(m => {
    const tipOk   = m.tip && m.tip === m.actualResult;
    const goalOk  = m.goalsTipped !== null && m.actualGoals !== null && m.goalsTipped === m.actualGoals;
    const totalPts = m.pts1x2 + m.ptsGoals;
    const { dateStr, matchStr } = parseMatchDisplay(m.match);
    return `<tr>
      <td>
        <div class="match-name">${escHtml(matchStr)}</div>
        <div class="match-date">${escHtml(dateStr)}</div>
      </td>
      <td class="${tipOk ? 'correct' : 'wrong'}">${m.tip ?? '–'} ${tipOk ? '✓' : ''}</td>
      <td class="muted">${m.actualResult}</td>
      <td class="${goalOk ? 'correct' : 'wrong'}">${m.goalsTipped ?? '–'} ${goalOk ? '✓' : ''}</td>
      <td class="muted">${m.actualGoals}</td>
      <td class="${totalPts > 0 ? 'pts' : 'pts-zero'}">${totalPts > 0 ? '+' + totalPts : '–'}</td>
    </tr>`;
  }).join('');

  const total = played.reduce((s, m) => s + m.pts1x2 + m.ptsGoals, 0);
  return `<div class="modal-section">
    <h3>Gruppspel — krysset &amp; antal mål</h3>
    <table class="modal-table">
      <thead><tr>
        <th>Match</th><th>Tips</th><th>Utfall</th>
        <th>Mål tips</th><th>Mål utfall</th><th class="right">Poäng</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="5" class="tfoot-label">Totalt</td>
        <td class="pts tfoot-pts">+${total}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

// ── Knockout section ──────────────────────────────────────────

const ROUND_LABELS = {
  sexton:     'Sextondelsfinal',
  atton:      'Åttondelsfinal',
  kvarts:     'Kvartsfinal',
  semi:       'Semifinal',
  finalTeams: 'Finalist',
};

function buildKnockoutSection(ko) {
  if (!ko) return '';
  const hasData = ['sexton','atton','kvarts','semi','finalTeams'].some(k => (ko[k]?.length ?? 0) > 0)
    || ko.winner?.tip || ko.thirdPlace?.tip;
  if (!hasData) return '';

  let rows = '';
  let total = 0;

  for (const [key, label] of Object.entries(ROUND_LABELS)) {
    for (const t of ko[key] ?? []) {
      const dupBadge = t.duplicate ? ' <span class="badge-dup">Dubblett</span>' : '';
      rows += `<tr>
        <td class="muted" style="font-size:0.8rem">${label}</td>
        <td class="${t.correct ? 'correct' : t.duplicate ? 'wrong' : 'wrong'}">${escHtml(t.team)}${dupBadge} ${t.correct ? '✓' : ''}</td>
        <td class="${t.pts > 0 ? 'pts' : 'pts-zero'}">${t.pts > 0 ? '+' + t.pts : '–'}</td>
      </tr>`;
      total += t.pts;
    }
  }

  for (const [entry, label, maxPts] of [
    [ko.winner, 'Slutsegrare (16p)', 16],
    [ko.thirdPlace, 'Tredjeplats (4p)', 4],
  ]) {
    if (!entry?.tip) continue;
    rows += `<tr>
      <td class="muted" style="font-size:0.8rem">${label}</td>
      <td class="${entry.correct ? 'correct' : 'wrong'}">${escHtml(entry.tip)} ${entry.correct ? '✓' : ''}</td>
      <td class="${entry.pts > 0 ? 'pts' : 'pts-zero'}">${entry.pts > 0 ? '+' + entry.pts : '–'}</td>
    </tr>`;
    total += entry.pts;
  }

  return `<div class="modal-section">
    <h3>Slutspel</h3>
    <table class="modal-table">
      <thead><tr><th>Runda</th><th>Lag</th><th class="right">Poäng</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2" class="tfoot-label">Totalt</td>
        <td class="pts tfoot-pts">+${total}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

// ── Goalscorer section ────────────────────────────────────────

function buildGoalscorerSection(scorers) {
  if (!scorers || scorers.length === 0) return '';

  const rows = scorers.map(s => `<tr>
    <td class="${s.pts > 0 ? 'correct' : s.goals > 0 ? 'muted' : 'wrong'}">${escHtml(s.name)} ${s.pts > 0 ? '✓' : ''}</td>
    <td class="right muted">${s.listed}</td>
    <td class="right muted">${s.goals}</td>
    <td class="${s.pts > 0 ? 'pts' : 'pts-zero'}">${s.pts > 0 ? '+' + s.pts : '–'}</td>
  </tr>`).join('');

  const total = scorers.reduce((s, p) => s + p.pts, 0);
  return `<div class="modal-section">
    <h3>Målskyttar</h3>
    <table class="modal-table">
      <thead><tr>
        <th>Spelare</th>
        <th class="right">Tippade</th>
        <th class="right">Mål</th>
        <th class="right">Poäng</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="3" class="tfoot-label">Totalt</td>
        <td class="pts tfoot-pts">+${total}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

// ── Stats section ─────────────────────────────────────────────

function buildStatsSection(row) {
  const played = row.breakdown.groupMatches.filter(m => m.actualResult != null);
  if (played.length === 0) return '';

  const tipped1x2   = played.filter(m => m.tip).length;
  const correct1x2  = played.filter(m => m.pts1x2 > 0).length;
  const tippedGoals = played.filter(m => m.goalsTipped != null).length;
  const correctGoals = played.filter(m => m.ptsGoals > 0).length;
  const pct1x2   = tipped1x2   > 0 ? Math.round(100 * correct1x2   / tipped1x2)   : 0;
  const pctGoals = tippedGoals > 0 ? Math.round(100 * correctGoals / tippedGoals) : 0;

  const bestMatch = played
    .map(m => ({ ...parseMatchDisplay(m.match), pts: m.pts1x2 + m.ptsGoals }))
    .sort((a, b) => b.pts - a.pts)[0];

  const bestScorer = [...row.breakdown.goalscorers]
    .filter(s => s.pts > 0)
    .sort((a, b) => b.pts - a.pts)[0];

  return `<div class="modal-section">
    <h3>Statistik</h3>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${pct1x2}%</div>
        <div class="stat-label">Rätt 1/X/2<br><span class="stat-sub">${correct1x2} av ${tipped1x2} matcher</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${pctGoals}%</div>
        <div class="stat-label">Rätt antal mål<br><span class="stat-sub">${correctGoals} av ${tippedGoals} matcher</span></div>
      </div>
      ${bestMatch?.pts > 0 ? `<div class="stat-card">
        <div class="stat-value">+${bestMatch.pts}p</div>
        <div class="stat-label">Bästa match<br><span class="stat-sub">${escHtml(bestMatch.matchStr)}</span></div>
      </div>` : ''}
      ${bestScorer ? `<div class="stat-card">
        <div class="stat-value">+${bestScorer.pts}p</div>
        <div class="stat-label">Bästa målskytt<br><span class="stat-sub">${escHtml(bestScorer.name)}</span></div>
      </div>` : ''}
    </div>
  </div>`;
}

// ── Refresh & init ────────────────────────────────────────────

async function refresh() {
  setStatus('Laddar resultat…');
  try {
    const { matchResults, roundTeams, goalscorers, liveMatches, updatedAt } = await loadResults(
      tipsData.matchList, teamNames
    );
    currentScores = calcAllScores(
      tipsData.participants, matchResults, roundTeams, goalscorers, teamNames, playerAliases
    );
    renderTable();
    renderUpcoming();
    renderLiveBanner(liveMatches);
    setStatus('');
    if (updatedAt) {
      const d = new Date(updatedAt);
      document.getElementById('last-updated').textContent =
        'Uppdaterad: ' + d.toLocaleString('sv-SE');
    } else {
      document.getElementById('last-updated').textContent = '';
    }
    if (firstLoad) {
      firstLoad = false;
      animateCountUp();
      const player = new URLSearchParams(window.location.search).get('player');
      if (player) {
        const scoreRow = currentScores.find(s => s.sheetName === player);
        if (scoreRow) openDetailModal(scoreRow);
      }
    }
  } catch (err) {
    console.error(err);
    setStatus('Fel: ' + err.message, true);
  }
}

async function init() {
  initSortHandlers();

  document.getElementById('modal-close').addEventListener('click', closeDetailModal);
  document.getElementById('detail-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetailModal();
  });

  try {
    await loadStaticData();
  } catch (err) {
    setStatus('Kunde inte ladda tipsdata: ' + err.message, true);
    return;
  }
  await refresh();
  setInterval(refresh, REFRESH_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', init);

