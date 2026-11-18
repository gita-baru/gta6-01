// localStorage save / load. The storage object is injected so the headless
// sim tests can pass a fake instead of the browser's localStorage.
const KEY = 'solmar-heat-save-v1';

export function saveGame(storage, world) {
  try {
    const data = {
      cash: world.cash,
      missionsDone: world.stats.missionsDone,
      nextMission: world.missions.index + (world.missions.done ? 1 : 0),
      health: world.player.health,
      ammo: world.player.ammo,
      x: world.player.x,
      z: world.player.z,
      time: world.time,
    };
    storage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(world, data) {
  if (!data) return;
  world.cash = data.cash;
  world.stats.missionsDone = data.missionsDone || 0;
  world.missions.index = Math.min(4, data.nextMission || 0);
  world.player.health = data.health ?? 100;
  world.player.ammo = data.ammo ?? 24;
  world.player.x = data.x ?? world.player.x;
  world.player.z = data.z ?? world.player.z;
  world.time = data.time || 0;
}
