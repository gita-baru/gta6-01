// Three.js scene for Solmar City. Builds the static city once, then syncs
// meshes from the simulation state every frame. Browser only.
import * as THREE from 'three';
import { CFG, clamp, lerp } from './config.js';
import { roadCoord, blockSeed, PLACES } from './city.js';
import { currentTarget } from './missions.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildingTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#c8ccd2'; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 12; y += 22) {
      for (let x = 10; x < w - 10; x += 20) {
        g.fillStyle = Math.random() < 0.25 ? '#ffd27a' : '#2c3644';
        g.fillRect(x, y, 12, 14);
      }
    }
  });
}

function roadTexture() {
  const t = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#2e3138'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e8e8'; g.fillRect(w / 2 - 2, 6, 4, 22);
    g.fillStyle = '#3a3e46'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const PALETTE = [0x8a7f72, 0x6b7a8a, 0x9a8a6a, 0x7a6a7a, 0x5a6a7a, 0x8a6a5a, 0x746a8a, 0x6a7a5a];

export function createRenderer(world, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0x9ab8d8, 220, 700);

  const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 1200);
  camera.position.set(0, 30, 60);

  const sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
  sun.position.set(120, 90, 60);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a3a, 0.9);
  scene.add(hemi);

  // --- Ground: city slab, roads, beach, ocean ---
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x8f8f86 }));
  slab.rotation.x = -Math.PI / 2; slab.position.set(0, 0, 0);
  scene.add(slab);
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (let i = 0; i < 10; i++) {
    for (const vertical of [true, false]) {
      const len = 480;
      const geo = new THREE.PlaneGeometry(vertical ? 12 : len, vertical ? len : 12);
      const m = new THREE.Mesh(geo, roadMat.clone());
      m.material.map = roadTex.clone();
      m.material.map.repeat.set(vertical ? 1 : len / 16, vertical ? len / 16 : 1);
      m.material.map.needsUpdate = true;
      m.rotation.x = -Math.PI / 2;
      m.position.set(vertical ? roadCoord(i) : 0, 0.05, vertical ? 0 : roadCoord(i));
      scene.add(m);
    }
  }
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 60),
    new THREE.MeshLambertMaterial({ color: 0xd9c08a }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.04, 268);
  scene.add(beach);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 700),
    new THREE.MeshPhongMaterial({ color: 0x1a6f8f, shininess: 120, transparent: true, opacity: 0.94 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.02, 640);
  scene.add(ocean);

  // --- Buildings: one or two per block, taller toward the centre ---
  const bTex = buildingTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const bMats = PALETTE.map((c) => new THREE.MeshLambertMaterial({ color: c, map: bTex }));
  for (let bi = 0; bi < 9; bi++) {
    for (let bj = 0; bj < 9; bj++) {
      const s = blockSeed(bi, bj);
      const cx = roadCoord(bi) + 26, cz = roadCoord(bj) + 26;
      const distC = Math.hypot(bi - 4, bj - 4) / 5.7;
      const h1 = 8 + s * 26 * (1.25 - distC * 0.7);
      const b1 = new THREE.Mesh(bGeo, bMats[(bi * 9 + bj) % bMats.length]);
      b1.scale.set(22 + s * 8, h1, 22 + s * 8);
      b1.position.set(cx - 6, 0, cz - 6);
      scene.add(b1);
      if (s > 0.45) {
        const b2 = new THREE.Mesh(bGeo, bMats[(bi * 3 + bj * 7) % bMats.length]);
        b2.scale.set(14, 6 + s * 14, 14);
        b2.position.set(cx + 10, 0, cz + 10);
        scene.add(b2);
      }
    }
  }

  // --- Palms along the roads ---
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafGeo = new THREE.ConeGeometry(3.2, 3.4, 6);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
  const palmRng = (() => { let a = 1234567; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  for (let n = 0; n < 90; n++) {
    const i = Math.floor(palmRng() * 10);
    const along = -230 + palmRng() * 460;
    const side = palmRng() < 0.5 ? -9.5 : 9.5;
    const x = palmRng() < 0.5 ? roadCoord(i) + side : along;
    const z = palmRng() < 0.5 ? along : roadCoord(i) + side;
    // Keep the plaza clear — it is the street-level staging area.
    if (Math.hypot(x - PLACES.plaza.x, z - PLACES.plaza.z) < 26) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3.5, z);
    scene.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, 8.2, z);
    scene.add(leaf);
  }

  // --- Landmarks ---
  const landmark = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    scene.add(m);
    return m;
  };
  // Hotel Solmar: tall gold tower with a rooftop sign.
  const hotel = PLACES.hotel;
  landmark(new THREE.BoxGeometry(30, 64, 30), new THREE.MeshLambertMaterial({ color: 0xc9a227, map: bTex }), hotel.x - 20, 32, hotel.z - 20);
  landmark(new THREE.BoxGeometry(24, 4, 6), new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xaa8822 }), hotel.x - 20, 66, hotel.z - 20);
  // Docks: shipping containers.
  const contCols = [0xb04030, 0x3050b0, 0x40a050, 0xc0a030];
  const docks = PLACES.docks;
  for (let n = 0; n < 6; n++) {
    landmark(new THREE.BoxGeometry(10, 3.4, 3.4),
      new THREE.MeshLambertMaterial({ color: contCols[n % 4] }),
      docks.x - 30 + (n % 3) * 12, 1.7, docks.z + 14 + Math.floor(n / 3) * 6);
  }
  // Garage: low wide building. Safehouse: small house. Stadium: bowl.
  const garage = PLACES.garage;
  landmark(new THREE.BoxGeometry(26, 8, 18), new THREE.MeshLambertMaterial({ color: 0x5a6a7a, map: bTex }), garage.x - 18, 4, garage.z - 18);
  const safe = PLACES.safehouse;
  landmark(new THREE.BoxGeometry(12, 6, 10), new THREE.MeshLambertMaterial({ color: 0xd9c8a0 }), safe.x + 16, 3, safe.z - 16);
  const stadium = PLACES.stadium;
  landmark(new THREE.CylinderGeometry(26, 28, 12, 18), new THREE.MeshLambertMaterial({ color: 0x7a8a9a }), stadium.x + 20, 6, stadium.z + 20);
  // Marina boats.
  const marina = PLACES.marina;
  for (let n = 0; n < 4; n++) {
    landmark(new THREE.BoxGeometry(4, 1.6, 10), new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
      marina.x - 10 + n * 7, 0.8, 312 + (n % 2) * 10);
  }

  // --- Dynamic objects ---
  const carGeo = new THREE.BoxGeometry(2.1, 0.75, 4.4);
  const cabinGeo = new THREE.BoxGeometry(1.8, 0.65, 2.2);
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0x18202c });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const carGroups = new Map();
  function carGroup(car) {
    let g = carGroups.get(car);
    if (g) return g;
    g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: car.color });
    const body = new THREE.Mesh(carGeo, bodyMat);
    body.position.y = 0.55;
    g.add(body);
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.15, -0.2);
    g.add(cabin);
    for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.42, wz);
      g.add(w);
    }
    if (car.kind === 'police') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5),
        new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x880000 }));
      bar.position.set(0, 1.6, -0.2);
      bar.name = 'lightbar';
      g.add(bar);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 2.0),
        new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
      roof.position.set(0, 1.5, -0.2);
      g.add(roof);
    }
    g.userData.bodyMat = bodyMat;
    scene.add(g);
    carGroups.set(car, g);
    return g;
  }

  const pedGeo = new THREE.BoxGeometry(0.55, 1.1, 0.35);
  const headGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const pedGroups = new Map();
  function pedGroup(ped) {
    let g = pedGroups.get(ped);
    if (g) return g;
    g = new THREE.Group();
    const body = new THREE.Mesh(pedGeo, new THREE.MeshLambertMaterial({ color: ped.color }));
    body.position.y = 0.85;
    g.add(body);
    const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
    head.position.y = 1.6;
    g.add(head);
    scene.add(g);
    pedGroups.set(ped, g);
    return g;
  }

  // Helicopter.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 7),
    new THREE.MeshLambertMaterial({ color: 0x223344 }));
  heliBody.position.y = 0;
  heli.add(heliBody);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5),
    new THREE.MeshLambertMaterial({ color: 0x223344 }));
  heliTail.position.set(0, 0.2, -5);
  heli.add(heliTail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 1.1;
  heli.add(rotor);
  const search = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2aa, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  search.position.y = -16;
  search.rotation.x = Math.PI;
  heli.add(search);
  scene.add(heli);

  // Mission beacon: glowing column + pulsing ground ring.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  column.position.y = 30;
  beacon.add(column);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  beacon.add(ring);
  scene.add(beacon);

  // Player marker: a small ring under Marco when he is on foot.
  const playerRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  playerRing.rotation.x = -Math.PI / 2;
  playerRing.position.y = 0.1;
  scene.add(playerRing);

  const state = {
    renderer, scene, camera, sun, hemi,
    carGroups, pedGroups, heli, beacon, rotor, playerRing,
    makeCarGroup: carGroup, makePedGroup: pedGroup,
    orbit: 0,            // temporary mouse orbit offset while driving
    camOverride: null,   // {pos, look} for staged screenshots
    snapNext: false,
  };
  return state;
}

