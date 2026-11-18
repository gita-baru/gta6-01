// Solmar Heat — the HUD (DOM) and the live minimap (2D canvas).
import { BOUND } from "./config.js";
import { stars } from "./police.js";
import { currentObjective } from "./missions.js";

function el(id) {
  return document.getElementById(id);
}

export function fmtMoney(n) {
  return "$" + Math.floor(n).toLocaleString("en-US");
}

export function fmtClock(seconds) {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor(seconds / 60) % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function updateHud(S, audio) {
  el("money").textContent = fmtMoney(S.money);
  const s = stars(S);
  el("stars").textContent = "★".repeat(s) + "☆".repeat(5 - s);
  el("stars").style.color = s >= 4 ? "#ff4d4d" : s >= 2 ? "#ffcc00" : "#ffffff";
  const hp = el("health-fill");
  hp.style.width = Math.max(0, S.health) + "%";
  hp.style.background = S.health > 50 ? "#2ecc71" : S.health > 25 ? "#f39c12" : "#e74c3c";
  const speed = S.player.onFoot ? 0 : Math.abs(S.player.car ? S.player.car.speed : 0);
  el("speed").textContent = Math.round(speed * 3.6) + " km/h";
  el("ammo").textContent = "Ammo " + S.ammo;
  el("clock").textContent = fmtClock(S.clock);
  el("radio").textContent = "♪ " + (audio ? audio.stationName() : "SOLMAR FM");
  const obj = currentObjective(S);
  if (obj) {
    el("objective").textContent = obj.text;
    el("obj-dist").textContent =
      obj.timer > 0 ? Math.ceil(obj.timer) + "s" : Math.round(obj.dist) + " m";
  } else if (S.mission.done.every(Boolean)) {
    el("objective").textContent = "All jobs done — Solmar is yours.";
    el("obj-dist").textContent = "";
  } else {
    el("objective").textContent = "Press T to start the next job";
    el("obj-dist").textContent = "";
  }
  if (S.bannerT > 0) {
    el("banner").textContent = S.banner;
    el("banner").style.opacity = "1";
  } else {
    el("banner").style.opacity = "0";
  }
  drawMinimap(S);
}

function drawMinimap(S) {
  const c = el("minimap");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  const scale = W / (BOUND * 2 + 120);
  const toX = (x) => W / 2 + x * scale;
  const toY = (z) => H / 2 + z * scale;
  ctx.fillStyle = "#0d1b2a";
  ctx.fillRect(0, 0, W, H);
  // Ocean and sand (south).
  ctx.fillStyle = "#155e8a";
  ctx.fillRect(0, toY(288), W, H - toY(288));
  ctx.fillStyle = "#d9c48a";
  ctx.fillRect(0, toY(244), W, toY(288) - toY(244));
  // Roads.
  ctx.strokeStyle = "#5a5f6a";
  ctx.lineWidth = 3;
  for (let i = -234; i <= 234; i += 52) {
    ctx.beginPath();
    ctx.moveTo(toX(i), toY(-240));
    ctx.lineTo(toX(i), toY(240));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX(-240), toY(i));
    ctx.lineTo(toX(240), toY(i));
    ctx.stroke();
  }
  // Mission target.
  const obj = currentObjective(S);
  if (obj && obj.dist > 0) {
    const pulse = 4 + Math.sin(S.time * 5) * 2;
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath();
    ctx.arc(toX(obj.x), toY(obj.z), pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // Traffic.
  ctx.fillStyle = "#cfd8dc";
  for (const car of S.cars) {
    if (car.kind === "traffic" || car.kind === "parked") {
      ctx.fillRect(toX(car.x) - 1.5, toY(car.z) - 1.5, 3, 3);
    }
  }
  // Police.
  ctx.fillStyle = "#ff5252";
  for (const car of S.cars) {
    if (car.kind === "police") {
      ctx.beginPath();
      ctx.arc(toX(car.x), toY(car.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Helicopter.
  if (S.heli.active) {
    ctx.fillStyle = "#ff8a65";
    ctx.beginPath();
    ctx.arc(toX(S.heli.x), toY(S.heli.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  ctx.save();
  ctx.translate(toX(S.player.x), toY(S.player.z));
  ctx.rotate(Math.atan2(Math.sin(S.player.angle), Math.cos(S.player.angle)) + Math.PI);
  ctx.fillStyle = "#2ecc71";
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function showScreen(name) {
  for (const id of ["title-screen", "pause-screen", "busted-screen", "wasted-screen"]) {
    el(id).style.display = id === name ? "flex" : "none";
  }
}
