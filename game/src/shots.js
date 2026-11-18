// Screenshot staging for Solmar Heat. The shot tool opens the game with
// ?shot=<name>&seed=<n>; this module teleports the world into a composed scene,
// snaps the chase camera and, once the camera has settled, raises
// window.__shotReady so the tool knows the frame is safe to capture.
// Camera snap + settle is the fix for the v1 shots, where the camera was still
// lerping toward the player when the capture fired.
import { makeRng } from './random.js';

export function shotParams() {
  const q = new URLSearchParams(window.location.search);
  const name = q.get('shot');
  if (!name) return null;
  return { name, seed: Number(q.get('seed') || 7) };
}

// Stage the game for a named shot. game exposes its mutable state and helpers:
// game.state, game.enterCar(car), game.startMissionAt(i), game.setHour(h),
// game.setWanted(n), game.spawnPolice(n). Runs once, before the first frame.
export function stageShot(game, params) {
  const { name, seed } = params;
  const rng = makeRng(seed);
  const s = game.state;
  if (name === 'title') {
    game.showTitle();
    return { name, readyAfterFrames: 45 };
  }
  if (name === 'chase') {
    // Sunset chase: player car at full speed down the x=-25 avenue, two police
    // cars on its tail, three wanted stars, the sun low ahead. autoDrive keeps
    // the throttle down so the car holds its speed while the camera settles.
    game.setHour(17.8);
    const car = s.parked[0];
    car.x = -25;
    car.z = -100;
    car.heading = 0;
    car.speed = 34;
    game.enterCar(car);
    s.autoDrive = true;
    game.setWanted(3);
    game.spawnPolice(2);
    const [p1, p2] = s.police;
    // Ahead of the player on the same avenue, in the camera's view: the
    // follow camera sits behind the player, so police placed on its tail
    // (behind the player) end up behind the camera and invisible. Ahead,
    // they read as the chase closing in from the front. Frozen so the
    // pursuit AI does not U-turn them back behind the camera during the
    // settle frames; they hold their line at 32 while the player (38) gains
    // ~22 units over the settle, so they end up ~23 and ~43 ahead.
    p1.x = -28;
    p1.z = -55;
    p1.heading = 0;
    p1.speed = 32;
    p1.frozen = true;
    p2.x = -21;
    p2.z = -35;
    p2.heading = 0;
    p2.speed = 32;
    p2.frozen = true;
    // Oncoming traffic in the next lane for depth. Pin its road so the traffic
    // AI does not reassign it to a random street on the first frame.
    s.traffic[0].road = s.city.roads.find((r) => r.axis === 'z' && r.coord === -25);
    s.traffic[0].roadDir = -1;
    s.traffic[0].x = -27;
    s.traffic[0].z = 20;
    s.traffic[0].heading = Math.PI;
    s.traffic[0].speed = 10;
    game.snapCamera();
    return { name, readyAfterFrames: 75 };
  }
  if (name === 'street') {
    // Midday plaza: player on foot, traffic and pedestrians in frame.
    game.setHour(10.5);
    s.player.x = 0;
    s.player.z = 25;
    s.player.heading = Math.PI * 0.85;
    s.player.inCar = false;
    s.camYaw = 0.7;
    // [x, z, heading, roadAxis, roadCoord, roadDir] per car. The road is pinned
    // so the traffic AI keeps the staged position instead of reassigning it.
    const spots = [
      [-25, -75, 0, 'z', -25, 1],
      [25, -25, Math.PI, 'z', 25, -1],
      [-75, 25, Math.PI / 2, 'x', 25, 1],
      [75, 75, -Math.PI / 2, 'x', 75, -1],
      [-25, 125, 0, 'z', -25, 1],
      [125, -25, Math.PI, 'z', 125, -1],
    ];
    s.traffic.forEach((car, i) => {
      const spot = spots[i % spots.length];
      car.road = s.city.roads.find((r) => r.axis === spot[3] && r.coord === spot[4]);
      car.roadDir = spot[5];
      car.x = spot[0];
      car.z = spot[1];
      car.heading = spot[2];
      car.speed = 8;
    });
    s.peds.forEach((ped, i) => {
      ped.x = -30 + (i % 6) * 12 + rng.range(-3, 3);
      ped.z = 10 + Math.floor(i / 6) * 14 + rng.range(-3, 3);
      ped.alive = true;
    });
    game.snapCamera();
    return { name, readyAfterFrames: 75 };
  }
  if (name === 'mission') {
    // Mission in progress: Lena's first job active, beacon ~67 m ahead, sunset.
    // The car waits on the x=-125 road, facing the beachfront beacon.
    game.setHour(17.5);
    game.startMissionAt(0);
    const car = s.parked[1] || s.parked[0];
    car.x = -125;
    car.z = 180;
    car.heading = 0;
    car.speed = 0;
    game.enterCar(car);
    game.snapCamera();
    return { name, readyAfterFrames: 75 };
  }
  return { name, readyAfterFrames: 60 };
}