const SKY_DAY = new THREE.Color(0x87b5e0);
const SKY_SET = new THREE.Color(0xff9a56);
const SKY_NIGHT = new THREE.Color(0x0b1026);
const tmpColor = new THREE.Color();

export function updateScene(R, world, dt, time) {
  // --- Day cycle lighting ---
  const sunEl = Math.sin(world.dayT * Math.PI * 2); // >0 day, <0 night
  const sunAz = Math.cos(world.dayT * Math.PI * 2);
  R.sun.position.set(sunAz * 160, Math.max(8, sunEl * 160), 80);
  R.sun.intensity = clamp(sunEl * 3.0, 0.15, 3.0);
  R.sun.color.setHSL(0.08, 0.7, clamp(0.5 + sunEl * 0.25, 0.35, 0.75));
  R.hemi.intensity = clamp(0.5 + sunEl * 0.6, 0.35, 1.1);
  if (sunEl > 0.12) tmpColor.copy(SKY_DAY).lerp(SKY_SET, clamp(1 - sunEl * 2.2, 0, 1) * 0.85);
  else if (sunEl > -0.08) tmpColor.copy(SKY_SET).lerp(SKY_NIGHT, clamp((0.12 - sunEl) / 0.2, 0, 1));
  else tmpColor.copy(SKY_NIGHT);
  R.scene.background.copy(tmpColor);
  R.scene.fog.color.copy(tmpColor);

  // --- Cars ---
  const seen = new Set();
  const allCars = [...world.traffic, ...world.police];
  if (world.player.car) allCars.push(world.player.car);
  for (const car of allCars) {
    seen.add(car);
    const g = R.makeCarGroup(car);
    g.position.set(car.x, 0, car.z);
    g.rotation.y = car.heading;
    if (car.kind === 'police') {
      const bar = g.getObjectByName('lightbar');
      if (bar) bar.material.emissive.setHex(Math.floor(time * 6) % 2 === 0 ? 0xff0000 : 0x0000ff);
    }
  }
  for (const [car, g] of R.carGroups) {
    if (!seen.has(car)) { R.scene.remove(g); R.carGroups.delete(car); }
  }

  // --- Pedestrians ---
  for (const ped of world.peds) {
    const g = R.makePedGroup(ped);
    g.position.set(ped.x, ped.state === 'down' ? 0.35 : 0, ped.z);
    g.rotation.y = ped.heading;
    g.rotation.z = ped.state === 'down' ? Math.PI / 2 : 0;
    g.visible = true;
  }

  // --- Helicopter ---
  R.heli.visible = world.heli.active;
  if (world.heli.active) {
    R.heli.position.set(world.heli.x, world.heli.y, world.heli.z);
    R.heli.rotation.y = world.heli.heading;
    R.rotor.rotation.y = world.heli.rotor;
  }

  // --- Mission beacon ---
  const target = currentTarget(world);
  R.beacon.visible = !!target;
  if (target) {
    R.beacon.position.set(target.x, 0, target.z);
    const s = 1 + Math.sin(time * 3) * 0.15;
    R.beacon.scale.set(s, 1, s);
  }

  // --- Player marker ring (on foot only) ---
  const p = world.player;
  R.playerRing.visible = p.onFoot;
  if (p.onFoot) R.playerRing.position.set(p.x, 0.1, p.z);

  // --- Camera ---
  R.orbit *= Math.max(0, 1 - dt * 1.2);
  if (R.camOverride) {
    R.camera.position.set(R.camOverride.pos[0], R.camOverride.pos[1], R.camOverride.pos[2]);
    R.camera.lookAt(R.camOverride.look[0], R.camOverride.look[1], R.camOverride.look[2]);
    return;
  }
  const pos = p.onFoot ? { x: p.x, z: p.z } : { x: p.car.x, z: p.car.z };
  const fwd = p.onFoot
    ? { x: -Math.sin(world.camYaw), z: -Math.cos(world.camYaw) }
    : { x: Math.sin(p.heading), z: Math.cos(p.heading) };
  const orbitA = R.orbit;
  const fx = fwd.x * Math.cos(orbitA) - fwd.z * Math.sin(orbitA);
  const fz = fwd.x * Math.sin(orbitA) + fwd.z * Math.cos(orbitA);
  const dist = p.onFoot ? 9 : 13.5;
  const height = p.onFoot ? 5 : 6.5;
  const tx = pos.x - fx * dist;
  const tz = pos.z - fz * dist;
  const ty = height;
  if (R.snapNext) {
    R.camera.position.set(tx, ty, tz);
    R.snapNext = false;
  } else {
    const k = Math.min(1, dt * 5);
    R.camera.position.x += (tx - R.camera.position.x) * k;
    R.camera.position.y += (ty - R.camera.position.y) * k;
    R.camera.position.z += (tz - R.camera.position.z) * k;
  }
  R.camera.lookAt(pos.x + fx * 7, 1.6, pos.z + fz * 7);
}
