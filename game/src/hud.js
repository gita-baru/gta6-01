// HUD: cash, stars, health, speed, objective + distance, clock, live minimap,
// and the start / pause / busted / wasted screens. Browser only.
import { CFG } from './config.js';
import { roadCoord } from './city.js';
import { objectiveInfo, clockString, playerPos } from './world.js';

export function createHud(world) {
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $('hud-cash'), stars: $('hud-stars'), health: $('hud-health-fill'),
    speed: $('hud-speed'), objective: $('hud-objective'), clock: $('hud-clock'),
    ammo: $('hud-ammo'), toast: $('hud-toast'), minimap: $('minimap'),
    screens: { start: $('screen-start'), pause: $('screen-pause'), busted: $('screen-busted'), wasted: $('screen-wasted') },
    menuCash: $('menu-cash'), menuMissions: $('menu-missions'),
  };
  const mm = els.minimap.getContext('2d');
  let toastT = 0;
  return {
    showToast(text, seconds = 4) {
      els.toast.textContent = text;
      els.toast.style.opacity = '1';
      toastT = seconds;
    },
    showScreen(name) {
      for (const [key, el] of Object.entries(els.screens)) {
        el.classList.toggle('hidden', key !== name);
      }
      if (name === 'start') {
        els.menuCash.textContent = `$${world.cash.toLocaleString()}`;
        els.menuMissions.textContent = `${world.stats.missionsDone} of 5 jobs done`;
      }
    },
    hideScreens() {
      for (const el of Object.values(els.screens)) el.classList.add('hidden');
    },
    update(dt) {
      const p = world.player;
      els.cash.textContent = `$${world.cash.toLocaleString()}`;
      els.stars.textContent = '★'.repeat(world.wanted.stars) + '☆'.repeat(CFG.maxStars - world.wanted.stars);
      els.stars.style.color = world.wanted.stars >= 4 ? '#ff4444' : world.wanted.stars > 0 ? '#ffcc22' : '#ffffff';
      els.health.style.width = `${Math.max(0, p.health)}%`;
      els.health.style.background = p.health > 50 ? '#4caf50' : p.health > 25 ? '#ff9800' : '#f44336';
      const speedKmh = p.onFoot ? Math.round(p.speed * 3.6) : Math.round(Math.abs(p.car.speed) * 3.6);
      els.speed.textContent = `${speedKmh} km/h`;
      els.clock.textContent = clockString(world);
      els.ammo.textContent = p.onFoot ? `🔫 ${p.ammo}` : '';
      const obj = objectiveInfo(world);
      els.objective.textContent = obj.dist !== null
        ? `${obj.text} — ${obj.dist} m` : obj.text;
      if (toastT > 0) {
        toastT -= dt;
        if (toastT <= 0) els.toast.style.opacity = '0';
      }
      drawMinimap(mm, world, els.minimap.width);
    },
  };
}

function drawMinimap(g, world, size) {
  const S = size;
  const toMap = (x, z) => [
    ((x - CFG.cityMin) / (CFG.cityMax - CFG.cityMin)) * (S - 16) + 8,
    ((z - CFG.cityMin) / (CFG.cityMax - CFG.cityMin)) * (S - 16) + 8,
  ];
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(10, 16, 24, 0.82)';
  g.fillRect(0, 0, S, S);
  // Blocks.
  g.fillStyle = '#3a4a5a';
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const [x, z] = toMap(roadCoord(i) + 26, roadCoord(j) + 26);
      g.fillRect(x - 9, z - 9, 18, 18);
    }
  }
  // Roads.
  g.strokeStyle = '#6a7a8a';
  g.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const [a] = toMap(roadCoord(i), 0);
    g.beginPath(); g.moveTo(a, 4); g.lineTo(a, S - 4); g.stroke();
    const [, b] = toMap(0, roadCoord(i));
    g.beginPath(); g.moveTo(4, b); g.lineTo(S - 4, b); g.stroke();
  }
  // Beach / ocean.
  g.fillStyle = '#d9c08a';
  g.fillRect(4, S - 14, S - 8, 6);
  g.fillStyle = '#1a6f8f';
  g.fillRect(4, S - 8, S - 8, 4);
  // Mission target.
  const obj = objectiveInfo(world);
  if (obj.target) {
    const [x, z] = toMap(obj.target.x, obj.target.z);
    g.fillStyle = '#ffd21a';
    g.beginPath(); g.arc(x, z, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd21a'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, z, 8, 0, Math.PI * 2); g.stroke();
  }
  // Police (red), traffic (grey), peds (dots).
  g.fillStyle = '#ff4444';
  for (const c of world.police) {
    const [x, z] = toMap(c.x, c.z);
    g.fillRect(x - 2.5, z - 2.5, 5, 5);
  }
  if (world.heli.active) {
    const [x, z] = toMap(world.heli.x, world.heli.z);
    g.fillStyle = '#ff8844';
    g.beginPath(); g.arc(x, z, 4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#bbbbbb';
  for (const c of world.traffic) {
    const [x, z] = toMap(c.x, c.z);
    g.fillRect(x - 1.5, z - 1.5, 3, 3);
  }
  // Player arrow.
  const pos = playerPos(world);
  const [px, pz] = toMap(pos.x, pos.z);
  const heading = world.player.heading;
  g.fillStyle = '#ffffff';
  g.save();
  g.translate(px, pz);
  g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) * -1 + Math.PI);
  g.beginPath();
  g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
  g.fill();
  g.restore();
  // North label.
  g.fillStyle = '#9ab';
  g.font = 'bold 10px sans-serif';
  g.fillText('N', S - 14, 14);
}
