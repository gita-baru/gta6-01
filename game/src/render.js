// Three.js rendering for Solmar Heat: the city, the ocean, the cars, the people,
// the helicopter, the beacon, the day-sunset cycle and the chase camera.
// The simulation stays in the pure-logic modules; this file only turns state
// into meshes, lights and a camera position every frame.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { clamp } from './random.js';

function groundTexture(city) {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const scale = S / (CITY.WORLD_HALF * 2);
  const toPx = (v) => (v + CITY.WORLD_HALF) * scale;
  // Base: sidewalk grey.
  ctx.fillStyle = '#b8b0a0';
  ctx.fillRect(0, 0, S, S);
  // Blocks: grass green, plaza tan, park darker green.
  for (const b of city.blocks) {
    const x = toPx(b.cx - 20);
    const y = toPx(b.cz - 20);
    const w = 40 * scale;
    ctx.fillStyle = b.kind === 'plaza' ? '#cbb98f' : b.kind === 'park' ? '#6f9a5e' : '#8fae7a';
    ctx.fillRect(x, y, w, w);
    if (b.kind === 'plaza') {
      ctx.strokeStyle = '#a89060';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 4, w - 8, w - 8);
    }
  }
  // Roads: asphalt strips with dashed centre lines.
  for (const s of city.streets) {
    const c = toPx(s);
    const half = CITY.ROAD_HALF * scale;
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(0, c - half, S, half * 2);
    ctx.fillRect(c - half, 0, half * 2, S);
  }
  ctx.strokeStyle = '#d8c860';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 12]);
  for (const s of city.streets) {
    const c = toPx(s);
    ctx.beginPath();
    ctx.moveTo(0, c);
    ctx.lineTo(S, c);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c, S);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Beach sand and the water's edge.
  ctx.fillStyle = '#e3cf9e';
  ctx.fillRect(0, toPx(CITY.BEACH_START), S, toPx(CITY.SAND_END) - toPx(CITY.BEACH_START));
  ctx.fillStyle = '#1e6f8e';
  ctx.fillRect(0, toPx(CITY.SAND_END), S, S - toPx(CITY.SAND_END));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildingTexture(baseColor, litRatio, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  // Window grid: some lit warm, most dark glass.
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = rnd() < litRatio;
      ctx.fillStyle = lit ? '#ffd88a' : '#2a4a5a';
      ctx.fillRect(10 + col * 19, 12 + row * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x223844 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.12, -0.25);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const wx of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    light.position.set(wx, 0.62, 2.22);
    group.add(light);
  }
  if (isPolice) {
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    );
    red.position.set(-0.45, 1.48, -0.25);
    red.name = 'sirenRed';
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2040ff }),
    );
    blue.position.set(0.45, 1.48, -0.25);
    blue.name = 'sirenBlue';
    group.add(blue);
  }
  // Cheap blob shadow.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.set(1, 1.5, 1);
  group.add(shadow);
  return group;
}

function makePersonMesh(shirtColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a070 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), pants);
  legL.position.set(-0.14, 0.25, 0);
  legL.name = 'legL';
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), pants);
  legR.position.set(0.14, 0.25, 0);
  legR.name = 'legR';
  group.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), shirt);
  torso.position.y = 0.85;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.45;
  group.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), shirt);
  armL.position.set(-0.4, 0.9, 0);
  armL.name = 'armL';
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), shirt);
  armR.position.set(0.4, 0.9, 0);
  armR.name = 'armR';
  group.add(armR);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  return group;
}

