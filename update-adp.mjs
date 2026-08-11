#!/usr/bin/env node
// Refresh the Perfect Season player pool from FantasyPros PPR consensus rankings.
//
//   node update-adp.mjs                      fetch the latest rankings and rewrite index.html
//   node update-adp.mjs --check              report what would change without writing anything
//   node update-adp.mjs --file ecr.csv       use a previously saved copy of the rankings CSV
//   node update-adp.mjs --source espn        use ESPN's own average draft position instead
//   node update-adp.mjs --espn-players p.json --espn-schedule s.json
//                                            use saved copies of the two ESPN responses
//
// Requires Node 18 or newer for the built-in fetch, and has no dependencies.
//
// The rankings come from the DynastyProcess open-data mirror of FantasyPros,
// which publishes a fresh scrape of the PPR redraft cheatsheet every day. Each
// row carries the player's consensus rank, current team, and real bye week, so
// a refresh corrects for trades, releases, and injuries in one pass. The script
// keeps the top 24 quarterbacks, 36 running backs, 40 receivers, and 16 tight
// ends, orders them by consensus rank, and rewrites the player block in
// index.html between the ADP:BEGIN and ADP:END markers.
//
// Whenever the pool changes the script also bumps SHARE_VERSION. That
// intentionally expires every previously shared link, because a link replays a
// draft against the pool it was created from and would otherwise show a roster
// that no longer matches the board.

import { readFileSync, writeFileSync } from "node:fs";

const SOURCE =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv";

