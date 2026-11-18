# Solmar Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gita-baru/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gita-baru/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for make.fun's
**gta6-01** bounty. It runs offline in a desktop browser from static files
under `game/` — no build step, no network requests. Three.js is vendored
under `game/vendor/`; every other line is original.

## The game

Solmar City is a sun-soaked coastal city: nine by nine blocks of towers,
palms and neon, an ocean and a beach on its south edge. You are Marco, a
getaway driver picking up work from Lena Voss, a fixer who calls you on the
in-game phone.

**Systems:** walk and drive anywhere in the city, steal any car, traffic
and pedestrians who flee gunfire, a 5-star wanted level with police cruisers
that route along the roads to chase you down (and a helicopter from 4 stars),
five story missions, combat (fists and a pistol), a HUD with a live minimap,
a day-to-sunset lighting cycle, synthesized sound plus a synth radio, and
saves in localStorage.

**Missions (from Lena Voss):**
1. **First Pickup** — collect a package at the docks, deliver it to the Hotel Solmar. ($500)
2. **Hot Wheels** — steal the yellow Comet GT uptown and bring it to the garage, with the police already on you. ($1,200)
3. **The Getaway** — lose a 3-star wanted level and reach the safehouse in 90 seconds. ($2,000)
4. **Night Run** — three deliveries across the city against a 150-second clock. ($1,500)
5. **Heat Wave** — lose a 4-star wanted level with the helicopter up and reach the safehouse. ($3,000)

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive, steer |
| Shift | Run |
| E | Enter / exit car |
| F | Punch |
| Mouse click | Shoot (on foot) |
| Space | Handbrake (driving) / confirm (menus) |
| T | Start the next job |
| R | Toggle the radio |
| M | Mute |
| Esc | Pause |
| Mouse | Orbit the camera (click to lock the pointer) |

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and press Start. Your progress
saves automatically to localStorage.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game,
staged deterministically: `?shot=cover|street|mission|title` plays the
simulation forward from a fixed seed with an autopilot, so the same seed
always gives the same frame. See `shots.json`. The camera snaps to its final
position before capture, so every frame is settled and readable: the chase
cover shows the player at speed with police cruisers in pursuit, the street scene
has traffic and pedestrians in frame, and the mission scene shows the hotel
beacon with the objective distance.

## Layout

```
main.ts                  entry program: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts                 tiny static server for local play
vendor/makefun-game.ts   the kit's dossier library, unchanged
game/
  index.html             page, import map, HUD markup
  style.css              HUD and menu styling
  vendor/three.module.min.js   three.js r160, vendored
  src/
    main.js              boot, game loop, screens, shot staging
    world.js             the simulation: player, cars, peds, police, missions, wanted
    city.js              procedural Solmar City: blocks, roads, palms, named places
    render.js            three.js scene: sky, sun, ocean, buildings, cars, people, camera
    vehicles.js          arcade driving, traffic AI, police pursuit (BFS over the road grid)
    player.js            on-foot movement and combat
    peds.js              pedestrians who stroll and flee
    missions.js          the five jobs from Lena Voss
    wanted.js            wanted stars, police response, cooldown
    hud.js               cash, stars, health, speed, objective, minimap, menus
    audio.js             synthesized WebAudio: engine, sirens, gunshots, crashes, radio
    input.js             keyboard and mouse
    save.js              localStorage save/load
    shots.js             deterministic screenshot scenes
    config.js            tuning constants
    random.js            seeded RNG
tools/
  shot.mjs               headless-Chromium screenshot driver (CDP)
  simtest.mjs            headless smoke tests for the simulation core
```

## Entry

Built for make.fun bounty **gta6-01** ("Make GTA 6"). License: MIT.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bhtec78s&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
