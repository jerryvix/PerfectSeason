# Perfect Season 🏈

A single-file fantasy football game for the 2026 season. Draft an 8-man PPR
roster through eight rounds of tier spins (10 candidates per pick from a
116-player pool ordered by August 2026 12-team PPR ADP consensus), simulate a
17-week season with variance-based scoring, and land on a final record and a
team tier — Championship Threat down to Taco — then share it with a link.

**Everything is one file: `index.html`.** No backend, no database, no accounts,
no build step, no dependencies beyond Google Fonts.

## How shareable links work

When a season finishes, "Copy Shareable Link" packs the entire result into the
URL itself — no server ever stores anything:

- `?s=<14 chars>` — a base64url payload: 4-bit version + 8 × 7-bit player pool
  indexes (in slot order) + 17 × 1-bit win flags. That's the whole season.
- `&n=<name>` — optional display name (max 20 chars), kept human-readable so
  the shared page can say "Jerry's Perfect Season."

Anyone opening the link sees a read-only result card (record, tagline, week
ticker, roster) and a "Draft Your Own Season" button. A malformed or corrupted
`s` param silently falls back to the normal home screen — it never crashes.

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

- Pool: 24 QB / 36 RB / 40 WR / 16 TE, ordered by ADP within position
  (August 2026 12-team PPR consensus).
- Draft order: QB, RB, RB, WR, WR, TE, FLEX, FLEX — each round spins inside a
  tier band that widens automatically if it can't supply 10 undrafted
  candidates.
- Scoring (PPR): each player scores a gaussian around their PPR points per
  game (σ = 28%), zero on their bye week; the opponent scores a gaussian
  around the league-average starting eight. Bye weeks are invented — the real
  2026 schedule wasn't out when this was built.
- Team tiers by final record: 17-0 Perfect Season · 15+ Championship Threat ·
  12+ Contender · 9+ Pretender · 5+ Basement Dweller · else Taco (yes, from
  The League).
