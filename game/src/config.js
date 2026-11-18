// Solmar Heat: tuning constants for the whole game. One place, one job: every
// number the simulation, the city and the HUD agree on lives here.
// (v2, 18 Nov 2026) No tuning changes: the chase reads well at these speeds.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-heat-save-v1';

// City layout: a grid of square blocks separated by roads.
export const BLOCK = 40; // building block side, metres
export const ROAD = 12; // road width, metres
export const PITCH = BLOCK + ROAD; // block + road
export const GRID = 9; // blocks across (and down)
export const CITY_HALF = (GRID * PITCH) / 2; // city edge from centre
export const BEACH_Z = CITY_HALF + 26; // ocean starts here (south edge)

// Player on foot.
export const WALK_SPEED = 5.2;
export const RUN_SPEED = 8.5;
export const PLAYER_RADIUS = 0.55;
export const PLAYER_HEALTH = 100;

// Cars.
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 1.9;
export const CAR_ACCEL = 14;
export const CAR_BRAKE = 26;
export const CAR_REVERSE = 9;
export const CAR_MAX_SPEED = 38;
export const SPORT_MAX_SPEED = 48;
export const CAR_STEER = 0.55;
export const CAR_HEALTH = 100;

// Traffic and pedestrians.
export const TRAFFIC_COUNT = 10;
export const PED_COUNT = 18;
export const TRAFFIC_SPEED = 9;

// Wanted level.
export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 25;
export const POLICE_RAM_RANGE = 3.2;

// Missions pay out in dollars.
export const MISSION_REWARDS = [500, 1200, 2000];
