# Perfect Season 🏈

A single-file fantasy football game for the 2026 season. Live mock draft: you
get a random slot in a 12-team snake and 11 CPU teams draft around you off
August 2026 PPR ADP. Eight rounds, 96 picks, 116-player pool. Then your team
plays a 17-week season against the rosters those CPU teams actually drafted,
and the final record maps to a team tier, Championship Threat down to Taco.
Share the whole season with a link.

**Everything is one file: `index.html`.** No backend, no database, no accounts,
no build step, no dependencies beyond Google Fonts.

## How shareable links work

When a season finishes, "Copy Shareable Link" packs the entire result into the
URL itself — no server ever stores anything:

- `?s=<16 chars>` — a base64url payload: 4-bit version + 4-bit draft slot +
  8 × 7-bit user pick indexes + a 32-bit RNG seed. Opening the link replays
  the entire draft and season deterministically, so the shared page shows the
  exact same CPU picks, weekly scores, and record. Nothing is stored anywhere.
- `&n=<name>` — optional display name (max 20 chars), kept human-readable so
  the shared page can say "Jerry's Perfect Season."

Anyone opening the link sees a read-only result card (record, tier, week
ticker, season log, roster) and a "Draft Your Own Season" button. A malformed
or corrupted `s` param silently falls back to the normal home screen.

## Run it locally

Open `index.html` in a browser. That's it. (For clipboard access on some
browsers you'll want a local server: `python3 -m http.server` then visit
`http://localhost:8000`.)

## Deploy (free, on Vercel)

One-time setup:

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account.
2. Click **Add New → Project** and import `jerryvix/PerfectSeason`.
3. Leave everything default: Framework Preset **Other**, no build command, no
   output directory. Click **Deploy**.
4. Your game is live at `https://<project-name>.vercel.app`. Share links use
   whatever domain the game is served from, automatically.

**Redeploying after future edits** — this is the whole procedure:

```bash
git add -A
git commit -m "describe your change"
git push
```

Vercel auto-deploys every push to the production branch within ~30 seconds.
No dashboard visit needed.

### Netlify alternative

Same idea: [app.netlify.com](https://app.netlify.com) → **Add new site →
Import an existing project** → pick the repo, no build settings needed. Or
skip git entirely and drag the project folder onto
[app.netlify.com/drop](https://app.netlify.com/drop) (drag-and-drop deploys
need to be re-dragged after each edit; the git route redeploys on `git push`).

## Game notes

- Pool: 24 QB / 36 RB / 40 WR / 16 TE in overall ADP order (August 2026
  12-team PPR consensus).
- Lineup: 1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX. The board only offers picks that
  can still complete a legal lineup.
- Draft skill: every player's projected PPG deviates a fixed amount from his
  ADP price. CPUs draft close to ADP; finding the discounts is your edge.
- Season: 17 weeks against the 11 CPU rosters (round robin plus 6 rematches).
  Each player scores a gaussian around his PPG (sigma 12%), zero on his bye.
  Byes are invented, the real 2026 schedule wasn't out when this was built.
- Calibration: value-hunting drafts average 11-12 wins, ADP-following about
  9, careless drafting about 2. 17-0 is a sub-1% lottery ticket.
- Team tiers by final record: 17-0 Perfect Season, 15+ Championship Threat,
  12+ Contender, 9+ Pretender, 5+ Basement Dweller, else Taco.
