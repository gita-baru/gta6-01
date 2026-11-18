# Solmar Heat — build notes

Rebuilt from scratch under a sealed make.fun recording (round 2). Every line
of game code in this repo was written fresh in the recorded session; only the
kit starter files (main.ts, serve.ts, vendor/makefun-game.ts, LICENSE) were
copied unchanged, and three.js r160 was downloaded fresh from the public CDN.

## What it is

An open-world crime game in the browser: Solmar City (9x9 blocks, beach and
ocean south), walk/drive/steal cars, traffic + pedestrians, 0-5 star wanted
with BFS police pursuit and a helicopter at 4+ stars, five story missions,
fists + pistol combat, full HUD with a live minimap, day-to-sunset lighting,
synthesized WebAudio plus a synth radio, localStorage saves.

## How to test

```sh
node --test tools/simtest.mjs     # simulation smoke tests (must pass)
node serve.ts                     # http://localhost:8080
SHOT_CHROME=$HOME/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome \
  node tools/shot.mjs --url "http://localhost:8080/?shot=cover&seed=7" \
  --out screenshots/1-chase.jpg
node main.ts                      # builds out/dossier.json
node cli/makefun.mjs check --worktree /home/hatch/workspace/makefun/gta6-01
```

## Screenshot staging

Each scene plays the simulation forward from a fixed seed with a scripted
autopilot, then the camera SNAPS to its final position before capture (a
lerping camera never settles and ruined the first build's shots). Scenes are
defined in shots.json and staged in game/src/shots.js.

## Known limits

- Single-player, desktop Chrome, mouse + keyboard only.
- SwiftShader software rendering in headless Chromium is slow; the live game
  targets real GPUs.
- Police pathfinding is BFS over the intersection graph; ramming is a simple
  proximity push, not full collision physics.
