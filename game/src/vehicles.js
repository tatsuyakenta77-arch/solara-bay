// Solara Bay — vehicles: procedural car meshes plus arcade driving physics.
// The same Vehicle class serves the player's car, traffic and police cruisers;
// only the driver (player input, traffic AI, police AI) differs.
import * as THREE from 'three';
import { CONFIG, clamp, lerp } from './config.js';

export function buildCarMesh(color, isPolice = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc8dd });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.9), bodyMat);
  hood.position.set(0, 0.9, 1.7);
  group.add(hood);
  // Bumpers, grille, headlights, tail lights.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.22, 0.3), darkMat);
  bumperF.position.set(0, 0.35, 2.2);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.2;
  group.add(bumperF, bumperR);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd43a2a });
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), lightMat);
    hl.position.set(sx, 0.62, 2.22);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.62, -2.22);
    group.add(tl);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  if (isPolice) {
    // Light bar.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x222831 }));
    bar.position.set(0, 1.45, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(-0.32, 1.45, -0.25);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.set(0.32, 1.45, -0.25);
    group.add(red, blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
    // White doors stripe.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 2.4), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.set(0, 0.55, -0.2);
    group.add(stripe);
  }
  return { group, wheels };
}

export class Vehicle {
  constructor(scene, x, z, yaw, color, isPolice = false) {
    this.scene = scene;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.color = color;
    this.isPolice = isPolice;
    this.driver = 'none'; // none | player | traffic | police | fleeing
    this.health = 100;
    this.maxSpeed = CONFIG.CAR_MAX_SPEED * (isPolice ? 1.08 : 0.92 + Math.random() * 0.16);
    this.stolen = false;
    this.smoking = false;
    this.smokeTimer = 0;
    this.skidTimer = 0;
    this.flashTimer = 0;
    const built = buildCarMesh(color, isPolice);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    scene.add(this.mesh);
  }

  get forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  // Arcade drive: throttle -1..1, steer -1..1, handbrake bool.
  // Returns distance travelled this frame.
  drive(dt, throttle, steerInput, handbrake, world, onCrash) {
    const targetSteer = clamp(steerInput, -1, 1) * 0.62;
    this.steer = lerp(this.steer, targetSteer, Math.min(1, dt * 8));
    const speed01 = Math.abs(this.speed) / this.maxSpeed;
    const turnRate = this.steer * CONFIG.CAR_TURN * (0.4 + 0.6 * (1 - speed01 * 0.7)) * (this.speed >= 0 ? 1 : -1);
    this.yaw += turnRate * dt * Math.min(1, Math.abs(this.speed) / 3 + 0.15);
    // Acceleration / braking / drag.
    if (throttle > 0) this.speed += CONFIG.CAR_ACCEL * throttle * dt * (1 - speed01 * 0.75);
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= CONFIG.CAR_BRAKE * dt; // brake
      else this.speed -= CONFIG.CAR_ACCEL * 0.55 * dt; // reverse
    }
    if (handbrake) {
      this.speed = lerp(this.speed, this.speed * 0.4, Math.min(1, dt * 4));
      if (Math.abs(this.speed) > 6 && this.skidTimer <= 0) { this.skidTimer = 0.4; if (onCrash) onCrash('skid'); }
    }
    this.speed -= this.speed * 0.55 * dt; // rolling drag
    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    if (this.speed < -CONFIG.CAR_MAX_REVERSE) this.speed = -CONFIG.CAR_MAX_REVERSE;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    const f = this.forward;
    const nx = this.pos.x + f.x * this.speed * dt;
    const nz = this.pos.z + f.z * this.speed * dt;
    // Building collision: slide along walls, lose speed on impact.
    const hit = world.collideCircle(nx, nz, 2.1);
    if (hit.hit) {
      const impact = Math.abs(this.speed);
      this.speed *= -0.25;
      if (impact > 8 && onCrash) onCrash('crash', impact);
      this.pos.x += hit.nx * 0.05;
      this.pos.z += hit.nz * 0.05;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    world.resolveCircle(this.pos, 2.1);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    // Wheel spin + front steer visuals.
    const spin = (this.speed * dt) / 0.38;
    for (let i = 0; i < 4; i++) {
      this.wheels[i].rotation.x += spin;
      if (i < 2) this.wheels[i].rotation.y = this.steer * 0.5;
    }
    // Police light bar flash.
    if (this.isPolice) {
      this.flashTimer += dt;
      const phase = Math.floor(this.flashTimer * 6) % 2 === 0;
      const red = this.mesh.userData.lightRed, blue = this.mesh.userData.lightBlue;
      if (red && blue) {
        red.material.color.setHex(phase ? 0xff2a2a : 0x550000);
        blue.material.color.setHex(phase ? 0x0a2a66 : 0x2a6bff);
      }
    }
    this.skidTimer = Math.max(0, this.skidTimer - dt);
    // Damage smoke below half health.
    this.smoking = this.health < 50;
    return Math.abs(this.speed) * dt;
  }

  // Simple car-vs-car push-apart.
  separateFrom(other) {
    const dx = this.pos.x - other.pos.x;
    const dz = this.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    const min = 4.2;
    if (d > 0.001 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d, nz = dz / d;
      this.pos.x += nx * push; this.pos.z += nz * push;
      other.pos.x -= nx * push; other.pos.z -= nz * push;
      const exchange = this.speed * 0.4;
      this.speed = other.speed * 0.4;
      other.speed = exchange;
      this.mesh.position.copy(this.pos);
      other.mesh.position.copy(other.pos);
      return true;
    }
    return false;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}

// Find the nearest vehicle to a point, within maxDist, optionally excluding one.
export function nearestVehicle(vehicles, x, z, maxDist, exclude = null) {
  let best = null, bd = maxDist;
  for (const v of vehicles) {
    if (v === exclude) continue;
    const d = Math.hypot(v.pos.x - x, v.pos.z - z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
