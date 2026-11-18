// Solara Bay — shared configuration and the central game state object.
// Every system reads its tuning from here so the whole game stays in sync.
import * as THREE from 'three';

export const CONFIG = {
  // City layout: a square grid of blocks. Streets run every BLOCK metres.
  CITY_HALF: 220,
  BLOCK: 44,
  ROAD_HALF: 5.5,
  SIDEWALK: 3,
  // Player on foot
  WALK_SPEED: 5.2,
  SPRINT_SPEED: 9.0,
  JUMP_SPEED: 8.2,
  GRAVITY: 24,
  // Cars
  CAR_ACCEL: 16,
  CAR_BRAKE: 26,
  CAR_MAX_SPEED: 34,
  CAR_MAX_REVERSE: 10,
  CAR_TURN: 1.9,
  // Combat
  PISTOL_DAMAGE: 34,
  PISTOL_MAG: 12,
  PISTOL_RANGE: 90,
  FIST_DAMAGE: 12,
  FIST_RANGE: 2.4,
  // Wanted
  WANTED_DECAY_SECONDS: 14,
  MAX_WANTED: 5,
  // Money
  START_MONEY: 250,
  MISSION_REWARDS: [500, 800, 1200, 2000, 5000],
  RESPAWN_COST: 200,
  // Clock: one in-game hour per 90 real seconds, starting at 09:00.
  CLOCK_START_MINUTES: 9 * 60,
  MINUTES_PER_SECOND: 60 / 90,
  // Colours — sun-soaked coastal palette
  SKY_DAY: 0x87bfe8,
  SKY_SUNSET: 0xff9a5c,
  SEA: 0x2e8fa8,
  SAND: 0xe8d29a,
  GRASS: 0x5da24a,
  ASPHALT: 0x3a3d44,
  SIDEWALK_COLOR: 0x8d867a,
  BUILDING_PALETTE: [0xe8b48a, 0xd98a7a, 0x8fb8c9, 0xf2e3c6, 0xc9a0b4, 0x9ec49a, 0xe0cfa8, 0x7fa8b8],
  CAR_COLORS: [0xc0392b, 0x2e6fb0, 0xe8b73a, 0x2fae6e, 0xe8e8e8, 0x222831, 0x8e44ad, 0xd35400, 0x16a085, 0xb03a5b],
  POLICE_COLOR: 0x1c2733,
};

export const MISSION_DEFS = [
  {
    id: 1, name: 'First Wheels', giver: 'Rico',
    brief: 'Rico needs wheels. Steal any car and bring it to the marker at Marina Row.',
    objective: 'Steal a car, then drive to the yellow marker',
  },
  {
    id: 2, name: 'Courier Run', giver: 'Mara',
    brief: 'Mara has a package for the north pier. Deliver it before the clock runs out.',
    objective: 'Deliver the package to North Pier — beat the timer',
    timeLimit: 150,
  },
  {
    id: 3, name: 'Hot Pursuit', giver: 'Rico',
    brief: 'The crew needs a distraction. Draw three stars of heat, then lose the cops.',
    objective: 'Reach 3 wanted stars, then lose the police',
  },
  {
    id: 4, name: 'Warehouse Deal', giver: 'Mara',
    brief: 'A deal went sour at the old warehouse. Clear the yard and grab the stash.',
    objective: 'Defeat every gunman at the warehouse, then grab the stash',
  },
  {
    id: 5, name: 'The Big Score', giver: 'Rico',
    brief: 'One last job: hit every checkpoint across Solara Bay while the whole city chases you.',
    objective: 'Hit all 4 checkpoints and reach the hideout',
  },
];

// Seeded random so screenshot staging is deterministic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

// Central mutable state. Modules read and write fields on this one object.
export function createState() {
  return {
    mode: 'title', // title | playing | paused | dead | complete
    paused: false,
    startedAt: 0,
    money: CONFIG.START_MONEY,
    health: 100,
    maxHealth: 100,
    armor: 0,
    wanted: 0,
    wantedHeat: 0, // 0..1, fills while police can see the player
    wantedHiddenTimer: 0,
    weapon: 'fists', // fists | pistol
    ammoReserve: 48,
    ammoMag: CONFIG.PISTOL_MAG,
    kills: 0,
    carsStolen: 0,
    missionsDone: 0,
    missionIndex: 0, // next mission to play (0-based)
    missionActive: false,
    missionId: 0,
    missionStage: 0,
    missionTimer: 0,
    missionObjective: 'Welcome to Solara Bay',
    missionFailed: false,
    clockMinutes: CONFIG.CLOCK_START_MINUTES,
    speedKmh: 0,
    inCar: false,
    driving: null, // vehicle object the player drives
    nearCar: null,
    shotMode: null, // 'cover' | 'chase' | 'mission' | 'street' | null
    seed: 7,
    muted: false,
    volume: 0.7,
    sensitivity: 1.0,
    shake: 0,
    message: '',
    messageTimer: 0,
    deathTimer: 0,
    timeScale: 1,
    stats: { shotsFired: 0, shotsHit: 0, distanceDriven: 0 },
  };
}

export function formatClock(minutes) {
  const m = Math.floor(minutes) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export { THREE };
