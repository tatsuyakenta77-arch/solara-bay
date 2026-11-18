// Solara Bay — the city itself: a procedural grid of streets, buildings,
// beach and pier, park and palms, streetlights, and the day/sunset lighting.
// All geometry is generated from a seed; colliders are plain AABBs so the
// player, cars, traffic and pedestrians all share one collision test.
import * as THREE from 'three';
import { CONFIG, mulberry32, clamp } from './config.js';

const STREETS = [-198, -154, -110, -66, -22, 22, 66, 110, 154, 198];

function makeSidewalkTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#6f6a5e'; g.fillRect(0, 0, 128, 128);
  // Slight per-slab tone variation + dark joints every 32 px.
  const rnd = mulberry32(4242);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 96 + Math.floor(rnd() * 18);
      g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
    }
  }
  g.strokeStyle = 'rgba(52,48,42,0.9)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Anisotropy keeps the slab grid readable at the grazing angles a low
  // chase camera sees it at, instead of mip-blurring to flat cream.
  tex.anisotropy = 8;
  return tex;
}

function makeWindowTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const rnd = mulberry32(base.length * 7919 + lit * 31 + 13);
  for (let y = 12; y < 244; y += 24) {
    for (let x = 10; x < 118; x += 24) {
      const on = rnd() < 0.42;
      g.fillStyle = on ? '#ffd98a' : '#2c3542';
      g.fillRect(x, y, 15, 15);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class World {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rnd = mulberry32(seed);
    this.colliders = []; // {minX,maxX,minZ,maxZ}
    this.buildingMeshes = [];
    this.streetCoords = STREETS;
    this.landmarks = {
      hospital: { x: -66, z: 154 },
      hideout: { x: 154, z: -154 },
      warehouse: { x: 176, z: 176 },
      marina: { x: -176, z: -22 },
      northPier: { x: -198, z: -198 },
      park: { x: 22, z: 66 },
      beach: { x: -216, z: 0 },
    };
    this.pickups = [];
    this._build();
  }

  // ---- construction -------------------------------------------------------
  _build() {
    const rnd = this.rnd;
    const scene = this.scene;
    const H = CONFIG.CITY_HALF;

    // Ground: grass base, sand beach on the west edge, sea beyond it.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(H * 2 + 160, H * 2 + 80),
      new THREE.MeshLambertMaterial({ color: CONFIG.GRASS }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(36, H * 2 + 80),
      new THREE.MeshLambertMaterial({ color: CONFIG.SAND }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-H - 18, 0.02, 0);
    sand.receiveShadow = true;
    scene.add(sand);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(220, H * 2 + 80),
      new THREE.MeshLambertMaterial({ color: CONFIG.SEA }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-H - 146, -0.4, 0);
    scene.add(sea);

    // Roads: asphalt strips along every street, both directions.
    const roadMat = new THREE.MeshLambertMaterial({ color: CONFIG.ASPHALT });
    // Sidewalks get a concrete-slab texture so they read as pavement, not a
    // blank wall, at the grazing angles a chase camera sees them at.
    const slabTexH = makeSidewalkTexture();
    slabTexH.wrapS = THREE.RepeatWrapping; slabTexH.wrapT = THREE.RepeatWrapping;
    slabTexH.repeat.set(160, 1);
    const slabTexV = slabTexH.clone();
    slabTexV.needsUpdate = true;
    slabTexV.repeat.set(1, 160);
    const walkMatH = new THREE.MeshLambertMaterial({ map: slabTexH });
    const walkMatV = new THREE.MeshLambertMaterial({ map: slabTexV });
    for (const s of STREETS) {
      for (const horizontal of [true, false]) {
        // NOTE: a vertical strip is built with swapped dimensions and the
        // same flat rotation — rotating a flat plane about Z would stand it up.
        const road = new THREE.Mesh(
          horizontal ? new THREE.PlaneGeometry(H * 2 + 40, CONFIG.ROAD_HALF * 2) : new THREE.PlaneGeometry(CONFIG.ROAD_HALF * 2, H * 2 + 40),
          roadMat,
        );
        road.rotation.x = -Math.PI / 2;
        if (horizontal) road.position.set(0, 0.03, s);
        else road.position.set(s, 0.03, 0);
        road.receiveShadow = true;
        scene.add(road);
        // Sidewalks flanking the road.
        for (const side of [-1, 1]) {
          const walk = new THREE.Mesh(
            horizontal ? new THREE.PlaneGeometry(H * 2 + 40, CONFIG.SIDEWALK) : new THREE.PlaneGeometry(CONFIG.SIDEWALK, H * 2 + 40),
            horizontal ? walkMatH : walkMatV,
          );
          walk.rotation.x = -Math.PI / 2;
          const off = CONFIG.ROAD_HALF + CONFIG.SIDEWALK / 2;
          if (horizontal) walk.position.set(0, 0.04, s + side * off);
          else walk.position.set(s + side * off, 0.04, 0);
          walk.receiveShadow = true;
          scene.add(walk);
        }
      }
    }

    // Centre dashes: one instanced mesh for the whole city. The count must
    // match the loop exactly (23 positions per street, 2 instances each):
    // drawing more instances than the buffer holds reads out-of-bounds
    // matrices and can splat giant phantom boxes across the frame.
    const dashGeo = new THREE.BoxGeometry(2.2, 0.06, 0.28);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
    const dashCount = STREETS.length * 2 * 23;
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let di = 0;
    for (const s of STREETS) {
      for (let t = -H; t <= H; t += 20) {
        e.set(0, 0, 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(t, 0.06, s), q, new THREE.Vector3(1, 1, 1));
        dashes.setMatrixAt(di++, m4);
        e.set(0, Math.PI / 2, 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(s, 0.06, t), q, new THREE.Vector3(1, 1, 1));
        dashes.setMatrixAt(di++, m4);
      }
    }
    dashes.count = di;
    dashes.instanceMatrix.needsUpdate = true;
    scene.add(dashes);

    // Buildings: one or two per block, varied heights and colours, window texture.
    const winTextures = CONFIG.BUILDING_PALETTE.map((c, i) =>
      makeWindowTexture('#' + c.toString(16).padStart(6, '0'), i));
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
    for (let bx = 0; bx < STREETS.length - 1; bx++) {
      for (let bz = 0; bz < STREETS.length - 1; bz++) {
        const cx = (STREETS[bx] + STREETS[bx + 1]) / 2;
        const cz = (STREETS[bz] + STREETS[bz + 1]) / 2;
        const key = `${bx},${bz}`;
        // Special blocks: park, warehouse yard, plaza, hospital.
        if (key === '4,5') { this._buildPark(cx, cz); continue; }
        if (key === '8,8') { this._buildWarehouse(cx, cz); continue; }
        if (key === '2,7') { this._buildHospital(cx, cz); continue; }
        if (key === '0,4') { this._buildMarina(cx, cz); continue; }
        const lots = rnd() < 0.45 ? 1 : 2;
        for (let l = 0; l < lots; l++) {
          // Keep every building inside the block interior: the block is 44 m
          // wide with an 8.5 m road+sidewalk margin on each side, so a
          // building's half-size plus its offset must stay under 13.5 m —
          // otherwise walls would swallow the road and trap cars.
          const w = 12 + rnd() * 6;
          const d = 12 + rnd() * 6;
          const h = 8 + rnd() * rnd() * 34;
          const ox = lots === 1 ? 0 : (l === 0 ? -5 : 5);
          const oz = lots === 1 ? 0 : (l === 0 ? 5 : -5);
          const px = cx + ox, pz = cz + oz;
          const colorIdx = Math.floor(rnd() * CONFIG.BUILDING_PALETTE.length);
          const mat = new THREE.MeshLambertMaterial({ map: winTextures[colorIdx] });
          const b = new THREE.Mesh(boxGeo, mat);
          b.scale.set(w, h, d);
          b.position.set(px, h / 2, pz);
          b.castShadow = true; b.receiveShadow = true;
          scene.add(b);
          const roof = new THREE.Mesh(boxGeo, roofMat);
          roof.scale.set(w + 0.6, 0.5, d + 0.6);
          roof.position.set(px, h + 0.25, pz);
          scene.add(roof);
          // Rooftop box for taller towers.
          if (h > 26) {
            const top = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
            top.scale.set(4, 2.5, 4);
            top.position.set(px + w * 0.2, h + 1.5, pz - d * 0.15);
            scene.add(top);
          }
          this.colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
          this.buildingMeshes.push(b);
          // Shop awning on street-facing ground floors.
          if (h < 18 && rnd() < 0.5) {
            const awn = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: [0xd94f3d, 0x2e7d6b, 0xe8a33d][Math.floor(rnd() * 3)] }));
            awn.scale.set(w * 0.7, 0.4, 3);
            awn.position.set(px, 3.4, pz + d / 2 + 1.2);
            scene.add(awn);
          }
        }
      }
    }

    // Palms along the beach and scattered through the park.
    this._buildPalms();
    // Streetlights along every street.
    this._buildStreetlights();
    // The pier: wooden deck jutting into the sea, with posts and lamps.
    this._buildPier();
    // Waypoint beacon (hidden until a mission needs it).
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 30;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.28, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }),
    );
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
    this.beacon.add(beam, ring);
    this.beacon.visible = false;
    scene.add(this.beacon);

    // Lighting: warm sun + sky fill. updateLighting() moves the sun with the clock.
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -260; this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260; this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0x9fc8e8, 320, 720);
    this.updateLighting(CONFIG.CLOCK_START_MINUTES);
  }

  _buildPark(cx, cz) {
    const rnd = this.rnd;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), new THREE.MeshLambertMaterial({ color: 0x4f9a44 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(cx, 0.05, cz);
    lawn.receiveShadow = true;
    this.scene.add(lawn);
    // Pond.
    const pond = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshLambertMaterial({ color: 0x3d8fb0 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(cx + 8, 0.07, cz + 6);
    this.scene.add(pond);
    this.colliders.push({ minX: cx + 2, maxX: cx + 14, minZ: cz, maxZ: cz + 12 });
    for (let i = 0; i < 10; i++) {
      this._palm(cx - 16 + rnd() * 32, cz - 16 + rnd() * 32);
    }
    // Benches.
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
      b.position.set(cx - 12 + i * 8, 0.6, cz - 12);
      b.castShadow = true;
      this.scene.add(b);
    }
  }

  _buildWarehouse(cx, cz) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x9a8f7a });
    const shed = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 18), mat);
    shed.position.set(cx, 4.5, cz);
    shed.castShadow = true; shed.receiveShadow = true;
    this.scene.add(shed);
    this.buildingMeshes.push(shed);
    this.colliders.push({ minX: cx - 13, maxX: cx + 13, minZ: cz - 9, maxZ: cz + 9 });
    // Crates stacked in the yard.
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xb08a4a });
    const rnd = this.rnd;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), crateMat);
      c.position.set(cx - 14 + rnd() * 10, 1.2, cz - 14 + rnd() * 26);
      c.rotation.y = rnd() * Math.PI;
      c.castShadow = true;
      this.scene.add(c);
      this.colliders.push({ minX: c.position.x - 1.2, maxX: c.position.x + 1.2, minZ: c.position.z - 1.2, maxZ: c.position.z + 1.2 });
    }
  }

  _buildHospital(cx, cz) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xf0f0ea });
    const h = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 22), mat);
    h.position.set(cx, 8, cz);
    h.castShadow = true; h.receiveShadow = true;
    this.scene.add(h);
    this.buildingMeshes.push(h);
    this.colliders.push({ minX: cx - 15, maxX: cx + 15, minZ: cz - 11, maxZ: cz + 11 });
    // Red cross sign on the roof.
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xd43a2a });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.6), crossMat);
    c1.position.set(cx, 18.5, cz + 11.2);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6, 0.6), crossMat);
    c2.position.set(cx, 18.5, cz + 11.2);
    this.scene.add(c1, c2);
  }

  _buildMarina(cx, cz) {
    // Small boat sheds + a couple of docked boats near the beach edge.
    const mat = new THREE.MeshLambertMaterial({ color: 0x7fa8b8 });
    const shed = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 12), mat);
    shed.position.set(cx, 3.5, cz);
    shed.castShadow = true;
    this.scene.add(shed);
    this.buildingMeshes.push(shed);
    this.colliders.push({ minX: cx - 8, maxX: cx + 8, minZ: cz - 6, maxZ: cz + 6 });
    for (let i = 0; i < 3; i++) {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      hull.position.set(-232 - i * 2, 0.4, cz - 12 + i * 12);
      this.scene.add(hull);
    }
  }

  _palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 7, 7), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    trunk.position.y = 3.5;
    trunk.rotation.z = (Math.random() - 0.5) * 0.15;
    trunk.castShadow = true;
    g.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x3d8a3d });
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.4, 4), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
    return g;
  }

  _buildPalms() {
    const rnd = this.rnd;
    for (let z = -200; z <= 200; z += 22) {
      this._palm(-236 + rnd() * 6, z + rnd() * 8);
      if (rnd() < 0.6) this._palm(-206 + rnd() * 4, z + 10);
    }
    for (let i = 0; i < 14; i++) {
      const s = STREETS[Math.floor(rnd() * STREETS.length)];
      const t = -190 + rnd() * 380;
      if (Math.abs(s) < 30 && Math.abs(t) < 30) continue;
      // Keep palms out of cross-streets so they never block a road.
      const nearest = this.nearestStreetCoord(t);
      if (Math.abs(t - nearest) < 7) continue;
      this._palm(s + 9 + rnd() * 2, t);
    }
  }

  _buildStreetlights() {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const count = STREETS.length * 10;
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, count);
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (const s of STREETS) {
      for (let t = -180; t <= 180; t += 40) {
        m4.makeTranslation(s + 8.2, 3.25, t);
        poles.setMatrixAt(i, m4);
        m4.makeTranslation(s + 8.2, 6.6, t);
        lamps.setMatrixAt(i, m4);
        i++;
      }
    }
    poles.count = i; lamps.count = i;
    poles.castShadow = false;
    this.scene.add(poles, lamps);
  }

  _buildPier() {
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(60, 0.5, 8), deckMat);
    deck.position.set(-268, 0.6, -22);
    deck.castShadow = true; deck.receiveShadow = true;
    this.scene.add(deck);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6a5232 });
    for (let x = -292; x <= -242; x += 8) {
      for (const dz of [-3.4, 3.4]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), postMat);
        p.position.set(x, 0, -22 + dz);
        this.scene.add(p);
      }
    }
    // Pier lamps.
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let x = -288; x <= -246; x += 14) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), lampMat);
      lamp.position.set(x, 2.6, -25.2);
      this.scene.add(lamp);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), postMat);
      pole.position.set(x, 1.3, -25.2);
      this.scene.add(pole);
    }
  }

  // ---- runtime helpers ----------------------------------------------------
  updateLighting(clockMinutes) {
    // Sun swings from east (morning) to west (evening); after 18:00 it sinks
    // toward a sunset orange, before 07:00 it is a cool dawn.
    const dayT = clamp((clockMinutes - 360) / (1140 - 360), 0, 1); // 06:00..19:00
    const angle = Math.PI * (0.12 + 0.76 * dayT);
    const sunPos = new THREE.Vector3(Math.cos(angle) * 300, 120 + Math.sin(angle) * 180, 140);
    this.sun.position.copy(sunPos);
    this.sun.target.position.set(0, 0, 0);
    const sunset = clamp(1 - Math.abs(dayT - 0.92) * 8, 0, 1);
    const sky = new THREE.Color(CONFIG.SKY_DAY).lerp(new THREE.Color(CONFIG.SKY_SUNSET), sunset * 0.85);
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);
    this.sun.color.setHex(sunset > 0.5 ? 0xffb36b : 0xfff2d0);
    this.sun.intensity = 1.9 - sunset * 0.5;
    this.hemi.intensity = 0.75 - sunset * 0.2;
  }

  isOnRoad(x, z) {
    for (const s of STREETS) {
      if (Math.abs(z - s) < CONFIG.ROAD_HALF + 0.5) return true;
      if (Math.abs(x - s) < CONFIG.ROAD_HALF + 0.5) return true;
    }
    return false;
  }

  nearestStreetCoord(v) {
    let best = STREETS[0], bd = Infinity;
    for (const s of STREETS) { const d = Math.abs(v - s); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // Push a circle (player, car, ped) out of building AABBs. Returns true on hit.
  collideCircle(x, z, r) {
    for (const c of this.colliders) {
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) return { hit: true, nx: dx, nz: dz, d: Math.sqrt(d2) || 0.001, box: c };
    }
    return { hit: false };
  }

  resolveCircle(pos, r) {
    // pos is a THREE.Vector3; slide it out of any collider it overlaps.
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of this.colliders) {
        const cx = clamp(pos.x, c.minX, c.maxX);
        const cz = clamp(pos.z, c.minZ, c.maxZ);
        let dx = pos.x - cx, dz = pos.z - cz;
        let d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 0.001) { dx = 1; dz = 0; d = 1; }
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const H = CONFIG.CITY_HALF + 90;
    pos.x = clamp(pos.x, -H, CONFIG.CITY_HALF + 8);
    pos.z = clamp(pos.z, -CONFIG.CITY_HALF - 8, CONFIG.CITY_HALF + 8);
  }

  setBeacon(x, z, visible) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = visible;
  }

  spawnPickup(type, x, z) {
    const group = new THREE.Group();
    let color = 0x2ecc71;
    if (type === 'armor') color = 0x3498db;
    if (type === 'ammo') color = 0xf1c40f;
    if (type === 'cash') color = 0x27ae60;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshLambertMaterial({ color }));
    box.position.y = 0.9;
    box.castShadow = true;
    group.add(box);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.15, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }),
    );
    glow.position.y = 0.1;
    group.add(glow);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const pickup = { type, x, z, mesh: group, bob: Math.random() * 6 };
    this.pickups.push(pickup);
    return pickup;
  }

  removePickup(pickup) {
    this.scene.remove(pickup.mesh);
    const i = this.pickups.indexOf(pickup);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  updatePickups(dt, time) {
    for (const p of this.pickups) {
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.children[0].position.y = 0.9 + Math.sin(time * 2 + p.bob) * 0.18;
    }
    if (this.beacon.visible) this.beacon.children[1].rotation.z += dt * 0.8;
  }
}