// ESPN publishes its own average draft position, which is the literal order
// players came off the board in ESPN drafts rather than an analyst consensus.
// It is the better number if you can reach it, but ESPN blocks a lot of
// networks, so it sits behind --source espn instead of being the default.
const ESPN_SEASON = 2026;
const ESPN_BASE =
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${ESPN_SEASON}/segments/0/leaguedefaults/3`;
const ESPN_POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE" };
const ESPN_TEAM = {
  1:"ATL", 2:"BUF", 3:"CHI", 4:"CIN", 5:"CLE", 6:"DAL", 7:"DEN", 8:"DET",
  9:"GB", 10:"TEN", 11:"IND", 12:"KC", 13:"LV", 14:"LAR", 15:"MIA", 16:"MIN",
  17:"NE", 18:"NO", 19:"NYG", 20:"NYJ", 21:"PHI", 22:"ARI", 23:"PIT", 24:"LAC",
  25:"SF", 26:"SEA", 27:"TB", 28:"WAS", 29:"CAR", 30:"JAX", 33:"BAL", 34:"HOU",
};

// Turn ESPN's player payload and team schedule into the same shape the
// FantasyPros rows arrive in, so the selection logic below does not care
// which source the numbers came from.
export function normalizeEspn(playerPayload, schedulePayload) {
  const byes = {};
  for (const team of schedulePayload?.settings?.proTeams ?? []) {
    if (team.abbrev && team.byeWeek >= 1 && team.byeWeek <= 18) {
      byes[team.abbrev.toUpperCase()] = team.byeWeek;
    }
  }
  const rows = [];
  for (const entry of playerPayload?.players ?? playerPayload ?? []) {
    const p = entry.player ?? entry;
    const pos = ESPN_POS[p.defaultPositionId];
    const team = ESPN_TEAM[p.proTeamId];
    const adp = p.ownership?.averageDraftPosition;
    if (!pos || !team || !p.fullName) continue;
    if (!(adp > 0) || adp >= 500) continue; // ESPN parks undrafted players at a sentinel value
    rows.push({
      page_type: "redraft-overall",
      player: p.fullName,
      pos,
      tm: team,
      bye: String(byes[team] ?? ""),
      ecr: String(adp),
      scrape_date: new Date().toISOString().slice(0, 10),
    });
  }
  return rows;
}
const QUOTAS = { QB: 24, RB: 36, WR: 40, TE: 16 };
const POOL_SIZE = Object.values(QUOTAS).reduce((a, b) => a + b, 0);

// FantasyPros uses a few three-letter codes that differ from the ones the game
// displays, so those get normalized and everything else passes through.
const TEAM_FIXES = {
  GBP: "GB", JAC: "JAX", KCC: "KC", LVR: "LV",
  NEP: "NE", NOS: "NO", SFO: "SF", TBB: "TB",
};

const hasFlag = (name) => process.argv.includes(name);
const argValue = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};

// A small CSV reader that understands quoted fields containing commas.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return res.json();
}

async function loadEspn() {
  const savedPlayers = argValue("--espn-players");
  const savedSchedule = argValue("--espn-schedule");
  if (savedPlayers) {
    return normalizeEspn(
      JSON.parse(readFileSync(savedPlayers, "utf8")),
      savedSchedule ? JSON.parse(readFileSync(savedSchedule, "utf8")) : {}
    );
  }
  const filter = JSON.stringify({
    players: { limit: 500, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" } },
  });
  const players = await fetchJson(`${ESPN_BASE}?view=kona_player_info`, {
    "X-Fantasy-Filter": filter,
    Accept: "application/json",
  });
  const schedule = await fetchJson(`${ESPN_BASE}?view=proTeamSchedules_wl`, {
    Accept: "application/json",
  });
  return normalizeEspn(players, schedule);
}

async function loadRankings() {
  if (argValue("--source") === "espn" || argValue("--espn-players")) return loadEspn();
  const file = argValue("--file");
  if (file) return parseCsv(readFileSync(file, "utf8"));
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`rankings download failed: ${res.status} ${res.statusText}`);
  return parseCsv(await res.text());
}

// Keep only the PPR redraft board, drop free agents and anyone missing a bye
// week, and sort what remains by consensus rank.
function selectPool(rows) {
  const scored = rows
    .filter((r) => r.page_type === "redraft-overall")
    .filter((r) => QUOTAS[r.pos] !== undefined)
    .filter((r) => r.tm && r.tm !== "FA")
    .filter((r) => /^\d+$/.test(r.bye))
    .map((r) => ({
      name: r.player.trim(),
      team: TEAM_FIXES[r.tm] ?? r.tm,
      pos: r.pos,
      bye: Number(r.bye),
      ecr: Number(r.ecr),
    }))
    .filter((p) => Number.isFinite(p.ecr) && p.bye >= 1 && p.bye <= 18)
    .sort((a, b) => a.ecr - b.ecr);

  const remaining = { ...QUOTAS };
  const pool = [];
  for (const player of scored) {
    if (remaining[player.pos] > 0) {
      remaining[player.pos]--;
      pool.push(player);
    }
    if (pool.length === POOL_SIZE) break;
  }

  const short = Object.entries(remaining).filter(([, n]) => n > 0);
  if (short.length) {
    throw new Error(
      "the rankings did not contain enough players, still short " +
        short.map(([pos, n]) => `${n} ${pos}`).join(" and ")
    );
  }
  return pool;
}

function renderBlock(pool, scrapeDate, sourceLabel) {
  const lines = [];
  for (let i = 0; i < pool.length; i += 2) {
    const pair = pool.slice(i, i + 2).map((p) => {
      const ecr = Math.round(p.ecr * 10) / 10;
      return `[${JSON.stringify(p.name)},${JSON.stringify(p.team)},${JSON.stringify(p.pos)},${p.bye},${ecr}]`;
    });
    lines.push("  " + pair.join(","));
  }
  return (
    `/* ADP:BEGIN ${sourceLabel}, scraped ${scrapeDate} */\n` +
    "var RAW = [\n" + lines.join(",\n") + "\n];\n" +
    "/* ADP:END */"
  );
}

const rows = await loadRankings();
const pool = selectPool(rows);
const scrapeDate = rows.find((r) => r.scrape_date)?.scrape_date ?? "unknown date";
const sourceName =
  argValue("--source") === "espn" || argValue("--espn-players")
    ? "ESPN PPR average draft position"
    : "FantasyPros PPR consensus";

const htmlPath = new URL("./index.html", import.meta.url).pathname;
const html = readFileSync(htmlPath, "utf8");
const blockPattern = /\/\* ADP:BEGIN[^*]*\*\/[\s\S]*?\/\* ADP:END \*\//;
if (!blockPattern.test(html)) throw new Error("could not find the ADP markers in index.html");

const newBlock = renderBlock(pool, scrapeDate, sourceName);
const oldBlock = html.match(blockPattern)[0];
const withoutStamp = (s) => s.replace(/\/\* ADP:BEGIN[^*]*\*\//, "");

if (withoutStamp(oldBlock) === withoutStamp(newBlock)) {
  console.log(`The player pool already matches the ${scrapeDate} ${sourceName}, so nothing changed.`);
  process.exit(0);
}

const previousNames = new Set([...oldBlock.matchAll(/\["([^"]+)"/g)].map((m) => m[1]));
const added = pool.filter((p) => !previousNames.has(p.name));
const removed = [...previousNames].filter((n) => !pool.some((p) => p.name === n));

if (hasFlag("--check")) {
  console.log(`A refresh would apply the ${scrapeDate} rankings.`);
  console.log(`${added.length} players would join the pool and ${removed.length} would drop out.`);
  if (added.length) console.log("Joining: " + added.map((p) => p.name).join(", "));
  if (removed.length) console.log("Dropping: " + removed.join(", "));
  process.exit(0);
}

const versionPattern = /var SHARE_VERSION = (\d+); \/\* SHARE_VERSION_MARKER/;
const currentVersion = Number(html.match(versionPattern)[1]);
const nextVersion = currentVersion >= 15 ? 3 : currentVersion + 1;

writeFileSync(
  htmlPath,
  html.replace(blockPattern, newBlock)
      .replace(versionPattern, `var SHARE_VERSION = ${nextVersion}; /* SHARE_VERSION_MARKER`)
);

console.log(`Wrote ${pool.length} players from the ${scrapeDate} ${sourceName}.`);
console.log(`${added.length} players joined the pool and ${removed.length} dropped out.`);
console.log(
  `SHARE_VERSION moved from ${currentVersion} to ${nextVersion}, ` +
  "so links shared before this refresh now open on the home screen instead of replaying."
);
console.log("\nThe top of the new board:");
pool.slice(0, 12).forEach((p, i) => {
  const rank = String(i + 1).padStart(2);
  console.log(`  ${rank}. ${p.name} (${p.team} ${p.pos}) consensus ${p.ecr.toFixed(1)}, bye ${p.bye}`);
});
console.log("\nReview the diff, then commit and push to deploy the new board.");
