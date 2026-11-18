// Solara Bay — boot and the one game loop. Builds the renderer, the city and
// every system, then runs input → simulation → camera → HUD every frame.
// The game moves between title, playing, paused, dead and story-complete.
import * as THREE from 'three';
import { CONFIG, createState, clamp, formatMoney } from './config.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Vehicle, nearestVehicle } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Particles } from './particles.js';
import { saveGame, loadSave, hasSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '7', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 8, 30);

const G = {
  state: createState(),
  scene, camera, renderer,
  world: null, player: null, input: null, audio: null, particles: null,
  traffic: null, pedestrians: null, police: null, combat: null, missions: null, hud: null,
  parked: [],
  shotFrames: 0, shotReadyAfter: 0,
  driveCamOffset: 0,
  autosaveTimer: 0,
  lightTimer: 0,
  titleOrbit: 0,
};

G.world = new World(scene, seed);
G.player = new Player(scene);
G.input = new Input(canvas);
G.audio = new AudioEngine();
G.particles = new Particles(scene);
window.__particles = G.particles;
G.traffic = new Traffic(scene, G.world, seed + 1);
G.pedestrians = new Pedestrians(scene, G.world);
G.police = new Police(scene, G.world);
G.combat = new Combat(scene, G.world);
G.missions = new Missions(G);
G.hud = new HUD();

// Parked cars the player can take without a driver inside.
const PARK_SPOTS = [
  { x: 30, z: 22, yaw: Math.PI / 2 }, { x: -14, z: -22, yaw: -Math.PI / 2 },
  { x: 74, z: 110, yaw: 0 }, { x: 110, z: 74, yaw: Math.PI },
  { x: -102, z: 66, yaw: Math.PI / 2 }, { x: 158, z: -66, yaw: 0 },
  { x: -58, z: 154, yaw: -Math.PI / 2 }, { x: 22, z: -102, yaw: Math.PI / 2 },
];
for (const spot of PARK_SPOTS) {
  const color = CONFIG.CAR_COLORS[Math.floor(Math.random() * CONFIG.CAR_COLORS.length)];
  const v = new Vehicle(scene, spot.x, spot.z, spot.yaw, color, false);
  v.driver = 'none';
  G.parked.push(v);
}
// A few health/armor/ammo pickups scattered around town.
G.world.spawnPickup('health', -58, 146);
G.world.spawnPickup('armor', 146, -146);
G.world.spawnPickup('ammo', 30, 58);
G.world.spawnPickup('health', 102, 118);

G.allCars = function () {
  const list = [...G.parked, ...G.traffic.allVehicles(), ...G.police.cars];
  if (G.state.driving && !list.includes(G.state.driving)) list.push(G.state.driving);
  return list;
};

G.saveGame = function () { return saveGame(G); };

G.damagePlayer = function (amount, source) {
  const s = G.state;
  if (s.mode !== 'playing') return;
  let rest = amount;
  if (s.armor > 0) {
    const absorbed = Math.min(s.armor, rest * 0.6);
    s.armor -= absorbed;
    rest -= absorbed;
  }
  s.health -= rest;
  s.shake = Math.min(1, s.shake + 0.35);
  G.player.healthFlash = 0.25;
  if (s.health <= 0) {
    s.health = 0;
    G.die(source || 'You died');
  }
};

G.die = function (reason) {
  const s = G.state;
  if (s.mode !== 'playing') return;
  s.mode = 'dead';
  s.deathTimer = 3;
  s.deathReason = reason;
  G.hud.deadText.textContent = `${reason}. Respawning at Solara General…`;
  G.hud.showScreen('dead');
  G.input.unlockPointer();
  G.audio.setEngine(0, false);
  G.audio.setSiren(false);
};

G.onBusted = function (reason) {
  const s = G.state;
  if (s.mode !== 'playing') return;
  s.mode = 'dead';
  s.deathTimer = 3;
  s.deathReason = reason;
  G.police.clearWanted(s);
  G.hud.deadText.textContent = `${reason}. You were taken in — respawning at Solara General…`;
  G.hud.showScreen('dead');
  G.input.unlockPointer();
};

G.respawn = function () {
  const s = G.state;
  const cost = Math.min(s.money, CONFIG.RESPAWN_COST);
  s.money -= cost;
  s.health = s.maxHealth;
  s.armor = 0;
  s.wanted = 0;
  s.missionActive = false;
  G.missions.clearWaypoint();
  G.combat.clearEnemies();
  if (s.inCar) G.exitCar();
  const H = G.world.landmarks.hospital;
  G.player.reset(H.x - 20, H.z + 4, 0);
  s.mode = 'playing';
  s.message = cost > 0 ? `Hospital bill −${formatMoney(cost)}` : 'You woke up at Solara General';
  s.messageTimer = 4;
  G.hud.showScreen('playing');
  G.saveGame();
};

