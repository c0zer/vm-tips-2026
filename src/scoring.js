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

/** Strip accents for fuzzy player name matching */
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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
 * Returns { sheetName: { krysset, antalMal, details: [...] } }
 *
 * @param {Array} participants  - from tips.json
 * @param {Object} matchResults - { matchName: { result, goals } }
 */
function calcGroupMatchScores(participants, matchResults) {
  const results = matchResults;

  // For each match, count how many participants tipped the correct result
  const correctCounts = {};
  const totalTipped = {};

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

  const scores = {};
  for (const p of participants) {
    let krysset = 0;
    let antalMal = 0;
    const details = [];

    for (const m of p.groupMatches) {
      const actual = results[m.match];
      if (!actual) continue;

      let pts1x2 = 0;
      let ptsGoals = 0;

      // 1/X/2 scoring
      if (m.tip && m.tip === actual.result) {
        const total = totalTipped[m.match] || 1;
        const pct = correctCounts[m.match] / total;
        if (pct <= 0.25) pts1x2 = 3;
        else if (pct <= 0.5) pts1x2 = 2;
        else pts1x2 = 1;
        krysset += pts1x2;
      }

      // Goals scoring
      if (m.goals !== null && actual.goals !== null && m.goals === actual.goals) {
        ptsGoals = 1;
        antalMal += 1;
      }

      details.push({
        match: m.match,
        tip: m.tip ?? null,
        actualResult: actual.result,
        goalsTipped: m.goals ?? null,
        actualGoals: actual.goals,
        pts1x2,
        ptsGoals,
      });
    }

    scores[p.sheetName] = { krysset, antalMal, details };
  }

  return scores;
}

/**
 * Calculate knockout stage scores for a single participant.
 * Returns { pts, breakdown }
 */
function calcKnockoutScore(participant, roundTeams, teamNames) {
  let pts = 0;

  const { sexton = [], atton = [], kvarts = [], semi = [], final: finalTeams = [], winner = '', thirdPlace = '' } = roundTeams;

  const breakdown = {
    sexton:      [],
    atton:       [],
    kvarts:      [],
    semi:        [],
    finalTeams:  [],
    winner:      { tip: participant.winner ?? '', correct: false, pts: 0 },
    thirdPlace:  { tip: participant.thirdPlace ?? '', correct: false, pts: 0 },
  };

  for (const pred of participant.sexton) {
    const correct = sexton.includes(toEN(pred.team, teamNames));
    if (correct) pts += 1;
    breakdown.sexton.push({ team: pred.team, correct, pts: correct ? 1 : 0 });
  }

  for (const pred of participant.atton) {
    const correct = atton.includes(toEN(pred.team, teamNames));
    if (correct) pts += 2;
    breakdown.atton.push({ team: pred.team, correct, pts: correct ? 2 : 0 });
  }

  for (const pred of participant.kvarts) {
    const correct = kvarts.includes(toEN(pred.team, teamNames));
    if (correct) pts += 3;
    breakdown.kvarts.push({ team: pred.team, correct, pts: correct ? 3 : 0 });
  }

  for (const pred of participant.semi) {
    const correct = semi.includes(toEN(pred.team, teamNames));
    if (correct) pts += 5;
    breakdown.semi.push({ team: pred.team, correct, pts: correct ? 5 : 0 });
  }

  for (const team of participant.finalTeams) {
    const correct = finalTeams.includes(toEN(team, teamNames));
    if (correct) pts += 8;
    breakdown.finalTeams.push({ team, correct, pts: correct ? 8 : 0 });
  }

  if (winner && toEN(participant.winner, teamNames) === winner) {
    pts += 16;
    breakdown.winner = { tip: participant.winner ?? '', correct: true, pts: 16 };
  }

  if (thirdPlace && toEN(participant.thirdPlace, teamNames) === thirdPlace) {
    pts += 4;
    breakdown.thirdPlace = { tip: participant.thirdPlace ?? '', correct: true, pts: 4 };
  }

  return { pts, breakdown };
}

/**
 * Calculate goalscorer points for a participant.
 * Returns { pts, breakdown: [{ name, listed, goals, pts }] }
 */
function calcGoalscorerScore(participant, goalscorers) {
  const appearances = {};
  for (const name of participant.goalscorers) {
    appearances[name] = (appearances[name] || 0) + 1;
  }

  let pts = 0;
  const breakdown = [];

  for (const [playerName, listed] of Object.entries(appearances)) {
    const normalizedTip = stripAccents(playerName).toLowerCase();
    const goals = goalscorers[playerName]
      ?? goalscorers[Object.keys(goalscorers).find(k =>
          k.toLowerCase() === playerName.toLowerCase() ||
          stripAccents(k).toLowerCase() === normalizedTip
        )]
      // Suffix fallback: "Salah" matches "Mohamed Salah"
      ?? goalscorers[Object.keys(goalscorers).find(k => {
          const kNorm = stripAccents(k).toLowerCase();
          return kNorm.endsWith(' ' + normalizedTip) || normalizedTip.endsWith(' ' + kNorm);
        })]
      ?? 0;

    let playerPts = 0;
    if (goals > 0) {
      const credited = Math.min(listed, goals);
      playerPts = triangular(credited);
      pts += playerPts;
    }

    breakdown.push({ name: playerName, listed, goals, pts: playerPts });
  }

  return { pts, breakdown };
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
      const gs = groupScores[p.sheetName] ?? { krysset: 0, antalMal: 0, details: [] };
      const ko = calcKnockoutScore(p, roundTeams, teamNames);
      const scorer = calcGoalscorerScore(p, goalscorers);
      return {
        name: p.name,
        sheetName: p.sheetName,
        krysset: gs.krysset + ko.pts,
        antalMal: gs.antalMal,
        malskyttar: scorer.pts,
        totalt: gs.krysset + ko.pts + gs.antalMal + scorer.pts,
        breakdown: {
          groupMatches: gs.details,
          knockout:     ko.breakdown,
          goalscorers:  scorer.breakdown,
        },
      };
    })
    .sort((a, b) => b.totalt - a.totalt);
}
