/**
 * scoring.js
 * Calculates scores for all participants given actual match results.
 *
 * Results format (from api.js):
 * {
 *   groupMatches: { "match_name": { result: "1"|"X"|"2", goals: 3 }, ... },
 *   roundTeams: {
 *     sexton:    ["Germany", "France", ...],  // 32 qualified teams (English)
 *     atton:     ["Germany", "Brazil", ...],  // 16 teams (English)
 *     kvarts:    [...],  // 8 teams (English)
 *     semi:      [...],  // 4 teams (English)
 *     final:     [...],  // 2 finalists (English)
 *     winner:    "Spain",      // English
 *     thirdPlace: "France"     // English
 *   },
 *   goalscorers: { "Player Name": 3 }   // English name → goals scored
 * }
 * teamNames: { "Mexiko": "Mexico", ... }  Swedish→English mapping
 */

/** Convert Swedish team name to English */
function toEN(swedishName, teamNames) {
  return teamNames[swedishName] ?? swedishName;
}

/** Sum 1+2+...+n */
function triangular(n) {
  return n * (n + 1) / 2;
}

/**
 * Calculate dynamic 1/X/2 points for all participants.
 * Returns { matchName: { points: N, isCorrect: bool } } per participant.
 *
 * @param {Array} participants  - from tips.json
 * @param {Object} matchResults - { matchName: { result, goals } }
 */
function calcGroupMatchScores(participants, matchResults) {
  // Build a map: matchName → { result, goals }
  const results = matchResults;

  // For each match, count how many participants tipped the correct result
  const correctCounts = {}; // matchName → count of correct tips
  const totalTipped = {};   // matchName → count of participants who made a tip

  for (const match of Object.keys(results)) {
    correctCounts[match] = 0;
    totalTipped[match] = 0;
  }

  for (const p of participants) {
    for (const m of p.groupMatches) {
      if (!results[m.match]) continue;
      if (m.tip) totalTipped[m.match] = (totalTipped[m.match] || 0) + 1;
      if (m.tip && m.tip === results[m.match].result) {
        correctCounts[m.match] = (correctCounts[m.match] || 0) + 1;
      }
    }
  }

  // Per participant, calculate points per match
  const scores = {}; // participantName → { krysset, antalMal }
  for (const p of participants) {
    let krysset = 0;
    let antalMal = 0;

    for (const m of p.groupMatches) {
      const actual = results[m.match];
      if (!actual) continue;

      // 1/X/2 scoring
      if (m.tip && m.tip === actual.result) {
        const total = totalTipped[m.match] || 1;
        const pct = correctCounts[m.match] / total;
        if (pct <= 0.25) krysset += 3;
        else if (pct <= 0.5) krysset += 2;
        else krysset += 1;
      }

      // Goals scoring
      if (m.goals !== null && actual.goals !== null && m.goals === actual.goals) {
        antalMal += 1;
      }
    }

    scores[p.sheetName] = { krysset, antalMal };
  }

  return scores;
}

/**
 * Calculate knockout stage scores for a single participant.
 * All team names in roundTeams are in English; participant tips are in Swedish.
 */
function calcKnockoutScore(participant, roundTeams, teamNames) {
  let pts = 0;

  const { sexton = [], atton = [], kvarts = [], semi = [], final: finalTeams = [], winner = '', thirdPlace = '' } = roundTeams;

  // Sexton: 1p per correctly predicted team (32 total)
  for (const pred of participant.sexton) {
    if (sexton.includes(toEN(pred.team, teamNames))) pts += 1;
  }

  // Åtton: 2p per correctly predicted team (16 total)
  for (const pred of participant.atton) {
    if (atton.includes(toEN(pred.team, teamNames))) pts += 2;
  }

  // Kvarts: 3p per correctly predicted team (8 total)
  for (const pred of participant.kvarts) {
    if (kvarts.includes(toEN(pred.team, teamNames))) pts += 3;
  }

  // Semi: 5p per correctly predicted team (4 total)
  for (const pred of participant.semi) {
    if (semi.includes(toEN(pred.team, teamNames))) pts += 5;
  }

  // Finalists: 8p per team (2 total)
  for (const team of participant.finalTeams) {
    if (finalTeams.includes(toEN(team, teamNames))) pts += 8;
  }

  // Winner: 16p
  if (winner && toEN(participant.winner, teamNames) === winner) pts += 16;

  // Third place: 4p
  if (thirdPlace && toEN(participant.thirdPlace, teamNames) === thirdPlace) pts += 4;

  return pts;
}

/**
 * Calculate goalscorer points for a participant.
 * goalscorers: { "Player Name (English)": goalCount }
 * participant.goalscorers: ["Harry Kane", "Harry Kane", "Mbappé", ...]
 * teamNames: Swedish→English mapping (used for any name normalization)
 */
function calcGoalscorerScore(participant, goalscorers) {
  // Count how many times each player is listed (Swedish names kept as-is)
  const appearances = {};
  for (const name of participant.goalscorers) {
    appearances[name] = (appearances[name] || 0) + 1;
  }

  let pts = 0;
  for (const [playerName, listed] of Object.entries(appearances)) {
    // Try English name lookup; also try direct match (some players have same name)
    const goals = goalscorers[playerName] ?? goalscorers[toEN(playerName)] ?? 0;
    if (goals > 0) {
      const credited = Math.min(listed, goals);
      pts += triangular(credited);
    }
  }

  return pts;
}

/**
 * Calculate full scores for all participants.
 *
 * @param {Array}  participants  - from tips.json
 * @param {Object} matchResults  - { matchName: { result, goals } }
 * @param {Object} roundTeams    - { sexton, atton, kvarts, semi, final, winner, thirdPlace }
 * @param {Object} goalscorers   - { playerName: goalCount }
 * @param {Object} teamNames     - { "Mexiko": "Mexico", ... }
 * @returns {Array} sorted leaderboard entries
 */
export function calcAllScores(participants, matchResults, roundTeams, goalscorers, teamNames) {
  const groupScores = calcGroupMatchScores(participants, matchResults);

  return participants
    .map(p => {
      const gs = groupScores[p.sheetName] ?? { krysset: 0, antalMal: 0 };
      const knockout = calcKnockoutScore(p, roundTeams, teamNames);
      const malskyttar = calcGoalscorerScore(p, goalscorers);
      return {
        name: p.name,
        sheetName: p.sheetName,
        krysset: gs.krysset + knockout,
        antalMal: gs.antalMal,
        malskyttar,
        totalt: gs.krysset + knockout + gs.antalMal + malskyttar,
      };
    })
    .sort((a, b) => b.totalt - a.totalt);
}
