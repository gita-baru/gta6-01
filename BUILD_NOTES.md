# Solmar Heat — build notes (v2, 18 Nov 2026, recorded iteration)

## Status
Game v2 is built, verified and screenshotted under the official makefun
recording (ID 01a1ec92-e3b9-70a5-b807-42501c54c8c6). All 25 repo text files
were rewritten with write/edit tools in the recorded session (the 2 kit
files `LICENSE` and `vendor/makefun-game.ts` and the vendored
`game/vendor/three.module.min.js` were not touched). The 4 screenshots are
final: 1280x720 JPEG, 78-91 KiB each (limit 256 KiB), all `ready=true`,
`errors=0`.

## What is verified
- `node --test tools/simtest.mjs`: **11/11 pass** (city, collisions, car
  physics, traffic AI + the new lane-spread test, police BFS pursuit,
  missions 1+3, wanted decay, peds, player).
- All game sources parse (`node --check`); every import resolves; no
  external URL in `game/` (fully offline). `serve.ts` (TypeScript) starts
  and serves 200 on a test port.
- `game/` is ~764 KiB, 19 files (limit 48 MiB / 993 entries).
- Dossier source text is ~93 KiB (limit 160 KiB).
- Live play tested in headless Chromium (3 runs: mission start + walk,
  car-entry attempt + walk, E-spam walk): `errors=0` in every run, no
  console exceptions; title -> play, mission objective, HUD and minimap
  all work in the real browser.
- `makefun check --worktree` (v1): 4 passed, 0 failed (competition_open,
  snapshot, license_osi, entrypoint). Re-run after the dossier build.

## Visual fixes in v2 (vs the v1 screenshots)
- **Root cause of the bad shots:** the chase camera never settled —
  `runShot` painted 2 frames with a 1/6-per-frame lerp, so the camera was
  only ~31% toward its staged yaw/pitch. Fixed: `main.js` now snaps the
  camera (`renderer.updateCamera(..., 1)`) before painting a shot.
- **Cover (1-chase.jpg):** the sports car now starts on avenue x=26 and
  drives north on the road for 6 s (autopilot with a 30 m lookahead),
  reaching 169 km/h; two cruisers are staged 6-7 m behind it, flanking
  left/right with a clear gap; two traffic cars ahead on the avenue.
  Camera: dist 15, pitch 0.38.
- **Street (2-street.jpg):** 3 traffic cars and 5 pedestrians staged
  22-70 m ahead of the walking player, so the street reads as alive.
- **Mission (3-mission.jpg):** the car starts on avenue x=-26, drives
  north on the road for 3 s; the Hotel Solmar and the yellow beacon are
  in frame, 37 m ahead, at 118 km/h.
- **Title (4-title.jpg):** unchanged framing, still good.
- **Traffic AI bug:** `createCar` defaulted `laneAxis` to `'x'`, so the
  lane-pick block never ran and all traffic converged on one road. Fixed:
  default is now `null`, so each car picks the lane nearest to it.
  Covered by the new simtest lane-spread test.
- **Police crash fix preserved:** `spawnPoliceCar` in `world.js` uses the
  `playerX()` / `playerZ()` closures, never `state.playerX()` /
  `state.playerZ()` (the old form threw a TypeError the moment the first
  police car appeared).
- One flaky run produced a black 3D frame (29 KiB JPEG, HUD fine) with
  `errors=0`; a retry of the same scene rendered correctly. Treated as a
  headless-swiftshader hiccup, not a game bug.

## How to run
```sh
cd ~/workspace/makefun/gta6-01
node serve.ts --port 8080   # http://localhost:8080
```
Shot scenes: `?shot=cover|street|mission|title` (+ `&seed=N`); see
`shots.json` for the four screenshots. Screenshots are 1280x720 JPEG
≤256 KiB, saved as `screenshots/1-chase.jpg`, `2-street.jpg`,
`3-mission.jpg`, `4-title.jpg`.

## Screenshots (how they were taken)
`/opt/meta-chromium/chrome` (Hatch build) refuses every navigation to
localhost with `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`. The shots
were taken with stock Chromium from the Playwright cache
(`~/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`,
`--use-angle=swiftshader`) via the `SHOT_CHROME` env override in
`tools/shot.mjs`:
```sh
SHOT_CHROME=$HOME/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome \
  node tools/shot.mjs --url "http://localhost:8080/?shot=cover&seed=7" \
  --out screenshots/1-chase.jpg --wait 5000
```

## Before submit (parent)
1. `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`, then
   `makefun check` again — expect the gate rows to pass.
2. Write the usage rows to `~/.makefun/muse-usage-gta6-01.jsonl` (SELECT
   on muse.db, agent_id of the recorded iteration session), then stop the
   recording (kill the record PID) and seal it to get the recording ID.
3. Create the public GitHub repo, upload, and submit with `--keypair`
   (escrowed prizes must be signed). Do NOT submit yet (per
   instructions). Deadline: 24 Nov 2026 22:00 WIB.
