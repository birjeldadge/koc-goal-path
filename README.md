# KoC Goal Path

A small panel for Kings of Chaos that shows what you are saving for, what it
still needs, and what comes after it.

## Install

1. Install the Tampermonkey extension in your browser.
2. Open this link and click Install:
   https://raw.githubusercontent.com/birjeldadge/koc-goal-path/main/koc-goal-path.user.js
3. Open your Command Center once. The panel appears bottom right.

Tampermonkey checks the same link for updates.

## What it shows

- **Gold goal:** the next upgrade bought with gold, what you hold toward it
  (Vault, Safe, gold on hand), and how many hits that is at your own average.
  A bar splits those hits into turns you hold, XP trades, and what is still short.
- **XP goal:** the next upgrade bought with XP, and how long it takes.
- **A date for every goal** at the hits and conquests a day you set.
- **What 1 XP earns today:** soldiers, economy, turns or tech, ranked.
- **Conquest:** what the next try pays on each open level, and how many tries
  are left before a conquest stops being worth its turns.
- **Vault tax clock** and quick links to the pages you use most.

## Settings

Click Settings at the bottom of the panel.

- **Build:** Slayer (strike first), Balanced, or Economy.
- **Gold upgrades on the path:** tick Siege, Fort, Covert, Sentry.
- **Hit size, hits a day, conquests a day, income kept %:** it reads these from
  your own pages where it can; type your own to override.

Click any goal in the full path to skip it or bring it back.

## What it reads, and what it never does

It reads numbers from pages you open yourself: the left box on every page,
Command Center, Upgrades, Safe, Armory, Conquest and Attack Log. If the KoC
Data Centre script is installed, it uses that script's average hit and banked %
so the two agree.

It never loads a page, never clicks, never buys, never sends anything anywhere.
It shows only your own account. There is no buy button on purpose: the game
rules ban auto-buyers and any script that posts to the site.

## Each era

The level tables are one block at the top of the script, marked
`ERA 24 TABLES`. They need checking against the in-game User Guide when a new
era starts.

The dates and "what 1 XP earns" numbers are estimates from a model. Treat them
as a guide, not a promise.
