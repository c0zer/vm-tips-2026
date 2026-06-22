/**
 * main.js
 * Loads tips + pre-fetched results, calculates scores, renders leaderboard.
 */

import { loadResults } from './api.js';
import { calcAllScores } from './scoring.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let tipsData = null;
let teamNames = null;
let currentScores = [];

async function loadStaticData() {
  const [tipsRes, namesRes] = await Promise.all([
    fetch('./data/tips.json'),
    fetch('./data/team-names.json'),
  ]);
  tipsData = await tipsRes.json();
  teamNames = await namesRes.json();
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'status error' : 'status';
}

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

function renderTable(scores) {
  const tbody = document.querySelector('#leaderboard tbody');
  tbody.innerHTML = '';
  scores.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.classList.add('clickable');
    if (i === 0) tr.classList.add('rank-1');
    else if (i === 1) tr.classList.add('rank-2');
    else if (i === 2) tr.classList.add('rank-3');
    tr.innerHTML = `
      <td class="rank">${i + 1}</td>
      <td class="name">${escHtml(row.name)}</td>
      <td class="num bold">${row.totalt}</td>
      <td class="num">${row.krysset}</td>
      <td class="num">${row.antalMal}</td>
      <td class="num">${row.malskyttar}</td>
    `;
    tr.addEventListener('click', () => openDetailModal(row));
    tbody.appendChild(tr);
  });
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Detail modal ────────────────────────────────────────────

