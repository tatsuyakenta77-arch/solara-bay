// Solara Bay — pooled particle effects: dust, exhaust, muzzle flash, damage
// smoke and impact sparks. One THREE.Points cloud, fixed capacity, zero
// per-frame allocation: dead particles are recycled in place.
import * as THREE from 'three';

const CAPACITY = 600;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.positions = new Float32Array(CAPACITY * 3);
    this.colors = new Float32Array(CAPACITY * 3);
    this.vel = new Float32Array(CAPACITY * 3);
    this.life = new Float32Array(CAPACITY);
    this.maxLife = new Float32Array(CAPACITY);
    this.size = new Float32Array(CAPACITY);
    this.cursor = 0;
    this.positions.fill(9999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.42, vertexColors: true, transparent: true, opacity: 0.75,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % CAPACITY;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.colors[i * 3] = r; this.colors[i * 3 + 1] = g; this.colors[i * 3 + 2] = b;
  }

  burst(x, y, z, count, speed, life, r, g, b) {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, z, Math.cos(a) * s, Math.random() * speed * 0.6 + 0.5, Math.sin(a) * s, life * (0.6 + Math.random() * 0.7), r, g, b);
    }
  }

  dust(x, y, z) { this.spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2, 0.9, 0.75, 0.68, 0.55); }
  exhaust(x, y, z) { this.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, 0.7, 0.35, 0.35, 0.35); }
  smoke(x, y, z) { this.spawn(x, y, z, (Math.random() - 0.5) * 0.8, 1.4 + Math.random(), (Math.random() - 0.5) * 0.8, 1.6, 0.22, 0.22, 0.22); }
  sparks(x, y, z) { this.burst(x, y, z, 10, 5, 0.45, 1.0, 0.75, 0.2); }
  muzzle(x, y, z) { this.burst(x, y, z, 6, 3, 0.12, 1.0, 0.85, 0.3); }
  blood(x, y, z) { this.burst(x, y, z, 8, 2.5, 0.5, 0.7, 0.05, 0.05); }

  update(dt) {
    for (let i = 0; i < CAPACITY; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.positions[i * 3 + 1] = 9999; continue; }
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] += 0.4 * dt;
      const fade = this.life[i] / this.maxLife[i];
      this.colors[i * 3] *= (0.4 + 0.6 * fade);
      this.colors[i * 3 + 1] *= (0.4 + 0.6 * fade);
      this.colors[i * 3 + 2] *= (0.4 + 0.6 * fade);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
