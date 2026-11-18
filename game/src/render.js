// Solmar Heat — the Three.js view: the city, the cars, the people, the sky.
// Reads the plain game state and moves meshes to match it.
import { BLOCK, BOUND, MISSIONS, PITCH, STREETS } from "./config.js";

const THREE = window.THREE;

function makeWindowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#20242a";
  g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 10; x < 118; x += 18) {
      g.fillStyle = Math.random() < 0.45 ? "#ffd98a" : "#3a4a5a";
      g.fillRect(x, y, 10, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Sky keyframes: [hour, color, sun intensity].
const SKY = [
  [0, 0x0b1026, 0.12],
  [5, 0x0b1026, 0.12],
  [7, 0xe8906b, 0.55],
  [9, 0x87b5e0, 1.05],
  [16, 0x8fc0e8, 1.05],
  [18.5, 0xe07840, 0.5],
  [20, 0x0b1026, 0.12],
  [24, 0x0b1026, 0.12],
];

function skyAt(clock) {
  const h = (clock / 3600) % 24;
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, c0, s0] = SKY[i];
    const [h1, c1, s1] = SKY[i + 1];
    if (h >= h0 && h <= h1) {
      const f = (h - h0) / (h1 - h0 || 1);
      const col = new THREE.Color(c0).lerp(new THREE.Color(c1), f);
      return { color: col, sun: s0 + (s1 - s0) * f, day: f };
    }
  }
  return { color: new THREE.Color(0x0b1026), sun: 0.12, day: 0 };
}

