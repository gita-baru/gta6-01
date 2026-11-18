// Three.js rendering: the sky, sun and ocean, the city meshes, the cars, the
// people and the chase camera. The simulation never touches three.js; this
// file only turns the world's state into a picture each frame.
// (v2, 18 Nov 2026) Unchanged: the camera snap lives in main.js, not here.
import * as THREE from 'three';
import { BEACH_Z, BLOCK, CITY_HALF, GRID, PITCH, ROAD } from './config.js';

const SKY_SETS = [
  { top: 0x7ec8f0, mid: 0xcfe8f5, low: 0xffe0b0, sun: 0xfff2c0, fog: 0xd8e8f0 }, // morning
  { top: 0x3f8fd0, mid: 0x9fd4ef, low: 0xfff0c0, sun: 0xffffff, fog: 0xcfe4ee }, // noon
  { top: 0x5a7fd0, mid: 0xf0b070, low: 0xffc070, sun: 0xffd890, fog: 0xf0c890 }, // golden hour
  { top: 0x2a3a70, mid: 0xe07050, low: 0xff9040, sun: 0xff7030, fog: 0xd89070 }, // sunset
];

function skyTexture(top, mid, low) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
  gradient.addColorStop(0.55, `#${mid.toString(16).padStart(6, '0')}`);
  gradient.addColorStop(1, `#${low.toString(16).padStart(6, '0')}`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildingTexture(baseColor, variant) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${baseColor.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 128, 256);
  const cols = variant === 0 ? 4 : variant === 1 ? 5 : 3;
  const rows = variant === 0 ? 10 : variant === 1 ? 8 : 12;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = ((r * 7 + c * 13 + variant * 5) % 9) === 0;
      ctx.fillStyle = lit ? '#ffd890' : '#2a3540';
      ctx.fillRect(10 + c * (108 / cols), 12 + r * (232 / rows), 108 / cols - 8, 232 / rows - 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function groundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const worldSize = CITY_HALF * 2 + 130;
  const toPx = (v) => ((v + worldSize / 2) / worldSize) * size;
  // Sand base (beach shows at the south edge).
  ctx.fillStyle = '#e8d5a0';
  ctx.fillRect(0, 0, size, size);
  // City ground.
  ctx.fillStyle = '#b8b0a0';
  ctx.fillRect(0, 0, size, toPx(BEACH_Z));
  // Sidewalk blocks.
  for (let bx = 0; bx < GRID; bx += 1) {
    for (let bz = 0; bz < GRID; bz += 1) {
      const x = -CITY_HALF + bx * PITCH + ROAD / 2;
      const z = -CITY_HALF + bz * PITCH + ROAD / 2;
      ctx.fillStyle = (bx + bz) % 2 ? '#c4bcae' : '#bcb4a6';
      ctx.fillRect(toPx(x), toPx(z), toPx(x + BLOCK) - toPx(x), toPx(z + BLOCK) - toPx(z));
    }
  }
  // Roads.
  ctx.fillStyle = '#3a3f46';
  for (let i = 0; i <= GRID; i += 1) {
    const c = -CITY_HALF + i * PITCH;
    ctx.fillRect(toPx(c - ROAD / 2), 0, toPx(c + ROAD / 2) - toPx(c - ROAD / 2), toPx(BEACH_Z));
    ctx.fillRect(0, toPx(c - ROAD / 2), toPx(CITY_HALF), toPx(c + ROAD / 2) - toPx(c - ROAD / 2));
  }
  // Lane dashes.
  ctx.fillStyle = '#e8d880';
  for (let i = 0; i <= GRID; i += 1) {
    const c = -CITY_HALF + i * PITCH;
    for (let d = -CITY_HALF; d < CITY_HALF; d += 16) {
      ctx.fillRect(toPx(c) - 1, toPx(d), 2, 6);
      ctx.fillRect(toPx(d), toPx(c) - 1, 6, 2);
    }
  }
  // Beach strip and water edge.
  ctx.fillStyle = '#f0e0b0';
  ctx.fillRect(0, toPx(BEACH_Z), size, toPx(BEACH_Z + 26) - toPx(BEACH_Z));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd8e8f0, 120, 700);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a60, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2c0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // Sky dome with a vertical gradient; the sun disc is a small emissive circle.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(0x7ec8f0, 0xcfe8f5, 0xffe0b0), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
  );
  scene.add(sunDisc);

  // Ground: one textured plane for the whole city, beach and sand.
  const worldSize = CITY_HALF * 2 + 130;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldSize, worldSize),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, (BEACH_Z - CITY_HALF) / 2 + 10);
  ground.receiveShadow = true;
  scene.add(ground);

  // Ocean plane south of the beach.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 500),
    new THREE.MeshLambertMaterial({ color: 0x2a7ab0 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.4, BEACH_Z + 26 + 250);
  scene.add(ocean);

  const buildingMats = new Map();
  function buildingMaterial(color, variant) {
    const key = `${color}-${variant}`;
    if (!buildingMats.has(key)) {
      buildingMats.set(key, new THREE.MeshLambertMaterial({ map: buildingTexture(color, variant) }));
    }
    return buildingMats.get(key);
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x707880 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const frondGeo = new THREE.ConeGeometry(1.6, 3.2, 4);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3a8a4a });
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.09, 6, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x404850 });
  const lampHeadGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });

  const dynamic = new Map(); // id -> { group, wheels, steer, lightRed, lightBlue, legs }
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.visible = false;
  scene.add(beacon);
  const beaconDiamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd040 }),
  );
  beaconDiamond.visible = false;
  scene.add(beaconDiamond);

  // Simple particle pool for dust, sparks and muzzle flashes.
  const PARTICLE_MAX = 240;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(PARTICLE_MAX * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0xffd080, size: 0.9, transparent: true, opacity: 0.9 });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.frustumCulled = false;
  scene.add(particles);
  const particleLife = new Float32Array(PARTICLE_MAX);
  const particleVel = new Float32Array(PARTICLE_MAX * 3);
  let particleCursor = 0;

  function spawnParticles(x, y, z, count, spread, up) {
    for (let i = 0; i < count; i += 1) {
      const idx = particleCursor;
      particleCursor = (particleCursor + 1) % PARTICLE_MAX;
      particlePos[idx * 3] = x;
      particlePos[idx * 3 + 1] = y;
      particlePos[idx * 3 + 2] = z;
      particleVel[idx * 3] = (Math.random() - 0.5) * spread;
      particleVel[idx * 3 + 1] = Math.random() * up;
      particleVel[idx * 3 + 2] = (Math.random() - 0.5) * spread;
      particleLife[idx] = 0.5 + Math.random() * 0.4;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  function buildCity(city) {
    for (const b of city.buildings) {
      const mesh = new THREE.Mesh(boxGeo, buildingMaterial(b.color, b.variant));
      mesh.scale.set(b.w, b.h, b.d);
      mesh.position.set(b.x + b.w / 2, b.h / 2, b.z + b.d / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(b.w + 0.4, 0.5, b.d + 0.4);
      roof.position.set(b.x + b.w / 2, b.h + 0.25, b.z + b.d / 2);
      scene.add(roof);
    }
    for (const p of city.palms) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(p.x, 2.5, p.z);
      trunk.castShadow = true;
      scene.add(trunk);
      for (let f = 0; f < 6; f += 1) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.set(p.x, 5.4, p.z);
        frond.rotation.z = Math.PI / 2.6;
        frond.rotation.y = (f / 6) * Math.PI * 2;
        frond.scale.set(1, 1, 0.35);
        scene.add(frond);
      }
    }
    for (const lamp of city.lamps) {
      const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
      pole.position.set(lamp.x, 3, lamp.z);
      scene.add(pole);
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(lamp.x, 6.1, lamp.z);
      scene.add(head);
    }
  }

  function makeCarMesh(color, sport, police) {
    const group = new THREE.Group();
    const bodyColor = police ? 0xf0f0f0 : color;
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
    const body = new THREE.Mesh(boxGeo, bodyMat);
    body.scale.set(sport ? 4.6 : 4.4, 0.75, 1.9);
    body.position.y = 0.62;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(boxGeo, darkMat);
    cabin.scale.set(2.2, 0.62, 1.7);
    cabin.position.set(-0.2, 1.28, 0);
    cabin.castShadow = true;
    group.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14181c });
    const wheels = [];
    const steer = [];
    for (const [wx, wz] of [[1.45, 0.85], [1.45, -0.85], [-1.45, 0.85], [-1.45, -0.85]]) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.36, wz);
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      pivot.add(wheel);
      group.add(pivot);
      wheels.push(wheel);
      if (wx > 0) steer.push(pivot);
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const wz of [0.6, -0.6]) {
      const head = new THREE.Mesh(boxGeo, lightMat);
      head.scale.set(0.12, 0.18, 0.3);
      head.position.set(2.24, 0.66, wz);
      group.add(head);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
    for (const wz of [0.6, -0.6]) {
      const tail = new THREE.Mesh(boxGeo, tailMat);
      tail.scale.set(0.12, 0.18, 0.3);
      tail.position.set(-2.24, 0.66, wz);
      group.add(tail);
    }
    let lightRed = null;
    let lightBlue = null;
    if (police) {
      const stripe = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
      stripe.scale.set(4.42, 0.2, 1.92);
      stripe.position.y = 0.95;
      group.add(stripe);
      lightRed = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      lightRed.scale.set(0.5, 0.16, 0.5);
      lightRed.position.set(-0.2, 1.66, 0.45);
      group.add(lightRed);
      lightBlue = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x2040ff }));
      lightBlue.scale.set(0.5, 0.16, 0.5);
      lightBlue.position.set(-0.2, 1.66, -0.45);
      group.add(lightBlue);
    }
    return { group, wheels, steer, lightRed, lightBlue };
  }

  function makePersonMesh(shirt, pants) {
    const group = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xd8a080 });
    const torso = new THREE.Mesh(boxGeo, shirtMat);
    torso.scale.set(0.55, 0.75, 0.32);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinMat);
    head.position.y = 1.72;
    head.castShadow = true;
    group.add(head);
    const legL = new THREE.Mesh(boxGeo, pantsMat);
    legL.scale.set(0.2, 0.75, 0.2);
    legL.position.set(0.14, 0.38, 0);
    group.add(legL);
    const legR = new THREE.Mesh(boxGeo, pantsMat);
    legR.scale.set(0.2, 0.75, 0.2);
    legR.position.set(-0.14, 0.38, 0);
    group.add(legR);
    const armL = new THREE.Mesh(boxGeo, shirtMat);
    armL.scale.set(0.14, 0.6, 0.14);
    armL.position.set(0.36, 1.15, 0);
    group.add(armL);
    const armR = new THREE.Mesh(boxGeo, shirtMat);
    armR.scale.set(0.14, 0.6, 0.14);
    armR.position.set(-0.36, 1.15, 0);
    group.add(armR);
    return { group, legL, legR, armL, armR };
  }

  const camState = { yaw: 0, pitch: 0.32, dist: 9 };

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setTimeOfDay(t) {
    // t in [0,1]: 0 dawn, 0.5 noon, 1 dusk. Pick the nearest of four looks.
    const set = SKY_SETS[Math.max(0, Math.min(3, Math.round(t * 3)))];
    sky.material.map = skyTexture(set.top, set.mid, set.low);
    sky.material.needsUpdate = true;
    scene.fog.color.setHex(set.fog);
    sun.color.setHex(set.sun);
    sunDisc.material.color.setHex(set.sun);
    const angle = Math.PI * (0.15 + t * 0.7);
    const elevation = Math.sin(angle) * 0.9 + 0.15;
    sun.position.set(Math.cos(angle) * 120, elevation * 160, -80);
    sunDisc.position.set(Math.cos(angle) * 800, elevation * 700, -700);
    sunDisc.lookAt(camera.position);
    hemi.intensity = 0.55 + (1 - Math.abs(t - 0.5)) * 0.5;
    sun.intensity = 2.4 - Math.abs(t - 0.5) * 1.2;
  }

  return {
    scene,
    camera,
    buildCity,
    makeCarMesh,
    makePersonMesh,
    resize,
    setTimeOfDay,
    spawnParticles,
    dynamic,
    setBeacon(x, z, visible) {
      beacon.visible = visible;
      beaconDiamond.visible = visible;
      if (visible) {
        beacon.position.set(x, 30, z);
        beaconDiamond.position.set(x, 8 + Math.sin(performance.now() / 300) * 0.6, z);
        beaconDiamond.rotation.y = performance.now() / 500;
      }
    },
    updateParticles(dt) {
      for (let i = 0; i < PARTICLE_MAX; i += 1) {
        if (particleLife[i] <= 0) continue;
        particleLife[i] -= dt;
        particlePos[i * 3] += particleVel[i * 3] * dt;
        particlePos[i * 3 + 1] += particleVel[i * 3 + 1] * dt;
        particlePos[i * 3 + 2] += particleVel[i * 3 + 2] * dt;
        particleVel[i * 3 + 1] -= 4 * dt;
        if (particleLife[i] <= 0) particlePos[i * 3 + 1] = -100;
      }
      particleGeo.attributes.position.needsUpdate = true;
    },
    updateCamera(focus, yaw, pitch, dist, dt) {
      camState.yaw += (yaw - camState.yaw) * Math.min(1, dt * 10);
      camState.pitch += (pitch - camState.pitch) * Math.min(1, dt * 10);
      camState.dist += (dist - camState.dist) * Math.min(1, dt * 5);
      const cx = focus.x - Math.sin(camState.yaw) * Math.cos(camState.pitch) * camState.dist;
      const cz = focus.z - Math.cos(camState.yaw) * Math.cos(camState.pitch) * camState.dist;
      const cy = focus.y + Math.sin(camState.pitch) * camState.dist + 1.2;
      camera.position.set(cx, Math.max(cy, 1.2), cz);
      camera.lookAt(focus.x, focus.y + 1.4, focus.z);
      // Shadows follow the action.
      sun.position.set(focus.x + 90, 130, focus.z - 60);
      sun.target.position.set(focus.x, 0, focus.z);
      sun.target.updateMatrixWorld();
    },
    setCameraDirect(position, lookAt) {
      camera.position.copy(position);
      camera.lookAt(lookAt);
      camState.yaw = Math.atan2(-(position.x - lookAt.x), -(position.z - lookAt.z));
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
