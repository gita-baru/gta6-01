// Solmar Heat configuration: every tunable number lives here so the world, the
// physics, the missions and the HUD all agree on one set of facts.

export const CITY = {
  // Streets run every STREET_STEP units; there are STREET_COUNT streets per axis.
  STREET_STEP: 50,
  STREET_COUNT: 10,
  STREET_FIRST: -225,
  ROAD_HALF: 5, // half width of the drivable asphalt
  BLOCK: 40, // block size between neighbouring streets
  // South of this z the sand starts; the ocean starts past SAND_END.
  BEACH_START: 252,
  SAND_END: 296,
  WORLD_HALF: 350,
};

export const WORLD = {
  SEED: 20261118,
  TRAFFIC_CARS: 10,
  PEDESTRIANS: 18,
  MAX_POLICE: 6,
  // Player starts on foot in the central plaza.
  PLAYER_START: { x: 0, z: 25 },
};

export const PLAYER = {
  WALK_SPEED: 5.2,
  RUN_SPEED: 9.4,
  RADIUS: 0.8,
  MAX_HEALTH: 100,
  START_MONEY: 250,
  START_AMMO: 24,
  PUNCH_RANGE: 2.4,
  PUNCH_DAMAGE: 12,
  PUNCH_COOLDOWN: 0.45,
  SHOT_DAMAGE: 34,
  SHOT_RANGE: 60,
  SHOT_COOLDOWN: 0.28,
};

export const CAR = {
  ACCEL: 15,
  BRAKE: 26,
  REVERSE_ACCEL: 9,
  MAX_SPEED: 38, // ~137 km/h at the HUD's 3.6 factor
  MAX_REVERSE: 10,
  STEER_MAX: 0.55, // radians of front-wheel angle
  STEER_SPEED: 2.4,
  GRIP: 7.5, // lateral velocity damping, 1/s
  DRIFT_GRIP: 2.2, // grip while the handbrake is held
  LENGTH: 4.4,
  WIDTH: 2.0,
  RADIUS: 2.4, // collision circle
  TRAFFIC_SPEED: 9,
  TRAFFIC_MAX: 12,
  RAM_DAMAGE: 14,
};

export const WANTED = {
  MAX: 5,
  DECAY_SECONDS: 20, // one star fades after this long with no crime and no police near
  DECAY_POLICE_RANGE: 60,
  BUSTED_RANGE: 3.2, // police this close on foot, held, means busted
  BUSTED_HOLD: 2.5,
  POLICE_PER_STAR: [0, 2, 3, 4, 5, 6],
  HELI_STARS: 4,
  CRIME: {
    STEAL_CAR: 1,
    PUNCH_PED: 1,
    SHOOT: 1,
    KILL: 2,
  },
};

// The five story missions from fixer Lena Voss. Each stage is a beacon the player
// must reach (on foot or in a car) or a condition to survive.
export const MISSIONS = [
  {
    id: 'pickup',
    name: 'First Pickup',
    reward: 500,
    intro: 'Lena Voss: pick up the package at the docks and bring it back to me.',
    stages: [
      { type: 'goto', label: 'Pick up the package', x: -175, z: 225, radius: 5 },
      { type: 'goto', label: 'Bring it back to Lena', x: 25, z: 25, radius: 5 },
    ],
  },
  {
    id: 'hotwheels',
    name: 'Hot Wheels',
    reward: 1200,
    intro: 'Lena Voss: a gold Comet is parked by the plaza. Steal it, bring it to my garage.',
    stages: [
      { type: 'steal', label: 'Steal the gold Comet', x: -25, z: -25, radius: 6, carColor: 0xd4a017 },
      { type: 'deliver', label: 'Deliver it to the garage', x: 175, z: -175, radius: 6 },
    ],
  },
  {
    id: 'getaway',
    name: 'The Getaway',
    reward: 2000,
    intro: 'Lena Voss: the cops are on you. Lose them and reach the hideout.',
    wanted: 2,
    stages: [
      { type: 'goto', label: 'Reach the hideout', x: -225, z: -225, radius: 6, timeLimit: 90 },
    ],
  },
  {
    id: 'nightrun',
    name: 'Night Run',
    reward: 1500,
    intro: 'Lena Voss: three checkpoints, one night, no excuses. Go.',
    night: true,
    stages: [
      { type: 'goto', label: 'Checkpoint 1 of 3', x: 225, z: 175, radius: 6, timeLimit: 75 },
      { type: 'goto', label: 'Checkpoint 2 of 3', x: -225, z: 175, radius: 6 },
      { type: 'goto', label: 'Checkpoint 3 of 3', x: 225, z: -225, radius: 6 },
    ],
  },
  {
    id: 'heatwave',
    name: 'Heat Wave',
    reward: 3000,
    intro: 'Lena Voss: five stars, whole city hunting you. Survive, then vanish.',
    wanted: 5,
    stages: [
      { type: 'survive', label: 'Survive the heat', seconds: 60 },
      { type: 'goto', label: 'Slip away to the hideout', x: 0, z: 225, radius: 6 },
    ],
  },
];

// In-game clock: one full day every DAY_SECONDS of play; the game opens at 17:20 so
// the cover shot catches the sunset.
export const DAY = {
  DAY_SECONDS: 300,
  START_HOUR: 17.33,
};

export const RADIO = [
  { name: 'SOLMAR FM', desc: 'Sunset synthwave' },
  { name: 'HEAT 98', desc: 'Funk & bass' },
  { name: 'PALM TALK', desc: 'Late-night pads' },
];

// Palette: sun-soaked pastel city, warm asphalt, teal ocean.
export const PALETTE = {
  ASPHALT: 0x3a3f4a,
  SIDEWALK: 0xb8b0a0,
  BLOCK_GROUND: 0x8fae7a,
  PLAZA: 0xcbb98f,
  SAND: 0xe3cf9e,
  OCEAN: 0x1e6f8e,
  BUILDING: [0xe8dcc8, 0xd9c4a5, 0xc9b8d8, 0xa8c8d8, 0xe0a878, 0xf0e0c0, 0xb8d0b0, 0xd8a0a0],
  GLASS: 0x2a4a5a,
  CAR_COLORS: [0xc03030, 0x3060c0, 0xe0e0e0, 0x222222, 0x408040, 0xd0a020, 0x8030a0, 0x808080],
  POLICE_BODY: 0x1a1a22,
  POLICE_DOOR: 0xf0f0f0,
  TAXI: 0xe8c020,
};
