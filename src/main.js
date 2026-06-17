/**
 * main.js
 * Loads tips + pre-fetched results, calculates scores, renders leaderboard.
 */

import { loadResults } from './api.js';
import { calcAllScores } from './scoring.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let tipsData = null;
let teamNames = null;

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
    tbody.appendChild(tr);
  });
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function refresh() {
  setStatus('Laddar resultat…');
  try {
    const { matchResults, roundTeams, goalscorers, liveMatches, updatedAt } = await loadResults(
      tipsData.matchList, teamNames
    );
    const scores = calcAllScores(
      tipsData.participants, matchResults, roundTeams, goalscorers, teamNames
    );
    renderTable(scores);
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
