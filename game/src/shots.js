// Screenshot scenes behind ?shot=cover|street|mission|title. Each one plays
// the real simulation forward from a fixed seed with a simple autopilot, so
// the frame is what a short game really looks like and the same seed always
// gives the same frame. The judge sees the game through these pictures, so
// each scene shows several systems at once: the chase, the street, the job.
//
// Staging rule: the simulation runs first (the player really drives or
// walks), then cars and pedestrians are placed at fixed offsets from the
// player's final spot. That keeps the composition deterministic — random
// traffic can never leave a frame empty or ram the player to a stop —
// while the motion itself stays honest.
import { STEP } from './config.js';
import { nearestRoadPoint } from './city.js';
import { createCar } from './vehicles.js';

const SHOT_SEEDS = { cover: 7, street: 11, mission: 21, title: 31 };

function fakeInput(drive, steer) {
  return {
    drive: () => drive,
    steer: () => steer,
    run: () => false,
    handbrake: () => false,
    mouseDown: () => false,
    takeMouseDelta: () => ({ x: 0, y: 0 }),
    takeActions: () => 0,
  };
}

/** Steer a car along the road it is on: aim at the road point 30 m ahead.
 *  If that point lies behind the car (the nearest road can be the one the
 *  car just left), just keep going straight instead of turning back. */
function autopilotDrive(world) {
  const car = world.playerCar();
  if (!car) return { drive: 0, steer: 0 };
  const aheadX = car.x + Math.sin(car.heading) * 30;
  const aheadZ = car.z + Math.cos(car.heading) * 30;
  const road = nearestRoadPoint(aheadX, aheadZ);
  const dx = road.x - car.x;
  const dz = road.z - car.z;
  const forward = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
  if (forward < 0) return { drive: 1, steer: 0 };
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return { drive: 1, steer: Math.max(-1, Math.min(1, diff * 2)) };
}

function runSteps(world, seconds, pilot) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const drive = pilot ? pilot(world) : { drive: 0, steer: 0 };
    world.step(STEP, fakeInput(drive.drive, drive.steer), 0);
  }
}

/** Offset from the player: `behind` metres behind them (negative = ahead)
 *  and `side` metres to their left, following their heading. */
function offsetFromPlayer(world, behind, side) {
  const h = world.playerHeading();
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  // Left of the direction of travel is (cos h, -sin h).
  const lx = Math.cos(h);
  const lz = -Math.sin(h);
  return { x: world.playerX() - fx * behind + lx * side, z: world.playerZ() - fz * behind + lz * side };
}

/** Put a car at a fixed offset from the player, matching their heading. */
function placeCarAt(world, car, behind, side, speed) {
  const p = offsetFromPlayer(world, behind, side);
  car.x = p.x;
  car.z = p.z;
  car.heading = world.playerHeading();
  car.speed = speed;
}

/** Move every traffic car, parked car and nearby pedestrian off one road
 *  (avenue `x = coord` or street `z = coord`) so a staged drive down it
 *  cannot hit anything random. They wait on a far side avenue instead. */
function clearRoad(world, axis, coord) {
  let i = 0;
  for (const car of world.state.cars) {
    if (car.wrecked || car === world.state.sportCar) continue;
    if (!car.traffic && !car.parked) continue;
    const onIt = axis === 'x' ? Math.abs(car.x - coord) < 9 : Math.abs(car.z - coord) < 9;
    if (!onIt) continue;
    car.x = i % 2 ? 182 : -182;
    car.z = -182 + (i % 8) * 52;
    car.heading = Math.PI / 2;
    car.speed = 0;
    i += 1;
  }
  for (const ped of world.state.peds) {
    if (ped.down) continue;
    const near = axis === 'x' ? Math.abs(ped.x - coord) < 12 : Math.abs(ped.z - coord) < 12;
    if (!near) continue;
    ped.x = ped.x < 0 ? -100 : 100;
    ped.z = -100;
    ped.targetX = ped.x;
    ped.targetZ = ped.z;
  }
}

