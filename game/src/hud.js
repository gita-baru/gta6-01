// The HUD and the menus: cash, wanted stars, health, speed, the mission
// objective, a live minimap, phone-call banners and the title, pause and
// end screens. All DOM; the 3D view never draws text.
// (v2, 18 Nov 2026) Unchanged: the HUD already reads at 768x480, as the shots show.
import { BEACH_Z, CITY_HALF, GRID, PITCH } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const cash = el('cash');
  const stars = el('stars');
  const healthFill = el('health-fill');
  const speed = el('speed');
  const objective = el('objective');
  const objectiveDist = el('objective-dist');
  const clock = el('clock');
  const ammo = el('ammo');
  const toastBox = el('toast');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerText = el('banner-text');
  const menu = el('menu');
  const menuTitle = el('menu-title');
  const menuSub = el('menu-sub');
  const menuButtons = el('menu-buttons');
  const menuExtra = el('menu-extra');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  let toastTimer = 0;
  let bannerTimer = 0;

  function button(label, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    menuButtons.appendChild(b);
    return b;
  }

  function showMenu(title, sub, extra) {
    menuTitle.textContent = title;
    menuSub.textContent = sub || '';
    menuExtra.textContent = extra || '';
    menuButtons.innerHTML = '';
    menu.classList.remove('hidden');
  }

  return {
    toast(message, seconds) {
      toastBox.textContent = message;
      toastBox.classList.remove('hidden');
      toastTimer = seconds || 3;
    },
    bannerCall(title, text, seconds) {
      bannerTitle.textContent = title;
      bannerText.textContent = text;
      banner.classList.remove('hidden');
      bannerTimer = seconds || 6;
    },
    tick(dt) {
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toastBox.classList.add('hidden');
      }
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) banner.classList.add('hidden');
      }
    },
    hideMenu() {
      menu.classList.add('hidden');
    },
    showTitle(save, callbacks) {
      const lines = [
        'SOLMAR HEAT',
        'A sun-soaked open-world crime story. Steal cars, outrun the Solmar PD, and run jobs for Lena Voss.',
      ];
      showMenu(lines[0], lines[1], save ? `Saved game: $${save.cash} · ${save.missionsDone.length} job${save.missionsDone.length === 1 ? '' : 's'} done` : '');
      button('▶  Start', callbacks.start);
      if (save) button('Continue — $' + save.cash, callbacks.continue);
      button('How to play', callbacks.help);
      menuExtra.innerHTML += '<p class="controls">WASD drive / walk · E enter car · F punch · Click shoot · Shift run · Space handbrake · M mute · Esc pause</p>';
    },
    showHelp(callbacks) {
      showMenu('How to play', 'Walk up to any car and press E to take it. Follow the yellow marker to run Lena\'s jobs. Stars mean the police are coming — lose them by hiding. Getting caught means Busted; losing all health means Wasted.', '');
      button('← Back', callbacks.back);
    },
    showPause(callbacks) {
      showMenu('Paused', 'Solmar waits for no one. Well — right now it does.', '');
      button('Resume', callbacks.resume);
      button('Restart day', callbacks.restart);
      button('Quit to title', callbacks.quit);
    },
    showEnd(kind, stats, callbacks) {
      if (kind === 'busted') {
        showMenu('BUSTED', 'The Solmar PD caught up with you.', `Cash kept: $${stats.cash} · Jobs done: ${stats.jobs}`);
      } else {
        showMenu('WASTED', 'Solmar chewed you up.', `Cash kept: $${stats.cash} · Jobs done: ${stats.jobs}`);
      }
      button('Try again', callbacks.retry);
      button('Title screen', callbacks.quit);
    },
    showMissionComplete(mission, callbacks) {
      showMenu('Job done: ' + mission.name, `Lena paid you $${mission.reward}.`, '');
      button('Next job', callbacks.next);
    },
    update(world) {
      cash.textContent = '$' + Math.floor(world.cash);
      stars.textContent = '★'.repeat(world.wanted.level) + '☆'.repeat(5 - world.wanted.level);
      stars.classList.toggle('hot', world.wanted.level > 0);
      healthFill.style.width = Math.max(0, world.player.health) + '%';
      healthFill.classList.toggle('low', world.player.health < 35);
      const car = world.playerCar();
      speed.textContent = car ? Math.round(Math.abs(car.speed) * 3.6) + ' km/h' : '';
      ammo.textContent = world.player.inCar ? '' : `Ammo ${world.player.ammo}`;
      const hours = 6 + world.timeOfDay * 18;
      const hh = Math.floor(hours);
      const mm = Math.floor((hours - hh) * 60);
      clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (world.mission.active) {
        const step = world.missionStep();
        objective.textContent = step ? step.text : '';
        const target = world.missionTarget();
        if (target) {
          const d = Math.hypot(world.playerX() - target.x, world.playerZ() - target.z);
          objectiveDist.textContent = Math.round(d) + ' m';
        } else {
          objectiveDist.textContent = '';
        }
      } else if (world.nextMission()) {
        objective.textContent = 'Next job: ' + world.nextMission().name + ' — press T to start';
        objectiveDist.textContent = '';
      } else {
        objective.textContent = 'All jobs done — Solmar is yours. Free roam!';
        objectiveDist.textContent = '';
      }
    },
    drawMinimap(world) {
      const size = minimap.width;
      const ctx = mapCtx;
      const minX = -CITY_HALF - 20;
      const maxX = CITY_HALF + 20;
      const minZ = -CITY_HALF - 20;
      const maxZ = BEACH_Z + 60;
      const sx = (x) => ((x - minX) / (maxX - minX)) * size;
      const sz = (z) => ((z - minZ) / (maxZ - minZ)) * size;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#20242c';
      ctx.fillRect(0, 0, size, size);
      // Ocean.
      ctx.fillStyle = '#2a7ab0';
      ctx.fillRect(0, sz(BEACH_Z), size, size - sz(BEACH_Z));
      // Blocks.
      ctx.fillStyle = '#3a4048';
      for (let bx = 0; bx < GRID; bx += 1) {
        for (let bz = 0; bz < GRID; bz += 1) {
          const x = -CITY_HALF + bx * PITCH + 6;
          const z = -CITY_HALF + bz * PITCH + 6;
          ctx.fillRect(sx(x), sz(z), sx(x + 40) - sx(x), sz(z + 40) - sz(z));
        }
      }
      // Roads.
      ctx.strokeStyle = '#565e68';
      ctx.lineWidth = 2;
      for (let i = 0; i <= GRID; i += 1) {
        const c = -CITY_HALF + i * PITCH;
        ctx.beginPath(); ctx.moveTo(sx(c), sz(minZ)); ctx.lineTo(sx(c), sz(maxZ)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx(minX), sz(c)); ctx.lineTo(sx(maxX), sz(c)); ctx.stroke();
      }
      // Mission target.
      const target = world.missionTarget();
      if (target) {
        const pulse = 5 + Math.sin(performance.now() / 200) * 2;
        ctx.fillStyle = '#ffd040';
        ctx.beginPath();
        ctx.arc(sx(target.x), sz(target.z), pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      // Cars.
      for (const car of world.cars) {
        ctx.fillStyle = car.police ? (Math.floor(performance.now() / 300) % 2 ? '#ff4040' : '#4080ff') : '#c8c8c8';
        ctx.fillRect(sx(car.x) - 1.5, sz(car.z) - 1.5, 3, 3);
      }
      // Player arrow.
      const px = sx(world.playerX());
      const pz = sz(world.playerZ());
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(world.playerHeading());
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
