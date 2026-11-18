// Deterministic screenshot staging. Each scene is built from a fixed seed,
// the simulation is stepped forward with a scripted autopilot, and the
// camera SNAPS to its final position before capture (a lerping camera that
// never settles ruins every shot). No randomness outside the seeded rng.
import { CFG } from './config.js';
import { PLACES, roadCoord } from './city.js';
import { makeCar } from './vehicles.js';
import { setWanted } from './wanted.js';
import { MISSIONS } from './missions.js';

// Put a car on a road with an exact pose.
function placeCar(world, kind, x, z, heading, speed) {
  const car = makeCar(world.rng, kind, x, z, heading);
  car.speed = speed;
  if (kind === 'traffic') {
    car.axis = Math.abs(Math.sin(heading)) > 0.5 ? 'x' : 'z';
    car.dir = Math.sin(heading) > 0.5 || Math.cos(heading) > 0.5 ? 1 : -1;
    car.cruise = speed;
  }
  return car;
}

function behindCamera(car, dist, height, side = 0, lookAhead = 16) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const rx = -fz, rz = fx; // right vector
  return {
    pos: [car.x - fx * dist + rx * side, height, car.z - fz * dist + rz * side],
    look: [car.x + fx * lookAhead, 1.5, car.z + fz * lookAhead],
  };
}

export const SHOT_NAMES = ['cover', 'street', 'mission', 'title'];

// Stage the world for one scene. Returns { steps, input, cameraFor } where
// steps is how many 1/60s autopilot steps to run and cameraFor(world) gives
// the final snapped camera {pos, look}.
export function stageShot(world, name) {
  const p = world.player;
  if (name === 'cover') {
    // Chase: player car at speed up the central avenue, three cruisers
    // behind, traffic ahead on the parallel road, 3 stars on the HUD.
    const roadX = roadCoord(5); // x = 26
    const car = placeCar(world, 'player', roadX, 90, Math.PI, 38);
    car.color = 0xd9382a; // bright red so the hero car pops
    p.onFoot = false; p.car = car; p.x = car.x; p.z = car.z; p.heading = car.heading;
    world.police = [
      placeCar(world, 'police', roadX - 3.2, 100, Math.PI, 36),
      placeCar(world, 'police', roadX + 3.2, 104, Math.PI, 36),
      placeCar(world, 'police', roadX - 3.2, 112, Math.PI, 36),
    ];
    // Traffic stays clear of the player's lane so the chase never rear-ends.
    world.traffic = [
      placeCar(world, 'traffic', roadX - 52, 30, Math.PI, 12),
      placeCar(world, 'traffic', roadX - 52, -40, Math.PI, 11),
      placeCar(world, 'traffic', roadX, -90, Math.PI, 12),
    ];
    setWanted(world, 3);
    world.objective = 'Lose the cops — reach the safehouse';
    return {
      steps: 30,
      input: { throttle: 1, steer: 0 },
      fov: 74, // wider lens so the cruisers behind the player stay in frame
      cameraFor: () => behindCamera(p.car, 26, 11, -3, 16),
    };
  }

  if (name === 'street') {
    // Street level at the plaza: traffic crossing, pedestrians in frame.
    const plaza = PLACES.plaza;
    p.x = plaza.x + 4; p.z = plaza.z + 4; p.heading = Math.PI * 0.75; p.onFoot = true;
    world.camYaw = Math.PI * 0.25;
    world.traffic = [
      placeCar(world, 'traffic', plaza.x, plaza.z - 60, 0, 11),
      placeCar(world, 'traffic', plaza.x + 6.4, plaza.z - 30, 0, 12),
      placeCar(world, 'traffic', plaza.x - 6.4, plaza.z + 40, Math.PI, 11),
      placeCar(world, 'traffic', plaza.x - 60, plaza.z, Math.PI / 2, 10),
      placeCar(world, 'traffic', plaza.x + 40, plaza.z + 6.4, -Math.PI / 2, 12),
    ];
    // Cluster pedestrians near the corner.
    world.peds.forEach((ped, i) => {
      ped.x = plaza.x + ((i * 7) % 24) - 12;
      ped.z = plaza.z + ((i * 11) % 24) - 12;
      ped.state = 'stroll';
    });
    setWanted(world, 0);
    world.wanted.heat = 0;
    return {
      steps: 60,
      input: {},
      cameraFor: () => ({
        pos: [p.x + 16, 4, p.z + 12],
        look: [p.x - 10, 1.5, p.z - 4],
      }),
    };
  }

  if (name === 'mission') {
    // Driving to the Hotel Solmar: beacon on the hotel, objective distance
    // showing, car on the road at speed.
    const hotel = PLACES.hotel;
    const car = placeCar(world, 'player', hotel.x - 90, hotel.z, Math.PI / 2, 30);
    car.color = 0x2e7ad9; // bright blue so the hero car pops
    p.onFoot = false; p.car = car; p.x = car.x; p.z = car.z; p.heading = car.heading;
    world.missions.active = true;
    world.missions.index = 0;
    world.missions.step = 1;
    world.missions.timer = 0;
    world.objective = MISSIONS[0].steps[1].text;
    world.traffic = [
      placeCar(world, 'traffic', hotel.x - 140, hotel.z + 6.4, Math.PI / 2, 11),
      placeCar(world, 'traffic', hotel.x + 60, hotel.z - 6.4, -Math.PI / 2, 12),
    ];
    setWanted(world, 0);
    world.wanted.heat = 0;
    return {
      steps: 30,
      input: { throttle: 1, steer: 0 },
      cameraFor: () => behindCamera(p.car, 15, 6, -2),
    };
  }

  // title: high establishing shot over downtown, ocean behind.
  return {
    steps: 1,
    input: {},
    cameraFor: () => ({
      pos: [-140, 95, 260],
      look: [20, 10, -40],
    }),
  };
}
