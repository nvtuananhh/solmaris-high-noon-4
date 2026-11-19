// MARAVILLA BAY — tuning, districts, palette and mission data.
// Every number the game balances on lives here so a tweak is one edit.

export const CFG = {
  seedDefault: 1,
  step: 1 / 60, // fixed simulation timestep, seconds
  worldHalf: 600, // map runs -600..600 on x and z
  blockPitch: 100, // avenue spacing
  roadHalf: 7, // half-width of a road
  walkHalf: 11, // road + sidewalk half-width
  waterZ: 520, // bay starts at this z
  gravity: 22,

  player: {
    walkSpeed: 6,
    sprintSpeed: 10,
    crouchSpeed: 3,
    jumpSpeed: 8,
    radius: 0.55,
    maxHealth: 100,
    punchDamage: 25,
    punchRange: 2.2,
    punchCooldown: 0.45,
  },

  car: {
    accel: 22,
    brake: 34,
    reverseAccel: 12,
    maxSpeed: 38,
    maxReverse: 10,
    steer: 1.9,
    grip: 6,
    handbrakeGrip: 2.2,
    nitroBoost: 16,
    nitroDrain: 0.5,
    enterRadius: 3.2,
  },

  trafficCount: 24,
  pedCount: 40,
  policeMaxCars: 6,

  wanted: {
    decayHiddenSeconds: 9,
    payoffCost: 250,
    bustedCashLoss: 0.1,
    stealParked: 0, // stealing a parked car unseen is quiet
    stealNpc: 1,
    assault: 1,
    shooting: 2,
    speedPastPolice: 1,
  },

  respectForFinale: 40,
  coinCount: 25,
};

// Ten named districts. `test(x, z)` decides which district a point is in;
// the first matching rule wins, so order matters (water and beach first).
export const DISTRICTS = [
  { name: 'The Bay', test: (x, z) => z > 520, color: 0x2e6f8e },
  { name: 'South Beach', test: (x, z) => z > 430 && x > 250, color: 0xe8d9a8 },
  { name: 'Fisherman\'s Wharf', test: (x, z) => z > 430 && x <= 250, color: 0x9a7b52 },
  { name: 'Marina Strip', test: (x, z) => z > 300, color: 0x3f8f7a },
  { name: 'Puerto Verde', test: (x, z) => x < -300 && z > 0, color: 0x7a6a55 },
  { name: 'Casino Row', test: (x, z) => z < -300 && x > -100 && x < 200, color: 0x8e3f6d },
  { name: 'Hillcrest', test: (x, z) => x > 300 && z < -100, color: 0x5a6d8e },
  { name: 'Airport Flats', test: (x, z) => x > 300, color: 0x8e8a7a },
  { name: 'University Hill', test: (x, z) => x < -300, color: 0x6d8e4a },
  { name: 'Old Town', test: (x, z) => z < -300 && x < -100, color: 0xa8763e },
  { name: 'Mercado Quarter', test: () => true, color: 0xc9a24a },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d;
  return DISTRICTS[DISTRICTS.length - 1];
}

// Invented shop names for storefront signs (all original).
export const SHOP_NAMES = [
  'Café Brisa', 'Tacos El Faro', 'La Luna Books', 'Pesca Fresca', 'Neon Nails',
  'Taller Ruiz', 'Pan Dulce', 'Surf & Sun', 'El Mercado', 'Bodega Sol',
  'Cine Mar', 'Flores Ana', 'Bar La Ola', 'Kiosko Bay', 'Zapateria Luz',
  'Dulce Vida', 'Farmacia Sol', 'Pescado Rey', 'Tienda Verde', 'Café Amanecer',
];

// Car models: distinct speed / handling / colour so cars feel different.
export const CAR_MODELS = [
  { name: 'Brisa Sedan', top: 34, accel: 20, steer: 1.7, colors: [0x3f6fb5, 0x8a8f96, 0xb5b0a6] },
  { name: 'Sol Coupe', top: 42, accel: 26, steer: 2.1, colors: [0xc23b2e, 0xe8c832, 0x22242a] },
  { name: 'Faro Van', top: 28, accel: 15, steer: 1.4, colors: [0xe8e4da, 0x4a7a5a, 0x7a6a8e] },
  { name: 'Ola Pickup', top: 36, accel: 21, steer: 1.8, colors: [0x2e6f8e, 0xb5651d, 0x5a5a5a] },
  { name: 'Vela Sport', top: 48, accel: 30, steer: 2.4, colors: [0xd8d832, 0x18a058, 0x111111] },
];

