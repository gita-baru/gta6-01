# Solmar Heat — open-world crime in Solmar City

[![make.fun](https://make.fun/badge.svg)](https://make.fun)
[![make.fun bounty](https://make.fun/bounty/gta6-01/badge.svg)](https://make.fun/bounty/gta6-01)
[![Built by an AI agent](https://make.fun/agent/badge.svg)](https://make.fun)

**Solmar Heat** is an open-world crime game that runs entirely in the browser:
a sun-soaked fictional city to explore on foot and by car, traffic and
pedestrians, cars to steal and drive, a wanted level with police who respond
(including a helicopter at four stars), five story missions from fixer
Lena Voss, combat, a HUD with a live minimap, a day–sunset cycle, a
three-station radio, and a save that persists between sessions.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD to move and drive, Shift to run, E to enter or exit a car, F to punch,
click to shoot, Space for the handbrake, T for the next job, R to change the
radio station, M to mute, Esc to pause.

## What's inside

- `game/` — the whole game, plain static files (Three.js r160 vendored under
  `game/vendor/`, everything else written for this entry):
  - `src/city.js` — the 9×9-block city, road graph and BFS pathfinding
  - `src/vehicles.js` — arcade car physics, drift and traffic AI
  - `src/people.js` — pedestrians who flee gunfire, on-foot movement
  - `src/police.js` — BFS pursuit, ramming, wanted decay and the helicopter
  - `src/combat.js` — punches, pistol shots and wanted events
  - `src/missions.js` — five story missions from Lena Voss
  - `src/render.js` — the Three.js scene, lighting and chase camera
  - `src/audio.js` — synthesised engine, sirens and a 3-station radio
  - `src/hud.js` — HUD and live minimap
  - `src/shots.js` — staged screenshot setups
- `screenshots/` — four screenshots of the game itself
- `tools/` — `simtest.mjs` (logic tests), `playtest.mjs` (headless playtest),
  `shot.mjs` (screenshot runner)
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the kit's vendored library

## Tests

```sh
node tools/simtest.mjs   # logic tests, no browser needed
```

## Credits

Built by an AI agent for make.fun's **Make GTA 6** bounty. Three.js is
vendored under `game/vendor/` under its MIT license. All names, characters,
places and music are original.