G.enterCar = function (car, silent = false) {
  const s = G.state;
  if (car.driver === 'traffic') {
    // Pull the driver out of traffic; they run off on foot.
    const ti = G.traffic.cars.findIndex((c) => c.v === car);
    if (ti >= 0) G.traffic.cars.splice(ti, 1);
    G.pedestrians.scare(car.pos.x, car.pos.z, 6);
    G.police.addWanted(s, 1, 'Car stolen — 1 star');
    if (!silent) G.audio.doorSlam();
  } else if (car.driver === 'police') {
    G.police.addWanted(s, 2, 'You stole a police cruiser — 2 stars!');
  } else if (!silent) {
    s.message = 'Borrowed a parked car';
    s.messageTimer = 2;
  }
  if (!silent) s.carsStolen += 1;
  car.driver = 'player';
  car.stolen = true;
  s.driving = car;
  s.inCar = true;
  s.speedKmh = 0;
  G.player.mesh.visible = false;
  G.player.setArmed(false);
  if (!silent) G.audio.doorSlam();
};

G.exitCar = function () {
  const s = G.state;
  const car = s.driving;
  if (!car) return;
  car.driver = 'none';
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const sideX = car.pos.x - fz * 2.2, sideZ = car.pos.z + fx * 2.2;
  G.player.reset(sideX, sideZ, car.yaw);
  G.player.mesh.visible = true;
  s.driving = null;
  s.inCar = false;
  s.speedKmh = 0;
  G.audio.setEngine(0, false);
};

function newGame(missionIndex = 0) {
  const s = G.state;
  const fresh = createState();
  Object.assign(s, fresh);
  s.mode = 'playing';
  G.player.reset(0, 22, 0);
  G.player.mesh.visible = true;
  G.police.clearWanted(s);
  G.combat.clearEnemies();
  G.missions.clearWaypoint();
  G.hud.showScreen('playing');
  G.audio.ensure();
  G.missions.startMission(missionIndex);
  G.saveGame();
}

function continueGame() {
  const data = loadSave();
  if (!data) { newGame(0); return; }
  const s = G.state;
  const fresh = createState();
  Object.assign(s, fresh);
  s.mode = 'playing';
  s.money = data.money;
  s.health = data.health;
  s.armor = data.armor;
  s.wanted = data.wanted;
  s.weapon = data.weapon;
  s.ammoReserve = data.ammoReserve;
  s.ammoMag = data.ammoMag;
  s.kills = data.kills;
  s.carsStolen = data.carsStolen;
  s.missionsDone = data.missionsDone;
  s.missionIndex = data.missionIndex;
  s.clockMinutes = data.clockMinutes;
  G.player.reset(data.player.x, data.player.z, data.player.yaw);
  G.player.mesh.visible = true;
  if (data.car) {
    const car = G.parked[0];
    car.pos.set(data.car.x, 0, data.car.z);
    car.yaw = data.car.yaw;
    car.mesh.position.copy(car.pos);
    G.enterCar(car, true);
  }
  s.missionObjective = s.missionsDone >= 5 ? 'Story complete — free roam' : 'Press Enter to start the next mission';
  G.hud.showScreen('playing');
  G.audio.ensure();
  G.saveGame();
}

function togglePause() {
  const s = G.state;
  if (s.mode === 'playing') {
    s.mode = 'paused';
    G.hud.showScreen('paused');
    G.input.unlockPointer();
    G.audio.setEngine(0, false);
    G.audio.setSiren(false);
  } else if (s.mode === 'paused') {
    s.mode = 'playing';
    G.hud.showScreen('playing');
    G.audio.ensure();
  }
}

G.input.onPause = () => { if (G.state.mode === 'playing' || G.state.mode === 'paused') togglePause(); };

