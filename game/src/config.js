// Solmar Heat — tuning constants. All distances in world units, speeds in units/s.
export const CFG = {
  // City grid: 10 roads each way, 9x9 blocks.
  pitch: 52,            // distance between road centrelines
  roadHalf: 6,          // half the road width
  roads: 10,            // roads per axis (indices 0..9)
  cityMin: -234,        // roadCoord(0)
  cityMax: 234,         // roadCoord(9)
  beachZ: 240,          // sand starts here
  oceanZ: 292,          // water starts here

  // Player on foot.
  walkSpeed: 4.5,
  runSpeed: 8.5,
  playerHealth: 100,
  punchRange: 2.4,
  punchDamage: 20,
  punchCooldown: 0.45,
  shootRange: 38,
  shootDamage: 34,
  pistolAmmoStart: 24,
  pistolAmmoMax: 48,

  // Driving (arcade).
  carAccel: 22,
  carBrake: 36,
  carMaxSpeed: 42,      // ~150 km/h on the HUD scale
  carReverseMax: 11,
  steerRate: 2.1,
  carDrag: 0.35,

  // Traffic and pedestrians.
  trafficCount: 10,
  trafficSpeedMin: 9,
  trafficSpeedMax: 13,
  pedCount: 18,
  pedSpeedMin: 1.1,
  pedSpeedMax: 2.0,

  // Wanted / police.
  maxStars: 5,
  heliStars: 4,         // helicopter joins at 4 stars
  policeRamDist: 9,
  policeRamSpeed: 30,
  bustDist: 3.2,        // police this close on foot starts the bust timer
  bustTime: 1.6,
  heatDecayDelay: 6,    // seconds without crime before heat decays
  heatDecayRate: 0.25,  // stars per second once decaying

  // World clock and light.
  dayLength: 240,       // seconds for a full day cycle
  dayStart: 0.40,       // mid-afternoon: bright golden sun for screenshots
  clockStart: 17.2,     // 17:12 on the HUD clock

  // Missions.
  arriveRadius: 6,
  getawayTime: 90,
  nightRunTime: 150,
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Shortest signed angle difference, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
