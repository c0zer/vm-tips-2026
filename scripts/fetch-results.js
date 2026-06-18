/**
 * fetch-results.js
 * Fetches FIFA World Cup 2026 results from football-data.org (server-side).
 * Run by GitHub Actions on a schedule → writes data/results.json.
 *
 * Usage: node scripts/fetch-results.js
 * Requires env var: FOOTBALL_DATA_API_KEY
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
if (!API_KEY) {
  console.error('Missing FOOTBALL_DATA_API_KEY environment variable');
  process.exit(1);
}

const COMPETITION = 'WC';
const OUT_FILE = path.join(__dirname, '..', 'data', 'results.json');

function apiGet(urlPath, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (attemptsLeft) => {
      const options = {
        hostname: 'api.football-data.org',
        path: urlPath,
        headers: { 'X-Auth-Token': API_KEY },
        timeout: 10000,
      };
      https.get(options, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error(`Parse error: ${e.message}\nBody: ${body.slice(0, 200)}`)); }
        });
      }).on('error', (err) => {
        if (attemptsLeft > 1) {
          console.warn(`  ⚠ ${err.code} on ${urlPath} – retrying (${attemptsLeft - 1} left)...`);
          setTimeout(() => attempt(attemptsLeft - 1), 2000);
        } else {
          reject(err);
        }
      });
    };
    attempt(retries);
  });
}

function deriveResult(homeScore, awayScore, status) {
  if (!['FINISHED', 'IN_PLAY', 'PAUSED'].includes(status)) return null;
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return '1';
  if (homeScore === awayScore) return 'X';
  return '2';
}

async function main() {
  console.log('Fetching group stage matches...');
  const groupData = await apiGet(`/v4/competitions/${COMPETITION}/matches?stage=GROUP_STAGE`);

  // Build groupMatches: { matchKey: { result, goals } }
  // matchKey = "HomeTeamEN_AwayTeamEN" for later lookup by api.js in browser
  const groupMatches = {};
  const liveMatches = [];

  for (const m of groupData.matches ?? []) {
    const homeEN = m.homeTeam?.shortName ?? m.homeTeam?.name ?? '';
    const awayEN = m.awayTeam?.shortName ?? m.awayTeam?.name ?? '';
    const score = m.score?.fullTime ?? m.score?.currentScore ?? {};
    const h = score.home ?? null;
    const a = score.away ?? null;
    const result = deriveResult(h, a, m.status);
    if (result !== null) {
      groupMatches[`${homeEN}_${awayEN}`] = { result, goals: h + a };
    }
    // Only mark as live if status says so AND no fullTime score exists yet
    const hasFullTime = m.score?.fullTime?.home != null;
    if ((m.status === 'IN_PLAY' || m.status === 'PAUSED') && !hasFullTime) {
      liveMatches.push({
        home: homeEN,
        away: awayEN,
        score: `${h ?? 0}–${a ?? 0}`,
        minute: m.minute ?? null,
      });
    }
  }

  // Also check knockout matches for live status
  console.log('Fetching knockout matches...');
  const koData = await apiGet(`/v4/competitions/${COMPETITION}/matches?stage=ROUND_OF_32,ROUND_OF_16,QUARTER_FINALS,SEMI_FINALS,THIRD_PLACE,FINAL`);

  const roundTeams = {
    sexton: new Set(),
    atton: new Set(),
    kvarts: new Set(),
    semi: new Set(),
    final: new Set(),
    winner: '',
    thirdPlace: '',
  };

  const stageMap = {
    ROUND_OF_32: 'sexton',
    ROUND_OF_16: 'atton',
    QUARTER_FINALS: 'kvarts',
    SEMI_FINALS: 'semi',
    FINAL: 'final',
    THIRD_PLACE: null,
  };

  for (const m of koData.matches ?? []) {
    const stage = m.stage;
    const key = stageMap[stage];
    const homeEN = m.homeTeam?.shortName ?? m.homeTeam?.name ?? '';
    const awayEN = m.awayTeam?.shortName ?? m.awayTeam?.name ?? '';
    if (key) {
      if (homeEN) roundTeams[key].add(homeEN);
      if (awayEN) roundTeams[key].add(awayEN);
    }
    if (m.status === 'FINISHED') {
      const score = m.score?.fullTime ?? {};
      const h = score.home ?? 0;
      const a = score.away ?? 0;
      const winner = h > a ? homeEN : awayEN;
      if (stage === 'FINAL') roundTeams.winner = winner;
      if (stage === 'THIRD_PLACE') roundTeams.thirdPlace = winner;
    }
    if (m.status === 'IN_PLAY' || m.status === 'PAUSED') {
      const hasFullTime = m.score?.fullTime?.home != null;
      if (!hasFullTime) {
        const liveScore = m.score?.currentScore ?? m.score?.fullTime ?? {};
        liveMatches.push({
          home: homeEN,
          away: awayEN,
          score: `${liveScore.home ?? 0}–${liveScore.away ?? 0}`,
          minute: m.minute ?? null,
        });
      }
    }
  }
  console.log(`  ${liveMatches.length} live matches`);

  console.log('Fetching scorers...');
  const scorersData = await apiGet(`/v4/competitions/${COMPETITION}/scorers?limit=100`);
  const goalscorers = {};
  for (const entry of scorersData.scorers ?? []) {
    const name = entry.player?.name ?? '';
    const goals = entry.goals ?? 0;
    if (name && goals > 0) goalscorers[name] = goals;
  }
  console.log(`  ${Object.keys(goalscorers).length} scorers found`);

  const results = {
    updatedAt: new Date().toISOString(),
    liveMatches,
    groupMatches,
    roundTeams: {
      sexton: [...roundTeams.sexton],
      atton: [...roundTeams.atton],
      kvarts: [...roundTeams.kvarts],
      semi: [...roundTeams.semi],
      final: [...roundTeams.final],
      winner: roundTeams.winner,
      thirdPlace: roundTeams.thirdPlace,
    },
    goalscorers,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`✓ Wrote ${OUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