// First gesture unlocks audio (browsers require it).
const unlockAudio = () => { G.audio.ensure(); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// Wire the menus.
G.hud.setTitleButtons(hasSave(), () => newGame(0), () => continueGame(), (i) => newGame(i));
G.hud.setPauseButtons(
  () => togglePause(),
  () => { if (G.saveGame()) { G.state.message = 'Game saved'; G.state.messageTimer = 2; } },
  () => { G.state.mode = 'title'; G.hud.showScreen('title'); G.hud.setTitleButtons(hasSave(), () => newGame(0), () => continueGame(), (i) => newGame(i)); G.input.unlockPointer(); },
  () => { document.getElementById('settings-panel').classList.toggle('hidden'); },
);
G.hud.setDeadButton(() => G.respawn());
G.hud.setCompleteButton(() => { G.state.mode = 'playing'; G.hud.showScreen('playing'); });
G.hud.bindSettings(
  (v) => { G.state.volume = v; G.audio.setVolume(v); },
  (v) => { G.state.sensitivity = 0.5 + v; },
  () => { G.state.muted = !G.state.muted; G.audio.setMuted(G.state.muted); G.hud.syncSettings(G.state.volume, G.state.sensitivity, G.state.muted); },
);
G.hud.syncSettings(G.state.volume, G.state.sensitivity, G.state.muted);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- per-frame simulation --------------------------------------------------
function updatePlaying(dt) {
  const s = G.state;
  const input = G.input;
  s.clockMinutes += dt * CONFIG.MINUTES_PER_SECOND;
  if (s.clockMinutes >= 24 * 60) s.clockMinutes -= 24 * 60;
  G.lightTimer -= dt;
  if (G.lightTimer <= 0) { G.lightTimer = 5; G.world.updateLighting(s.clockMinutes); }
  s.messageTimer = Math.max(0, s.messageTimer - dt);
  s.shake = Math.max(0, s.shake - dt * 1.6);
  window.__shake = s.shake;

  // Global keys.
  if (input.wasPressed('KeyM')) {
    s.muted = !s.muted;
    G.audio.setMuted(s.muted);
    G.hud.syncSettings(s.volume, s.sensitivity, s.muted);
  }
  if (input.wasPressed('Digit1')) { s.weapon = 'fists'; G.player.setArmed(false); }
  if (input.wasPressed('Digit2')) { s.weapon = 'pistol'; G.player.setArmed(true); G.audio.click(); }
  if (input.wasPressed('KeyR')) G.combat.reload(G);
  if (input.wasPressed('Enter') && !s.missionActive && s.missionsDone < 5) {
    G.missions.startMission(s.missionIndex);
  } else if (input.wasPressed('Enter') && s.missionFailed) {
    G.missions.startMission(s.missionIndex);
  }

  // Find the nearest car for the steal prompt.
  const focus = s.inCar ? s.driving.pos : G.player.pos;
  s.nearCar = nearestVehicle(G.allCars(), focus.x, focus.z, s.inCar ? 0 : 4.5, s.driving);

  if (s.inCar) {
    const car = s.driving;
    const axes = input.moveAxes();
    const mouse = input.consumeMouse();
    G.driveCamOffset = clamp(G.driveCamOffset - mouse.dx * 0.0022 * s.sensitivity, -1.4, 1.4);
    G.driveCamOffset *= Math.max(0, 1 - dt * 0.4);
    const throttle = axes.y;
    const steer = -axes.x;
    const handbrake = input.down('Space');
    const travelled = car.drive(dt, throttle, steer, handbrake, G.world, (kind, impact) => {
      if (kind === 'crash') {
        G.audio.crash();
        s.shake = Math.min(1, s.shake + Math.min(0.6, impact * 0.02));
        if (window.__particles) window.__particles.sparks(car.pos.x, 0.8, car.pos.z);
        G.damagePlayer(Math.min(18, impact * 0.5), 'Crashed the car');
        car.damage(Math.min(20, impact));
      } else if (kind === 'skid') {
        G.audio.skid();
      }
    });
    s.stats.distanceDriven += travelled;
    s.speedKmh = Math.abs(car.speed) * 3.6;
    // While driving, the player's position IS the car's — missions, police,
    // the minimap and pickups all read player.pos.
    G.player.pos.copy(car.pos);
    G.player.yaw = car.yaw;
    G.audio.setEngine(Math.abs(car.speed) / car.maxSpeed, true);
    // Exhaust + dust while driving.
    if (Math.abs(car.speed) > 4 && Math.random() < dt * 14) {
      const f = car.forward;
      window.__particles.exhaust(car.pos.x - f.x * 2.3, 0.45, car.pos.z - f.z * 2.3);
      if (Math.abs(car.speed) > 12 && Math.random() < dt * 10) {
        window.__particles.dust(car.pos.x + (Math.random() - 0.5) * 2, 0.2, car.pos.z + (Math.random() - 0.5) * 2);
      }
    }
    // Damage smoke.
    if (car.smoking) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) { car.smokeTimer = 0.12; window.__particles.smoke(car.pos.x, 1.2, car.pos.z); }
    }
    // Running over a pedestrian: they go down, the law notices.
    for (const p of [...G.pedestrians.peds]) {
      if (Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 2.3 && Math.abs(car.speed) > 3) {
        G.pedestrians.scare(p.x, p.z, 30);
        G.police.addWanted(s, 1, 'Pedestrian hit — 1 star');
        G.audio.crash();
        s.shake = Math.min(1, s.shake + 0.4);
        const i = G.pedestrians.peds.indexOf(p);
        if (i >= 0) {
          G.scene.remove(p.mesh);
          const fresh = G.pedestrians._spawnPed(false);
          G.pedestrians.peds[i] = fresh;
        }
      }
    }
    if (input.wasPressed('KeyE')) G.exitCar();
    if (input.wasPressed('KeyC')) G.audio.horn();
    // Camera follows behind the car.
    G.player.updateCamera(camera, dt, car.pos, car.yaw + Math.PI + G.driveCamOffset);
  } else {
    G.audio.setEngine(0, false);
    G.player.update(dt, input, G.world, s);
    G.player.updateCamera(camera, dt, G.player.pos);
    // Shooting / punching.
    if (input.mouseDown && !input.pointerLocked) input.lockPointer();
    if (input.mouseDown && s.weapon) G.combat.tryFire(G, camera);
    // Steal / enter a car.
    if (input.wasPressed('KeyE') && s.nearCar) G.enterCar(s.nearCar);
    // Traffic cars can hit the player on foot.
    for (const t of G.traffic.cars) {
      const d = Math.hypot(t.v.pos.x - G.player.pos.x, t.v.pos.z - G.player.pos.z);
      if (d < 2.0 && t.speed > 2) {
        G.damagePlayer(12, 'Hit by a car');
        G.player.pos.x += (G.player.pos.x - t.v.pos.x) / (d || 1) * 2;
        G.player.pos.z += (G.player.pos.z - t.v.pos.z) / (d || 1) * 2;
        G.pedestrians.scare(G.player.pos.x, G.player.pos.z, 20);
      }
    }
  }

  // Car-vs-car separation for every pair.
  const cars = G.allCars();
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      cars[i].separateFrom(cars[j]);
    }
  }

  G.traffic.update(dt, s.driving, G.police.cars);
  G.traffic.recycle(G.player.pos);
  G.pedestrians.update(dt, G.player.pos);
  G.police.update(dt, G);
  G.combat.update(dt, G);
  G.missions.update(dt);
  G.world.updatePickups(dt, performance.now() / 1000);
  G.particles.update(dt);
  G.audio.update(dt, s.wanted);
  G.audio.setSiren(s.wanted > 0 && s.mode === 'playing');

  // Autosave every 30 seconds.
  G.autosaveTimer += dt;
  if (G.autosaveTimer > 30) { G.autosaveTimer = 0; G.saveGame(); }

  G.hud.update(G, dt);
  if (s.mode === 'complete') G.hud.showScreen('complete');
  input.endFrame();
}