export function createRenderer(canvas, city) {
  // preserveDrawingBuffer keeps the last rendered frame in the canvas so a
  // screenshot taken between animation frames still captures the 3D view.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfd4e0, 180, 700);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);

  // Lights: sun + sky fill. Both are re-aimed and recoloured by the hour.
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd4e0, 0x5a4a38, 0.9);
  scene.add(hemi);

  // Ground with the painted city texture.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.WORLD_HALF * 2, CITY.WORLD_HALF * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture(city) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Ocean: a second plane past the sand, gently breathing.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.WORLD_HALF * 2, 220),
    new THREE.MeshPhongMaterial({ color: PALETTE.OCEAN, transparent: true, opacity: 0.92, shininess: 90 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.15, CITY.SAND_END + 110);
  scene.add(ocean);

  // Buildings with window facades, in three texture variants.
  const facadeMats = [0, 1, 2].map((v) => {
    const tex = buildingTexture('#cfc0a8', 0.25, 1234 + v * 777);
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
  const buildingMeshes = [];
  city.buildings.forEach((b, i) => {
    const mats = [facadeMats[i % 3], facadeMats[i % 3], roofMat, roofMat, facadeMats[i % 3], facadeMats[i % 3]];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mats);
    mesh.position.set(b.x, b.h / 2, b.z);
    scene.add(mesh);
    buildingMeshes.push(mesh);
    if (b.h > 26) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.4, 1.2, b.d * 0.4), roofMat);
      roof.position.set(b.x, b.h + 0.6, b.z);
      scene.add(roof);
    }
  });

  // Palms: trunk + a crown of flat fronds.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a, side: THREE.DoubleSide });
  for (const palm of city.palms) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, palm.h, 6), trunkMat);
    trunk.position.y = palm.h / 2;
    group.add(trunk);
    for (let f = 0; f < 6; f++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), frondMat);
      frond.position.y = palm.h + 0.2;
      frond.rotation.y = (f / 6) * Math.PI * 2;
      frond.rotation.x = -0.5;
      frond.translateY(0.9);
      group.add(frond);
    }
    group.position.set(palm.x, 0, palm.z);
    scene.add(group);
  }

  // Street lamps along every second street.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333338 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const lampHeads = [];
  for (const s of city.streets) {
    if (Math.round(s) % 100 !== 0) continue;
    for (const along of [-175, -75, 25, 125, 225]) {
      for (const [x, z] of [[s + 6.5, along], [along, s + 6.5]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6), lampMat);
        pole.position.set(x, 2.7, z);
        scene.add(pole);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampHeadMat.clone());
        head.position.set(x, 5.5, z);
        scene.add(head);
        lampHeads.push(head);
      }
    }
  }

  // Sun disc + drifting clouds.
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  scene.add(sunDisc);
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + j * 2, 10, 8), cloudMat);
      puff.position.set(j * 7 - 7, j % 2, 0);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(-300 + i * 65, 90 + (i % 3) * 14, -220 + (i % 4) * 110);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Mission beacon: a glowing pillar and a ground ring.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 70, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 35;
  beacon.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  // Helicopter.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x20242e }));
  heliBody.position.y = 0;
  heli.add(heliBody);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4), new THREE.MeshLambertMaterial({ color: 0x20242e }));
  heliTail.position.set(0, 0.2, -4);
  heli.add(heliTail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 0.9;
  rotor.name = 'rotor';
  heli.add(rotor);
  const spot = new THREE.Mesh(
    new THREE.ConeGeometry(7, 42, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  spot.position.y = -21;
  heli.add(spot);
  heli.visible = false;
  scene.add(heli);

  // Shot tracer: a short-lived line from muzzle to impact.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);

  const carMeshes = new Map();
  const pedMeshes = new Map();
  let playerMesh = null;
  const camState = { yaw: 0, pitch: 0, dist: 10, height: 4.5, snapped: false };
  const tmpTarget = new THREE.Vector3();

  function carMeshFor(car) {
    let mesh = carMeshes.get(car);
    if (!mesh) {
      mesh = makeCarMesh(car.color, car.kind === 'police');
      scene.add(mesh);
      carMeshes.set(car, mesh);
    }
    return mesh;
  }

  function pedMeshFor(ped) {
    let mesh = pedMeshes.get(ped);
    if (!mesh) {
      mesh = makePersonMesh(ped.color);
      scene.add(mesh);
      pedMeshes.set(ped, mesh);
    }
    return mesh;
  }

  // Sky and sun for an hour of the day. 6 = dawn, 12 = noon, 18 = sunset, 0 = night.
  function applyHour(hour) {
    const dayT = clamp((hour - 6) / 12, 0, 1); // 0 dawn, 1 dusk
    const elev = Math.sin(dayT * Math.PI); // 0 at dawn/dusk, 1 at noon
    const night = hour < 5.5 || hour >= 19.5;
    const dusk = hour >= 16.5 && hour < 19.5;
    const dawn = hour >= 5.5 && hour < 8;
    let sky;
    let sunColor;
    let sunI;
    if (night) {
      sky = new THREE.Color(0x0e1a2e);
      sunColor = new THREE.Color(0x8aa0c0);
      sunI = 0.25;
    } else if (dusk) {
      sky = new THREE.Color(0xe8863a);
      sunColor = new THREE.Color(0xff9a3c);
      sunI = 1.6;
    } else if (dawn) {
      sky = new THREE.Color(0xe8a06a);
      sunColor = new THREE.Color(0xffc080);
      sunI = 1.4;
    } else {
      sky = new THREE.Color(0x8ec4e8);
      sunColor = new THREE.Color(0xfff0d0);
      sunI = 2.4;
    }
    scene.background = sky;
    scene.fog.color.copy(sky);
    sun.color.copy(sunColor);
    sun.intensity = sunI;
    hemi.intensity = night ? 0.35 : 0.9;
    const ang = (dayT * Math.PI);
    sun.position.set(Math.cos(ang) * 300, 60 + elev * 260, 180);
    sunDisc.position.set(Math.cos(ang) * 600, 40 + elev * 420, -500);
    sunDisc.material.color.set(night ? 0xc0d0e8 : dusk ? 0xff7a2a : 0xffd27a);
    for (const head of lampHeads) {
      head.material.color.set(night || dusk ? 0xffe9a0 : 0x8a8a7a);
    }
  }

  function sync(state, dt, time) {
    applyHour(state.hour);
    // Ocean breathing.
    ocean.material.opacity = 0.88 + Math.sin(time * 0.5) * 0.04;
    ocean.position.x = Math.sin(time * 0.08) * 6;
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 380) cloud.position.x = -380;
    }

    // Player: a person on foot, or hidden inside the driven car.
    if (!state.player.inCar) {
      if (!playerMesh) {
        playerMesh = makePersonMesh(0x2a6ac0);
        scene.add(playerMesh);
      }
      playerMesh.visible = true;
      playerMesh.position.set(state.player.x, 0, state.player.z);
      playerMesh.rotation.y = state.player.heading;
      const swing = Math.sin(state.player.walkPhase || 0) * (state.player.speed > 0.5 ? 0.55 : 0);
      playerMesh.getObjectByName('legL').rotation.x = swing;
      playerMesh.getObjectByName('legR').rotation.x = -swing;
      playerMesh.getObjectByName('armL').rotation.x = -swing;
      playerMesh.getObjectByName('armR').rotation.x = swing;
    } else if (playerMesh) {
      playerMesh.visible = false;
    }

    // Every car: traffic, parked, police and the player's.
    const allCars = [];
    if (state.playerCar) allCars.push(state.playerCar);
    for (const c of state.traffic) allCars.push(c);
    for (const c of state.parked) allCars.push(c);
    for (const c of state.police) allCars.push(c);
    for (const car of allCars) {
      const mesh = carMeshFor(car);
      mesh.visible = true;
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
      if (car.disabled) mesh.rotation.z = 0.12;
      if (car.kind === 'police') {
        const phase = Math.floor(time * 6) % 2 === 0;
        const red = mesh.getObjectByName('sirenRed');
        const blue = mesh.getObjectByName('sirenBlue');
        if (red) red.material.color.set(phase ? 0xff2020 : 0x550000);
        if (blue) blue.material.color.set(phase ? 0x550000 : 0x2040ff);
      }
    }

    // Pedestrians.
    for (const ped of state.peds) {
      const mesh = pedMeshFor(ped);
      mesh.visible = ped.alive;
      if (!ped.alive) continue;
      mesh.position.set(ped.x, 0, ped.z);
      mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.walkPhase || 0) * 0.5;
      mesh.getObjectByName('legL').rotation.x = swing;
      mesh.getObjectByName('legR').rotation.x = -swing;
      mesh.getObjectByName('armL').rotation.x = -swing;
      mesh.getObjectByName('armR').rotation.x = swing;
    }

    // Helicopter.
    if (state.heli && state.heli.active) {
      heli.visible = true;
      heli.position.set(state.heli.x, state.heli.y, state.heli.z);
      heli.rotation.y = state.heli.angle + Math.PI / 2;
      const rotorMesh = heli.getObjectByName('rotor');
      if (rotorMesh) rotorMesh.rotation.y += dt * 22;
    } else {
      heli.visible = false;
    }

    // Mission beacon.
    if (state.objective && state.objective.x !== undefined) {
      beacon.visible = true;
      beacon.position.set(state.objective.x, 0, state.objective.z);
      const pulse = 0.22 + Math.sin(time * 3) * 0.08;
      pillar.material.opacity = pulse;
      ring.scale.setScalar(1 + Math.sin(time * 2) * 0.15);
    } else {
      beacon.visible = false;
    }

    // Shot tracer.
    if (state.tracer && state.tracer.life > 0) {
      tracer.visible = true;
      const pos = tracer.geometry.attributes.position;
      pos.setXYZ(0, state.tracer.x1, 1.2, state.tracer.z1);
      pos.setXYZ(1, state.tracer.x2, 1.2, state.tracer.z2);
      pos.needsUpdate = true;
    } else {
      tracer.visible = false;
    }

    updateCamera(state, dt);
    renderer.render(scene, camera);
  }

  function updateCamera(state, dt) {
    if (state.camMode === 'title') {
      const t = state.titleTime || 0;
      camera.position.set(Math.cos(t * 0.05) * 160, 55, Math.sin(t * 0.05) * 160);
      camera.lookAt(0, 0, 25);
      return;
    }
    const target = state.player.inCar && state.playerCar ? state.playerCar : state.player;
    const heading = target.heading;
    const yaw = heading + Math.PI + (state.camYaw || 0);
    const dist = state.player.inCar ? 12 : 8;
    const height = state.player.inCar ? 5 : 4.2;
    const cx = target.x + Math.sin(yaw) * dist;
    const cz = target.z + Math.cos(yaw) * dist;
    tmpTarget.set(target.x, 1.2, target.z);
    if (camState.snapped) {
      camera.position.set(cx, height, cz);
      camera.lookAt(tmpTarget);
      camState.snapped = false;
    } else {
      const k = 1 - Math.exp(-dt * 4.5);
      camera.position.x += (cx - camera.position.x) * k;
      camera.position.y += (height - camera.position.y) * k;
      camera.position.z += (cz - camera.position.z) * k;
      camera.lookAt(tmpTarget);
    }
  }

  function snapCamera() {
    camState.snapped = true;
  }

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  return {
    renderer,
    scene,
    camera,
    sync,
    snapCamera,
    resize,
    applyHour,
  };
}
