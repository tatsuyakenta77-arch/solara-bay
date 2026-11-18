// Solara Bay — the player on foot: a low-poly character, WASD movement
// relative to the camera, sprint, jump, and the third-person orbit camera
// that follows on foot and behind the wheel.
import * as THREE from 'three';
import { CONFIG, clamp, lerp } from './config.js';

function limb(color, w, h, d) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.castShadow = true;
  return m;
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 22);
    this.yaw = 0; // facing
    this.camYaw = Math.PI; // camera looks north by default
    this.camPitch = 0.32;
    this.camDist = 7.5;
    this.velY = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.moving = false;
    this.sprinting = false;
    this.healthFlash = 0;
    this.mesh = new THREE.Group();
    // Torso, head, arms, legs — bright jacket so the player reads at a glance.
    this.torso = limb(0xe74c3c, 0.72, 0.85, 0.4);
    this.torso.position.y = 1.15;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
    this.head.position.y = 1.85;
    this.head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0x222831 }));
    cap.position.y = 2.02;
    this.legL = limb(0x2c3e50, 0.26, 0.8, 0.3); this.legL.position.set(-0.18, 0.4, 0);
    this.legR = limb(0x2c3e50, 0.26, 0.8, 0.3); this.legR.position.set(0.18, 0.4, 0);
    this.armL = limb(0xe74c3c, 0.2, 0.75, 0.24); this.armL.position.set(-0.48, 1.15, 0);
    this.armR = limb(0xe74c3c, 0.2, 0.75, 0.24); this.armR.position.set(0.48, 1.15, 0);
    // A pistol in the right hand when armed (shown by combat).
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    this.gun.position.set(0.48, 0.82, 0.22);
    this.gun.visible = false;
    this.mesh.add(this.torso, this.head, cap, this.legL, this.legR, this.armL, this.armR, this.gun);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
    this._camTarget = new THREE.Vector3();
    this._camPos = new THREE.Vector3(0, 6, 30);
  }

  setArmed(armed) { this.gun.visible = armed; }

  reset(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.camYaw = yaw + Math.PI;
    this.velY = 0;
    this.mesh.position.copy(this.pos);
  }

  // Returns true while the player is actually moving.
  update(dt, input, world, state) {
    const axes = input.moveAxes();
    // Mouse orbit.
    const mouse = input.consumeMouse();
    this.camYaw -= mouse.dx * 0.0028 * state.sensitivity;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0022 * state.sensitivity, -0.15, 1.1);
    // When aiming with the pistol held, the camera pulls in closer.
    const aiming = state.weapon === 'pistol' && input.mouseDown;
    const wantDist = aiming ? 5.2 : 7.5;
    this.camDist = lerp(this.camDist, wantDist, dt * 5);

    this.sprinting = (input.down('ShiftLeft') || input.down('ShiftRight')) && axes.y > 0;
    const speed = this.sprinting ? CONFIG.SPRINT_SPEED : CONFIG.WALK_SPEED;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    // Forward is away from the camera.
    let mx = (-sin * axes.y) + (-cos * axes.x) * -1;
    let mz = (-cos * axes.y) + (sin * axes.x) * -1;
    // Recompute cleanly: forward = (-sin(camYaw), -cos(camYaw)), right = (cos, -sin)... use vector math:
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
    mx = fwdX * axes.y + rightX * axes.x;
    mz = fwdZ * axes.y + rightZ * axes.x;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    if (this.moving) {
      mx /= len; mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      const targetYaw = Math.atan2(mx, mz);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 12);
      this.walkPhase += dt * (this.sprinting ? 13 : 9);
    }
    // Jump + gravity.
    if (input.wasPressed('Space') && this.onGround) {
      this.velY = CONFIG.JUMP_SPEED;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= CONFIG.GRAVITY * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    }
    world.resolveCircle(this.pos, 0.55);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    // Walk-cycle swing.
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    if (!this.moving) {
      this.legL.rotation.x *= 0.8; this.legR.rotation.x *= 0.8;
      this.armL.rotation.x *= 0.8; this.armR.rotation.x *= 0.8;
    }
    if (this.healthFlash > 0) this.healthFlash -= dt;
    return this.moving;
  }

  updateCamera(camera, dt, focusPos, focusYaw) {
    // focusPos/focusYaw: the car when driving, the player otherwise.
    const yaw = focusYaw !== undefined ? focusYaw : this.camYaw;
    const dist = focusYaw !== undefined ? 12 : this.camDist;
    // A low, near-level chase camera: steep look-down angles make the flat
    // ground planes (sidewalks especially) swallow the frame.
    const height = focusYaw !== undefined ? 5.6 : 2.8 + this.camPitch * 2.0;
    const tx = focusPos.x, ty = focusPos.y + (focusYaw !== undefined ? 1.2 : 1.6), tz = focusPos.z;
    const cx = tx + Math.sin(yaw) * dist;
    const cz = tz + Math.cos(yaw) * dist;
    const cy = ty + height;
    const k = 1 - Math.exp(-dt * 7);
    this._camPos.x += (cx - this._camPos.x) * k;
    this._camPos.y += (cy - this._camPos.y) * k;
    this._camPos.z += (cz - this._camPos.z) * k;
    // Screen shake.
    const s = window.__shake || 0;
    const shX = s > 0 ? (Math.random() - 0.5) * s * 0.5 : 0;
    const shY = s > 0 ? (Math.random() - 0.5) * s * 0.4 : 0;
    camera.position.set(this._camPos.x + shX, this._camPos.y + shY, this._camPos.z);
    this._camTarget.set(tx, ty, tz);
    camera.lookAt(this._camTarget);
  }
}
