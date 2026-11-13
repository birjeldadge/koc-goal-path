// ==UserScript==
// @name         KoC Goal Path
// @namespace    https://github.com/birjeldadge/koc-goal-path
// @version      2.2
// @description  Shows your current gold goal and XP goal, what each still needs (hits at your average, XP, time), and the path after them. It only reads pages you open yourself. It never loads a page, never clicks, never sends.
// @match        https://www.kingsofchaos.com/*
// @match        https://kingsofchaos.com/*
// @exclude      https://*.kingsofchaos.com/confirm.login.php*
// @exclude      https://*.kingsofchaos.com/security.php*
// @exclude      https://*.kingsofchaos.com/error.php*
// @exclude      https://*.kingsofchaos.com/recruit.php*
// @homepageURL  https://github.com/birjeldadge/koc-goal-path
// @updateURL    https://raw.githubusercontent.com/birjeldadge/koc-goal-path/main/koc-goal-path.user.js
// @downloadURL  https://raw.githubusercontent.com/birjeldadge/koc-goal-path/main/koc-goal-path.user.js
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==

/* HOW THIS FILE WORKS (plain English):
   Tampermonkey runs this every time a Kings of Chaos page loads. It reads
   numbers that are already on the page you opened:

   - every page:      the left box (Gold, Safe, Vault, Experience, Turns),
                      the era day and the server clock
   - Command Center:  your levels (XP a minute, soldiers a minute, economy,
                      tech, siege, covert) and your strike
   - Upgrades, Safe:  the same levels, so a buy shows up straight away
   - Armory:          what your armory cost in total (for the tech line)
   - Conquest:        tries and XP per level. This page attacks without
                      reloading, so the panel watches its numbers change and
                      updates as you go: tries done and what each one paid
   - Attack Log:      your 24 hour average gold per hit (if the KoC
                      Data Centre is installed, its average is used instead so
                      the two boxes always agree)

   It also shows a Vault tax clock (5% at 00:00, 06:00, 12:00 and 18:00 server
   time) and, for every goal, the date you reach it at the hits-a-day you set.

   From those it shows two goals at once, because they are paid from two
   different pots: one bought with GOLD (Vault + Safe + gold on hand) and one
   bought with XP. When a level is reached the goal ticks itself off and the
   next one moves up. The order is worked out from YOUR numbers: the build you
   pick in Settings (Slayer, Balanced or Economy), the stats you tick, your hit
   size, the share of income you keep and the days left in the era.

   Safety: there is no fetch, no form submit and no click on the game anywhere
   in this file. Page names in the panel are ordinary links. It shows only
   your own account's numbers.                                              */