function updateTitle(dt) {
  // Attract mode: slow orbit over the city while traffic and pedestrians live.
  G.titleOrbit += dt * 0.05;
  const cx = Math.sin(G.titleOrbit) * 90;
  const cz = Math.cos(G.titleOrbit) * 90;
  camera.position.set(cx, 55, cz);
  camera.lookAt(0, 4, 0);
  G.traffic.update(dt, null, []);
  G.pedestrians.update(dt, { x: 0, z: 0 });
  G.particles.update(dt);
  G.world.updatePickups(dt, performance.now() / 1000);
  G.input.endFrame();
}

// ---- main loop -------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  const s = G.state;
  if (s.mode === 'playing') {
    updatePlaying(dt);
  } else if (s.mode === 'title') {
    updateTitle(dt);
  } else if (s.mode === 'dead') {
    // World keeps breathing behind the death screen.
    G.traffic.update(dt, null, []);
    G.pedestrians.update(dt, G.player.pos);
    G.particles.update(dt);
    s.deathTimer -= dt;
    if (s.deathTimer <= 0) G.respawn();
    G.input.endFrame();
  } else {
    // paused / complete: frozen world, still render.
    G.input.endFrame();
  }
  renderer.render(scene, camera);
  // Screenshot staging: signal readiness after the settle frames — or after
  // 12 s of wall time, so a slow software renderer does not stall the shot.
  if (s.shotMode) {
    G.shotFrames += 1;
    if ((G.shotFrames >= G.shotReadyAfter || performance.now() - (G.shotStart || 0) > 12000) && !window.__shotReady) {
      window.__shotReady = true;
    }
  }
}

if (shotName) {
  stageShot(G, shotName);
  G.hud.showScreen('playing');
  G.hud.setTitleButtons(false, () => {}, () => {}, () => {});
} else {
  G.hud.showScreen('title');
  G.hud.setTitleButtons(hasSave(), () => newGame(0), () => continueGame(), (i) => newGame(i));
}
// Debug/test hook: the live game object, so automated play-tests can read
// state (position, wanted, mission) without scraping the DOM.
window.__G = G;
window.__shotReady = false;
requestAnimationFrame(frame);
