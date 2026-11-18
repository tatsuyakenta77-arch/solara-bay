# Solara Bay

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/tatsuyakenta77-arch/solara-bay/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/tatsuyakenta77-arch/solara-bay/reward.svg)](https://make.fun/c/gta6-01)

An original open-world crime game in the browser. You are new in **Solara Bay**, a sun-soaked
coastal city — broke, unknown, and ready to take the whole town. Work for Rico and Mara through
five story missions, steal cars, outrun the police, and pull off the big score.

## What is in the game

- **A walkable, drivable city** — a procedural grid of streets, sidewalks, varied buildings,
  a beach and pier, a park with a pond, palms and streetlights, with day-to-sunset lighting
  and shadows. Third-person camera, on foot (WASD + mouse orbit, Shift sprint, Space jump)
  and behind the wheel (WASD/arrows, Space handbrake).
- **Traffic and pedestrians** — AI cars that follow the road grid in lanes, slow for the car
  ahead and turn at junctions; pedestrians who stroll the sidewalks and flee from gunfire
  and crashes.
- **Car stealing and a wanted system** — press E near any car to take it (an occupied car
  sends its driver running and earns a star). Wanted runs 0–5 stars: police cruisers chase
  and ram, foot officers run you down and make arrests, and the heat cools off when you hide.
- **Five story missions** — First Wheels, Courier Run, Hot Pursuit, Warehouse Deal and
  The Big Score — with on-screen objectives, a waypoint beacon, timers and payouts, plus
  mission select from the title screen.
- **Combat** — fists and a pistol (mouse aim, click to shoot, R reload, 1/2 to switch),
  gunmen who shoot back, health / armor / ammo pickups, and respawning at the hospital
  with a bill when you go down.
- **HUD with a live minimap** — health and armor, money, wanted stars, weapon and ammo,
  speed while driving, the mission objective, the in-game clock, and a canvas minimap
  showing streets, the player arrow, cars, police blips and the mission waypoint.
- **Polish** — fully synthesized WebAudio sound (engine, sirens, gunshots, pickups and a
  synth music loop, M to mute), dust / exhaust / smoke / spark particles, screen shake,
  title / pause / mission-complete / game-over menus, settings (volume, sensitivity),
  and save/load through localStorage.

Everything is original: the city, characters, vehicles, names, story, art (procedural
Three.js geometry) and sounds (synthesized WebAudio). No assets from any commercial game.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network
requests at runtime — the game is plain static files under `game/`, with Three.js
vendored at `game/vendor/three.module.min.js`.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Sprint |
| Space | Jump (on foot) / handbrake (driving) |
| E | Steal / enter / exit a car |
| Click | Shoot / punch |
| 1 / 2 | Fists / pistol |
| R | Reload |
| C | Horn |
| Enter | Start the next mission |
| M | Mute |
| Esc | Pause |

## Built with

- [Three.js](https://threejs.org/) (vendored, MIT) for the 3D city
- WebAudio for all sound and music — no audio files
- No other dependencies

## License

MIT — see [LICENSE](LICENSE).

---

Built for [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) — enter the gta6-01 competition and build your own open-world crime game.
