/**
 * api.js
 * Fetches FIFA World Cup 2026 results from football-data.org API.
 *
 * Free API key registration: https://www.football-data.org/client/register
 * After registering, set your API key in config.js:
 *   export const API_KEY = 'your_key_here';
 *
 * Rate limit: 10 req/min on free tier. We cache responses in sessionStorage.
 */

import { API_KEY } from './config.js';

const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';   // FIFA World Cup
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes

async function apiFetch(path) {
  const cacheKey = `vmtips_${path}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    const { data, ts } = JSON.parse(cached);
    if (Date.now() - ts < CACHE_TTL_MS) return data;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY },
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  const data = await res.json();
  sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
  return data;
}

/**
 * Parse a match label from tips.json to extract home/away team (Swedish).
 * Format: "11 juni, 21.00 Mexiko - Sydafrika (A)"
 */
function parseMatchLabel(label) {
  const m = label.match(/[\d.]+ \w+, [\d.]+\s+(.+?)\s*-\s*(.+?)\s*\(([A-L])\)/);
  if (!m) return null;
  return { home: m[1].trim(), away: m[2].trim(), group: m[3] };
}

/**
 * Derive 1/X/2 result from scores.
 * Returns null if match not yet finished.
 */
function deriveResult(homeScore, awayScore, status) {
  if (!['FINISHED', 'IN_PLAY', 'PAUSED'].includes(status)) return null;
  if (homeScore > awayScore) return '1';
  if (homeScore === awayScore) return 'X';
  return '2';
}

/**
 * Fetch all match results for the World Cup.
 * Returns { matchName: { result: "1"|"X"|"2", goals: N } }
 * matchName is the Swedish-format label from tips.json.
 *
 * @param {Array}  matchList  - ordered list of match labels from tips.json
 * @param {Object} teamNames  - { "Mexiko": "Mexico", ... }
 */
export async function fetchMatchResults(matchList, teamNames) {
  // Build reverse lookup: English name → Swedish name
  const enToSv = {};
  for (const [sv, en] of Object.entries(teamNames)) {
    enToSv[en] = sv;
    enToSv[en.toLowerCase()] = sv;
  }

  // Build lookup key: "HomeSwedish_AwaySwedish" → matchLabel
  const tipLookup = {};
  for (const label of matchList) {
    const parsed = parseMatchLabel(label);
    if (parsed) {
      tipLookup[`${parsed.home}_${parsed.away}`] = label;
    }
  }

  const data = await apiFetch(`/competitions/${COMPETITION}/matches`);
  const results = {};

  for (const match of data.matches ?? []) {
    const homeEN = match.homeTeam?.shortName ?? match.homeTeam?.name ?? '';
    const awayEN = match.awayTeam?.shortName ?? match.awayTeam?.name ?? '';

    // Try to find matching Swedish label
    const homeSv = enToSv[homeEN] ?? enToSv[homeEN.toLowerCase()];
    const awaySv = enToSv[awayEN] ?? enToSv[awayEN.toLowerCase()];
    if (!homeSv || !awaySv) continue;

    const label = tipLookup[`${homeSv}_${awaySv}`];
    if (!label) continue;

    const score = match.score?.fullTime ?? match.score?.regularTime ?? {};
    const homeScore = score.home ?? score.homeTeam;
    const awayScore = score.away ?? score.awayTeam;
    const result = deriveResult(homeScore, awayScore, match.status);
    if (result !== null) {
      results[label] = {
        result,
        goals: (homeScore ?? 0) + (awayScore ?? 0),
      };
    }
  }

  return results;
}

/**
 * Fetch teams that have reached each knockout round.
 * Returns { sexton, atton, kvarts, semi, final, winner, thirdPlace }
 * All team names in English.
 */
export async function fetchRoundTeams() {
  const data = await apiFetch(`/competitions/${COMPETITION}/matches?stage=LAST_32,LAST_16,QUARTER_FINALS,SEMI_FINALS,THIRD_PLACE,FINAL`);
  const matches = data.matches ?? [];

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
    LAST_32: 'sexton',
    LAST_16: 'atton',
    QUARTER_FINALS: 'kvarts',
    SEMI_FINALS: 'semi',
    FINAL: 'final',
    THIRD_PLACE: null,
  };

  for (const match of matches) {
    const stage = match.stage;
    const key = stageMap[stage];
    const homeEN = match.homeTeam?.shortName ?? match.homeTeam?.name ?? '';
    const awayEN = match.awayTeam?.shortName ?? match.awayTeam?.name ?? '';

    if (key) {
      if (homeEN) roundTeams[key].add(homeEN);
      if (awayEN) roundTeams[key].add(awayEN);
    }

    // Determine winners from finished matches
    if (match.status === 'FINISHED') {
      const score = match.score?.fullTime ?? match.score?.regularTime ?? {};
      const h = score.home ?? score.homeTeam ?? 0;
      const a = score.away ?? score.awayTeam ?? 0;
      const winner = h > a ? homeEN : awayEN;

      if (stage === 'FINAL') roundTeams.winner = winner;
      if (stage === 'THIRD_PLACE') roundTeams.thirdPlace = winner;
    }
  }

  return {
    sexton: [...roundTeams.sexton],
    atton: [...roundTeams.atton],
    kvarts: [...roundTeams.kvarts],
    semi: [...roundTeams.semi],
    final: [...roundTeams.final],
    winner: roundTeams.winner,
    thirdPlace: roundTeams.thirdPlace,
  };
}

/**
 * Fetch tournament top scorers.
 * Returns { "Player Name": goalCount }
 */
export async function fetchGoalscorers() {
  const data = await apiFetch(`/competitions/${COMPETITION}/scorers?limit=100`);
  const result = {};
  for (const entry of data.scorers ?? []) {
    const name = entry.player?.name ?? '';
    const goals = entry.goals ?? 0;
    if (name && goals > 0) result[name] = goals;
  }
  return result;
}
