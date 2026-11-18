// Solmar Heat — tuning, city layout and mission data (one place, no logic).
export const SAVE_KEY = "solmar-heat-save-v1";

// City: 9x9 blocks. Streets run every PITCH units; blocks sit between them.
export const PITCH = 52;
export const ROAD_W = 12;
export const BLOCK = 40;
export const BOUND = 240; // city edge (x and z, north/west/south edge of roads)
export const BEACH_Z = 244; // sand starts here (south)
export const SAND_END = 288;
export const OCEAN_END = 720;

export const STREETS = [];
for (let i = 0; i < 10; i++) STREETS.push(-234 + i * PITCH);

export const BUILDING_COLORS = [
  0xd8c9a3, 0xc9b18c, 0xb7a6a0, 0x9fb4c7, 0xc7a27a,
  0xa8b89a, 0xd0b49a, 0x8fa3b8, 0xc4aead, 0xb5c0a8,
];
export const CAR_COLORS = [
  0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x1e8449,
  0xe67e22, 0x95a5a6, 0x2c3e50, 0xca6f1e, 0x6c3483,
];

// Player / car tuning (units are metres, speeds m/s).
export const TUNE = {
  walkSpeed: 6,
  runSpeed: 10,
  carAccel: 24,
  carBrake: 34,
  carReverse: 12,
  carMaxSpeed: 46, // ~165 km/h on the HUD
  carDrag: 0.55,
  steerRate: 2.1,
  handbrakeGrip: 0.35,
  trafficSpeed: 11,
  policeSpeed: 50,
  pedWalk: 1.6,
  pedFlee: 5,
  punchRange: 2.4,
  punchArc: 1.1,
  gunRange: 46,
  gunCone: 0.14,
  gunDamage: 34,
  policeRamDamage: 9,
  playerMaxHealth: 100,
  startAmmo: 24,
  wantedDecay: 0.05, // stars per second while quiet
  maxDrawdown: 0.25,
};

// Five story jobs from fixer Lena Voss. Steps run in order; each step names
// what the player must do and where. Rewards are paid on completion.
export const MISSIONS = [
  {
    id: "pickup",
    name: "First Pickup",
    reward: 500,
    briefing: "Lena Voss: grab the package by the marina and bring it to my garage. No trouble, no noise.",
    steps: [
      { type: "goto", x: 130, z: 208, radius: 6, text: "Pick up the package at the marina" },
      { type: "goto", x: -130, z: -130, radius: 6, text: "Deliver the package to Lena's garage" },
    ],
  },
  {
    id: "hotwheels",
    name: "Hot Wheels",
    reward: 1200,
    briefing: "Lena Voss: a yellow Comet is parked by the plaza. Take it. Don't ask whose it is.",
    steps: [
      { type: "steal", x: 26, z: 26, radius: 8, text: "Steal the yellow Comet by the plaza" },
      { type: "goto", x: -130, z: -130, radius: 6, text: "Deliver the Comet to Lena's garage" },
    ],
  },
  {
    id: "getaway",
    name: "The Getaway",
    reward: 2000,
    briefing: "Lena Voss: the cops are already on you. Lose them and reach the north docks in 90 seconds.",
    steps: [
      { type: "timed", x: -182, z: -182, radius: 8, time: 90, wanted: 3, text: "Reach the north docks before time runs out" },
    ],
  },
  {
    id: "nightrun",
    name: "Night Run",
    reward: 1500,
    briefing: "Lena Voss: night work pays better. Two drops, no headlights, no witnesses.",
    steps: [
      { type: "goto", x: 182, z: -78, radius: 6, text: "First drop: the east apartments" },
      { type: "goto", x: -182, z: 130, radius: 6, text: "Second drop: the west motel" },
    ],
  },
  {
    id: "heatwave",
    name: "Heat Wave",
    reward: 3000,
    briefing: "Lena Voss: five stars, one minute, whole city hunting you. Survive it, then vanish at the safehouse.",
    steps: [
      { type: "survive", time: 60, wanted: 5, text: "Survive five stars for 60 seconds" },
      { type: "goto", x: 78, z: -208, radius: 6, text: "Reach the safehouse and disappear" },
    ],
  },
];

export const RADIO_STATIONS = ["SOLMAR FM", "BASSLINE 98", "COAST 107"];
