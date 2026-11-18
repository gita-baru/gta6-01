// The HUD: money, wanted stars, health, speed, objective, clock, messages and
// the live minimap. Pure DOM + a 2D canvas, no three.js. The minimap redraws
// every frame from the same world state the game simulates.
import { CITY, DAY } from './config.js';

export function makeHud() {
  const hud = {
    root: null,
    money: null,
    stars: null,
    healthBar: null,
    healthText: null,
    speed: null,
    objective: null,
    objectiveDist: null,
    clock: null,
    message: null,
    radio: null,
    map: null,
    mapCtx: null,
    screens: {},
    build() {
      hud.root = document.getElementById('hud');
      hud.money = document.getElementById('hud-money');
      hud.stars = document.getElementById('hud-stars');
      hud.healthBar = document.getElementById('hud-health-fill');
      hud.healthText = document.getElementById('hud-health-text');
      hud.speed = document.getElementById('hud-speed');
      hud.objective = document.getElementById('hud-objective');
      hud.objectiveDist = document.getElementById('hud-objective-dist');
      hud.clock = document.getElementById('hud-clock');
      hud.message = document.getElementById('hud-message');
      hud.radio = document.getElementById('hud-radio');
      hud.ammo = document.getElementById('hud-ammo');
      hud.map = document.getElementById('minimap');
      hud.mapCtx = hud.map.getContext('2d');
      hud.screens = {
        title: document.getElementById('screen-title'),
        pause: document.getElementById('screen-pause'),
        busted: document.getElementById('screen-busted'),
        wasted: document.getElementById('screen-wasted'),
      };
    },
    showScreen(name) {
      for (const key of Object.keys(hud.screens)) {
        if (hud.screens[key]) hud.screens[key].style.display = key === name ? 'flex' : 'none';
      }
      if (hud.root) hud.root.style.display = name ? 'none' : 'block';
    },
    setMessage(text, seconds) {
      if (!hud.message) return;
      hud.message.textContent = text;
      hud.message.style.opacity = '1';
      clearTimeout(hud._msgTimer);
      hud._msgTimer = setTimeout(() => {
        hud.message.style.opacity = '0';
      }, (seconds || 4) * 1000);
    },
    // Per-frame text updates. state carries the values to show.
    update(state) {
      if (!hud.root) return;
      hud.money.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
      hud.stars.textContent = stars;
      hud.stars.style.color = state.wanted >= 4 ? '#ff4040' : '#ffd23f';
      const hp = Math.max(0, Math.round(state.health));
      hud.healthBar.style.width = `${hp}%`;
      hud.healthBar.style.background = hp > 50 ? '#37c978' : hp > 25 ? '#ffb02e' : '#ff4040';
      hud.healthText.textContent = `${hp}`;
      if (hud.ammo) hud.ammo.textContent = `Ammo ${state.ammo ?? 0}`;
      hud.speed.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
      if (state.objective) {
        hud.objective.textContent = state.objective.label;
        hud.objectiveDist.textContent =
          state.objectiveDist !== Infinity ? `${Math.round(state.objectiveDist)} m` : '';
      } else {
        hud.objective.textContent = state.missionsLeft > 0 ? 'Press T for the next job — Lena is waiting' : 'All jobs done. Solmar is yours.';
        hud.objectiveDist.textContent = '';
      }
      const hours = Math.floor(state.hour);
      const mins = Math.floor((state.hour - hours) * 60);
      hud.clock.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      hud.radio.textContent = `♪ ${state.radio} ${state.muted ? '(muted)' : ''}`;
      hud.drawMinimap(state);
    },
    // Live minimap: roads, blocks, beach, player arrow, police, traffic,
    // pedestrians, the mission beacon and the helicopter.
    drawMinimap(state) {
      const ctx = hud.mapCtx;
      const S = 180;
      const world = CITY.WORLD_HALF;
      const toMap = (x, z) => [((x + world) / (world * 2)) * S, ((z + world) / (world * 2)) * S];
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(12, 20, 28, 0.85)';
      ctx.fillRect(0, 0, S, S);
      // Ocean + beach.
      const [, beachY] = toMap(0, CITY.BEACH_START);
      const [, sandY] = toMap(0, CITY.SAND_END);
      ctx.fillStyle = '#1e6f8e';
      ctx.fillRect(0, sandY, S, S - sandY);
      ctx.fillStyle = '#e3cf9e';
      ctx.fillRect(0, beachY, S, sandY - beachY);
      // Blocks.
      ctx.fillStyle = '#2c3a2e';
      for (const b of state.city.blocks) {
        const [x, y] = toMap(b.cx - 20, b.cz - 20);
        const [x2, y2] = toMap(b.cx + 20, b.cz + 20);
        ctx.fillRect(x, y, x2 - x, y2 - y);
      }
      // Roads.
      ctx.strokeStyle = '#5a6270';
      ctx.lineWidth = 2;
      for (const s of state.city.streets) {
        const [x1] = toMap(s, 0);
        ctx.beginPath();
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, S);
        ctx.stroke();
        const [, z1] = toMap(0, s);
        ctx.beginPath();
        ctx.moveTo(0, z1);
        ctx.lineTo(S, z1);
        ctx.stroke();
      }
      const dot = (x, z, color, r) => {
        const [mx, my] = toMap(x, z);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fill();
      };
      // Mission beacon.
      if (state.objective && state.objective.x !== undefined) {
        const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
        dot(state.objective.x, state.objective.z, '#ffd23f', pulse + 2);
        dot(state.objective.x, state.objective.z, '#fff3b0', 2);
      }
      for (const car of state.traffic) dot(car.x, car.z, '#9aa5b1', 1.6);
      for (const ped of state.peds) if (ped.alive) dot(ped.x, ped.z, '#c8b8a0', 1.2);
      for (const car of state.police) dot(car.x, car.z, '#ff4040', 2.6);
      if (state.heli && state.heli.active) dot(state.heli.x, state.heli.z, '#ff9040', 3);
      // Player arrow, rotated to the heading.
      const [px, py] = toMap(state.player.x, state.player.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(Math.sin(state.player.heading), Math.cos(state.player.heading)) + Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    // In-game clock from elapsed play seconds.
    hourOf(elapsedSeconds) {
      return (DAY.START_HOUR + (elapsedSeconds / DAY.DAY_SECONDS) * 24) % 24;
    },
  };
  return hud;
}
