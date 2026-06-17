# VM Tips 2026 – Live Poängtavla

En statisk webbsida som visar deltagarnas live-poäng för VM 2026 tipset.

## Snabbstart

### 1. Hämta API-nyckel
Registrera dig gratis på [football-data.org](https://www.football-data.org/client/register).
Du får din API-nyckel direkt via e-post.

### 2. Ange API-nyckeln
Öppna `src/config.js` och ersätt `YOUR_API_KEY_HERE` med din nyckel:
```js
export const API_KEY = 'abc123...';
```

### 3. Om Excelfilen uppdateras
Kör parsern för att uppdatera `data/tips.json`:
```bash
npm run parse
```

### 4. Deploya till GitHub Pages
1. Skapa ett nytt repo på GitHub (t.ex. `vm-tips-2026`)
2. Pusha koden:
   ```bash
   git remote add origin https://github.com/<ditt-användarnamn>/vm-tips-2026.git
   git branch -M main
   git push -u origin main
   ```
3. Gå till **Settings → Pages** och välj `main` branch som källa
4. Sidan är live på `https://<ditt-användarnamn>.github.io/vm-tips-2026`

---

## Poängsystem

| Kategori | Poäng |
|---|---|
| Rätt 1/X/2 (≤25% av deltagarna hade rätt) | 3p |
| Rätt 1/X/2 (26–50% hade rätt) | 2p |
| Rätt 1/X/2 (>50% hade rätt) | 1p |
| Rätt totalt antal mål i matchen | 1p |
| Rätt lag i sextondelsfinal | 1p/lag |
| Rätt lag i åttondelsfinal | 2p/lag |
| Rätt lag i kvartsfinal | 3p/lag |
| Rätt lag i semifinal | 5p/lag |
| Rätt finalist | 8p/lag |
| Rätt slutsegrare | 16p |
| Rätt tredjepristagare | 4p |
| Målskytt gör 1:a mål | 1p |
| Målskytt gör 2:a mål (om tippat 2× eller mer) | +2p |
| Målskytt gör 3:e mål (om tippat 3× eller mer) | +3p |

## Projektstruktur

```
VmTipsLive/
├── AllaTipsVM26.xlsx        # Original tipskupong
├── data/
│   ├── tips.json            # Genererad av parse-excel.js
│   └── team-names.json      # Namnmappning svenska → engelska
├── scripts/
│   └── parse-excel.js       # Kör med: npm run parse
├── src/
│   ├── config.js            # ← Ange din API-nyckel här
│   ├── api.js               # Hämtar resultat från football-data.org
│   ├── scoring.js           # Beräknar poäng
│   ├── main.js              # Applogik + rendering
│   └── styles.css           # Styling
└── index.html
```

## Anteckningar

- Sidan auto-uppdateras var 5:e minut
- API-svar cachas i `sessionStorage` för att hålla sig inom rate limit (10 req/min)
- Spelarnamn i målskyttartipsen matchas mot API:ets engelska namn – kontrollera vid avvikelser
