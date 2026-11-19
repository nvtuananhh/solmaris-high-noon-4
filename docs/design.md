# MARAVILLA BAY — design doc (round 13, written fresh 2026-11-19)

## The game in one paragraph
A sun-soaked, golden-hour open-world crime game in a fictional port city.
You are Mara Voss, a getaway driver back home after three years away. Her
brother Tomas runs a struggling garage; a fixer called Ines Delgado pulls her
into an eight-job chain that ends in a heist across the old bay causeway
before the city floods it for good. Third-person on foot and in cars, a
five-star wanted system with a police helicopter and roadblocks, traffic and
pedestrians, side jobs, a garage that upgrades cars, and saves.

## City layout
- One square map, 1200 x 1200 units, centred on the origin. Avenues run on a
  100-unit grid; roads are 14 wide with 4-unit sidewalks; blocks hold 1–4
  buildings each. The bay is a water plane along the south edge (z > +520)
  with a promenade and a pier; the old causeway bridge crosses the water at
  the east side.
- Ten districts, resolved from position: Puerto Verde docks (south-west,
  warehouses + containers), Old Town (north-west, low brick + garage),
  Marina Strip (south centre, palms + boats), Mercado Quarter (centre,
  storefronts + awnings), Hillcrest (north-east, taller towers),
  Airport Flats (east, low sheds + a runway strip), Casino Row (north
  centre, neon signs), Fisherman's Wharf (south-east, shacks + pier),
  University Hill (west centre, campus blocks), South Beach (far south-east,
  pale sand + beach huts).
- Golden hour: low warm sun from the west, long shadows, warm haze fog,
  sky gradient dome, drifting clouds. A day clock advances; at dusk
  streetlights switch on and car headlights come on.

## Core loops
1. **Missions (8, chained).** Each mission is a list of steps — go to a
   marker, drive somewhere, steal a car, survive a chase, fight on a roof,
   cross the bridge. A 3D beacon + minimap blip + HUD banner always show
   the current objective. Payouts give cash and respect; respect gates the
   finale (mission 8 needs 40 respect).
2. **Wanted 1–5.** Stealing, assault, shooting and speeding past police raise
   it. Police cars chase and ram; foot police try to arrest you on foot;
   at 4–5 stars a helicopter with a searchlight tracks you from above; at
   3+ stars roadblocks of police cars sit across the avenues ahead. Wanted
   decays while you stay out of sight, or you can pay it off at the
   safehouse. Getting arrested (or dropping to 0 health) is a busted screen:
   lose 10% of your cash, respawn at the police station.
3. **Side work.** Taxi fares (pick up a waving pedestrian, drive to the
   marker), three checkpoint street races, corner-store robberies (hold E,
   grab the cash, beat the escape timer), 25 hidden bay coins, car
   deliveries. All pay cash and a little respect.
4. **Garage.** Tomas's garage repairs, repaints, and sells engine, brake
   and nitro upgrades for cash. Cars you park there are kept as owned cars
   you can pick from later.

## Controls
- On foot: WASD move, mouse drag orbits the camera, Shift sprint,
  Space jump, E interact / enter car, F punch, R or right-click fire when
  armed, C crouch, H honk (in car), R cycles radio (in car).
- Driving: W/S accelerate and brake, A/D steer, Space handbrake,
  Shift nitro when upgraded.
- Esc pauses (resume, settings, save/load, quit to title). Settings:
  volume, mouse sensitivity, graphics quality.

## Systems and files (game/src/, one file per system)
- `config.js` — tuning numbers, district table, palette, mission data.
- `random.js` — mulberry32 seeded RNG; the only source of randomness.
- `input.js` — keyboard + mouse state, orbit drag.
- `audio.js` — WebAudio synth only: engine hum, sirens, gunshots,
  footsteps, chimes, three radio stations (synth loops).
- `city.js` — streets, blocks, buildings, palms, streetlights, pier,
  marina, signs, district lookup, building collision boxes.
- `vehicles.js` — car factory (box-built cars, wheels, colours), arcade
  driving physics, damage smoke, headlights.
- `traffic.js` — traffic cars on lanes with braking and lane changes.
- `pedestrians.js` — sidewalk walkers who scatter, cross at crossings,
  taxi customers.
- `police.js` — police cars (chase + ram + PIT), foot police (arrest),
  helicopter (searchlight), roadblocks, wanted logic.
- `missions.js` — the 8-mission chain plus side jobs, objectives, payouts.
- `combat.js` — melee, pistol/SMG hitscan, enemies, health packs, ammo.
- `hud.js` — DOM HUD: health, cash, respect, stars, clock, objective
  banner, speedometer, ammo, messages.
- `minimap.js` — rotating 2D canvas minimap with blips.
- `save.js` — localStorage save/load of progress, cash, cars, position.
- `render.js` — renderer, sky dome, sun, fog, camera rig.
- `world.js` — world state machine (title / playing / paused / busted),
  on-foot controller, entering and stealing cars, day cycle.
- `shots.js` — deterministic `?shot=` staging: fixed camera, fixed
  time-of-day, fixed sim steps per shot.
- `main.js` — boots everything, fixed-timestep loop, shot mode handling.

## Determinism
- Every random choice in gameplay, traffic, pedestrians, spawns and shot
  staging comes from the seeded RNG (seed from `?seed=`, default 1).
  No `Math.random()`, no `Date.now()` / `performance.now()` in any of those
  paths. Simulation runs on a fixed 1/60 s timestep. Shot modes run a
  fixed number of steps, then render once. Two runs with the same seed
  produce byte-identical screenshots (verified by hashing two renders).
- No network at run: everything is a file under `game/` or a `data:` URI.

## Screenshot staging (?shot=<mode>&seed=1)
1. `1-cover.jpg` — police chase: 4 stars, helicopter overhead, roadblock
   ahead, traffic around, minimap + objective banner visible.
2. `2-onfoot.jpg` — Mara on foot in Mercado Quarter, pedestrians,
   storefronts, awnings, HUD.
3. `3-driving.jpg` — driving down Marina Strip at dusk, traffic,
   skyline, minimap.
4. `4-mission.jpg` — mission 6 rooftop combat: enemies, muzzle flash,
   objective marker.

## Testing
Headless Chrome (Playwright chromium-1255): walk, steal a parked car,
steal an NPC car, drive, trigger a 4-star chase (helicopter visible),
start and complete mission 1, save + load, pause + resume. Zero console
errors, zero failed requests, and a network-disabled run. Every shot
rendered twice with seed=1 and hash-compared. Gate limits checked by
running main.ts locally with MAKEFUN_OUTPUT_DIR set.
