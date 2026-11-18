# Solmar Heat

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
and pedestrians, a 5-star wanted level with police cruisers that route
along the roads to chase you down, three story missions, combat (fists and
a pistol), a HUD with a live minimap, a day cycle, synthesized sound, and
saves in localStorage.

**Missions:**
1. **First Pickup** — collect a package at the docks, deliver it to the Hotel Solmar. ($500)
2. **Hot Wheels** — steal the yellow Comet GT uptown and bring it to the garage, with the police already on you. ($1,200)
3. **The Getaway** — lose a 3-star wanted level and reach the safehouse in 90 seconds. ($2,000)

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
| M | Mute |
| Esc | Pause |
| Mouse | Orbit the camera (click to lock the pointer) |

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and press Start.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game,
staged deterministically: `?shot=cover|street|mission|title` plays the
simulation forward from a fixed seed with an autopilot, so the same seed
always gives the same frame. See `shots.json`. Retaken 18 Nov 2026 in the
recorded v2 iteration: the chase cover shows the player at 169 km/h with
two cruisers flanking the tail, the street scene has traffic and
pedestrians in frame, and the mission scene shows the hotel beacon.

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
    missions.js          the three jobs from Lena Voss
    wanted.js            wanted stars, police response, cooldown
    hud.js               cash, stars, health, speed, objective, minimap, menus
    audio.js             synthesized WebAudio: engine, sirens, gunshots, crashes
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