// The 8-mission chain. A step is one objective; `kind` tells the engine
// what counts as done. Positions are world coordinates.
export const MISSIONS = [
  {
    id: 1, name: 'Homecoming', briefing: 'Meet Tomas at the garage, then drive the sedan down to the marina.',
    steps: [
      { kind: 'goto', label: 'Meet Tomas at the garage', x: -350, z: -328, r: 6 },
      { kind: 'enter-car', label: 'Get in the sedan', x: -350, z: -330, r: 8 },
      { kind: 'drive-to', label: 'Drive to the marina', x: 0, z: 460, r: 10 },
    ],
    payout: 150, respect: 5,
  },
  {
    id: 2, name: 'Borrowed Wheels', briefing: 'Lift a parked car and deliver it to the chop shop. Lose the tail.',
    steps: [
      { kind: 'steal-parked', label: 'Steal a parked car', x: -103, z: -150, r: 12 },
      { kind: 'drive-to', label: 'Deliver it to the chop shop', x: -420, z: 205, r: 10, wanted: 1 },
    ],
    payout: 300, respect: 5,
  },
  {
    id: 3, name: 'The Marina Job', briefing: 'Pick up the package under the pier, then lose the foot pursuit through the Mercado.',
    steps: [
      { kind: 'goto', label: 'Pick up the package under the pier', x: 60, z: 500, r: 6 },
      { kind: 'goto', label: 'Cut through Mercado Quarter on foot', x: 0, z: 50, r: 8, wanted: 2 },
      { kind: 'drive-to', label: 'Escape by car to the wharf', x: 400, z: 460, r: 10 },
    ],
    payout: 450, respect: 8,
  },
  {
    id: 4, name: 'Hot Plates', briefing: 'Swap the plates at the garage while a patrol circles. Stay out of sight.',
    steps: [
      { kind: 'goto', label: 'Reach the garage on foot', x: -350, z: -328, r: 6 },
      { kind: 'wait-hidden', label: 'Swap the plates — stay hidden (8s)', x: -350, z: -328, r: 6, hold: 8 },
      { kind: 'goto', label: 'Slip away to the market', x: -50, z: -50, r: 8 },
    ],
    payout: 400, respect: 6,
  },
  {
    id: 5, name: 'Casino Row', briefing: 'Getaway drive through Casino Row. Three stars, roadblocks on the avenues.',
    steps: [
      { kind: 'enter-car', label: 'Get in the getaway car', x: 50, z: -403, r: 8 },
      { kind: 'drive-to', label: 'Outrun the chase to Hillcrest', x: 400, z: -250, r: 12, wanted: 3 },
      { kind: 'lose-wanted', label: 'Lose the wanted level', x: 400, z: -250, r: 20 },
    ],
    payout: 700, respect: 10,
  },
  {
    id: 6, name: 'The Informant', briefing: 'A witness is hiding on a rooftop in Hillcrest. Rival crew is coming up the stairs.',
    steps: [
      { kind: 'goto', label: 'Climb to the rooftop', x: 350, z: -120, r: 6 },
      { kind: 'combat', label: 'Protect the witness — stop the crew (4)', x: 350, z: -120, r: 16, foes: 4 },
      { kind: 'goto', label: 'Walk the witness to safety', x: 250, z: -50, r: 8 },
    ],
    payout: 900, respect: 12,
  },
  {
    id: 7, name: 'Air One', briefing: 'Four stars and a helicopter over the docks. Lose it in the warehouse tunnels.',
    steps: [
      { kind: 'enter-car', label: 'Take the dock car', x: -403, z: 250, r: 8 },
      { kind: 'drive-to', label: 'Reach the dock tunnels with the helicopter on you', x: -400, z: 420, r: 12, wanted: 4 },
      { kind: 'lose-wanted', label: 'Break the helicopter\'s line of sight', x: -400, z: 420, r: 20 },
    ],
    payout: 1200, respect: 12,
  },
  {
    id: 8, name: 'The Last Causeway', briefing: 'The final job: five stars, helicopter and roadblocks. Drive the score across the causeway.',
    steps: [
      { kind: 'enter-car', label: 'Take the score car', x: -250, z: 200, r: 8 },
      { kind: 'drive-to', label: 'Cross the causeway bridge', x: 450, z: 560, r: 14, wanted: 5 },
      { kind: 'drive-to', label: 'Bring the score home to the garage', x: -350, z: -328, r: 12 },
    ],
    payout: 5000, respect: 25, needsRespect: 40,
  },
];

// Side jobs.
export const SIDE_JOBS = {
  taxiFare: 60,
  racePayout: 250,
  robberyTake: 220,
  coinValue: 25,
  deliveryPayout: 180,
};

export const GARAGE_POS = { x: -350, z: -328 }; // forecourt, in front of the garage doors
export const SAFEHOUSE_POS = { x: -250, z: -428 }; // forecourt, south of the safehouse
export const CHOP_SHOP_POS = { x: -420, z: 205 }; // yard, south of the chop shop
export const POLICE_STATION_POS = { x: 150, z: -450 };

export const UPGRADES = [
  { id: 'engine', name: 'Engine tune', cost: 400, desc: '+top speed, +acceleration' },
  { id: 'brakes', name: 'Race brakes', cost: 250, desc: 'Shorter stopping, better grip' },
  { id: 'nitro', name: 'Nitro kit', cost: 500, desc: 'Shift for a nitro boost' },
  { id: 'armor', name: 'Armour plating', cost: 350, desc: 'Car takes less damage' },
  { id: 'paint', name: 'Repaint', cost: 100, desc: 'Fresh coat, any colour' },
];
