/**
 * parse-excel.js
 * Reads AllaTipsVM26.xlsx and writes data/tips.json
 * Run: node scripts/parse-excel.js
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.join(__dirname, '..', 'AllaTipsVM26.xlsx');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'tips.json');

const wb = XLSX.readFile(EXCEL_FILE);

/** Get cell value (1-based row/col) */
function cv(ws, r, c) {
  const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
  const cell = ws[addr];
  if (!cell) return '';
  return String(cell.v ?? '').trim();
}

/** Determine 1/X/2 tip from three adjacent columns */
function tip(ws, r, c1, cX, c2) {
  if (cv(ws, r, c1)) return '1';
  if (cv(ws, r, cX)) return 'X';
  if (cv(ws, r, c2)) return '2';
  return '';
}

/** Normalize goalscorer name by stripping trailing digit */
function normalizeName(name) {
  return name.replace(/\d+$/, '').trim();
}

function parseParticipantSheet(ws) {
  const result = {
    name: '',
    groupMatches: [],
    sexton: [],    // 32 predictions → 1p each
    atton: [],     // 16 predictions → 2p each
    kvarts: [],    //  8 predictions → 3p each
    semi: [],      //  4 predictions → 5p each (C27/C28 rows 15-18)
    finalTeams: [], // 2 finalists → 8p each (C31 rows 16-17)
    winner: '',    // tournament winner → 16p (R24 C29)
    thirdPlace: '', // 3rd place → 4p (R28 C29)
    goalscorers: [] // raw list of normalized player names (up to 10)
  };

  // Participant name is stored at R31 C11
  result.name = cv(ws, 31, 11);

  // --- Group stage matches (rows 3-26, 3 matches per row) ---
  for (let r = 3; r <= 26; r++) {
    const matches = [
      { namecol: 1,  c1: 2,  cX: 3,  c2: 4,  cG: 5  },
      { namecol: 6,  c1: 7,  cX: 8,  c2: 9,  cG: 10 },
      { namecol: 11, c1: 12, cX: 13, c2: 14, cG: 15 },
    ];
    for (const m of matches) {
      const matchName = cv(ws, r, m.namecol);
      if (matchName && !matchName.startsWith('Tippa') && !matchName.startsWith('Antalet')
          && !matchName.startsWith('poäng') && !matchName.includes('poäng, om')
          && !matchName.startsWith('För varje') && !matchName.startsWith('Namn')) {
        result.groupMatches.push({
          match: matchName,
          tip: tip(ws, r, m.c1, m.cX, m.c2),
          goals: parseInt(cv(ws, r, m.cG)) || null,
        });
      }
    }
  }

  // --- Sexton / Round of 32 (C18=slot, C19=team, rows 1-32) ---
  for (let r = 1; r <= 32; r++) {
    const slot = cv(ws, r, 18);
    const team = cv(ws, r, 19);
    if (slot && team) {
      result.sexton.push({ slot, team });
    }
  }

  // --- Åtton / Round of 16 (C21=sextonRef, C22=team, rows 9-24) ---
  for (let r = 9; r <= 24; r++) {
    const sextonRef = cv(ws, r, 21);
    const team = cv(ws, r, 22);
    if (sextonRef && team) {
      result.atton.push({ sextonRef, team });
    }
  }

  // --- Kvarts / Quarter-finals (C24=attonRef, C25=team, rows 13-20) ---
  for (let r = 13; r <= 20; r++) {
    const attonRef = cv(ws, r, 24);
    const team = cv(ws, r, 25);
    if (attonRef && team) {
      result.kvarts.push({ attonRef, team });
    }
  }

  // --- Semi-finals (C27=kvartsRef, C28=team, rows 15-18) → 4 semi-finalists ---
  for (let r = 15; r <= 18; r++) {
    const kvartsRef = cv(ws, r, 27);
    const team = cv(ws, r, 28);
    if (kvartsRef && team) {
      result.semi.push({ kvartsRef, team });
    }
  }

  // --- Finalists (C31, rows 16-17) → 2 teams in final ---
  for (let r = 16; r <= 17; r++) {
    const team = cv(ws, r, 31);
    if (team) result.finalTeams.push(team);
  }

  // --- Tournament winner (R24, C29) ---
  result.winner = cv(ws, 24, 29);

  // --- Third place (R28, C29) ---
  result.thirdPlace = cv(ws, 28, 29);

  // --- Goalscorers (C27 rows 3-7, C30 rows 3-7) ---
  const rawPlayers = [];
  for (let r = 3; r <= 7; r++) {
    const p1 = cv(ws, r, 27);
    const p2 = cv(ws, r, 30);
    if (p1 && !p1.startsWith('Ange') && !p1.startsWith('Tror')) rawPlayers.push(p1);
    if (p2 && !p2.startsWith('Ange') && !p2.startsWith('Tror')) rawPlayers.push(p2);
  }
  result.goalscorers = rawPlayers.map(normalizeName);

  return result;
}

// Parse all participant sheets
const participants = [];
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  try {
    const data = parseParticipantSheet(ws);
    if (data.name || data.groupMatches.length > 0) {
      // Use sheet name as fallback if cell is empty
      if (!data.name) data.name = sheetName;
      participants.push({ sheetName, ...data });
      console.log(`✓ ${sheetName}: ${data.name}, ${data.groupMatches.length} matches, ${data.goalscorers.length} scorers`);
    }
  } catch (e) {
    console.error(`✗ ${sheetName}: ${e.message}`);
  }
}

// Extract the canonical match list from first sheet (order and names consistent)
const matchList = participants[0].groupMatches.map(m => m.match);

const output = {
  generatedAt: new Date().toISOString(),
  matchList,
  participants,
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nWrote ${participants.length} participants to ${OUTPUT_FILE}`);
