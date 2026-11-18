// Solara Bay — pedestrians: low-poly walkers on the sidewalks who stroll,
// cross at corners, and flee from gunfire, crashes and speeding cars.
import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';

const SHIRTS = [0x3498db, 0xe67e22, 0x9b59b6, 0x1abc9c, 0xf39c12, 0xecf0f1, 0xfd79a8, 0x55efc4, 0xffeaa7, 0x74b9ff];
const SKINS = [0xe8b98a, 0xc98a5a, 0x8a5a34, 0xf0c8a0];

// Shared person builder — also used by police and mission gunmen.
export function makePersonMesh(shirtColor, skinColor = 0xe8b98a, isCop = false) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2733 : shirtColor }));
  torso.position.y = 1.12;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshLambertMaterial({ color: skinColor }));
  head.position.y = 1.78;
  head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.28), new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2733 : 0x34495e }));
  legL.position.set(-0.17, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.22), new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2733 : shirtColor }));
  armL.position.set(-0.44, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.44;
  g.add(torso, head, legL, legR, armL, armR);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x0f141a }));
    cap.position.y = 1.98;
    g.add(cap);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.02), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    badge.position.set(0.16, 1.3, 0.2);
    g.add(badge);
  }
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Pedestrians {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.peds = [];
    for (let i = 0; i < 18; i++) {
      const ped = this._spawnPed(true);
      this.peds.push(ped);
    }
  }

  _spawnPed(anywhere) {
    const streets = this.world.streetCoords;
    const street = streets[Math.floor(Math.random() * streets.length)];
    const along = -200 + Math.random() * 400;
    const horizontal = Math.random() < 0.5;
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = CONFIG.ROAD_HALF + CONFIG.SIDEWALK / 2;
    const x = horizontal ? along : street + side * off;
    const z = horizontal ? street + side * off : along;
    const mesh = makePersonMesh(SHIRTS[Math.floor(Math.random() * SHIRTS.length)], SKINS[Math.floor(Math.random() * SKINS.length)]);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    return {
      mesh, x, z,
      horizontal, street, side,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 1.1 + Math.random() * 0.9,
      phase: Math.random() * 6,
      fleeing: false,
      fleeX: 0, fleeZ: 0, fleeTimer: 0,
      panic: 0,
    };
  }

  // Scare every pedestrian near a point (gunshot, crash, speeding car).
  scare(x, z, radius = 26) {
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.fleeing = true;
        p.fleeTimer = 2.5 + Math.random() * 2;
        p.fleeX = x; p.fleeZ = z;
        p.panic = 1;
      }
    }
  }

  update(dt, playerPos) {
    const off = CONFIG.ROAD_HALF + CONFIG.SIDEWALK / 2;
    for (const p of this.peds) {
      let speed = p.speed;
      let moveX = 0, moveZ = 0;
      if (p.fleeing) {
        p.fleeTimer -= dt;
        if (p.fleeTimer <= 0) p.fleeing = false;
        speed = 5.2;
        const dx = p.x - p.fleeX, dz = p.z - p.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        moveX = dx / d; moveZ = dz / d;
      } else {
        if (p.horizontal) moveX = p.dir;
        else moveZ = p.dir;
      }
      p.x += moveX * speed * dt;
      p.z += moveZ * speed * dt;
      // At a block end, turn around or switch streets.
      if (!p.fleeing) {
        const along = p.horizontal ? p.x : p.z;
        if (along > 208 || along < -208) p.dir *= -1;
        else if (Math.random() < dt * 0.02) {
          // Wander onto the crossing street.
          const s = this.world.nearestStreetCoord(along);
          if (Math.abs(along - s) < 3) {
            p.horizontal = !p.horizontal;
            p.street = s;
          }
        }
      }
      // Keep on the sidewalk line when strolling.
      if (!p.fleeing) {
        if (p.horizontal) p.z += (p.street + p.side * off - p.z) * Math.min(1, dt * 4);
        else p.x += (p.street + p.side * off - p.x) * Math.min(1, dt * 4);
      }
      p.x = clamp(p.x, -235, 228);
      p.z = clamp(p.z, -228, 228);
      this.world.resolveCircle(p.mesh.position.set(p.x, 0, p.z), 0.4);
      p.x = p.mesh.position.x; p.z = p.mesh.position.z;
      const targetYaw = Math.atan2(moveX, moveZ);
      let dy = targetYaw - p.mesh.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.mesh.rotation.y += dy * Math.min(1, dt * 8);
      p.phase += dt * speed * 3.2;
      const swing = Math.sin(p.phase) * 0.5;
      const u = p.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      // Far-away pedestrians respawn near the player so the streets stay alive.
      const dPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (dPlayer > 240) {
        const fresh = this._spawnPed(false);
        fresh.x = clamp(playerPos.x + (Math.random() - 0.5) * 160, -210, 210);
        fresh.z = clamp(playerPos.z + (Math.random() - 0.5) * 160, -210, 210);
        this.scene.remove(p.mesh);
        const i = this.peds.indexOf(p);
        this.peds[i] = fresh;
      }
    }
  }
}
