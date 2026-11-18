// Solara Bay — traffic: AI cars that follow the road grid in lanes, slow for
// the car ahead, and turn at junctions. Right-hand traffic, modest speeds.
import { Vehicle, nearestVehicle } from './vehicles.js';
import { CONFIG, clamp } from './config.js';

function laneOffset(axis, dir) {
  // Driving +x: right side is +z. Driving +z: right side is -x.
  if (axis === 'x') return dir > 0 ? 2.7 : -2.7;
  return dir > 0 ? -2.7 : 2.7;
}

export class Traffic {
  constructor(scene, world, seed = 11) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.rnd = Math.random;
    const streets = world.streetCoords;
    for (let i = 0; i < 12; i++) {
      const axis = i % 2 === 0 ? 'x' : 'z';
      const street = streets[1 + Math.floor(Math.random() * (streets.length - 2))];
      const dir = Math.random() < 0.5 ? 1 : -1;
      const along = -190 + Math.random() * 380;
      const color = CONFIG.CAR_COLORS[Math.floor(Math.random() * CONFIG.CAR_COLORS.length)];
      const yaw = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const x = axis === 'x' ? along : street + laneOffset(axis, dir);
      const z = axis === 'x' ? street + laneOffset(axis, dir) : along;
      const v = new Vehicle(scene, x, z, yaw, color, false);
      v.driver = 'traffic';
      v.maxSpeed = 10 + Math.random() * 5;
      this.cars.push({ v, axis, street, dir, along, speed: v.maxSpeed, wait: 0 });
    }
  }

  allVehicles() { return this.cars.map((c) => c.v); }

  update(dt, playerCar, extraVehicles) {
    const streets = this.world.streetCoords;
    for (const c of this.cars) {
      // Car ahead in the same lane? Slow down or stop.
      let targetSpeed = c.v.maxSpeed;
      const ahead = this._carAhead(c, playerCar, extraVehicles);
      if (ahead !== null) {
        if (ahead < 7) targetSpeed = 0;
        else if (ahead < 16) targetSpeed = c.v.maxSpeed * 0.35;
      }
      if (c.wait > 0) { c.wait -= dt; targetSpeed = 0; }
      c.speed = c.speed + clamp(targetSpeed - c.speed, -14 * dt, 8 * dt);
      c.along += c.dir * c.speed * dt;
      // Turn at a junction sometimes.
      const nearStreet = this.world.nearestStreetCoord(c.along);
      if (Math.abs(c.along - nearStreet) < 1.2 && Math.random() < 0.012 && c.speed > 2) {
        const newAxis = c.axis === 'x' ? 'z' : 'x';
        const newDir = Math.random() < 0.5 ? 1 : -1;
        const oldStreet = c.street;
        c.axis = newAxis;
        c.street = nearStreet;
        c.dir = newDir;
        c.along = oldStreet;
      }
      // Wrap around the city edge.
      if (c.along > 210) c.along = -210;
      if (c.along < -210) c.along = 210;
      const off = laneOffset(c.axis, c.dir);
      if (c.axis === 'x') {
        c.v.pos.set(c.along, 0, c.street + off);
        c.v.yaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        c.v.pos.set(c.street + off, 0, c.along);
        c.v.yaw = c.dir > 0 ? 0 : Math.PI;
      }
      c.v.speed = c.speed * c.dir;
      c.v.mesh.position.copy(c.v.pos);
      c.v.mesh.rotation.y = c.v.yaw;
      const spin = (c.speed * dt) / 0.38;
      for (const w of c.v.wheels) w.rotation.x += spin;
      // Exhaust puff when pulling away.
      if (c.speed > 1 && Math.random() < dt * 2 && window.__particles) {
        const back = c.v.forward;
        window.__particles.exhaust(c.v.pos.x - back.x * 2.2, 0.4, c.v.pos.z - back.z * 2.2);
      }
    }
  }

  _carAhead(c, playerCar, extraVehicles) {
    let best = null;
    const check = (v) => {
      if (v === c.v) return;
      const dx = v.pos.x - c.v.pos.x;
      const dz = v.pos.z - c.v.pos.z;
      let alongDist, crossDist;
      if (c.axis === 'x') { alongDist = dx * c.dir; crossDist = Math.abs(dz - laneOffset(c.axis, c.dir) - 0); }
      else { alongDist = dz * c.dir; crossDist = Math.abs(dx - laneOffset(c.axis, c.dir)); }
      // crossDist measured against this car's lane line:
      const laneLine = c.axis === 'x' ? c.street + laneOffset(c.axis, c.dir) : c.street + laneOffset(c.axis, c.dir);
      const cross = c.axis === 'x' ? Math.abs(v.pos.z - laneLine) : Math.abs(v.pos.x - laneLine);
      if (alongDist > 0 && alongDist < 24 && cross < 3.2) {
        if (best === null || alongDist < best) best = alongDist;
      }
    };
    for (const t of this.cars) check(t.v);
    if (playerCar) check(playerCar);
    if (extraVehicles) for (const v of extraVehicles) check(v);
    return best;
  }

  // Teleport a traffic car far from the player back near them, keeping the
  // streets busy wherever the player goes.
  recycle(playerPos) {
    for (const c of this.cars) {
      const d = Math.hypot(c.v.pos.x - playerPos.x, c.v.pos.z - playerPos.z);
      if (d > 260) {
        const streets = this.world.streetCoords;
        c.street = streets[1 + Math.floor(Math.random() * (streets.length - 2))];
        c.along = playerPos.x + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 80);
        c.along = clamp(c.along, -200, 200);
      }
    }
  }
}