function openDetailModal(scoreRow) {
  const modal = document.getElementById('detail-modal');
  document.getElementById('modal-title').textContent = `⚽ ${scoreRow.name}`;
  document.getElementById('modal-body').innerHTML = buildModalBody(scoreRow);
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
  const modal = document.getElementById('detail-modal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function buildModalBody(row) {
  const { breakdown } = row;
  return [
    buildGroupSection(breakdown.groupMatches),
    buildKnockoutSection(breakdown.knockout),
    buildGoalscorerSection(breakdown.goalscorers),
  ].join('');
}

function buildGroupSection(matches) {
  if (!matches || matches.length === 0) return '';

  const played = matches.filter(m => m.actualResult != null);
  if (played.length === 0) return '';

  const rows = played.map(m => {
    const tipOk = m.tip && m.tip === m.actualResult;
    const goalOk = m.goalsTipped !== null && m.actualGoals !== null && m.goalsTipped === m.actualGoals;
    const totalPts = m.pts1x2 + m.ptsGoals;
    const ptsClass = totalPts > 0 ? 'pts' : 'pts-zero';
    const tipClass = tipOk ? 'correct' : 'wrong';
    const goalClass = goalOk ? 'correct' : 'wrong';
    return `<tr>
      <td class="muted" style="font-size:0.8rem">${escHtml(m.match.replace('_', ' – '))}</td>
      <td class="${tipClass}">${m.tip ?? '–'} ${tipOk ? '✓' : ''}</td>
      <td class="muted">${m.actualResult}</td>
      <td class="${goalClass}">${m.goalsTipped ?? '–'} ${goalOk ? '✓' : ''}</td>
      <td class="muted">${m.actualGoals}</td>
      <td class="${ptsClass}">${totalPts > 0 ? '+' + totalPts : '–'}</td>
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
        <td colspan="5" style="padding:0.5rem 0.5rem 0;color:var(--muted);font-size:0.8rem">Totalt</td>
        <td class="pts" style="padding:0.5rem 0.5rem 0">+${total}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

const ROUND_LABELS = {
  sexton:     { label: 'Sexton­delsfinaler',  pts: 1  },
  atton:      { label: 'Åttondels­finaler',   pts: 2  },
  kvarts:     { label: 'Kvarts­finaler',       pts: 3  },
  semi:       { label: 'Semi­finaler',         pts: 5  },
  finalTeams: { label: 'Finalister',           pts: 8  },
};

function buildKnockoutSection(ko) {
  if (!ko) return '';

  const hasAnyData = ['sexton','atton','kvarts','semi','finalTeams'].some(k => (ko[k]?.length ?? 0) > 0)
    || ko.winner?.tip || ko.thirdPlace?.tip;
  if (!hasAnyData) return '';

  let rows = '';
  let total = 0;

  for (const [key, { label, pts }] of Object.entries(ROUND_LABELS)) {
    const teams = ko[key] ?? [];
    if (teams.length === 0) continue;
    for (const t of teams) {
      const cls = t.correct ? 'correct' : 'wrong';
      const ptsClass = t.pts > 0 ? 'pts' : 'pts-zero';
      rows += `<tr>
        <td class="muted" style="font-size:0.8rem">${label}</td>
        <td class="${cls}">${escHtml(t.team)} ${t.correct ? '✓' : ''}</td>
        <td class="${ptsClass}">${t.pts > 0 ? '+' + t.pts : '–'}</td>
      </tr>`;
      total += t.pts;
    }
  }

  if (ko.winner?.tip) {
    const w = ko.winner;
    rows += `<tr>
      <td class="muted" style="font-size:0.8rem">Slutsegrare (16p)</td>
      <td class="${w.correct ? 'correct' : 'wrong'}">${escHtml(w.tip)} ${w.correct ? '✓' : ''}</td>
      <td class="${w.pts > 0 ? 'pts' : 'pts-zero'}">${w.pts > 0 ? '+' + w.pts : '–'}</td>
    </tr>`;
    total += w.pts;
  }

  if (ko.thirdPlace?.tip) {
    const t = ko.thirdPlace;
    rows += `<tr>
      <td class="muted" style="font-size:0.8rem">Tredjeplats (4p)</td>
      <td class="${t.correct ? 'correct' : 'wrong'}">${escHtml(t.tip)} ${t.correct ? '✓' : ''}</td>
      <td class="${t.pts > 0 ? 'pts' : 'pts-zero'}">${t.pts > 0 ? '+' + t.pts : '–'}</td>
    </tr>`;
    total += t.pts;
  }

  return `<div class="modal-section">
    <h3>Slutspel</h3>
    <table class="modal-table">
      <thead><tr><th>Runda</th><th>Lag</th><th class="right">Poäng</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2" style="padding:0.5rem 0.5rem 0;color:var(--muted);font-size:0.8rem">Totalt</td>
        <td class="pts" style="padding:0.5rem 0.5rem 0">+${total}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

function buildGoalscorerSection(scorers) {
  if (!scorers || scorers.length === 0) return '';

  const rows = scorers.map(s => {
    const ptsClass = s.pts > 0 ? 'pts' : 'pts-zero';
    const nameClass = s.pts > 0 ? 'correct' : (s.goals > 0 ? 'muted' : 'wrong');
    return `<tr>
      <td class="${nameClass}">${escHtml(s.name)} ${s.pts > 0 ? '✓' : ''}</td>
      <td class="right muted">${s.listed}</td>
      <td class="right muted">${s.goals}</td>
      <td class="${ptsClass}">${s.pts > 0 ? '+' + s.pts : '–'}</td>
    </tr>`;
  }).join('');

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
        <td colspan="3" style="padding:0.5rem 0.5rem 0;color:var(--muted);font-size:0.8rem">Totalt</td>
        <td class="pts" style="padding:0.5rem 0.5rem 0">+${total}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

// ── Refresh & init ──────────────────────────────────────────

async function refresh() {
  setStatus('Laddar resultat…');
  try {
    const { matchResults, roundTeams, goalscorers, liveMatches, updatedAt } = await loadResults(
      tipsData.matchList, teamNames
    );
    currentScores = calcAllScores(
      tipsData.participants, matchResults, roundTeams, goalscorers, teamNames
    );
    renderTable(currentScores);
    renderLiveBanner(liveMatches);
    setStatus('');
    if (updatedAt) {
      const d = new Date(updatedAt);
      document.getElementById('last-updated').textContent =
        'Uppdaterad: ' + d.toLocaleString('sv-SE');
    } else {
      document.getElementById('last-updated').textContent = '';
    }
  } catch (err) {
    console.error(err);
    setStatus('Fel: ' + err.message, true);
  }
}

async function init() {
  // Modal close handlers
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
