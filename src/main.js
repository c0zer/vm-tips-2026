/**
 * main.js
 * Fetches tips + live results, calculates scores, renders leaderboard.
 */

import { fetchMatchResults, fetchRoundTeams, fetchGoalscorers } from './api.js';
import { calcAllScores } from './scoring.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

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

function setLastUpdated() {
  document.getElementById('last-updated').textContent =
    'Uppdaterad: ' + new Date().toLocaleTimeString('sv-SE');
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
  setStatus('Hämtar resultat…');
  try {
    const [matchResults, roundTeams, goalscorers] = await Promise.all([
      fetchMatchResults(tipsData.matchList, teamNames),
      fetchRoundTeams(),
      fetchGoalscorers(),
    ]);

    const scores = calcAllScores(
      tipsData.participants, matchResults, roundTeams, goalscorers, teamNames
    );

    renderTable(scores);
    setStatus('');
    setLastUpdated();
  } catch (err) {
    console.error(err);
    setStatus('Kunde inte hämta live-data: ' + err.message, true);
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