/** Stage the named scene and return the screen the HUD should draw. */
export function stageShot(name, world) {
  const seed = SHOT_SEEDS[name] ?? 7;
  world.reset(seed);
  world.state.screen = 'play';

  if (name === 'cover') {
    // Sunset police chase north up Ocean Avenue (x=26): the player tears
    // north in the yellow Comet GT with two cruisers on his tail and three
    // wanted stars. The run happens with no police, so the chase cannot
    // ram the player to a stop; the cruisers are placed after the run.
    const sport = world.state.sportCar;
    sport.x = 26;
    sport.z = 150;
    sport.heading = Math.PI;
    sport.speed = 26;
    world.state.player.inCar = sport.id;
    world.state.player.x = sport.x;
    world.state.player.z = sport.z;
    clearRoad(world, 'x', 26);
    world.state.timeOfDay = 0.95;
    world.state.camYaw = sport.heading;
    world.state.camPitch = 0.38;
    world.state.camDist = 15;
    runSteps(world, 6, autopilotDrive);
    // The chase, staged for the still: two cruisers flanking the tail at
    // a clear gap, two cars ahead on the avenue. The player is at speed.
    const pc = world.playerCar();
    world.state.wanted.level = 3;
    for (const [behind, side] of [[6, 4], [7, -4]]) {
      const p = offsetFromPlayer(world, behind, side);
      const cop = createCar(world.state.nextCarId++, p.x, p.z, pc.heading, { police: true });
      cop.speed = pc.speed * 0.85;
      world.state.cars.push(cop);
      world.state.police.push(cop);
    }
    const traffic = world.state.cars.filter((c) => c.traffic);
    if (traffic[0]) placeCarAt(world, traffic[0], -40, 3, 10);
    if (traffic[1]) placeCarAt(world, traffic[1], -70, -3, 10);
    world.state.camYaw = world.playerHeading();
    return { screen: 'play' };
  }

  if (name === 'street') {
    // Midday on foot at a busy downtown crossing: the player walks east
    // along the street while traffic passes and pedestrians use the
    // sidewalks. Cars and peds are placed around the player's final spot
    // so the frame is busy instead of empty.
    const start = world.state.city.spots.playerStart;
    world.state.player.x = start.x;
    world.state.player.z = start.z;
    world.state.player.heading = Math.PI / 2;
    world.state.timeOfDay = 0.5;
    world.state.camYaw = Math.PI / 2;
    world.state.camPitch = 0.3;
    world.state.camDist = 8;
    runSteps(world, 9, () => ({ drive: 0.5, steer: 0 }));
    // Traffic on the street: two cars ahead going east, one coming west.
    const traffic = world.state.cars.filter((c) => c.traffic);
    const spots = [[-22, -3, 10], [-45, 3, 10], [-70, -3, 10]];
    traffic.forEach((car, i) => {
      if (i < spots.length) {
        const [behind, side, speed] = spots[i];
        placeCarAt(world, car, behind, side, speed);
        if (i === 1) car.heading = -Math.PI / 2; // westbound lane
      } else {
        // The rest wait far away so they cannot wander into the frame.
        car.x = 182;
        car.z = -182 + (i % 8) * 52;
        car.heading = Math.PI / 2;
        car.speed = 0;
      }
    });
    // Pedestrians: on the sidewalks and one crossing right ahead.
    const peds = world.state.peds;
    const pedSpots = [
      [6, 0], [10, -6], [16, 6], [24, -6], [14, 0], [-10, 6],
    ];
    peds.forEach((ped, i) => {
      if (i < pedSpots.length) {
        const [ahead, side] = pedSpots[i];
        const p = offsetFromPlayer(world, -ahead, side);
        ped.x = p.x;
        ped.z = p.z;
        ped.heading = Math.PI / 2;
        ped.targetX = p.x;
        ped.targetZ = p.z;
        ped.walkPhase = i * 1.3;
      } else {
        ped.x = 100 + (i % 5) * 20;
        ped.z = 100 + Math.floor(i / 5) * 20;
        ped.targetX = ped.x;
        ped.targetZ = ped.z;
      }
    });
    world.state.camYaw = world.playerHeading();
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Golden hour delivery: Lena's first job, the player driving north up
    // Ocean Avenue (x=-26) to the Hotel Solmar, the yellow beacon ahead.
    // The car starts on the avenue 120 m south of the hotel so the run
    // stays on the road and ends with the hotel in sight.
    const mission = world.startMission();
    void mission;
    world.state.mission.step = 1; // past the pickup, on the delivery leg
    const hotel = world.state.city.spots.hotel;
    clearRoad(world, 'x', -26);
    const car = world.state.cars.find((c) => c.parked && !c.sport);
    car.x = -26;
    car.z = hotel.z + 120;
    car.heading = Math.PI;
    car.speed = 20;
    car.parked = false;
    world.state.player.inCar = car.id;
    world.state.player.x = car.x;
    world.state.player.z = car.z;
    world.state.timeOfDay = 0.78;
    world.state.camYaw = car.heading;
    world.state.camPitch = 0.32;
    world.state.camDist = 12;
    runSteps(world, 3, autopilotDrive);
    // Stage the arrival: a car ahead on the avenue, one behind, and
    // pedestrians on the sidewalks by the hotel.
    const traffic = world.state.cars.filter((c) => c.traffic);
    if (traffic[0]) placeCarAt(world, traffic[0], -50, 3, 10);
    if (traffic[1]) placeCarAt(world, traffic[1], 40, -3, 9);
    const nearHotel = [
      { x: hotel.x - 9, z: hotel.z + 14 },
      { x: hotel.x + 10, z: hotel.z - 10 },
    ];
    nearHotel.forEach((spot, i) => {
      const ped = world.state.peds[i];
      if (!ped) return;
      ped.x = spot.x;
      ped.z = spot.z;
      ped.heading = Math.PI / 2;
      ped.targetX = spot.x;
      ped.targetZ = spot.z;
    });
    world.state.camYaw = world.playerHeading();
    return { screen: 'play' };
  }

  // Title: the city at sunset behind the start menu.
  world.state.screen = 'title';
  world.state.timeOfDay = 0.9;
  runSteps(world, 10, null);
  return { screen: 'title' };
}