(function () {
  "use strict";

  // ============================ game tables ================================
  // From the in-game User Guide, Era 24.
  // ======================= ERA 24 TABLES (one block) =======================
  // Everything that changes from era to era lives here. Source: the in-game
  // User Guide, Upgrade reference, Era 24.
  // Soldiers a minute you end up with -> XP price of that step.
  const SPM_COST = { 3: 225, 4: 412, 5: 450, 6: 487, 7: 525, 8: 562, 9: 600, 10: 675, 11: 750, 12: 975, 13: 1050, 14: 1125,
    15: 1200, 16: 1275, 17: 1350, 18: 1425, 19: 1500, 20: 1575, 21: 1800, 22: 1875, 23: 1950, 24: 2025, 25: 2100, 26: 2250,
    27: 2550, 28: 2700, 29: 2850, 30: 3000, 31: 3150, 32: 3450, 33: 3600, 34: 3750, 35: 3900, 36: 4050, 37: 4200, 38: 4350,
    39: 4500, 40: 4650, 41: 5100, 42: 5400, 43: 5550, 44: 5700, 45: 5850, 46: 6000, 47: 6150, 48: 6300, 49: 6450, 50: 6600,
    51: 6750, 52: 6900, 53: 7050, 54: 7200, 55: 7350, 56: 7500, 57: 7650, 58: 7800, 59: 7950, 60: 8100, 61: 8250, 62: 8400,
    63: 8550, 64: 8700, 65: 8800, 66: 8950, 67: 9000, 68: 9250, 69: 9500, 70: 10000 };
  const ECON = {   // level: [XP cost, gold per turn, name]
    0: [0, 0, "None"], 1: [75, 400, "Hunting"], 2: [150, 1000, "Farming"], 3: [300, 2600, "Fishing"], 4: [600, 6200, "Mining"],
    5: [1200, 15600, "Construction"], 6: [2400, 39000, "SpiceTrade"], 7: [4800, 97600, "Feudal"], 8: [6000, 163013, "Trade"],
    9: [7200, 244200, "Exploration"], 10: [10200, 411563, "Masonry"], 11: [13200, 610400, "Imperial"],
    12: [17500, 1081625, "Urbanization"], 13: [22300, 1525800, "Mercantile"], 14: [32550, 2525000, "PortTrade"],
    15: [42330, 3814600, "Plantation"], 16: [62875, 6000000, "Manufacturing"], 17: [83445, 9536800, "Industrial"] };
  const TECH_LIST = [300, 350, 400, 460, 520, 600, 690, 800, 920, 1060, 1210, 1400, 1610, 1850, 2120, 2440, 2810, 3230, 3710,
    4270, 4910, 5650, 6490, 7470, 8590, 9880, 11360, 13060, 15020, 17270, 19860, 22840, 26270, 30210, 34740, 39950, 45950,
    52840, 60760, 69880, 80360, 92410, 106270];
  const TECH_COST = {};
  TECH_LIST.forEach(function (c, i) { TECH_COST[i + 1] = c; });
  const SAFE_STEPS = [5, 10, 15, 20, 25, 30, 40];                      // % of base income put in the Safe
  const SAFE_COST = { 10: 5000, 15: 7500, 20: 17500, 25: 25000, 30: 40000, 40: 50000 };
  const XPRATE_COST = { 2: 200e6, 3: 550e6, 4: 800e6, 5: 1e9, 6: 2e9 };  // gold
  const SIEGE_NAMES = ["Flaming Arrows", "Ballistas", "Battering Ram", "Ladders", "Trojan Horse", "Catapults", "War Elephants",
    "Siege Towers", "Trebuchets", "Black Powder", "Sappers", "Dynamite", "Greek Fire", "Cannons", "Great Horn", "Fists of Thor",
    "Ringwraiths", "Saurons Ring", "Morgoth"];
  const FORT_NAMES = ["Stockade", "Rabid Pitbulls", "Walled Town", "Towers", "Battlements", "Portcullis", "Boiling Oil", "Trenches",
    "Moat", "Drawbridge", "Fortress", "Stronghold", "Palace", "Keep", "Citadel", "Hand of God", "Gates of Hell", "Titans Shield",
    "Hancock"];
  const SIEGE_OPENS = { 1: "Halflings", 2: "Gnomes", 4: "Ogres", 5: "Goblins", 6: "Wraiths", 7: "Giants", 8: "Wizards", 9: "Fairies",
    10: "Spectres", 12: "Ghosts", 14: "Fire Giants", 15: "Balrogs", 16: "Eagles", 17: "Basilisks", 18: "Krakens", 19: "Oliphaunts" };
  const CONQUESTS = ["Wolves", "Halflings", "Gnomes", "Ogres", "Goblins", "Wraiths", "Giants", "Wizards", "Fairies", "Spectres",
    "Ghosts", "Fire Giants", "Balrogs", "Eagles", "Basilisks", "Krakens", "Oliphaunts"];
  const MAX = { xpRate: 6, siege: 19, fort: 19, covert: 20, sentry: 20, spm: 70, econ: 17, tech: 43 };
  // How each build weighs the gold upgrades: the next buy is the one with the
  // lowest price divided by its weight. Slayer wants siege ten times as much.
  const PRESETS = {
    slayer:   { name: "Slayer",   weight: { siege: 10, fort: 0.5, covert: 1, sentry: 0.5 }, include: { siege: true, fort: false, covert: true, sentry: false } },
    balanced: { name: "Balanced", weight: { siege: 2, fort: 2, covert: 1, sentry: 1 },      include: { siege: true, fort: true, covert: true, sentry: true } },
    economy:  { name: "Economy",  weight: { siege: 1, fort: 1, covert: 1, sentry: 1 },      include: { siege: true, fort: true, covert: true, sentry: true } }
  };
  // ===================== end of the era tables block =======================

  const TURNS_PER_HIT = 120, XP_PER_HIT = 120, XP_PER_TRADE = 1425, TURNS_PER_TRADE = 500;
  const KEEP = 0.56;           // default share of income you keep, until yours is known
  const CONQUEST_TURNS = 10, TRADE_BREAK_EVEN = 28.5;   // a conquest paying under 28.5 XP no longer beats buying its turns
  const KEY = "kocGoalPath";
  // How fast hit sizes grew over a past era: gold per hit on era days 10 to 84 as a
  // multiple of day 10. Only the SHAPE is used, to date goals that are days away.
  const ERA23 = [1.00, 1.19, 1.42, 1.56, 1.69, 1.77, 2.19, 2.46, 2.77, 2.96, 3.29, 3.40, 3.33, 3.56, 3.94,
    4.25, 4.71, 4.58, 5.13, 5.15, 5.50, 5.83, 5.94, 6.63, 6.54, 6.54, 6.10, 6.67, 7.75, 7.65,
    8.23, 7.58, 8.58, 7.87, 8.98, 8.90, 9.77, 9.27, 9.13, 9.90, 9.94, 10.52, 10.46, 10.69, 10.38,
    10.71, 10.13, 10.08, 9.88, 10.87, 10.56, 11.65, 11.65, 11.81, 10.37, 10.52, 10.56, 10.06, 12.37, 10.46,
    12.58, 11.33, 11.25, 11.65, 11.83, 12.75, 12.81, 13.04, 13.19, 13.87, 13.44, 13.83, 14.65, 13.35, 13.81];
  const NATURAL_HITS = 12;     // 1,440 turns a day = 12 hits without trading
  const LINKS = [["Command", "base.php"], ["Armory", "armory.php"], ["Safe", "safe.php"], ["Upgrades", "upgrades.php"],
                 ["Trade", "trade.php"], ["Conquest", "conquestv2.php"], ["Attack Log", "attacklog.php"], ["Training", "training.php"]];

  // ====================== pure helpers (no page access) ====================

  function num(text) {
    if (text == null) return null;
    const m = String(text).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  // 983400000 -> "983M", 1638400000 -> "1.64B", 450000 -> "450K", 675 -> "675"
  function fmt(n) {
    if (n == null || !isFinite(n)) return "?";
    const a = Math.abs(n);
    if (a >= 1e9) return trim(n / 1e9, a >= 1e10 ? 1 : 2) + "B";
    if (a >= 1e6) return trim(n / 1e6, a >= 1e8 ? 0 : 1) + "M";
    if (a >= 1e4) return trim(n / 1e3, 0) + "K";
    return Math.round(n).toLocaleString("en-US");
  }
  // XP is shown to the last point: prices like 10,200 matter exactly.
  function xpText(n) { return n == null || !isFinite(n) ? "?" : Math.round(n).toLocaleString("en-US"); }
  function trim(x, places) {
    return x.toFixed(places).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }

  // 135 -> "2h 15m", 2890 -> "2d 0h", 40 -> "40m"
  function span(minutes) {
    if (minutes == null || !isFinite(minutes)) return "?";
    const m = Math.max(0, Math.ceil(minutes));
    if (m < 60) return m + "m";
    if (m < 1440) return Math.floor(m / 60) + "h " + (m % 60) + "m";
    return Math.floor(m / 1440) + "d " + Math.floor((m % 1440) / 60) + "h";
  }

  function siegeCost(level) { return 50000 * Math.pow(2, level - 1); }
  function covertCost(level) { return 17500 * Math.pow(2, level - 1); }
  function levelFromMult(mult, step) {
    if (!(mult > 0)) return null;
    return Math.round(Math.log(mult) / Math.log(step));
  }
  function econLevelFromGold(gold) {
    if (gold == null) return null;
    let best = 0;
    Object.keys(ECON).forEach(function (k) { if (ECON[k][1] <= gold) best = Math.max(best, +k); });
    return best;
  }

  // ---- page readers: each takes the page's visible text ----
  function parseSidebar(text) {
    const t = String(text || "");
    const grab = function (re) { const m = t.match(re); return m && m[1] !== "" ? num(m[1]) : null; };
    const gold = grab(/Gold:\s*([\d,]+)/);
    const xp = grab(/Experience:\s*([\d,]+)/);
    const turns = grab(/Turns:\s*([\d,]+)/);
    if (gold == null || xp == null || turns == null) return null;
    return { gold: gold, safe: grab(/Safe:\s*([\d,]+)/) || 0, vault: grab(/Vault:\s*([\d,]+)/) || 0,
             xp: xp, bank: grab(/Experience Bank:\s*([\d,]+)/) || 0, turns: turns };
  }
  function parseEra(text) {
    const t = String(text || "");
    const d = t.match(/day\s+(\d+)\s+of\s+(\d+)/i);
    const c = t.match(/Server Time\s*(\d{4})-(\d\d)-(\d\d)\s+(\d\d):(\d\d):(\d\d)/);
    return { day: d ? +d[1] : null, days: d ? +d[2] : null, hour: c ? +c[4] : null, minute: c ? +c[5] : null };
  }
  function parseBase(text) {
    const t = String(text || "");
    const g = function (re) { const m = t.match(re); return m ? num(m[1]) : null; };
    const out = {
      xpRate: g(/Experience Per Turn\s+([\d,]+)\s*EXP/),
      spm: g(/Soldier Per Turn\s+([\d,]+)\s+Soldiers/i),
      econ: econLevelFromGold(g(/Economy\s+[^\n(]*\(\s*([\d,]+)\s+gold per turn\)/i)),
      tech: levelFromMult(g(/Technology\s+[^\n(]*\(x\s*([\d.]+)\)/), 1.05),
      siege: levelFromMult(g(/Siege\s+[^\n(]*\(x\s*([\d.]+)\)/), 1.3),
      covert: g(/Covert Level\s+[^\n(]*\(Level\s+(\d+)\)/),
      fort: levelFromMult(g(/Fortification\s+[^\n(]*\(x\s*([\d.]+)\)/), 1.3),
      sentry: g(/Sentry Level\s+[^\n(]*\(Level\s+(\d+)\)/),
      strike: g(/Strike\s+([\d,]{5,})/),
      income: g(/Projected Income\s+([\d,]+)\s+Gold/)
    };
    return out.xpRate == null && out.spm == null && out.siege == null ? null : out;
  }
  function parseUpgrades(text) {
    const t = String(text || "");
    const g = function (re) { const m = t.match(re); return m ? num(m[1]) : null; };
    const out = {
      siege: g(/Current Siege Upgrade[\s\S]{0,200}?Level\s+(\d+)\s*\|/),
      covert: g(/Current Covert Skill[\s\S]{0,200}?Level\s+(\d+)\s*\|/),
      fort: g(/Current Fortification Upgrade[\s\S]{0,200}?Level\s+(\d+)\s*\|/),
      sentry: g(/Current Sentry Skill[\s\S]{0,200}?Level\s+(\d+)\s*\|/),
      xpRate: g(/\|\s*(\d+)\s*EXP Per Min/)
    };
    return out.siege == null && out.xpRate == null ? null : out;
  }
  function parseSafe(text) {
    const t = String(text || "");
    const g = function (re) { const m = t.match(re); return m ? num(m[1]) : null; };
    let econGold = null;
    const block = t.match(/Economic Development[\s\S]{0,400}/);
    if (block) {
      const all = block[0].match(/\(\s*[\d,]+\s+gold per turn\)/gi) || [];
      all.forEach(function (s) { const v = num(s); if (v != null && (econGold == null || v < econGold)) econGold = v; });
    }
    const out = {
      spm: g(/\|\s*(\d+)\s*Soldiers? Per Min/i),
      econ: econLevelFromGold(econGold),
      tech: levelFromMult(g(/\(x\s*([\d.]+)\s*strength\)/), 1.05),
      safePct: g(/\(\s*(\d+)\s*% TBG Deposited\)/)
    };
    return out.spm == null && out.econ == null && out.tech == null ? null : out;
  }
  function parseAttackLog(text) {
    const m = String(text || "").match(/Total By You Last 24 Hours[\s\S]{0,400}?Attacks\s+([\d,]+)\s+([\d,]+)/);
    if (!m) return null;
    const n = num(m[1]), gold = num(m[2]);
    return n > 0 ? { hits: n, gold: gold, avg: gold / n } : null;
  }
  // Conquest page statistics: per level, attempts so far, XP so far, and the
  // opponent's strength. A locked level prints N/A and is left out.
  function parseConquest(text) {
    const t = String(text || "");
    const out = {};
    CONQUESTS.forEach(function (name) {
      const m = t.match(new RegExp("(?:^|\\n)\\s*" + name + "\\s+([\\d,]+)\\s+times\\s+([\\d,]+)\\s+Exp\\s+[\\d,]+\\s+[A-Za-z]+\\s+([\\d,]+)"));
      if (m) out[name] = { times: num(m[1]), exp: num(m[2]), strength: num(m[3]) };
    });
    return Object.keys(out).length ? out : null;
  }
  // Fold a fresh reading into what we remember. When tries went up since the
  // last look, the XP gained over those tries is what a conquest REALLY paid.
  // We keep the last eight tries or so per level:
  //   rate    = their average pay        last = the pay of the newest batch
  //   rateMid = the try number that average sits on (pay falls as tries add up)
  function conquestUpdate(old, read, now) {
    const mem = {};
    Object.keys(read || {}).forEach(function (name) {
      const r = read[name], o = old && old[name];
      const rec = { times: r.times, exp: r.exp, strength: r.strength,
                    rate: o && o.rate != null ? o.rate : null, rateAt: o && o.rateAt != null ? o.rateAt : null,
                    rateMid: o && o.rateMid != null ? o.rateMid : null, last: o && o.last != null ? o.last : null,
                    recent: o && o.recent ? o.recent.slice() : [] };
      if (o && r.times > o.times && r.exp >= o.exp) {
        const n = r.times - o.times, per = (r.exp - o.exp) / n;
        rec.recent.push({ xp: per, n: n, at: r.times });
        const keep = [];
        let total = 0;
        for (let i = rec.recent.length - 1; i >= 0 && total < 8; i--) { keep.unshift(rec.recent[i]); total += rec.recent[i].n; }
        rec.recent = keep;
        let sum = 0, cnt = 0, mid = 0;
        keep.forEach(function (e) { sum += e.xp * e.n; cnt += e.n; mid += (e.at - (e.n - 1) / 2) * e.n; });
        rec.rate = sum / cnt; rec.rateMid = mid / cnt; rec.rateAt = now; rec.last = per;
      }
      mem[name] = rec;
    });
    return mem;
  }
  // If the page does not redraw its statistics table after an attack, work the
  // try out from the left box instead: turns went down by 10 a try and XP went
  // up by what the tries paid. `level` is the conquest picked in the page's list.
  function conquestFromWallet(cq, before, after, level, now) {
    if (!cq || !before || !after || !level || !cq[level]) return null;
    const spent = before.turns - after.turns;
    const gained = (after.xp + after.bank) - (before.xp + before.bank);
    // a queue is five tries at most; anything bigger, or paying over 60 a try, is not a conquest
    if (!(spent > 0) || spent % CONQUEST_TURNS !== 0 || spent > 100 || !(gained > 0) || gained / (spent / CONQUEST_TURNS) > 60) return null;
    const read = {};
    Object.keys(cq).forEach(function (k) { read[k] = { times: cq[k].times, exp: cq[k].exp, strength: cq[k].strength }; });
    read[level].times += spent / CONQUEST_TURNS;
    read[level].exp += gained;
    return conquestUpdate(cq, read, now);
  }
  // What a conquest pays (Era 24, fitted to one member's own conquest table):
  //   a WIN pays 50 XP for the first 50 tries on a level, then half an XP less
  //   per try (that predicts 4,259.5 XP for 96 tries; the game showed 4,259);
  //   a FAIL pays 40, taken here as four fifths of the win pay all the way down.
  function winPay(attempt) { return attempt <= 50 ? 50 : Math.max(0, 50 - (attempt - 50) / 2); }
  // Chance of a win from your strike against the opponent's strength. The game
  // recommends 2.2x the strength for a sure win; at about 1.0x one member won roughly
  // one in three. A straight line through those two points. An estimate.
  function winChance(strike, strength) {
    if (!(strike > 0) || !(strength > 0)) return 0.5;
    return Math.max(0, Math.min(1, (strike / strength - 0.4) / 1.8));
  }
  function conquestPay(attempt, chance) { return winPay(attempt) * (0.8 + 0.2 * chance); }
  // Every open level, best first: what the NEXT try is expected to pay, and how
  // many tries are left before it stops beating the price of its own turns.
  // Where we have watched real tries, the estimate starts from what they paid
  // and only uses the rule for how much the pay has fallen since.
  function conquestBoard(cq, strike) {
    const rows = [];
    Object.keys(cq || {}).forEach(function (name) {
      const c = cq[name];
      const chance = winChance(strike, c.strength);
      const shift = c.rate != null ? c.rate - conquestPay(c.rateMid != null ? c.rateMid : c.times, chance) : 0;
      const pay = function (attempt) { return Math.max(0, conquestPay(attempt, chance) + shift); };
      const xp = pay(c.times + 1);
      let left = 0;
      while (left < 400 && pay(c.times + 1 + left) > TRADE_BREAK_EVEN) left++;
      rows.push({ name: name, xp: xp, perTurn: xp / CONQUEST_TURNS, chance: chance, times: c.times, left: left,
                  measured: c.rate != null ? c.rate : null, last: c.last != null ? c.last : null, pays: xp > TRADE_BREAK_EVEN });
    });
    rows.sort(function (a, b) { return b.xp - a.xp; });
    return rows;
  }
  // Do `count` conquests, always on the level that pays most right now. `counts`
  // (tries per level) is updated in place. Stops early when the best level pays
  // under 10 XP, because a hit then gives the same XP per turn plus gold.
  function conquestDay(counts, cq, strike, count) {
    let xp = 0, n = 0;
    const names = Object.keys(cq || {});
    for (; n < count; n++) {
      let best = null, bestXp = 10;
      names.forEach(function (name) {
        const v = conquestPay((counts[name] || 0) + 1, winChance(strike, cq[name].strength));
        if (v > bestXp) { bestXp = v; best = name; }
      });
      if (!best) break;
      counts[best] = (counts[best] || 0) + 1;
      xp += bestXp;
    }
    return { xp: xp, n: n };
  }
  function conquestXp(cq, strike) {        // what to expect from your next conquest
    const top = conquestBoard(cq, strike);
    return top.length ? top[0].xp : null;
  }

  // ---- hits your turns and XP are worth (same order as the Data Centre) ----
  function hitsWithTrades(xp, turns, maxTrades) {
    let hits = 0, trades = 0;
    for (;;) {
      while (turns >= TURNS_PER_HIT) { turns -= TURNS_PER_HIT; hits++; xp += XP_PER_HIT; }
      if (trades >= maxTrades || xp < XP_PER_TRADE) break;
      xp -= XP_PER_TRADE; turns += TURNS_PER_TRADE; trades++;
    }
    return { hits: hits, trades: trades, xpLeft: xp };
  }
  function fewestTrades(xp, turns, hitsNeeded) {
    for (let k = 0; k <= 400; k++) {
      const r = hitsWithTrades(xp, turns, k);
      if (r.hits >= hitsNeeded) return k;
      if (r.trades < k) return null;        // ran out of XP first
    }
    return null;
  }

  // ---- the path, worked out from the member's own numbers ----
  // levels: { xpRate, spm, econ, tech, siege, fort, covert, sentry, safePct, income } (null = not read yet)
  // skipped: { id: true }. Skipping a step parks that whole line (you cannot buy level 15 before 14).
  // o: { preset, include: {siege, fort, covert, sentry}, daysLeft, avg, invested, keep }
  function buildPath(levels, skipped, o) {
    const L = levels || {};
    skipped = skipped || {};
    o = o || {};
    const preset = PRESETS[o.preset] || PRESETS.slayer;
    const include = o.include || preset.include;
    const keep = o.keep > 0 ? o.keep : KEEP;
    const T = o.daysLeft > 0 ? o.daysLeft : 60;
    const gold = [], xp = [];
    const item = function (id, label, cost, page, why, extra) {
      const it = { id: id, label: label, short: label.replace(/ a minute$/, "").replace(/^((?:Siege|Fort|Economy) \d+) .*$/, "$1"),
                   cost: cost, done: false, skipped: !!skipped[id], page: page, why: why || "" };
      if (extra) Object.keys(extra).forEach(function (k) { it[k] = extra[k]; });
      return it;
    };

    // ----- gold: XP rate first, then the cheapest step once weighted by the build -----
    const at = { xpRate: L.xpRate, siege: L.siege, fort: L.fort, covert: L.covert, sentry: L.sentry };
    const parked = {};
    const goldStep = function (stat) {
      const n = at[stat] + 1;
      if (stat === "xpRate") return item("xp" + n, n + " XP a minute", XPRATE_COST[n], "upgrades.php", "+1,440 XP a day" + (n === 6 ? ", then claim 5,000 XP on Rewards" : ""));
      if (stat === "siege") return item("siege" + n, "Siege " + n + " " + SIEGE_NAMES[n - 1], siegeCost(n), "upgrades.php", "+30% strike" + (SIEGE_OPENS[n] ? ", opens " + SIEGE_OPENS[n] : ""));
      if (stat === "fort") return item("fort" + n, "Fort " + n + " " + FORT_NAMES[n - 1], siegeCost(n), "upgrades.php", "+30% defense");
      if (stat === "covert") return item("covert" + n, "Covert " + n, covertCost(n), "upgrades.php", "+40% spy: see and recon richer targets");
      return item("sentry" + n, "Sentry " + n, covertCost(n), "upgrades.php", "+40% sentry: harder to scout and sabotage");
    };
    while (at.xpRate != null && at.xpRate < MAX.xpRate && !parked.xpRate) {
      const it = goldStep("xpRate");
      gold.push(it);
      if (it.skipped) parked.xpRate = true; else at.xpRate++;
    }
    for (let guard = 0; guard < 60; guard++) {
      let pick = null, pickStat = null;
      ["siege", "fort", "covert", "sentry"].forEach(function (stat) {
        if (!include[stat] || parked[stat] || at[stat] == null || at[stat] >= MAX[stat]) return;
        const it = goldStep(stat);
        const eff = it.cost / (preset.weight[stat] || 1);
        if (pick == null || eff < pick.eff) { pick = { it: it, eff: eff }; pickStat = stat; }
      });
      if (!pick) break;
      gold.push(pick.it);
      if (pick.it.skipped) parked[pickStat] = true; else at[pickStat]++;
    }

    // ----- XP: always the step that earns the most gold per XP by era end -----
    const gps = (1.15 * keep + 0.10) * 1440;
    const LOSS = 0.015;
    const soldierDays = 1440 * (T / LOSS - (1 - Math.exp(-LOSS * T)) / (LOSS * LOSS));
    const base = L.income > 0 ? L.income / 1.15 : null;          // gold a turn before the race bonus
    const x = { spm: L.spm, econ: L.econ, tech: L.tech, safe: L.safePct };
    const xparked = {};
    const turnsValue = o.avg > 0 ? o.avg / 222 : 0;
    let beaten = false;
    for (let guard = 0; guard < 45; guard++) {
      const c = [];
      if (x.spm != null && !xparked.spm && SPM_COST[x.spm + 1]) {
        const n = x.spm + 1;
        c.push({ stat: "spm", v: soldierDays * 2 * gps / SPM_COST[n],
                 it: item("spm" + n, "Soldiers " + n + " a minute", SPM_COST[n], "safe.php", "+1,440 soldiers a day") });
      }
      if (x.econ != null && !xparked.econ && ECON[x.econ + 1]) {
        const n = x.econ + 1;
        let best = 0, cc = 0, cv = 0;                               // look ahead: a weak level can sit in front of strong ones
        for (let lv = n; ECON[lv]; lv++) { cc += ECON[lv][0]; cv += (ECON[lv][1] - ECON[lv - 1][1]) * gps * T; best = Math.max(best, cv / cc); }
        c.push({ stat: "econ", v: best,
                 it: item("econ" + n, "Economy " + n + " " + ECON[n][2], ECON[n][0], "safe.php", "+" + fmt((ECON[n][1] - ECON[n - 1][1]) * 1.15 * 1440) + " income a day") });
      }
      if (x.tech != null && !xparked.tech && TECH_COST[x.tech + 1]) {
        const n = x.tech + 1;
        c.push({ stat: "tech", v: o.invested > 0 ? 0.05 * o.invested / TECH_COST[n] : 0,
                 it: item("tech" + n, "Tech " + n, TECH_COST[n], "safe.php", "+5% to every stat") });
      }
      const si = SAFE_STEPS.indexOf(x.safe);
      if (x.safe != null && !xparked.safe && si > -1 && si + 1 < SAFE_STEPS.length && base > 0) {
        const n = SAFE_STEPS[si + 1];
        c.push({ stat: "safe", v: (n - x.safe) / 100 * base * 1440 * T / SAFE_COST[n],
                 it: item("safe" + n, "Safe " + n + "%", SAFE_COST[n], "safe.php", (n - x.safe) + "% more of base income, cannot be stolen") });
      }
      if (!c.length) break;
      c.sort(function (a, b) { return b.v - a.v; });
      const top = c[0];
      if (turnsValue > top.v && top.v > 0) { beaten = true; break; }   // a traded XP now earns more than any upgrade left
      top.it.perXp = top.v;
      xp.push(top.it);
      if (top.it.skipped) xparked[top.stat] = true;
      else if (top.stat === "safe") x.safe = SAFE_STEPS[si + 1];
      else x[top.stat]++;
    }
    return { gold: gold, xp: xp, turnsBeatUpgrades: beaten, preset: preset.name };
  }
  function current(list) {
    for (let i = 0; i < list.length; i++) if (!list[i].done && !list[i].skipped) return list[i];
    return null;
  }
  function upcoming(list, n) {
    const cur = current(list), out = [];
    let seen = false;
    list.forEach(function (it) {
      if (it === cur) { seen = true; return; }
      if (seen && !it.done && !it.skipped && out.length < n) out.push(it);
    });
    return out;
  }

  // ---- what a gold goal still needs ----
  // wallet: { gold, safe, vault, xp, bank, turns }; avg: gold per hit (or null)
  function goldPlan(goal, wallet, avg, countOnHand) {
    const have = wallet.vault + wallet.safe + (countOnHand ? wallet.gold : 0);
    const need = Math.max(0, goal.cost - have);
    const p = { have: have, need: need, pct: Math.min(1, have / goal.cost), ready: need <= 0,
                hits: null, fromTurns: Math.floor(wallet.turns / TURNS_PER_HIT), withXp: null, trades: null,
                turnsWait: null, avg: avg };
    p.withXp = hitsWithTrades(wallet.xp, wallet.turns, 400).hits;
    if (need > 0 && avg > 0) {
      p.hits = Math.ceil(need / avg);
      p.trades = fewestTrades(wallet.xp, wallet.turns, p.hits);
      p.turnsWait = Math.max(0, p.hits * TURNS_PER_HIT - wallet.turns);   // one turn a minute
    }
    return p;
  }
  // ---- what an XP goal still needs ----
  function xpPlan(goal, wallet, xpRate) {
    const have = wallet.xp + wallet.bank;
    const need = Math.max(0, goal.cost - have);
    return { have: have, need: need, pct: Math.min(1, have / goal.cost), ready: need <= 0,
             deposit: Math.max(0, goal.cost - wallet.bank),
             wait: need > 0 && xpRate > 0 ? need / xpRate : null };
  }

  // ---- upgrade or hit? gold an XP earns each way, from the Era 24 model ----
  // Returns null when it cannot tell. ratio > 1 means the upgrade wins.
  function upgradeVsHit(levels, daysLeft, avg) {
    if (!levels || levels.econ == null || !(daysLeft > 0) || !(avg > 0)) return null;
    const next = levels.econ + 1;
    if (!ECON[next] || !ECON[next - 1]) return { done: true };
    const perXp = (ECON[next][1] - ECON[next - 1][1]) * (1.15 * KEEP + 0.10) * 1440 * daysLeft / ECON[next][0];
    const hit = avg / (XP_PER_TRADE / TURNS_PER_TRADE * TURNS_PER_HIT - XP_PER_HIT);   // 222 XP net a hit
    return { ratio: perXp / hit, breakEven: perXp * 222, next: next };
  }

  // Minutes until the next Vault tax (00:00, 06:00, 12:00, 18:00 server time).
  function vaultTaxIn(hour, minute) {
    if (hour == null || minute == null) return null;
    const into = (hour % 6) * 60 + minute;
    return 360 - into;
  }

  // Armory page: "Total Invested Value" is the first big number under the header row.
  function parseArmory(text) {
    const m = String(text || "").match(/Total Invested Value[\s\S]{0,160}?([\d,]{7,})/);
    return m ? num(m[1]) : null;
  }

  // ---- what one XP earns today, each way you can spend it (Era 24 model) ----
  // Gold by era end, after the share of income you lose to hits. Sorted best first;
  // a row whose input has not been read yet keeps perXp = null and says what to open.
  function xpValues(levels, daysLeft, avg, invested, keepShare) {
    const L = levels || {};
    const rows = [];
    const gps = (1.15 * (keepShare > 0 ? keepShare : KEEP) + 0.10) * 1440;      // gold a day from 1 base gold a turn
    const T = daysLeft > 0 ? daysLeft : null;
    const LOSS = 0.015;                            // soldiers lost a day
    const sn = L.spm != null ? L.spm + 1 : null;
    if (sn != null && SPM_COST[sn]) {
      const soldierDays = T == null ? null : 1440 * (T / LOSS - (1 - Math.exp(-LOSS * T)) / (LOSS * LOSS));
      rows.push({ key: "soldiers", label: "Soldiers " + sn, perXp: soldierDays == null ? null : soldierDays * 2 * gps / SPM_COST[sn],
                  missing: "no era day", tip: "1,440 more soldiers every day, each earning income until the era ends." });
    }
    const en = L.econ != null ? L.econ + 1 : null;
    if (en != null && ECON[en] && ECON[en - 1]) {
      rows.push({ key: "economy", label: "Economy " + en, perXp: T == null ? null : (ECON[en][1] - ECON[en - 1][1]) * gps * T / ECON[en][0],
                  missing: "no era day", tip: "More income every minute until the era ends." });
    }
    rows.push({ key: "turns", label: "Turns for hits", perXp: avg > 0 ? avg / 222 : null,
                missing: "no hit size", tip: "A hit costs 342 XP in turns and pays 120 back: 222 XP for one hit of gold." });
    const tn = L.tech != null ? L.tech + 1 : null;
    if (tn != null && TECH_COST[tn]) {
      rows.push({ key: "tech", label: "Tech " + tn, perXp: invested > 0 ? 0.05 * invested / TECH_COST[tn] : null,
                  missing: "open Armory", tip: "+5% to every stat: worth 5% of what your armory cost. It grows as the armory grows." });
    }
    rows.sort(function (x, y) { return (y.perXp == null ? -1 : y.perXp) - (x.perXp == null ? -1 : x.perXp); });
    return rows;
  }

  // ---- pace forecast: hours from now until each goal on the path can be bought ----
  // A day's play is o.hitsPerDay hits (120 turns each) and o.conquestsPerDay
  // conquests (10 turns each). The day's own 1,440 turns are used first; any
  // turns beyond that are bought with XP at 2.85 XP a turn. A hit pays 120 XP
  // and your hit size in gold; conquests go to whichever level in o.cq pays
  // most that day, and their pay falls as the tries add up. Gold pays the gold
  // goals in order, XP pays the XP goals in order. Hit size grows along the
  // Era 23 curve. Left out, so real life is a little faster: the login bonus,
  // the Safe trickle and income on hand. A goal missing from the result is not
  // reached before the era ends at this pace.
  function forecast(path, wallet, levels, avg, o) {
    const out = {};
    o = o || {};
    if (!path || !wallet || !levels || !(levels.xpRate > 0)) return out;
    const want = o.hitsPerDay > 0 ? o.hitsPerDay : 30;
    const cqWant = o.conquestsPerDay > 0 && o.cq ? o.conquestsPerDay : 0;
    const counts = {};
    Object.keys(o.cq || {}).forEach(function (name) { counts[name] = o.cq[name].times; });
    let cqN = 0, cqGain = 0;                                         // today's conquests and the XP they pay
    const open = function (it) { return !it.done && !it.skipped; };
    const gq = path.gold.filter(open), xq = path.xp.filter(open);
    const stock = Math.floor(wallet.turns / TURNS_PER_HIT);          // hits you can do right now
    let rate = levels.xpRate, gi = 0, xi = 0;
    let gold = wallet.vault + wallet.safe + (o.countOnHand ? wallet.gold : 0) + (avg > 0 ? stock * avg : 0);
    let xp = wallet.xp + wallet.bank + stock * XP_PER_HIT;
    const at = function (day) { return ERA23[Math.max(0, Math.min(ERA23.length - 1, day - 10))]; };
    const grow = function (h) { return o.eraDay == null ? 1 : at(o.eraDay + Math.floor(h / 24)) / at(o.eraDay); };
    const limit = o.eraDay != null && o.eraDays ? Math.max(0, (o.eraDays - o.eraDay) * 24) : 24 * 120;
    const xpDay = function (hits) {
      const turns = hits * TURNS_PER_HIT + cqN * CONQUEST_TURNS;
      return rate * 1440 + hits * XP_PER_HIT + cqGain - Math.max(0, turns - 1440) * (XP_PER_TRADE / TURNS_PER_TRADE);
    };
    for (let h = 0; h <= limit; h++) {
      while (gi < gq.length && gold >= gq[gi].cost) {
        gold -= gq[gi].cost; out[gq[gi].id] = h;
        const m = gq[gi].id.match(/^xp(\d)$/);
        if (m) { rate = Math.max(rate, +m[1]); if (+m[1] === 6) xp += 5000; }
        gi++;
      }
      while (xi < xq.length && xp >= xq[xi].cost) { xp -= xq[xi].cost; out[xq[xi].id] = h; xi++; }
      if (gi >= gq.length && xi >= xq.length) break;
      if (cqWant && h % 24 === 0) { const day = conquestDay(counts, o.cq, o.strike, cqWant); cqN = day.n; cqGain = day.xp; }
      let hits = want;
      while (hits > 0 && xpDay(hits) < 0) hits--;                    // cannot trade XP you do not earn
      if (avg > 0) gold += hits / 24 * avg * grow(h);
      xp += xpDay(hits) / 24;
    }
    return out;
  }

  const GP = { num: num, fmt: fmt, span: span, siegeCost: siegeCost, covertCost: covertCost, levelFromMult: levelFromMult,
    econLevelFromGold: econLevelFromGold, parseSidebar: parseSidebar, parseEra: parseEra, parseBase: parseBase,
    parseUpgrades: parseUpgrades, parseSafe: parseSafe, parseAttackLog: parseAttackLog, hitsWithTrades: hitsWithTrades,
    fewestTrades: fewestTrades, buildPath: buildPath, current: current, upcoming: upcoming, goldPlan: goldPlan,
    xpPlan: xpPlan, upgradeVsHit: upgradeVsHit, vaultTaxIn: vaultTaxIn, parseArmory: parseArmory, xpValues: xpValues, forecast: forecast, parseConquest: parseConquest,
    conquestUpdate: conquestUpdate, conquestBoard: conquestBoard, conquestXp: conquestXp, PRESETS: PRESETS,
    winPay: winPay, winChance: winChance, conquestPay: conquestPay, conquestDay: conquestDay,
    conquestFromWallet: conquestFromWallet };
  if (typeof module !== "undefined" && module.exports) { module.exports = GP; }
  if (typeof document === "undefined") return;

  // =============================== memory ==================================
  function load() {
    try {
      const m = JSON.parse(localStorage.getItem(KEY) || "{}");
      return m && typeof m === "object" ? m : {};
    } catch (e) { return {}; }
  }
  function save(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* storage full or blocked: the panel still works */ } }
  function readShared(key) {       // the Data Centre's own numbers, if it is installed
    try { const v = JSON.parse(localStorage.getItem(key)); return typeof v === "number" && isFinite(v) ? v : null; } catch (e) { return null; }
  }

  // The Data Centre works out the share of income you keep ("Banked 56.2%").
  // If its box is on the page, use that number. Returns true when it changed.
  function readBanked(mem) {
    const b = document.getElementById("xp-banked");
    const m = b ? (b.textContent || "").match(/([\d.]+)\s*%/) : null;
    const v = m ? parseFloat(m[1]) / 100 : null;
    if (v > 0.05 && v <= 1 && v !== mem.keepSeen) { mem.keepSeen = v; return true; }
    return false;
  }

  // The page writes its "day 10 of 83" line a moment after it loads, so the first
  // look can miss it. Remember the last day seen and count forward from it.
  function eraNow(mem, era, now) {
    if (era.day != null) { mem.era = { day: era.day, days: era.days, at: now }; return era; }
    if (mem.era && mem.era.day != null) {
      era.days = mem.era.days;
      era.day = Math.min(mem.era.days, mem.era.day + Math.floor((now - mem.era.at) / 86400000));
    }
    return era;
  }

  // ============================ read this page ==============================
  function sidebarText() {
    let pick = null;
    document.querySelectorAll("table").forEach(function (t) {
      const s = t.innerText || "";
      if (s.indexOf("Gold:") !== -1 && s.indexOf("Experience:") !== -1 && s.indexOf("Turns:") !== -1) pick = s;   // last = innermost
    });
    return pick;
  }

  function readPage(mem) {
    const body = document.body ? document.body.innerText || "" : "";
    const path = location.pathname.toLowerCase();
    const now = Date.now();
    const merge = function (part) {
      if (!part) return;
      mem.levels = mem.levels || {};
      Object.keys(part).forEach(function (k) { if (part[k] != null) mem.levels[k] = part[k]; });
      mem.levelsAt = now;
    };
    if (/\/base\.php$/.test(path)) merge(parseBase(body));
    if (/\/upgrades\.php$/.test(path)) merge(parseUpgrades(body));
    if (/\/safe\.php$/.test(path)) merge(parseSafe(body));
    if (/\/armory\.php$/.test(path)) {
      const inv = parseArmory(body);
      if (inv) { mem.invested = inv; mem.investedAt = now; }
    }
    if (/\/conquestv2\.php$/.test(path)) {
      const c = parseConquest(body);
      if (c) { mem.cq = conquestUpdate(mem.cq, c, now); mem.cqAt = now; }
    }
    if (/\/attacklog\.php$/.test(path)) {
      const a = parseAttackLog(body);
      if (a) { mem.avg = a.avg; mem.avgAt = now; mem.hits24 = a.hits; }
    }
    readBanked(mem);
    return { wallet: parseSidebar(sidebarText()), era: eraNow(mem, parseEra(body), now) };
  }

  // ================================ panel ==================================
  // Colours: gold = things paid with gold, blue = things paid with XP,
  // green = ready or covered, amber = still waiting, grey = not known yet.
  const CSS = [
    "#kgp{position:fixed;right:14px;bottom:14px;z-index:99999;width:336px;max-width:calc(100vw - 28px);box-sizing:border-box;",
    "font:13px/1.4 'Segoe UI',system-ui,Arial,sans-serif;color:#eef0f4;background:#10131a;border:1px solid #3b4658;",
    "border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.6);text-align:left}",
    "#kgp *{box-sizing:border-box}",
    "#kgp .kgp-head{display:flex;align-items:center;gap:8px;padding:9px 12px;background:linear-gradient(90deg,#3b2c08,#1a2233 70%);border-radius:9px 9px 0 0;cursor:pointer;user-select:none;border-bottom:1px solid #3b4658}",
    "#kgp.kgp-min .kgp-head{border-radius:9px;border-bottom:0}",
    "#kgp .kgp-title{font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#ffcf5c;flex:1 1 auto;min-width:0}",
    "#kgp .kgp-chip{font-size:11.5px;color:#c6cedb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}",
    "#kgp .kgp-btn{flex:0 0 auto;width:22px;height:22px;line-height:19px;text-align:center;border:1px solid #56627a;border-radius:5px;color:#eef0f4;background:#1b2130;font-size:14px;font-weight:700}",
    "#kgp .kgp-body{padding:10px;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 80px);overflow-y:auto}",
    "#kgp .kgp-body>*{flex:0 0 auto}",
    "#kgp.kgp-min .kgp-body{display:none}",
    "#kgp .kgp-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}",
    "#kgp .kgp-nav a{display:block;text-align:center;padding:4px 2px;border:1px solid #33405a;border-radius:5px;background:#18202f;color:#cfe0ff;text-decoration:none;font-size:12px;font-weight:600;white-space:nowrap}",
    "#kgp .kgp-nav a:hover{background:#25355a;border-color:#6d8fd0;color:#fff}",
    "#kgp .kgp-card{border:1px solid #33405a;border-radius:8px;background:#161b26;overflow:hidden}",
    "#kgp .kgp-gold{border-color:#6b5316} #kgp .kgp-xp{border-color:#1f4f84}",
    "#kgp .kgp-chead{display:flex;align-items:center;gap:8px;padding:7px 10px}",
    "#kgp .kgp-gold .kgp-chead{background:#2b2209} #kgp .kgp-xp .kgp-chead{background:#0f2540}",
    "#kgp .kgp-tag{flex:0 0 auto;font-size:10.5px;font-weight:800;letter-spacing:.08em;padding:2px 7px;border-radius:4px;color:#10131a}",
    "#kgp .kgp-gold .kgp-tag{background:#ffcf5c} #kgp .kgp-xp .kgp-tag{background:#6cb8ff}",
    "#kgp .kgp-name{flex:1 1 auto;min-width:0;font-weight:700;font-size:14px;overflow-wrap:anywhere}",
    "#kgp .kgp-pill{flex:0 0 auto;font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:2px 8px;border-radius:999px;white-space:nowrap}",
    "#kgp .kgp-s-go{background:#1f9d55;color:#fff} #kgp .kgp-s-xp{background:#2f7fd6;color:#fff}",
    "#kgp .kgp-s-wait{background:#f0a23a;color:#1a1204} #kgp .kgp-s-off{background:#4a5568;color:#eef0f4}",
    "#kgp .kgp-cbody{padding:9px 10px 10px;display:flex;flex-direction:column;gap:7px}",
    "#kgp .kgp-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}",
    "#kgp .kgp-num{font-size:26px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums}",
    "#kgp .kgp-gold .kgp-num{color:#ffcf5c} #kgp .kgp-xp .kgp-num{color:#6cb8ff} #kgp .kgp-num.kgp-ok{color:#4ade80}",
    "#kgp .kgp-unit{font-size:12.5px;color:#c6cedb;margin-top:3px}",
    "#kgp .kgp-side{text-align:right;font-size:12px;color:#aab4c4;font-variant-numeric:tabular-nums;line-height:1.45;flex:0 0 auto}",
    "#kgp .kgp-side b{color:#eef0f4;font-weight:700}",
    "#kgp .kgp-bar{position:relative;height:9px;border-radius:5px;background:#283042;overflow:hidden}",
    "#kgp .kgp-fill{height:100%;border-radius:5px}",
    "#kgp .kgp-gold .kgp-fill{background:linear-gradient(90deg,#c98d12,#ffcf5c)} #kgp .kgp-xp .kgp-fill{background:linear-gradient(90deg,#2f7fd6,#8ccaff)}",
    "#kgp .kgp-barrow{display:flex;align-items:center;gap:8px} #kgp .kgp-barrow .kgp-bar{flex:1 1 auto}",
    "#kgp .kgp-pct{flex:0 0 38px;text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}",
    "#kgp .kgp-meter{display:flex;height:14px;border-radius:4px;overflow:hidden;background:#283042;gap:1px}",
    "#kgp .kgp-seg{height:100%} #kgp .kgp-seg-t{background:#4ade80} #kgp .kgp-seg-x{background:#6cb8ff} #kgp .kgp-seg-s{background:#5a3a1a}",
    "#kgp .kgp-legend{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:12px;color:#c6cedb}",
    "#kgp .kgp-key{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}",
    "#kgp .kgp-dot{width:9px;height:9px;border-radius:2px;flex:0 0 auto}",
    "#kgp .kgp-do{font-weight:700;border-radius:5px;padding:5px 8px;font-size:12.5px}",
    "#kgp .kgp-do-go{background:#11331f;color:#7ff0a8;border:1px solid #1f9d55}",
    "#kgp .kgp-do-xp{background:#0f2540;color:#a9d6ff;border:1px solid #2f7fd6}",
    "#kgp .kgp-do-wait{background:#33240a;color:#ffd08a;border:1px solid #a86a12}",
    "#kgp .kgp-do-off{background:#222a38;color:#d5dbe6;border:1px solid #4a5568}",
    "#kgp .kgp-why{color:#aab4c4;font-size:12px}",
    "#kgp .kgp-line{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;font-variant-numeric:tabular-nums}",
    "#kgp .kgp-line span:first-child{color:#aab4c4} #kgp .kgp-line span:last-child{text-align:right;font-weight:600}",
    "#kgp .kgp-hot span:last-child{color:#ffb454}",
    "#kgp a{color:#9cc4ff;text-decoration:underline}",
    "#kgp .kgp-board{border:1px solid #33405a;border-radius:8px;background:#161b26;padding:8px 10px;display:flex;flex-direction:column;gap:5px}",
    "#kgp .kgp-bt{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#aab4c4;font-weight:800}",
    "#kgp .kgp-vrow{display:grid;grid-template-columns:96px 1fr 62px;align-items:center;gap:8px;font-size:12.5px}",
    "#kgp .kgp-vrow .kgp-vl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#kgp .kgp-vrow .kgp-vv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}",
    "#kgp .kgp-vbar{height:8px;border-radius:4px;background:#283042;overflow:hidden}",
    "#kgp .kgp-vfill{height:100%;border-radius:4px;background:#56627a}",
    "#kgp .kgp-best .kgp-vfill{background:linear-gradient(90deg,#1f9d55,#4ade80)} #kgp .kgp-best .kgp-vl,#kgp .kgp-best .kgp-vv{color:#7ff0a8}",
    "#kgp .kgp-dim .kgp-vl,#kgp .kgp-dim .kgp-vv{color:#8590a3}",
    "#kgp .kgp-note{font-size:12px;color:#c6cedb}",
    "#kgp .kgp-tax{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;padding:5px 9px;border-radius:6px;background:#18202f;border:1px solid #33405a;font-variant-numeric:tabular-nums}",
    "#kgp .kgp-tax b{font-weight:800;color:#eef0f4} #kgp .kgp-tax span{color:#aab4c4}",
    "#kgp .kgp-tax.kgp-taxhot{background:#3a1d0d;border-color:#d9772b} #kgp .kgp-tax.kgp-taxhot b{color:#ffb454}",
    "#kgp .kgp-pace{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;border-top:1px dashed #33405a;padding-top:6px}",
    "#kgp .kgp-pace span:first-child{color:#aab4c4} #kgp .kgp-pace b{font-weight:800;text-align:right}",
    "#kgp .kgp-stop u{text-decoration:none;color:#7ff0a8;margin-left:5px}",
    "#kgp .kgp-row .kgp-re{flex:0 0 58px;text-align:right;color:#7ff0a8;font-variant-numeric:tabular-nums}",
    "#kgp input.kgp-small{width:40px}",
    "#kgp .kgp-set{border:1px solid #33405a;border-radius:8px;background:#161b26;padding:8px 10px;display:flex;flex-direction:column;gap:7px;font-size:12.5px}",
    "#kgp .kgp-set .kgp-srow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}",
    "#kgp .kgp-set .kgp-sl{flex:0 0 100%;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#aab4c4;font-weight:800}",
    "#kgp .kgp-seg3{display:flex;border:1px solid #56627a;border-radius:6px;overflow:hidden}",
    "#kgp .kgp-seg3 button{font:inherit;font-weight:700;padding:3px 10px;border:0;background:#18202f;color:#c6cedb;cursor:pointer}",
    "#kgp .kgp-seg3 button+button{border-left:1px solid #56627a}",
    "#kgp .kgp-seg3 button.kgp-on{background:#ffcf5c;color:#10131a}",
    "#kgp .kgp-vrow .kgp-vl i{font-style:normal;color:#8590a3;margin-left:5px;font-size:11.5px}",
    "#kgp .kgp-vrow.kgp-crow{grid-template-columns:138px 1fr 56px}",
    "#kgp .kgp-live{color:#7ff0a8}",
    "#kgp .kgp-next{display:flex;flex-direction:column;gap:5px;font-size:12px}",
    "#kgp .kgp-nrow{display:flex;flex-wrap:wrap;align-items:center;gap:4px}",
    "#kgp .kgp-nl{flex:0 0 auto;width:40px;font-weight:800;font-size:10.5px;letter-spacing:.08em}",
    "#kgp .kgp-nl-g{color:#ffcf5c} #kgp .kgp-nl-x{color:#6cb8ff}",
    "#kgp .kgp-stop{border:1px solid #33405a;border-radius:999px;padding:1px 8px;background:#18202f;color:#d5dbe6;white-space:nowrap}",
    "#kgp .kgp-stop i{font-style:normal;color:#aab4c4;margin-left:4px;font-variant-numeric:tabular-nums}",
    "#kgp .kgp-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12px;color:#aab4c4;border-top:1px solid #283042;padding-top:8px}",
    "#kgp .kgp-link{color:#9cc4ff;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0;font:inherit}",
    "#kgp input[type=text]{width:74px;font:inherit;color:#eef0f4;background:#0b0d12;border:1px solid #56627a;border-radius:4px;padding:1px 5px}",
    "#kgp label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}",
    "#kgp .kgp-stale{color:#ffb454}",
    "#kgp .kgp-path{display:flex;flex-direction:column;gap:2px;font-size:12px}",
    "#kgp .kgp-path h4{margin:6px 0 2px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:800}",
    "#kgp .kgp-path h4.kgp-hg{color:#ffcf5c} #kgp .kgp-path h4.kgp-hx{color:#6cb8ff}",
    "#kgp .kgp-row{display:flex;gap:6px;align-items:baseline;cursor:pointer;border-radius:4px;padding:1px 4px}",
    "#kgp .kgp-row:hover{background:#222a38}",
    "#kgp .kgp-row .kgp-mark{flex:0 0 14px;text-align:center}",
    "#kgp .kgp-row .kgp-rl{flex:1 1 auto;min-width:0;overflow-wrap:anywhere} #kgp .kgp-row .kgp-rc{flex:0 0 auto;font-variant-numeric:tabular-nums;color:#aab4c4}",
    "#kgp .kgp-row.kgp-done .kgp-rl,#kgp .kgp-row.kgp-done .kgp-mark{color:#4ade80} #kgp .kgp-row.kgp-skip .kgp-rl{color:#6d7890;text-decoration:line-through}",
    "#kgp .kgp-row.kgp-cur{background:#222a38} #kgp .kgp-row.kgp-cur .kgp-rl{color:#fff;font-weight:800}"
  ].join("");

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function line(label, value, cls) {
    const d = el("div", "kgp-line" + (cls ? " " + cls : ""));
    d.appendChild(el("span", null, label));
    d.appendChild(el("span", null, value));
    return d;
  }
  function pageLink(href, text) {
    const a = el("a", null, text);
    a.href = href;
    return a;
  }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  const DAYS3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function clock(d) {
    const h = d.getHours(), m = d.getMinutes();
    return ((h + 11) % 12 + 1) + (m ? ":" + (m < 10 ? "0" : "") + m : "") + (h < 12 ? " AM" : " PM");
  }
  // hours from now -> "now", "today 9 PM", "tomorrow 9 PM", "Sat 15 Nov"   (your own clock)
  function whenLong(hours) {
    if (hours == null) return "not this era at this pace";
    if (hours <= 0) return "now";
    const now = new Date(), d = new Date(now.getTime() + hours * 3600000);
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    if (days === 0) return "today " + clock(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()));
    if (days === 1) return "tomorrow " + clock(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()));
    return DAYS3[d.getDay()] + " " + d.getDate() + " " + MONTHS3[d.getMonth()] + " (" + days + " days)";
  }
  function whenShort(hours) {
    if (hours == null) return "later";
    if (hours <= 0) return "now";
    if (hours < 24) return span(hours * 60).replace(/ \d+m$/, "");
    const d = new Date(Date.now() + hours * 3600000);
    return DAYS3[d.getDay()] + " " + d.getDate();
  }
  function pace(body, label, hours, tip) {
    const d = el("div", "kgp-pace");
    d.title = "Counting " + tip + ". Change them at the bottom of the panel.";
    d.appendChild(el("span", null, label));
    d.appendChild(el("b", null, whenLong(hours)));
    body.appendChild(d);
  }

  // One goal card: coloured header with a status pill, then the body.
  function card(kind, tag, goal, pill, pillKind) {
    const c = el("div", "kgp-card kgp-" + kind);
    const h = el("div", "kgp-chead");
    h.appendChild(el("span", "kgp-tag", tag));
    h.appendChild(el("span", "kgp-name", goal.label));
    h.appendChild(el("span", "kgp-pill kgp-s-" + pillKind, pill));
    c.appendChild(h);
    const b = el("div", "kgp-cbody");
    c.appendChild(b);
    return { root: c, body: b };
  }
  function hero(body, big, unit, sideRows, ok) {
    const h = el("div", "kgp-hero");
    const l = el("div");
    l.appendChild(el("div", "kgp-num" + (ok ? " kgp-ok" : ""), big));
    l.appendChild(el("div", "kgp-unit", unit));
    h.appendChild(l);
    const s = el("div", "kgp-side");
    sideRows.forEach(function (r) {
      const d = el("div");
      d.appendChild(document.createTextNode(r[0] + " "));
      d.appendChild(el("b", null, r[1]));
      s.appendChild(d);
    });
    h.appendChild(s);
    body.appendChild(h);
  }
  function bar(body, pct) {
    const row = el("div", "kgp-barrow"), b = el("div", "kgp-bar"), f = el("div", "kgp-fill");
    f.style.width = Math.max(pct > 0 ? 2 : 0, Math.round(pct * 100)) + "%";
    b.appendChild(f);
    row.appendChild(b);
    row.appendChild(el("span", "kgp-pct", Math.floor(pct * 100) + "%"));
    body.appendChild(row);
  }
  function action(body, kind, nodes) {
    const d = el("div", "kgp-do kgp-do-" + kind);
    nodes.forEach(function (n) { d.appendChild(typeof n === "string" ? document.createTextNode(n) : n); });
    body.appendChild(d);
  }
  function key(colour, text) {
    const k = el("span", "kgp-key"), d = el("span", "kgp-dot");
    d.style.background = colour;
    k.appendChild(d);
    k.appendChild(document.createTextNode(text));
    return k;
  }

  function avgNow(mem) {
    if (mem.manualAvg > 0) return { v: mem.manualAvg, from: "typed by you" };
    const shared = readShared("xpTool_avgGold");
    if (shared > 0) return { v: shared, from: "Data Centre" };
    if (mem.avg > 0) return { v: mem.avg, from: "Attack Log" };
    return { v: null, from: "" };
  }

  function drawGold(body, g, wallet, era, avg, countOnHand, eta, paceTip) {
    const p = goldPlan(g, wallet, avg.v, countOnHand);
    let pill, kind;
    if (p.ready) { pill = "READY"; kind = "go"; }
    else if (p.hits == null) { pill = "NEEDS HIT SIZE"; kind = "off"; }
    else if (p.fromTurns >= p.hits) { pill = "TURNS COVER IT"; kind = "go"; }
    else if (p.trades != null) { pill = "DOABLE WITH XP"; kind = "xp"; }
    else { pill = plural(p.hits - p.withXp, "hit").toUpperCase() + " SHORT"; kind = "wait"; }
    const c = card("gold", "GOLD", g, pill, kind);
    const side = [["cost", fmt(g.cost)], ["have", fmt(p.have)]];
    if (p.ready) hero(c.body, "Ready", "you hold the full price", side, true);
    else if (p.hits != null) hero(c.body, plural(p.hits, "hit"), "to go, at " + fmt(p.avg) + " a hit", side.concat([["need", fmt(p.need)]]), false);
    else hero(c.body, fmt(p.need), "still to find", side, false);
    bar(c.body, p.pct);
    c.body.appendChild(el("div", "kgp-why", "vault " + fmt(wallet.vault) + " + safe " + fmt(wallet.safe) + (countOnHand ? " + on hand " + fmt(wallet.gold) : "") + ". Buys: " + g.why));

    if (p.ready) {
      action(c.body, "go", ["Withdraw the Safe if you need it, then buy on ", pageLink(g.page, "Upgrades"), "."]);
    } else if (p.hits != null) {
      // where the hits come from: turns you hold, XP trades, and what is still missing
      const t = Math.min(p.fromTurns, p.hits), x = Math.max(0, Math.min(p.withXp, p.hits) - t), s = p.hits - t - x;
      const m = el("div", "kgp-meter");
      [["t", t], ["x", x], ["s", s]].forEach(function (pair) {
        if (pair[1] <= 0) return;
        const seg = el("div", "kgp-seg kgp-seg-" + pair[0]);
        seg.style.flex = pair[1] + " 1 0";
        m.appendChild(seg);
      });
      c.body.appendChild(m);
      const lg = el("div", "kgp-legend");
      lg.appendChild(key("#4ade80", t + " from turns"));
      if (x > 0) lg.appendChild(key("#6cb8ff", x + " from XP trades"));
      if (s > 0) lg.appendChild(key("#5a3a1a", s + " short"));
      c.body.appendChild(lg);
      if (p.fromTurns >= p.hits) {
        action(c.body, "go", ["You hold the turns: " + plural(p.hits, "hit") + ", then buy on ", pageLink(g.page, "Upgrades"), "."]);
      } else if (p.trades != null) {
        action(c.body, "xp", ["Doable now with " + plural(p.trades, "XP trade") + " (" + xpText(p.trades * XP_PER_TRADE) + " XP)."]);
        c.body.appendChild(line("Or wait for turns", span(p.turnsWait)));
      } else {
        action(c.body, "wait", ["Even with every XP traded you are " + plural(s, "hit") + " short."]);
        c.body.appendChild(line("Turns alone get there in", span(p.turnsWait)));
      }
    } else {
      action(c.body, "off", ["No average per hit yet. Open your ", pageLink("attacklog.php", "Attack Log"), " or type a hit size below."]);
    }
    if (!p.ready && p.hits != null) pace(c.body, "On your pace", eta[g.id], paceTip);
    body.appendChild(c.root);
  }

  function drawXp(body, x, wallet, levels, eta, paceTip) {
    const q = xpPlan(x, wallet, levels.xpRate);
    const c = card("xp", "XP", x, q.ready ? "READY" : "SAVING", q.ready ? "go" : "wait");
    const side = [["cost", xpText(x.cost)], ["have", xpText(q.have)]];
    if (q.ready) hero(c.body, "Ready", "you hold the full price", side, true);
    else hero(c.body, xpText(q.need), "XP to go", side, false);
    bar(c.body, q.pct);
    c.body.appendChild(el("div", "kgp-why", (wallet.bank > 0 ? xpText(wallet.bank) + " already in the bank. " : "") + "Buys: " + x.why));
    if (q.ready) {
      action(c.body, "go", [(q.deposit > 0 ? "Deposit " + xpText(q.deposit) + " XP, then buy on " : "Buy on "), pageLink(x.page, "Safe"), "."]);
    } else {
      if (q.wait != null) c.body.appendChild(line("With no XP traded away", span(q.wait)));
      c.body.appendChild(line("Or sooner with", plural(Math.ceil(q.need / XP_PER_HIT), "hit") + " or " + plural(Math.ceil(q.need / 40), "conquest")));
      pace(c.body, "On your pace", eta[x.id], paceTip);
    }
    body.appendChild(c.root);
  }

  // What one XP earns today, each way you can spend it. Longest bar wins.
  function drawBoard(body, levels, daysLeft, avg, invested, keep) {
    const rows = xpValues(levels, daysLeft, avg.v, invested, keep);
    const known = rows.filter(function (r) { return r.perXp != null; });
    if (!known.length) return;
    const top = known[0].perXp;
    const box = el("div", "kgp-board");
    box.appendChild(el("div", "kgp-bt", "What 1 XP earns today (gold by era end)"));
    rows.forEach(function (r) {
      const row = el("div", "kgp-vrow" + (r.perXp != null && r === known[0] ? " kgp-best" : "") + (r.perXp == null ? " kgp-dim" : ""));
      row.title = r.tip;
      row.appendChild(el("span", "kgp-vl", r.label));
      const b = el("div", "kgp-vbar"), f = el("div", "kgp-vfill");
      f.style.width = r.perXp != null ? Math.max(2, Math.round(r.perXp / top * 100)) + "%" : "0%";
      b.appendChild(f);
      row.appendChild(b);
      row.appendChild(el("span", "kgp-vv", r.perXp != null ? fmt(r.perXp) : r.missing));
      box.appendChild(row);
    });
    body.appendChild(box);
  }

  // What a conquest pays you on each open level right now. Longest bar = do this one.
  function drawConquest(body, cq, strike) {
    const box = el("div", "kgp-board");
    box.appendChild(el("div", "kgp-bt", "Conquest: XP for the next try (10 turns)"));
    if (!cq) {
      const n = el("div", "kgp-note");
      n.appendChild(document.createTextNode("Open "));
      n.appendChild(pageLink("conquestv2.php", "Conquest"));
      n.appendChild(document.createTextNode(" once and this ranks your levels."));
      box.appendChild(n);
      body.appendChild(box);
      return;
    }
    const rows = conquestBoard(cq, strike);
    let left = 0;
    rows.forEach(function (r) { left += r.left; });
    rows.slice(0, 6).forEach(function (r, i) {
      const row = el("div", "kgp-vrow kgp-crow" + (i === 0 && r.pays ? " kgp-best" : "") + (r.pays ? "" : " kgp-dim"));
      row.title = r.times + " done. Win chance about " + Math.round(r.chance * 100) + "%. " + r.left + " more tries beat the price of their turns." +
                  (r.last != null ? " Your last one paid " + trim(r.last, 1) + " XP; your recent tries averaged " + trim(r.measured, 1) + "." : " Estimate from the pay rule; it sharpens once you do one with this page open.");
      const l = el("span", "kgp-vl", r.name);
      l.appendChild(el("i", r.last != null ? "kgp-live" : null, r.times + " kc"));
      row.appendChild(l);
      const b = el("div", "kgp-vbar"), f = el("div", "kgp-vfill");
      f.style.width = Math.max(2, Math.min(100, Math.round(r.xp / 50 * 100))) + "%";
      b.appendChild(f);
      row.appendChild(b);
      row.appendChild(el("span", "kgp-vv", Math.round(r.xp) + " XP"));
      box.appendChild(row);
    });
    box.appendChild(el("div", "kgp-note", left > 0
      ? left + " tries left that pay over 28.5 XP, where a conquest stops beating the XP price of its turns. kc = tries done; green kc = pay watched live."
      : "No level pays over 28.5 XP any more. Conquests no longer beat the XP price of their turns."));
    body.appendChild(box);
  }

  function drawSettings(body, mem, presetKey, include, keep, cqPerDay, redraw) {
    const box = el("div", "kgp-set");
    const r1 = el("div", "kgp-srow");
    r1.appendChild(el("span", "kgp-sl", "Build"));
    const seg = el("div", "kgp-seg3");
    Object.keys(PRESETS).forEach(function (k) {
      const b = el("button", k === presetKey ? "kgp-on" : null, PRESETS[k].name);
      b.type = "button";
      b.addEventListener("click", function () { mem.preset = k; delete mem.include; redraw(); });
      seg.appendChild(b);
    });
    r1.appendChild(seg);
    box.appendChild(r1);
    const r2 = el("div", "kgp-srow");
    r2.appendChild(el("span", "kgp-sl", "Gold upgrades on the path"));
    [["siege", "Siege"], ["fort", "Fort"], ["covert", "Covert"], ["sentry", "Sentry"]].forEach(function (pair) {
      const lab = el("label"), cb = document.createElement("input");
      cb.type = "checkbox"; cb.id = "kgp-inc-" + pair[0]; cb.checked = !!include[pair[0]];
      cb.addEventListener("change", function () {
        mem.include = mem.include || {};
        ["siege", "fort", "covert", "sentry"].forEach(function (k) { if (mem.include[k] == null) mem.include[k] = !!include[k]; });
        mem.include[pair[0]] = cb.checked;
        redraw();
      });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(pair[1]));
      r2.appendChild(lab);
    });
    box.appendChild(r2);
    const r3 = el("div", "kgp-srow");
    r3.appendChild(el("span", "kgp-sl", "Your pace and numbers"));
    const field = function (id, label, value, tip, onSet) {
      const lab = el("label");
      lab.title = tip;
      lab.appendChild(document.createTextNode(label));
      const inp = document.createElement("input");
      inp.type = "text"; inp.id = id; inp.className = "kgp-small"; inp.value = value;
      inp.addEventListener("change", function () { onSet(inp.value.trim()); redraw(); });
      lab.appendChild(inp);
      r3.appendChild(lab);
    };
    field("kgp-cq", "Conquests a day", String(cqPerDay), "How many conquests you do on a normal day. They use 10 turns each.", function (v) {
      const n = parseInt(v, 10);
      if (n >= 0 && n <= 2000) mem.cqPerDay = n; else delete mem.cqPerDay;
    });
    field("kgp-keep", "Income kept %", String(Math.round(keep * 100)), "The share of your income you manage to spend before it is stolen. Empty = use the Data Centre's Banked figure.", function (v) {
      const n = parseFloat(v);
      if (n >= 5 && n <= 100) mem.keep = n / 100; else delete mem.keep;
    });
    box.appendChild(r3);
    body.appendChild(box);
  }

  function draw(mem, seen) {
    let root = document.getElementById("kgp");
    if (!root) {
      const st = document.createElement("style");
      st.textContent = CSS;
      document.head.appendChild(st);
      root = el("div");
      root.id = "kgp";
      document.body.appendChild(root);
    }
    root.className = mem.min ? "kgp-min" : "";
    root.textContent = "";

    const levels = mem.levels || null;
    const wallet = seen.wallet;
    const era = seen.era;
    const avg = avgNow(mem);
    const countOnHand = mem.countOnHand !== false;
    const redraw = function () { save(mem); draw(mem, seen); };
    const daysLeft = era.day != null ? era.days - era.day : null;
    const keep = mem.keep > 0 ? mem.keep : (mem.keepSeen > 0 ? mem.keepSeen : KEEP);
    const presetKey = PRESETS[mem.preset] ? mem.preset : "slayer";
    const include = {};
    ["siege", "fort", "covert", "sentry"].forEach(function (k) {
      include[k] = mem.include && mem.include[k] != null ? !!mem.include[k] : PRESETS[presetKey].include[k];
    });
    const path = buildPath(levels, mem.skipped, { preset: presetKey, include: include, daysLeft: daysLeft, avg: avg.v, invested: mem.invested, keep: keep });
    const g = current(path.gold), x = current(path.xp);
    const hitsPerDay = mem.hitsPerDay > 0 ? mem.hitsPerDay : (mem.hits24 > 0 ? mem.hits24 : 30);   // your own last 24 hours, else 30
    const cqPerDay = mem.cqPerDay != null ? mem.cqPerDay : (mem.cq ? 50 : 0);
    const strike = levels ? levels.strike : null;
    const eta = forecast(path, wallet, levels, avg.v, { hitsPerDay: hitsPerDay, countOnHand: countOnHand, eraDay: era.day, eraDays: era.days,
                                                        conquestsPerDay: cqPerDay, cq: mem.cq, strike: strike });
    const paceTip = hitsPerDay + " hits and " + cqPerDay + " conquests a day";
    const etaOf = function (it) { return Object.prototype.hasOwnProperty.call(eta, it.id) ? eta[it.id] : null; };

    // ---- header ----
    const head = el("div", "kgp-head");
    head.title = mem.min ? "Show the goal path" : "Hide the goal path";
    head.appendChild(el("span", "kgp-title", "Goal Path"));
    let chip = (era.day != null ? "Day " + era.day + " of " + era.days + " \u00B7 " : "") + PRESETS[presetKey].name;
    if (mem.min && g && wallet && levels) {
      const p0 = goldPlan(g, wallet, avg.v, countOnHand);
      chip = g.short + ": " + (p0.ready ? "ready" : (p0.hits != null ? plural(p0.hits, "hit") : fmt(p0.need) + " to go"));
    }
    head.appendChild(el("span", "kgp-chip", chip));
    head.appendChild(el("span", "kgp-btn", mem.min ? "+" : "-"));
    head.addEventListener("click", function () { mem.min = !mem.min; redraw(); });
    root.appendChild(head);

    const body = el("div", "kgp-body");
    root.appendChild(body);

    // ---- quick links: ordinary links, you do every click and every buy ----
    const nav = el("div", "kgp-nav");
    LINKS.forEach(function (pair) { nav.appendChild(pageLink(pair[1], pair[0])); });
    body.appendChild(nav);

    if (!wallet) {
      action(body, "off", ["I can't find the Gold, Experience and Turns box on this page. Open any page in the game while logged in."]);
      return;
    }
    if (!levels) {
      action(body, "off", ["Open your ", pageLink("base.php", "Command Center"), " once so I can read your levels. After that this panel fills in on every page."]);
      return;
    }

    // ---- Vault tax clock: 5% every six hours at 00, 06, 12, 18 server time (20% a day) ----
    const taxBox = el("div", "kgp-tax");
    const taxAt = function () {
      const srv = era.hour != null ? { h: era.hour, m: era.minute } : { h: new Date().getUTCHours(), m: new Date().getUTCMinutes() };
      const gone = era.hour != null ? Math.floor((Date.now() - LOADED) / 60000) : 0;
      let left = vaultTaxIn(srv.h, srv.m) - gone;
      while (left <= 0) left += 360;
      return left;
    };
    const paintTax = function () {
      const left = taxAt();
      taxBox.textContent = "";
      taxBox.className = "kgp-tax" + (wallet.vault > 0 && left <= 45 ? " kgp-taxhot" : "");
      const l = el("span", null, "Vault tax 5% in ");
      l.appendChild(el("b", null, span(left)));
      taxBox.appendChild(l);
      taxBox.appendChild(el("span", null, "at " + clock(new Date(Math.round((Date.now() + left * 60000) / 60000) * 60000)) + (wallet.vault > 0 ? ", costs " + fmt(wallet.vault * 0.05) : "")));
    };
    paintTax();
    if (TAX_TIMER) clearInterval(TAX_TIMER);
    TAX_TIMER = setInterval(paintTax, 30000);
    body.appendChild(taxBox);

    if (g) drawGold(body, g, wallet, era, avg, countOnHand, eta, paceTip);
    else action(body, "go", ["Every gold goal on the path is done. Gold now goes to chariots and whatever passes the 30% and 40% rules."]);

    if (x) drawXp(body, x, wallet, levels, eta, paceTip);
    else if (path.turnsBeatUpgrades) action(body, "xp", ["A traded XP now earns more than any upgrade left. Send your spare XP to turns."]);
    else action(body, "go", ["Every XP goal on the path is done. XP now goes to turns."]);

    drawBoard(body, levels, daysLeft, avg, mem.invested, keep);
    drawConquest(body, mem.cq, strike);
    body.appendChild(el("div", "kgp-note", "Gold on hand can't be saved, so it goes to chariots between the lump buys."));

    // ---- what comes next ----
    const ng = upcoming(path.gold, 3), nxp = upcoming(path.xp, 3);
    if (ng.length || nxp.length) {
      const nx = el("div", "kgp-next");
      const stops = function (cls, label, list) {
        if (!list.length) return;
        const r = el("div", "kgp-nrow");
        r.appendChild(el("span", "kgp-nl " + cls, label));
        list.forEach(function (it) {
          const s = el("span", "kgp-stop", it.short);
          s.appendChild(el("i", null, it.cost < 1e6 ? xpText(it.cost) : fmt(it.cost)));
          s.appendChild(el("u", null, whenShort(etaOf(it))));
          s.title = "On pace: " + whenLong(etaOf(it));
          r.appendChild(s);
        });
        nx.appendChild(r);
      };
      stops("kgp-nl-g", "THEN", ng);
      stops("kgp-nl-x", "THEN", nxp);
      body.appendChild(nx);
    }

    // ---- full path (click a line to skip it or bring it back) ----
    if (mem.showPath) {
      const box = el("div", "kgp-path");
      const section = function (title, cls, list, cur) {
        box.appendChild(el("h4", cls, title));
        list.forEach(function (it) {
          const r = el("div", "kgp-row" + (it.done ? " kgp-done" : it.skipped ? " kgp-skip" : it === cur ? " kgp-cur" : ""));
          r.title = it.done ? "Done" : it.skipped ? "Skipped. Click to bring it back." : "Click to skip this one.";
          r.appendChild(el("span", "kgp-mark", it.done ? "\u2713" : it.skipped ? "x" : it === cur ? "\u25B8" : ""));
          r.appendChild(el("span", "kgp-rl", it.label));
          r.appendChild(el("span", "kgp-rc", it.cost < 1e6 ? xpText(it.cost) : fmt(it.cost)));
          r.appendChild(el("span", "kgp-re", it.done || it.skipped ? "" : whenShort(etaOf(it))));
          if (!it.done) r.addEventListener("click", function () {
            mem.skipped = mem.skipped || {};
            if (mem.skipped[it.id]) delete mem.skipped[it.id]; else mem.skipped[it.id] = true;
            redraw();
          });
          box.appendChild(r);
        });
      };
      section("Paid with gold", "kgp-hg", path.gold, g);
      section("Paid with XP", "kgp-hx", path.xp, x);
      body.appendChild(box);
    }

    // ---- footer: settings ----
    const foot = el("div", "kgp-foot");
    const toggle = el("button", "kgp-link", mem.showPath ? "Hide full path" : "Show full path");
    toggle.type = "button";
    toggle.addEventListener("click", function () { mem.showPath = !mem.showPath; redraw(); });
    foot.appendChild(toggle);

    const lab = el("label");
    lab.title = "Count the gold in your hand toward the gold goal. Vault and Safe always count.";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.id = "kgp-onhand"; cb.checked = countOnHand;
    cb.addEventListener("change", function () { mem.countOnHand = cb.checked; redraw(); });
    lab.appendChild(cb); lab.appendChild(document.createTextNode("count gold on hand"));
    foot.appendChild(lab);

    const al = el("label");
    al.title = "Gold you expect from one hit, like 40m. Leave it empty to use your Attack Log average.";
    al.appendChild(document.createTextNode("Hit size"));
    const inp = document.createElement("input");
    inp.type = "text"; inp.id = "kgp-avg"; inp.placeholder = avg.v ? fmt(avg.v) : "40m";
    if (mem.manualAvg > 0) inp.value = fmt(mem.manualAvg);
    inp.addEventListener("change", function () {
      const raw = inp.value.trim().toLowerCase();
      const m = raw.match(/^([\d.,]+)\s*([kmb]?)$/);
      if (!raw) delete mem.manualAvg;
      else if (m) mem.manualAvg = parseFloat(m[1].replace(/,/g, "")) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
      redraw();
    });
    al.appendChild(inp);
    foot.appendChild(al);
    if (avg.v) foot.appendChild(el("span", null, "(" + avg.from + ")"));

    const hl = el("label");
    hl.title = "How many hits you make on a normal day. The dates in this panel assume it. The first 12 use the day's own turns, the rest use XP.";
    hl.appendChild(document.createTextNode("Hits a day"));
    const hin = document.createElement("input");
    hin.type = "text"; hin.id = "kgp-hits"; hin.className = "kgp-small"; hin.value = String(hitsPerDay);
    hin.addEventListener("change", function () {
      const v = parseInt(hin.value, 10);
      if (v > 0 && v <= 200) mem.hitsPerDay = v; else delete mem.hitsPerDay;
      redraw();
    });
    hl.appendChild(hin);
    foot.appendChild(hl);

    const setLink = el("button", "kgp-link", mem.showSet ? "Hide settings" : "Settings");
    setLink.type = "button";
    setLink.addEventListener("click", function () { mem.showSet = !mem.showSet; redraw(); });
    foot.appendChild(setLink);

    if (mem.levelsAt) {
      const age = Math.round((Date.now() - mem.levelsAt) / 60000);
      const s = el("span", age > 720 ? "kgp-stale" : null);
      s.appendChild(document.createTextNode("Levels read " + (age < 2 ? "just now" : span(age) + " ago") + (age > 720 ? ". Open " : "")));
      if (age > 720) s.appendChild(pageLink("base.php", "Command Center"));
      foot.appendChild(s);
    }
    body.appendChild(foot);
    if (mem.showSet) drawSettings(body, mem, presetKey, include, keep, cqPerDay, redraw);
  }

  const LOADED = Date.now();
  let TAX_TIMER = null;

  // Which conquest is picked in the page's own list.
  function selectedConquest() {
    const sel = document.querySelector("#anotherconquest select, #conquests select");
    const opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
    const text = opt ? (opt.textContent || "").trim() : "";
    for (let i = CONQUESTS.length - 1; i >= 0; i--) if (text.indexOf(CONQUESTS[i]) === 0) return CONQUESTS[i];
    return null;
  }
  // The Conquest page runs each attack without loading a new page. Watch the
  // page's own numbers change (we only look, we never ask the game anything)
  // and redraw: tries done, XP paid, turns and XP left.
  function watchConquest(mem, seen) {
    if (!/\/conquestv2\.php$/.test(location.pathname.toLowerCase()) || typeof MutationObserver === "undefined") return;
    let timer = null, pending = null;
    const sig = function (c) { return c ? Object.keys(c).map(function (k) { return k + c[k].times + ":" + c[k].exp; }).join(",") : ""; };
    let tableSig = sig(parseConquest(document.body.innerText || ""));   // what the page's table said when we last looked
    const check = function () {
      timer = null;
      try {
        const now = Date.now();
        const wallet = parseSidebar(sidebarText());
        const read = parseConquest(document.body.innerText || "");
        let changed = false;
        if (read && sig(read) !== tableSig) {                          // the page's own table moved: trust it
          tableSig = sig(read);
          Object.keys(read).forEach(function (k) {                     // but never step back behind tries we already counted
            const have = mem.cq && mem.cq[k];
            if (have && read[k].times < have.times) read[k] = { times: have.times, exp: have.exp, strength: read[k].strength };
          });
          mem.cq = conquestUpdate(mem.cq, read, now); mem.cqAt = now;
          mem.cqTableLive = true;
          pending = null; changed = true;
        } else if (pending && now - pending.at >= 800) {               // it did not: use turns spent and XP gained
          const live = conquestFromWallet(mem.cq, pending.before, pending.after, pending.level, now);
          if (live) { mem.cq = live; mem.cqAt = now; changed = true; }
          pending = null;
        }
        if (wallet && JSON.stringify(wallet) !== JSON.stringify(seen.wallet)) {
          if (pending) pending.after = wallet;
          else if (!mem.cqTableLive && seen.wallet && wallet.turns < seen.wallet.turns) {
            pending = { before: seen.wallet, after: wallet, level: selectedConquest(), at: now };
            setTimeout(check, 900);
          }
          seen.wallet = wallet; changed = true;
        }
        if (changed) { save(mem); draw(mem, seen); }
      } catch (e) { /* keep the panel as it is */ }
    };
    new MutationObserver(function (list) {
      for (let i = 0; i < list.length; i++) {
        const t = list[i].target, e = t && t.nodeType === 1 ? t : (t ? t.parentElement : null);
        if (e && e.closest && e.closest("#kgp")) continue;             // our own redraws
        if (!timer) timer = setTimeout(check, 400);
        return;
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ================================= run ===================================
  try {
    const mem = load();
    const seen = readPage(mem);
    save(mem);
    draw(mem, seen);
    const lookAgain = function () {          // things the page (or the Data Centre) draws after load
      try {
        let changed = readBanked(mem);
        const era = parseEra(document.body ? document.body.innerText || "" : "");
        if (era.day != null && (!mem.era || mem.era.day !== era.day || seen.era.day !== era.day)) {
          seen.era = eraNow(mem, era, Date.now());
          changed = true;
        }
        if (changed) { save(mem); draw(mem, seen); }
      } catch (e2) { /* the panel is already up */ }
    };
    setTimeout(lookAgain, 1500);
    setTimeout(lookAgain, 6000);
    watchConquest(mem, seen);
  } catch (e) {
    if (window.console) console.error("[KoC Goal Path]", e);
  }
})();