export class Renderer {
  constructor(container, city) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87b5e0, 220, 760);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 40, 80);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.position.set(120, 180, 60);
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x3a3230, 0.7));
    this.city = city;
    this.carMeshes = new Map();
    this.pedMeshes = new Map();
    this.windowTex = makeWindowTexture();
    this.buildStatic();
    this.beacon = this.makeBeacon();
    this.heli = this.makeHeli();
    this.scene.add(this.beacon);
    this.scene.add(this.heli);
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  box(w, h, d, color, x, y, z, opts = {}) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, ...opts })
    );
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  buildStatic() {
    // Ground, sand and ocean.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshLambertMaterial({ color: 0x5d7a4e })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 120);
    this.scene.add(ground);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 46),
      new THREE.MeshLambertMaterial({ color: 0xe0c98f })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.02, 266);
    this.scene.add(sand);
    this.ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 460),
      new THREE.MeshPhongMaterial({ color: 0x1a5f8a, transparent: true, opacity: 0.92, shininess: 120 })
    );
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.set(0, 0.1, 520);
    this.scene.add(this.ocean);
    // Sidewalk strips, then darker road strips on top.
    for (const s of STREETS) {
      const sw1 = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 500),
        new THREE.MeshLambertMaterial({ color: 0x8a8a84 })
      );
      sw1.rotation.x = -Math.PI / 2;
      sw1.position.set(s, 0.01, 0);
      this.scene.add(sw1);
      const rd1 = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 500),
        new THREE.MeshLambertMaterial({ color: 0x2b2b30 })
      );
      rd1.rotation.x = -Math.PI / 2;
      rd1.position.set(s, 0.03, 0);
      this.scene.add(rd1);
      const sw2 = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 16),
        new THREE.MeshLambertMaterial({ color: 0x8a8a84 })
      );
      sw2.rotation.x = -Math.PI / 2;
      sw2.position.set(0, 0.01, s);
      this.scene.add(sw2);
      const rd2 = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 12),
        new THREE.MeshLambertMaterial({ color: 0x2b2b30 })
      );
      rd2.rotation.x = -Math.PI / 2;
      rd2.position.set(0, 0.03, s);
      this.scene.add(rd2);
    }
    // Block slabs and buildings.
    for (const b of this.city.blocks) {
      const color = b.kind === "park" ? 0x4a7c43 : b.kind === "plaza" ? 0xb0a894 : 0x9a938a;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK, 0.6, BLOCK),
        new THREE.MeshLambertMaterial({ color })
      );
      slab.position.set(b.x, 0.3, b.z);
      this.scene.add(slab);
      if (b.kind === "park") {
        for (let i = 0; i < 3; i++) {
          const tx = b.x + (i - 1) * 10;
          const tz = b.z + ((i % 2) - 0.5) * 12;
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.5, 3, 6),
            new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
          );
          trunk.position.set(tx, 2, tz);
          this.scene.add(trunk);
          const top = new THREE.Mesh(
            new THREE.ConeGeometry(3, 7, 8),
            new THREE.MeshLambertMaterial({ color: 0x2f6b2f })
          );
          top.position.set(tx, 6.5, tz);
          this.scene.add(top);
        }
      }
    }
    for (const b of this.city.buildings) {
      const mat = new THREE.MeshLambertMaterial({ color: b.color, map: this.windowTex });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.hw * 2, b.h, b.hd * 2), mat);
      mesh.position.set(b.x, b.h / 2 + 0.6, b.z);
      this.scene.add(mesh);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.hw * 2 + 0.4, 0.5, b.hd * 2 + 0.4),
        new THREE.MeshLambertMaterial({ color: 0x3a3a3a })
      );
      roof.position.set(b.x, b.h + 0.85, b.z);
      this.scene.add(roof);
    }
    // A pier into the ocean and a ferris wheel silhouette on the beach.
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(8, 1, 60),
      new THREE.MeshLambertMaterial({ color: 0x7a5c3a })
    );
    pier.position.set(-130, 0.6, 310);
    this.scene.add(pier);
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(14, 0.8, 8, 24),
      new THREE.MeshLambertMaterial({ color: 0xf1c40f })
    );
    wheel.position.set(130, 22, 270);
    this.scene.add(wheel);
  }

  makeBeacon() {
    const g = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    col.position.y = 35;
    g.add(col);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.35, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xf1c40f })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    g.add(ring);
    return g;
  }

  makeHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 2, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x1a2a4a })
    );
    g.add(body);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x1a2a4a })
    );
    tail.position.set(-4, 0.4, 0);
    g.add(tail);
    this.rotor = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.15, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    this.rotor.position.y = 1.3;
    g.add(this.rotor);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8 })
    );
    lamp.position.set(0, -1.2, 0);
    g.add(lamp);
    g.visible = false;
    return g;
  }

  makeCarMesh(car) {
    const g = new THREE.Group();
    const bodyColor = car.kind === "police" ? 0x1a1a1a : car.color;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.85, 4.2),
      new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    body.position.y = 0.65;
    g.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.7, 2),
      new THREE.MeshLambertMaterial({ color: 0x182430 })
    );
    cabin.position.set(0, 1.35, -0.2);
    g.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const wheels = [];
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.42, wz);
      g.add(w);
      wheels.push(w);
    }
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    for (const hx of [-0.6, 0.6]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), headMat);
      h.position.set(hx, 0.7, 2.12);
      g.add(h);
    }
    if (car.kind === "police") {
      const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
      barR.position.set(-0.4, 1.85, 0);
      g.add(barR);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
      barB.position.set(0.4, 1.85, 0);
      g.add(barB);
      g.userData.barR = barR;
      g.userData.barB = barB;
    }
    g.userData.wheels = wheels;
    return g;
  }

  makePedMesh(ped) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.4, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: ped.color })
    );
    body.position.y = 0.85;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xd9a066 })
    );
    head.position.y = 1.65;
    g.add(head);
    return g;
  }

  sync(S, dt) {
    // Cars: add meshes for new cars, drop them for removed ones.
    const seen = new Set();
    for (const car of S.cars) {
      seen.add(car.id);
      let mesh = this.carMeshes.get(car.id);
      if (!mesh) {
        mesh = this.makeCarMesh(car);
        this.carMeshes.set(car.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.angle;
      const spin = car.speed * dt * 2;
      for (const w of mesh.userData.wheels) w.rotation.x += spin;
      if (car.kind === "police" && mesh.userData.barR) {
        const on = Math.sin(S.time * 9) > 0;
        mesh.userData.barR.material.color.setHex(on ? 0xff0000 : 0x550000);
        mesh.userData.barB.material.color.setHex(on ? 0x002266 : 0x2266ff);
      }
    }
    for (const [id, mesh] of this.carMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.carMeshes.delete(id);
      }
    }
    // Pedestrians.
    const seenP = new Set();
    S.peds.forEach((ped, i) => {
      seenP.add(i);
      let mesh = this.pedMeshes.get(i);
      if (!mesh) {
        mesh = this.makePedMesh(ped);
        this.pedMeshes.set(i, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(ped.x, ped.state === "down" ? 0.25 : 0, ped.z);
      mesh.rotation.y = ped.angle;
      mesh.rotation.z = ped.state === "down" ? Math.PI / 2 : 0;
      mesh.visible = ped.state !== "down" || true;
    });
    // Player on foot.
    if (!this.playerMesh) {
      this.playerMesh = this.makePedMesh({ color: 0x27ae60 });
      this.scene.add(this.playerMesh);
    }
    this.playerMesh.visible = S.player.onFoot;
    if (S.player.onFoot) {
      this.playerMesh.position.set(S.player.x, 0, S.player.z);
      this.playerMesh.rotation.y = S.player.angle;
    }
    // Helicopter.
    this.heli.visible = S.heli.active;
    if (S.heli.active) {
      this.heli.position.set(S.heli.x, S.heli.y, S.heli.z);
      this.heli.rotation.y = S.heli.angle + Math.PI / 2;
      this.rotor.rotation.y += dt * 22;
    }
    // Mission beacon.
    let bx = 0, bz = 0, show = false;
    if (S.mission.active) {
      const m = MISSIONS[S.mission.index];
      const step = m && m.steps[S.mission.step];
      if (step && step.x !== undefined && step.type !== "survive") {
        bx = step.x;
        bz = step.z;
        show = true;
      }
    }
    this.beacon.visible = show;
    if (show) {
      this.beacon.position.set(bx, 0, bz);
      this.beacon.children[0].material.opacity = 0.22 + Math.sin(S.time * 4) * 0.08;
    }
    // Ocean shimmer and the sun.
    this.ocean.position.y = 0.1 + Math.sin(S.time * 0.7) * 0.08;
    const sky = skyAt(S.clock);
    this.scene.background = sky.color;
    this.scene.fog.color.copy(sky.color);
    this.sun.intensity = sky.sun;
    const h = ((S.clock / 3600) % 24) / 24;
    const ang = (h - 0.25) * Math.PI * 2;
    this.sun.position.set(Math.cos(ang) * 200, Math.max(20, Math.sin(ang) * 220), 80);
    this.renderer.render(this.scene, this.camera);
  }

  followCamera(S, dt, snap, pose) {
    if (pose) {
      this.camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      this.camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
      return;
    }
    const p = S.player;
    const dist = p.onFoot ? 8.5 : 12;
    const height = p.onFoot ? 3.6 : 5.2;
    const fx = Math.sin(p.angle);
    const fz = Math.cos(p.angle);
    const tx = p.x - fx * dist;
    const tz = p.z - fz * dist;
    if (snap) {
      this.camera.position.set(tx, height, tz);
    } else {
      const k = 1 - Math.exp(-dt * 5);
      this.camera.position.x += (tx - this.camera.position.x) * k;
      this.camera.position.y += (height - this.camera.position.y) * k;
      this.camera.position.z += (tz - this.camera.position.z) * k;
    }
    this.camera.lookAt(p.x + fx * 7, 1.6, p.z + fz * 7);
  }
}
