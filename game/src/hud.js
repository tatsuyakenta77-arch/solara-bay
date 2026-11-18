// Solara Bay — the HUD: health/armor/money/wanted/weapon/speed/clock,
// mission objective, messages, crosshair, a live canvas minimap, and the
// title / pause / mission-complete / game-over menus.
import { CONFIG, formatClock, formatMoney } from './config.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.money = this.el('hud-money');
    this.clock = this.el('hud-clock');
    this.stars = this.el('hud-stars');
    this.objective = this.el('hud-objective');
    this.objectiveSub = this.el('hud-objective-sub');
    this.healthFill = this.el('health-fill');
    this.armorFill = this.el('armor-fill');
    this.healthText = this.el('health-text');
    this.weapon = this.el('hud-weapon');
    this.ammo = this.el('hud-ammo');
    this.speed = this.el('hud-speed');
    this.speedBox = this.el('hud-speed-box');
    this.message = this.el('hud-message');
    this.hint = this.el('hud-hint');
    this.crosshair = this.el('crosshair');
    this.minimap = this.el('minimap');
    this.miniCtx = this.minimap.getContext('2d');
    this.titleScreen = this.el('title-screen');
    this.pauseScreen = this.el('pause-screen');
    this.deadScreen = this.el('dead-screen');
    this.completeScreen = this.el('complete-screen');
    this.deadText = this.el('dead-text');
    this._lastStars = -1;
    this._lastObjective = '';
  }

  showScreen(name) {
    // name: 'title' | 'playing' | 'paused' | 'dead' | 'complete' | null
    this.titleScreen.classList.toggle('hidden', name !== 'title');
    this.pauseScreen.classList.toggle('hidden', name !== 'paused');
    this.deadScreen.classList.toggle('hidden', name !== 'dead');
    this.completeScreen.classList.toggle('hidden', name !== 'complete');
    document.getElementById('hud').classList.toggle('hidden', name !== 'playing');
    this.crosshair.classList.toggle('hidden', name !== 'playing');
  }

  setTitleButtons(hasSave, onNew, onContinue, onMission) {
    const cont = this.el('btn-continue');
    cont.classList.toggle('hidden', !hasSave);
    this.el('btn-new').onclick = () => onNew();
    cont.onclick = () => onContinue();
    // Mission select buttons on the title screen.
    const list = this.el('mission-list');
    list.innerHTML = '';
    const defs = [
      ['1', 'First Wheels'], ['2', 'Courier Run'], ['3', 'Hot Pursuit'],
      ['4', 'Warehouse Deal'], ['5', 'The Big Score'],
    ];
    defs.forEach(([n, name]) => {
      const b = document.createElement('button');
      b.className = 'menu-btn small';
      b.textContent = `${n}. ${name}`;
      b.onclick = () => onMission(Number(n) - 1);
      list.appendChild(b);
    });
  }

  setPauseButtons(onResume, onSave, onQuit, onSettings) {
    this.el('btn-resume').onclick = () => onResume();
    this.el('btn-save').onclick = () => onSave();
    this.el('btn-quit').onclick = () => onQuit();
    this.el('btn-settings').onclick = () => onSettings();
  }

  setDeadButton(onRespawn) { this.el('btn-respawn').onclick = () => onRespawn(); }
  setCompleteButton(onFreeRoam) { this.el('btn-freeroam').onclick = () => onFreeRoam(); }

  bindSettings(onVolume, onSensitivity, onMute) {
    const vol = this.el('setting-volume');
    const sens = this.el('setting-sensitivity');
    const mute = this.el('setting-mute');
    vol.addEventListener('input', () => onVolume(Number(vol.value) / 100));
    sens.addEventListener('input', () => onSensitivity(Number(sens.value) / 100));
    mute.addEventListener('click', () => onMute());
    this._vol = vol; this._sens = sens; this._mute = mute;
  }

  syncSettings(volume, sensitivity, muted) {
    if (this._vol) this._vol.value = String(Math.round(volume * 100));
    if (this._sens) this._sens.value = String(Math.round(sensitivity * 100));
    if (this._mute) this._mute.textContent = muted ? 'Unmute (M)' : 'Mute (M)';
  }

  update(G, dt) {
    const s = G.state;
    this.money.textContent = formatMoney(s.money);
    this.clock.textContent = formatClock(s.clockMinutes);
    if (s.wanted !== this._lastStars) {
      this._lastStars = s.wanted;
      let stars = '';
      for (let i = 0; i < CONFIG.MAX_WANTED; i++) stars += i < s.wanted ? '★' : '☆';
      this.stars.textContent = stars;
      this.stars.classList.toggle('hot', s.wanted > 0);
    }
    const objective = s.missionActive
      ? s.missionObjective
      : (s.missionsDone >= 5 ? 'Story complete — free roam Solara Bay' : 'Press Enter to start the next mission');
    if (objective !== this._lastObjective) {
      this._lastObjective = objective;
      this.objective.textContent = objective;
    }
    let sub = '';
    if (s.missionActive) {
      const def = this._defName(s);
      if (def) sub = def;
      if (s.missionTimer > 0) sub += `  •  ${Math.ceil(s.missionTimer)}s left`;
      const dist = G.missions.waypointDistance();
      if (dist !== null) sub += `  •  ${dist}m`;
    }
    this.objectiveSub.textContent = sub;
    this.healthFill.style.width = `${Math.max(0, s.health)}%`;
    this.armorFill.style.width = `${Math.max(0, s.armor)}%`;
    this.healthText.textContent = `${Math.ceil(s.health)} HP`;
    this.weapon.textContent = s.weapon === 'pistol' ? 'Pistol' : 'Fists';
    this.ammo.textContent = s.weapon === 'pistol' ? `${s.ammoMag} / ${s.ammoReserve}` : '—';
    if (s.inCar) {
      this.speedBox.classList.remove('hidden');
      this.speed.textContent = `${Math.round(Math.abs(s.speedKmh))}`;
    } else {
      this.speedBox.classList.add('hidden');
    }
    if (s.messageTimer > 0) {
      this.message.textContent = s.message;
      this.message.classList.remove('hidden');
    } else {
      this.message.classList.add('hidden');
    }
    // Context hint: what E does right now.
    let hint = 'WASD move • Shift sprint • Space jump • E enter/exit car • 1/2 weapons • R reload • M mute • Esc pause';
    if (s.nearCar && !s.inCar) hint = 'Press E to steal the car';
    if (s.inCar) hint = 'WASD drive • Space handbrake • E exit car • C horn';
    this.hint.textContent = hint;
    this.crosshair.classList.toggle('hidden', s.weapon !== 'pistol' || s.inCar);
    this._drawMinimap(G);
  }

  _defName(s) {
    const names = ['1 · First Wheels', '2 · Courier Run', '3 · Hot Pursuit', '4 · Warehouse Deal', '5 · The Big Score'];
    return s.missionIndex < 5 ? names[s.missionIndex] : '';
  }

  _drawMinimap(G) {
    const ctx = this.miniCtx;
    const W = 190, H = 190;
    const range = 260; // metres shown across the minimap
    const scale = W / (range * 2);
    const px = G.player.pos.x, pz = G.player.pos.z;
    ctx.clearRect(0, 0, W, H);
    // Sea + sand on the west edge.
    ctx.fillStyle = '#1d3a4a';
    ctx.fillRect(0, 0, W, H);
    const toX = (x) => W / 2 + (x - px) * scale;
    const toZ = (z) => H / 2 + (z - pz) * scale;
    // Land.
    ctx.fillStyle = '#274d2f';
    ctx.fillRect(toX(-220), 0, W, H);
    // Roads.
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = Math.max(2, 11 * scale * 2.2);
    for (const s of G.world.streetCoords) {
      ctx.beginPath(); ctx.moveTo(toX(-220), toZ(s)); ctx.lineTo(toX(220), toZ(s)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(s), toZ(-220)); ctx.lineTo(toX(s), toZ(220)); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#7a6a58';
    for (const b of G.world.buildingMeshes) {
      const w = b.scale.x * scale, h = b.scale.z * scale;
      ctx.fillRect(toX(b.position.x) - w / 2, toZ(b.position.z) - h / 2, Math.max(1, w), Math.max(1, h));
    }
    // Beach + sea tint on the west.
    ctx.fillStyle = 'rgba(46,143,168,0.85)';
    ctx.fillRect(0, 0, Math.max(0, toX(-220)), H);
    ctx.fillStyle = 'rgba(232,210,154,0.9)';
    ctx.fillRect(Math.max(0, toX(-238)), 0, Math.max(0, toX(-220) - toX(-238)), H);
    // Waypoint.
    if (G.missions.waypoint) {
      const wx = toX(G.missions.waypoint.x), wz = toZ(G.missions.waypoint.z);
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.moveTo(wx, wz - 7); ctx.lineTo(wx + 6, wz); ctx.lineTo(wx, wz + 7); ctx.lineTo(wx - 6, wz);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 1; ctx.stroke();
    }
    // Traffic (white), police (blue), enemies (red).
    const dot = (x, z, color, r = 2.5) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(toX(x), toZ(z), r, 0, Math.PI * 2); ctx.fill();
    };
    for (const t of G.traffic.cars) dot(t.v.pos.x, t.v.pos.z, '#ffffff', 2);
    for (const car of G.police.cars) dot(car.pos.x, car.pos.z, '#3d8bff', 3.5);
    for (const cop of G.police.cops) dot(cop.x, cop.z, '#3d8bff', 2.5);
    for (const e of G.combat.enemies) if (e.alive) dot(e.x, e.z, '#ff3b30', 3);
    // Player arrow (rotates with facing).
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-G.player.yaw + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Border + N.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', W - 14, 14);
  }
}
