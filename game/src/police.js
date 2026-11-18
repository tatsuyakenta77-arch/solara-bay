// Solara Bay — the wanted system: stars 0–5, police cruisers that chase and
// ram, foot officers who run the player down and make arrests, and the
// heat that cools off when the player hides out of sight.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { makePersonMesh } from './pedestrians.js';
import { CONFIG, clamp } from './config.js';

export class Police {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = []; // Vehicle objects driven by the police AI
    this.cops = []; // on-foot officers {mesh, x, z, phase, shootTimer}
    this.spawnTimer = 0;
    this.sirenOn = false;
  }

  wantedCount(wanted) {
    if (wanted <= 0) return { cars: 0, cops: 0 };
    if (wanted === 1) return { cars: 1, cops: 0 };
    if (wanted === 2) return { cars: 2, cops: 1 };
    if (wanted === 3) return { cars: 3, cops: 2 };
    if (wanted === 4) return { cars: 4, cops: 3 };
    return { cars: 5, cops: 4 };
  }

  addWanted(state, n, reason = '') {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, CONFIG.MAX_WANTED);
    state.wantedHeat = 1;
    state.wantedHiddenTimer = 0;
    if (state.wanted > before) {
      state.message = reason || `Wanted level ${state.wanted}`;
      state.messageTimer = 2.5;
    }
    return state.wanted;
  }

  clearWanted(state) {
    state.wanted = 0;
    state.wantedHeat = 0;
    state.wantedHiddenTimer = 0;
  }

  _spawnCar(playerPos) {
    // Appear on a road 55–90 m away, roughly in the player's direction of travel.
    const streets = this.world.streetCoords;
    for (let tries = 0; tries < 12; tries++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const street = streets[Math.floor(Math.random() * streets.length)];
      const along = clamp(playerPos.x + (Math.random() - 0.5) * 160, -200, 200);
      const x = axis === 'x' ? along : street + 2.7;
      const z = axis === 'x' ? street + 2.7 : clamp(playerPos.z + (Math.random() - 0.5) * 160, -200, 200);
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d < 45 || d > 110) continue;
      const v = new Vehicle(this.scene, x, z, Math.random() * Math.PI * 2, CONFIG.POLICE_COLOR, true);
      v.driver = 'police';
      this.cars.push(v);
      return v;
    }
    return null;
  }

  _spawnCop(playerPos) {
    const a = Math.random() * Math.PI * 2;
    const x = clamp(playerPos.x + Math.cos(a) * (25 + Math.random() * 20), -210, 210);
    const z = clamp(playerPos.z + Math.sin(a) * (25 + Math.random() * 20), -210, 210);
    const mesh = makePersonMesh(0x1c2733, 0xe8b98a, true);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const cop = { mesh, x, z, phase: Math.random() * 6, shootTimer: 1 + Math.random() };
    this.cops.push(cop);
    return cop;
  }

  _removeCar(v) {
    v.remove();
    const i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
  }

  _removeCop(cop) {
    this.scene.remove(cop.mesh);
    const i = this.cops.indexOf(cop);
    if (i >= 0) this.cops.splice(i, 1);
  }

  update(dt, G) {
    const state = G.state;
    const playerPos = G.player.pos;
    const want = this.wantedCount(state.wanted);
    this.sirenOn = state.wanted > 0;
    // Spawn to match the wanted level, staggered so they do not all pop in.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const activeCars = this.cars.filter((c) => c.driver !== 'player').length;
      if (activeCars < want.cars) this._spawnCar(playerPos);
      else if (this.cops.length < want.cops) this._spawnCop(playerPos);
    }
    // Despawn the surplus when the heat drops — never the car the player drives.
    while (this.cars.filter((c) => c.driver !== 'player').length > want.cars) {
      const surplus = this.cars.find((c) => c.driver !== 'player');
      if (!surplus) break;
      this._removeCar(surplus);
    }
    while (this.cops.length > want.cops) this._removeCop(this.cops[this.cops.length - 1]);

    const playerCar = state.driving;
    const playerSpeed = playerCar ? Math.abs(playerCar.speed) : 0;

    // Police cruisers: steer toward the player, ram the player's car.
    // A cruiser the player stole is driven by the player, never by this AI.
    for (const car of [...this.cars]) {
      if (car.driver === 'player') continue;
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const targetYaw = Math.atan2(dx, dz);
      let dy = targetYaw - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const steer = clamp(dy * 1.6, -1, 1);
      const throttle = dist > 6 ? 1 : 0.4;
      const before = { x: car.pos.x, z: car.pos.z };
      car.drive(dt, throttle, steer, false, this.world, (kind, impact) => {
        if (kind === 'crash' && impact > 10 && window.__particles) {
          window.__particles.sparks(car.pos.x, 0.8, car.pos.z);
        }
      });
      // If the cruiser got stuck on a building, back up and turn away.
      const moved = Math.hypot(car.pos.x - before.x, car.pos.z - before.z);
      if (moved < dt * 1.2 && dist > 8) {
        car.yaw += dt * 2.4;
        car.speed = -6;
      }
      // Ram the player's car.
      if (playerCar && dist < 5.2) {
        const push = 3.2;
        playerCar.pos.x += (dx / dist) * -push * dt * 4;
        playerCar.pos.z += (dz / dist) * -push * dt * 4;
        if (Math.abs(playerCar.speed) > 4 && Math.random() < dt * 2) {
          playerCar.damage(2);
          G.audio.crash();
          state.shake = Math.min(1, state.shake + 0.3);
          if (window.__particles) window.__particles.sparks(playerCar.pos.x, 1, playerCar.pos.z);
        }
      }
      // Despawn cruisers that fell far behind.
      if (dist > 320) this._removeCar(car);
    }

    // Foot officers: sprint at the player; close in on foot to arrest,
    // and open fire once the heat is 3 stars or more.
    for (const cop of [...this.cops]) {
      const dx = playerPos.x - cop.x;
      const dz = playerPos.z - cop.z;
      const dist = Math.hypot(dx, dz) || 1;
      const runSpeed = 6.4;
      cop.x += (dx / dist) * runSpeed * dt;
      cop.z += (dz / dist) * runSpeed * dt;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = Math.atan2(dx, dz);
      cop.phase += dt * 11;
      const swing = Math.sin(cop.phase) * 0.6;
      const u = cop.mesh.userData;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
      // Arrest: officer reaches a slow on-foot player.
      if (dist < 2.2 && !state.inCar && playerSpeed < 2) {
        G.onBusted('Busted by the Solara Bay police');
        return;
      }
      // Officers shoot at 3+ stars when the player is on foot and in range.
      if (state.wanted >= 3 && !state.inCar && dist < 34 && dist > 6) {
        cop.shootTimer -= dt;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = 1.1 + Math.random() * 0.9;
          G.audio.enemyShot();
          if (window.__particles) window.__particles.muzzle(cop.x, 1.4, cop.z);
          if (Math.random() < 0.3) {
            G.damagePlayer(6 + Math.random() * 6, 'Shot by police');
          }
        }
      }
      if (dist > 320) this._removeCop(cop);
    }

    // Wanted decay: hidden while no police unit is near and the player is
    // not actively committing crimes.
    if (state.wanted > 0) {
      let nearest = Infinity;
      for (const car of this.cars) nearest = Math.min(nearest, Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z));
      for (const cop of this.cops) nearest = Math.min(nearest, Math.hypot(cop.x - playerPos.x, cop.z - playerPos.z));
      const seen = nearest < 55;
      if (!seen) {
        state.wantedHiddenTimer += dt;
        if (state.wantedHiddenTimer >= CONFIG.WANTED_DECAY_SECONDS) {
          state.wanted -= 1;
          state.wantedHiddenTimer = 0;
          state.message = state.wanted > 0 ? `Heat cooling off… ${state.wanted} star${state.wanted > 1 ? 's' : ''} left` : 'You lost the cops';
          state.messageTimer = 3;
          if (state.wanted === 0) G.audio.cash();
        }
      } else {
        state.wantedHiddenTimer = 0;
      }
    }
  }
}
