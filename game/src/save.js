// Solara Bay — save / load through localStorage.
const KEY = 'solara-bay-save-v1';

export function hasSave() {
  try { return !!window.localStorage.getItem(KEY); } catch { return false; }
}

export function saveGame(G) {
  const s = G.state;
  const data = {
    version: 1,
    savedAt: Date.now(),
    money: s.money,
    health: s.health,
    armor: s.armor,
    wanted: s.wanted,
    weapon: s.weapon,
    ammoReserve: s.ammoReserve,
    ammoMag: s.ammoMag,
    kills: s.kills,
    carsStolen: s.carsStolen,
    missionsDone: s.missionsDone,
    missionIndex: s.missionIndex,
    clockMinutes: s.clockMinutes,
    player: { x: G.player.pos.x, y: G.player.pos.y, z: G.player.pos.z, yaw: G.player.yaw },
    inCar: s.inCar,
    car: s.driving ? { x: s.driving.pos.x, z: s.driving.pos.z, yaw: s.driving.yaw, color: s.driving.color } : null,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { window.localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
