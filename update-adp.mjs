#!/usr/bin/env node
// Refresh the Perfect Season player pool from ESPN's live PPR ADP.
//
//   node update-adp.mjs                          fetch from ESPN and rewrite index.html
//   node update-adp.mjs --file espn.json         use a saved kona_player_info response
//   node update-adp.mjs --file espn.json --byes sched.json
//                                                also use a saved proTeamSchedules_wl response
//
// Requires Node 18+ (built-in fetch). No dependencies.
//
// What it does: pulls ESPN's averageDraftPosition for every player, keeps the
// top 24 QB / 36 RB / 40 WR / 16 TE, sorts them by ADP, and regenerates the
// RAW array between the ADP:BEGIN / ADP:END markers in index.html with real
// bye weeks. If the data changed it bumps SHARE_VERSION, which intentionally
// expires previously shared links (they fall back to the home screen rather
// than replaying against a different player pool).

import { readFileSync, writeFileSync } from "node:fs";

const SEASON = 2026;
const BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leaguedefaults/3`;
const QUOTAS = { QB: 24, RB: 36, WR: 40, TE: 16 };
const POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE" };
const TEAM = {
  1:"ATL", 2:"BUF", 3:"CHI", 4:"CIN", 5:"CLE", 6:"DAL", 7:"DEN", 8:"DET",
  9:"GB", 10:"TEN", 11:"IND", 12:"KC", 13:"LV", 14:"LAR", 15:"MIA", 16:"MIN",
  17:"NE", 18:"NO", 19:"NYG", 20:"NYJ", 21:"PHI", 22:"ARI", 23:"PIT", 24:"LAC",
  25:"SF", 26:"SEA", 27:"TB", 28:"WAS", 29:"CAR", 30:"JAX", 33:"BAL", 34:"HOU",
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function loadPlayers() {
  const file = arg("--file");
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const filter = JSON.stringify({
    players: {
      limit: 500,
      sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" },
    },
  });
  try {
    return await fetchJson(`${BASE}?view=kona_player_info`, {
      "X-Fantasy-Filter": filter,
      Accept: "application/json",
    });
  } catch (e) {
    console.warn(`filtered request failed (${e.message}), retrying without filter`);
    return fetchJson(`${BASE}?view=kona_player_info`, { Accept: "application/json" });
  }
}

async function loadByes() {
  const file = arg("--byes");
  try {
    const data = file
      ? JSON.parse(readFileSync(file, "utf8"))
      : await fetchJson(`${BASE}?view=proTeamSchedules_wl`, { Accept: "application/json" });
    const map = {};
    for (const t of data?.settings?.proTeams ?? []) {
      if (t.abbrev && t.byeWeek >= 1 && t.byeWeek <= 18)
        map[t.abbrev.toUpperCase()] = t.byeWeek;
    }
    return map;
  } catch (e) {
    console.warn(`bye weeks unavailable (${e.message}); keeping formula byes`);
    return {};
  }
}

function normalize(raw) {
  const rows = raw?.players ?? raw ?? [];
  const out = [];
  for (const row of rows) {
    const p = row.player ?? row;
    const pos = POS[p.defaultPositionId];
    const team = TEAM[p.proTeamId];
    const adp = p.ownership?.averageDraftPosition;
    if (!pos || !team || !p.fullName) continue;
    if (!(adp > 0) || adp >= 500) continue; // undrafted placeholder values
    out.push({ name: p.fullName, team, pos, adp });
  }
  out.sort((a, b) => a.adp - b.adp);
  return out;
}

function selectPool(players) {
  const left = { ...QUOTAS };
  const pool = [];
  for (const p of players) {
    if (left[p.pos] > 0) {
      left[p.pos]--;
      pool.push(p);
    }
    if (pool.length === 116) break;
  }
  const missing = Object.entries(left).filter(([, n]) => n > 0);
  if (missing.length)
    throw new Error(
      "ESPN data too thin, still need: " +
        missing.map(([pos, n]) => `${n} ${pos}`).join(", ")
    );
  return pool;
}

function renderRaw(pool, byes, sourceNote) {
  const lines = [];
  for (let i = 0; i < pool.length; i += 3) {
    const chunk = pool.slice(i, i + 3).map((p) => {
      const bye = byes[p.team];
      const parts = [JSON.stringify(p.name), JSON.stringify(p.team), JSON.stringify(p.pos)];
      if (bye) parts.push(bye);
      return `[${parts.join(",")}]`;
    });
    lines.push("  " + chunk.join(","));
  }
  return (
    `/* ADP:BEGIN source: ${sourceNote} */\n` +
    `var RAW = [\n` + lines.join(",\n") + `\n];\n` +
    `/* ADP:END */`
  );
}

const players = normalize(await loadPlayers());
if (players.length < 116)
  throw new Error(`only ${players.length} draftable players in feed`);
const byes = await loadByes();
const pool = selectPool(players);

const htmlPath = new URL("./index.html", import.meta.url).pathname;
const html = readFileSync(htmlPath, "utf8");
const blockRe = /\/\* ADP:BEGIN[^*]*\*\/[\s\S]*?\/\* ADP:END \*\//;
if (!blockRe.test(html)) throw new Error("ADP markers not found in index.html");

const stamp = arg("--file")
  ? `ESPN PPR ADP (from file, applied ${new Date().toISOString().slice(0, 10)})`
  : `ESPN PPR ADP, fetched ${new Date().toISOString().slice(0, 10)}`;
const newBlock = renderRaw(pool, byes, stamp);

const oldBlock = html.match(blockRe)[0];
const stripStamp = (s) => s.replace(/\/\* ADP:BEGIN[^*]*\*\//, "");
if (stripStamp(oldBlock) === stripStamp(newBlock)) {
  console.log("Player pool unchanged. Nothing to do.");
  process.exit(0);
}

let out = html.replace(blockRe, newBlock);
const verRe = /var SHARE_VERSION = (\d+); \/\* SHARE_VERSION_MARKER/;
const ver = Number(out.match(verRe)[1]);
const nextVer = ver >= 15 ? 3 : ver + 1;
out = out.replace(verRe, `var SHARE_VERSION = ${nextVer}; /* SHARE_VERSION_MARKER`);
writeFileSync(htmlPath, out);

console.log(`Wrote 116 players (24 QB / 36 RB / 40 WR / 16 TE) to index.html`);
console.log(`Byes applied for ${Object.keys(byes).length} teams`);
console.log(`SHARE_VERSION ${ver} -> ${nextVer}. Previously shared links now expire to the home screen.`);
console.log("\nTop of the board:");
pool.slice(0, 12).forEach((p, i) =>
  console.log(`  ${String(i + 1).padStart(2)}. ${p.name} (${p.team} ${p.pos}) ADP ${p.adp.toFixed(1)}`)
);
console.log("\nReview the diff, then: git add -A && git commit -m 'refresh ADP' && git push");
