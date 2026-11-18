// Solara Bay — combat: fists and pistol, mouse aim, reload, enemy gunmen
// who shoot back, health / armor / ammo pickups, and damage + death.
import * as THREE from 'three';
import { CONFIG, clamp, dist2D } from './config.js';
import { makePersonMesh } from './pedestrians.js';

const ENEMY_SHIRTS = [0x8e2f2f, 0x5a2f6e, 0x2f4a6e];

export class Combat {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.enemies = []; // {mesh, x, z, health, shootTimer, phase, alive}
    this.raycaster = new THREE.Raycaster();
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this._tmpDir = new THREE.Vector3();
  }

  spawnEnemies(x, z, count, spread = 14) {
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const ex = x + (Math.random() - 0.5) * spread * 2;
      const ez = z + (Math.random() - 0.5) * spread * 2;
      const mesh = makePersonMesh(ENEMY_SHIRTS[i % ENEMY_SHIRTS.length]);
      mesh.position.set(ex, 0, ez);
      this.scene.add(mesh);
      const enemy = { mesh, x: ex, z: ez, health: 100, shootTimer: 0.8 + Math.random(), phase: Math.random() * 6, alive: true };
      this.enemies.push(enemy);
      spawned.push(enemy);
    }
    return spawned;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  aliveCount() { return this.enemies.filter((e) => e.alive).length; }

  // Fire the currently selected weapon. Called from the main loop on click.
  tryFire(G, camera) {
    const state = G.state;
    if (this.fireCooldown > 0 || this.punchCooldown > 0) return;
    if (state.weapon === 'pistol') {
      if (state.ammoMag <= 0) {
        G.audio.reload();
        state.message = 'Out of ammo — press R to reload';
        state.messageTimer = 1.5;
        this.fireCooldown = 0.35;
        return;
      }
      state.ammoMag -= 1;
      state.stats.shotsFired += 1;
      this.fireCooldown = 0.22;
      G.audio.gunshot();
      state.shake = Math.min(1, state.shake + 0.12);
      // Muzzle flash at the player's gun.
      const px = G.player.pos.x, pz = G.player.pos.z;
      if (window.__particles) window.__particles.muzzle(px, 1.5, pz);
      // Ray from the camera through the screen centre.
      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      this.raycaster.far = CONFIG.PISTOL_RANGE;
      const ray = this.raycaster.ray;
      // Nearest building hit blocks the shot.
      const buildingHits = this.raycaster.intersectObjects(this.world.buildingMeshes, false);
      const wallDist = buildingHits.length ? buildingHits[0].distance : Infinity;
      // Nearest enemy the ray passes within 1.1 m of.
      let best = null, bestT = wallDist;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const toX = e.x - ray.origin.x, toY = 1.3 - ray.origin.y, toZ = e.z - ray.origin.z;
        const t = toX * ray.direction.x + toY * ray.direction.y + toZ * ray.direction.z;
        if (t < 1 || t > bestT) continue;
        const cx = ray.origin.x + ray.direction.x * t;
        const cy = ray.origin.y + ray.direction.y * t;
        const cz = ray.origin.z + ray.direction.z * t;
        const d = Math.hypot(e.x - cx, 1.3 - cy, e.z - cz);
        if (d < 1.2) { best = e; bestT = t; }
      }
      if (best) {
        state.stats.shotsHit += 1;
        this.damageEnemy(G, best, CONFIG.PISTOL_DAMAGE);
        if (window.__particles) window.__particles.blood(best.x, 1.3, best.z);
      } else {
        // Impact dust where the shot lands.
        const t = Math.min(wallDist, CONFIG.PISTOL_RANGE);
        const ix = ray.origin.x + ray.direction.x * t;
        const iy = ray.origin.y + ray.direction.y * t;
        const iz = ray.origin.z + ray.direction.z * t;
        if (window.__particles && t < CONFIG.PISTOL_RANGE) window.__particles.dust(ix, Math.max(0.2, iy), iz);
      }
      // Nearby pedestrians flee from the gunshot.
      G.pedestrians.scare(px, pz, 30);
    } else {
      // Fists: hit the nearest enemy in front within range.
      this.punchCooldown = 0.4;
      G.audio.punch();
      const px = G.player.pos.x, pz = G.player.pos.z;
      const fx = Math.sin(G.player.yaw), fz = Math.cos(G.player.yaw);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - px, dz = e.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < CONFIG.FIST_RANGE && (dx * fx + dz * fz) > 0) {
          this.damageEnemy(G, e, CONFIG.FIST_DAMAGE);
          if (window.__particles) window.__particles.blood(e.x, 1.3, e.z);
          break;
        }
      }
      G.pedestrians.scare(px, pz, 12);
    }
  }

  damageEnemy(G, enemy, amount) {
    enemy.health -= amount;
    if (enemy.health <= 0 && enemy.alive) {
      enemy.alive = false;
      this.scene.remove(enemy.mesh);
      G.state.kills += 1;
      G.state.money += 25;
      // Drop a cash pickup half the time.
      if (Math.random() < 0.5) G.world.spawnPickup('cash', enemy.x + 1, enemy.z + 1);
      G.audio.cash();
    }
  }

  reload(G) {
    const state = G.state;
    if (state.weapon !== 'pistol') return;
    if (state.ammoMag >= CONFIG.PISTOL_MAG || state.ammoReserve <= 0) return;
    const need = CONFIG.PISTOL_MAG - state.ammoMag;
    const take = Math.min(need, state.ammoReserve);
    state.ammoMag += take;
    state.ammoReserve -= take;
    G.audio.reload();
    state.message = `Reloaded — ${state.ammoMag}/${state.ammoReserve} rounds`;
    state.messageTimer = 1.5;
  }

  update(dt, G) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    const state = G.state;
    const px = G.player.pos.x, pz = G.player.pos.z;
    // Enemy AI: face the player, shoot when in range and line of sight is
    // roughly clear (no building between us — cheap AABB segment test).
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = px - e.x, dz = pz - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.phase += dt * 6;
      const swing = Math.sin(e.phase) * 0.4;
      const u = e.mesh.userData;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      // Strafe sideways a little so gunmen do not stand still.
      if (dist < 42 && dist > 8) {
        const strafe = Math.sin(e.phase * 0.4) * 1.4;
        e.x += (-dz / dist) * strafe * dt;
        e.z += (dx / dist) * strafe * dt;
        e.mesh.position.set(e.x, 0, e.z);
      }
      if (dist < 38 && !state.inCar) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 0.9 + Math.random() * 1.1;
          if (!this._blockedByBuilding(e.x, e.z, px, pz)) {
            G.audio.enemyShot();
            if (window.__particles) window.__particles.muzzle(e.x, 1.4, e.z);
            // Inaccuracy grows with distance.
            if (Math.random() < clamp(0.55 - dist * 0.008, 0.12, 0.55)) {
              G.damagePlayer(5 + Math.random() * 7, 'Shot by a gunman');
            }
          }
        }
      }
    }
    // Pickups: walk over one to collect it.
    const pickups = [...this.world.pickups];
    for (const p of pickups) {
      const d = dist2D(px, pz, p.x, p.z);
      if (d < 2.0) {
        this.world.removePickup(p);
        G.audio.pickup();
        if (p.type === 'health') {
          state.health = Math.min(state.maxHealth, state.health + 50);
          state.message = 'Health +50'; state.messageTimer = 2;
        } else if (p.type === 'armor') {
          state.armor = Math.min(100, state.armor + 50);
          state.message = 'Armor +50'; state.messageTimer = 2;
        } else if (p.type === 'ammo') {
          state.ammoReserve += 36;
          state.message = 'Ammo +36'; state.messageTimer = 2;
        } else if (p.type === 'cash') {
          state.money += 100;
          state.message = 'Cash +$100'; state.messageTimer = 2;
        }
      }
    }
  }

  _blockedByBuilding(ax, az, bx, bz) {
    // Sample the segment; if any sample sits inside a building AABB, blocked.
    for (let t = 0.15; t < 1; t += 0.12) {
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      for (const c of this.world.colliders) {
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
      }
    }
    return false;
  }
}
