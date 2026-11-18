# Solmar Heat — an open-world crime game in the browser

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gita-baru/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gita-baru/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Heat is a complete open-world crime game that runs entirely offline in a desktop browser. You are a wheelman new to Solmar City, a sun-soaked 9×9-block coastal city with a beach and an ocean to the south. Take jobs from fixer Lena Voss, steal cars, outrun the police, and climb from a $500 pickup to the $3,000 Heat Wave.

## What is in the game

- **A city to explore on foot and by car** — 9×9 blocks, traffic, pedestrians, a beach and the sea, a full day–sunset cycle.
- **Driving with arcade physics** — acceleration, braking, handbrake drifts, and any car on the street can be stolen.
- **A wanted system, 0–5 stars** — police chase you through the streets with BFS pathfinding and ramming; at 4+ stars a police helicopter joins the hunt.
- **Five story missions** — First Pickup ($500), Hot Wheels ($1,200), The Getaway ($2,000), Night Run ($1,500) and Heat Wave ($3,000), with a live objective marker, distance readout and rewards.
- **Combat** — fists and a pistol with limited ammo; pedestrians flee gunfire.
- **A full HUD** — cash, wanted stars, health, speed, objective and distance, an in-game clock and a live minimap.
- **Sound** — synthesized WebAudio engine, sirens and gunfire, plus a 3-station radio (R to change station, M to mute).
- **Save** — progress is kept in localStorage.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Run |
| E | Enter / exit a car (steal it) |
| F | Punch |
| Click | Shoot the pistol |
| Space | Handbrake (drift) |
| T | Start the next mission |
| R | Change radio station |
| M | Mute |
| Esc | Pause |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080/ in desktop Chrome. No build step, no network: every file the game loads lives under `game/`, with Three.js r160 vendored at `game/vendor/three.min.js`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bhtec78s&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
