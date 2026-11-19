# MARAVILLA BAY — TESTLOG (round 13)

How it was tested: headless Chrome via Playwright (chromium-1255,
swiftshader), served locally with `node serve.ts` on port 8901.
Wall-clock key holds run slowly under swiftshader, so movement figures
below come from synchronous fixed-step runs (`stepN`), which are exact.

## Playthrough (all passed, zero console errors, zero failed requests)
- Boot: title screen loads, `__maravilla` present, 24 traffic cars,
  40 pedestrians, 14 parked cars, 25 bay coins, 204 building colliders.
- New Game: mode `playing`, Mission 1 objective "Meet Tomas at the garage".
- Walk 2 sim-s: 12.0 units (walk speed 6). Sprint 2 sim-s: 20.0 units.
- Steal parked car (garage sedan): entered, drove 3 sim-s to 33 u/s
  (top speed), 65 units covered.
- Steal NPC traffic car: entered; wanted rose to 1 (witnessed by a
  pedestrian).
- Wanted chase at 4 stars: 5 police cars chasing, helicopter active,
  6 roadblock cars placed; wanted reached 5 after speeding past police.
- Mission 1 full chain: goto garage (step 0→1) → enter sedan (1→2) →
  drive to marina (2→done): missionIndex 1, cash $200→$350, respect +5.
- Combat: mission 6, 4 foes spawned, pistol shot fired, ammo 24→23.
- Garage: opens with E at the forecourt, lists upgrades, closes with
  button and with Escape.
- Pause/resume: Escape pauses, Escape resumes (fixed a bug where the
  paused loop swallowed the second Escape).
- Busted: lethal damage → busted screen, cash $1000→$900 (−10%),
  health restored, respawn at the police station, resume works.
- Save/load: saved after mission 1, reloaded the page, Continue
  restored missionIndex 1 and cash $350.
- Network-disabled run (all non-localhost requests aborted): boots,
  plays, zero errors, zero external requests.

## Determinism (seed=1, each shot rendered twice in fresh pages)
| shot | file | bytes | canvas hash match | JPEG hash match |
|---|---|---|---|---|
| cover | 1-cover.jpg | 75,850 | yes | yes |
| onfoot | 2-onfoot.jpg | 77,501 | yes | yes |
| driving | 3-driving.jpg | 89,902 | yes | yes |
| mission | 4-mission.jpg | 82,717 | yes | yes |

Canvas data-URL hashes (first 16 hex): cover 35f3d718da013d8b,
onfoot 48cdcdf9013790f7, driving 35d016ccf6e784f8,
mission cf134c40449e49bf. All ≤256 KiB, 1280×800.

## Gate limits (MAKEFUN_OUTPUT_DIR run of main.ts)
- game/: 20 files (limit 993), 745,071 bytes (limit 50,331,648)
- index.html: 7,729 bytes (limit 1,048,576)
- dossier text: 138,594 bytes (limit 163,840); cover index 0, 4 images
- Screenshots: all four ≤256 KiB (see table above)
- No `Math.random()`, `Date.now()` or `performance.now()` calls anywhere
  under game/src/ (grep-verified; only mentions are in comments).

## Bugs found and fixed during testing
1. Mission markers inside building colliders (garage, chop shop,
   rooftop tower, safehouse) could never be reached — moved to
   forecourts, avenues and the bridge deck.
2. E opened the garage even with a car at the player's elbow — car
   entry now wins over building interaction.
3. Escape did not resume from pause (paused loop swallowed it) and
   did not close the garage — both fixed.
4. Mission 1 step 1 auto-completed at spawn (player spawned on the
   marker) — spawn moved 30 units south.
5. Roadblocks stayed behind the player after they drove past —
   re-laid ahead once none is ahead of the player.
6. Helicopter flew too high to appear in the cover frame — lowered to
   16 units on a 22-unit orbit; searchlight cone shortened to match.
7. Favicon 404 — added a `data:,` icon link. Coin placement could
   land inside buildings — retries until clear (25/25 placed).
