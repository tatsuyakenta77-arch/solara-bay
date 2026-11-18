// Solara Bay — deterministic screenshot staging behind ?shot=cover|chase|
// mission|street. Each scene arranges the real game (real city, real cars,
// real police, real mission state) and a fixed camera, then the loop runs
// live for a short settle so traffic and particles are mid-motion.
import { CONFIG } from './config.js';

export function stageShot(G, name) {
  const s = G.state;
  const W = G.world.landmarks;
  s.shotMode = name;
  s.mode = 'playing';
  s.muted = true;
  G.audio.setMuted(true);
  // A sunny late-afternoon look for every shot.
  s.clockMinutes = 16 * 60 + 40;
  G.world.updateLighting(s.clockMinutes);
  // Clear any parked-car randomness: use the same starting arrangement.
  if (name === 'cover') {
    // Hero: player beside a red car on a sunlit avenue, mission 1 live.
    // The camera sits south-west of the player, looking north-east down the
    // avenue so the road, buildings and palms fill the frame.
    const car = G.parked[0];
    car.pos.set(44, 0, 22);
    car.yaw = Math.PI / 2;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.yaw;
    // The cover car is always the classic red one.
    car.mesh.children[0].material.color.setHex(0xc0392b);
    G.player.reset(48, 27, Math.PI * 0.55);
    G.player.camYaw = -0.6;
    G.player.camPitch = 0.25;
    G.missions.startMission(0);
    s.money = 1250;
    s.weapon = 'pistol';
    s.health = 100; s.armor = 50;
    s.message = 'First Wheels — steal a car and bring it to Marina Row';
    s.messageTimer = 999;
  } else if (name === 'chase') {
    // Police pursuit: player driving, 3 stars, cruisers closing in.
    const car = G.parked[1];
    car.pos.set(-22, 0, -22);
    car.yaw = Math.PI / 2;
    car.speed = 18;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.yaw;
    G.enterCar(car, true);
    G.player.camYaw = Math.PI * 1.5;
    G.police.addWanted(s, 3, 'Wanted: 3 stars');
    // Cruisers ahead of the player, in view of the chase camera: one
    // head-on in the oncoming lane, one cutting across from the right.
    const cruiserSpots = [
      { x: 14, z: -27, yaw: -Math.PI / 2 },
      { x: 30, z: -32, yaw: Math.PI },
      { x: -8, z: -14, yaw: Math.PI / 2 },
    ];
    for (let i = 0; i < 3; i++) {
      const c = G.police._spawnCar(G.player.pos);
      if (c) {
        c.pos.set(cruiserSpots[i].x, 0, cruiserSpots[i].z);
        c.yaw = cruiserSpots[i].yaw;
        c.mesh.position.copy(c.pos);
        c.mesh.rotation.y = c.yaw;
      }
    }
    s.money = 3420;
    s.speedKmh = 68;
    s.message = 'Lose the cops — stay out of sight until the heat dies';
    s.messageTimer = 999;
    s.missionObjective = 'Hot Pursuit — reach 3 stars, then lose the police';
    s.missionActive = true;
    s.missionId = 3;
    s.missionStage = 1;
    s.missionIndex = 2;
  } else if (name === 'mission') {
    // Mission 4 in progress: warehouse shootout, waypoint + gunmen.
    // The player stands north-west of the warehouse on open ground and
    // the camera looks south-east at the shed, the beacon and the yard
    // (close-in angles put the shed's wall across the whole frame).
    G.player.reset(W.warehouse.x - 16, W.warehouse.z - 36, Math.PI * 0.25);
    G.player.camYaw = Math.PI * 1.25;
    G.player.camPitch = 0.25;
    G.missions.startMission(3);
    G.player.setArmed(true);
    s.weapon = 'pistol';
    s.ammoMag = 10; s.ammoReserve = 48;
    s.money = 2100;
    s.wanted = 1;
    s.message = 'Warehouse Deal — clear the yard';
    s.messageTimer = 999;
    // A traffic car and pedestrians in the mid-ground for life.
    const car = G.parked[2];
    car.pos.set(W.warehouse.x - 8, 0, W.warehouse.z - 30);
    car.yaw = 0;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.yaw;
  } else if (name === 'street') {
    // Street level on foot: pedestrians, traffic, storefronts. The player
    // stands on the road itself, looking north down the avenue.
    G.player.reset(66, 66, Math.PI * 0.9);
    G.player.camYaw = Math.PI * 1.02;
    G.player.camPitch = 0.2;
    G.player.camDist = 6;
    s.weapon = 'fists';
    s.money = 750;
    s.missionObjective = 'Free roam — explore Solara Bay';
    s.missionActive = false;
    s.message = 'Solara Bay — Marina District';
    s.messageTimer = 999;
    // Pull a few pedestrians close to the player for the frame.
    for (let i = 0; i < 5; i++) {
      const p = G.pedestrians.peds[i];
      p.x = 60 + i * 4;
      p.z = 70 + (i % 2 ? 2 : -2);
      p.horizontal = true;
      p.street = 66;
      p.side = 1;
    }
    const car = G.parked[3];
    car.pos.set(66, 0, 88);
    car.yaw = 0;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.yaw;
  }
  // Let the world settle (traffic moves, smoke rises) before the shot.
  G.shotFrames = 0;
  G.shotReadyAfter = 75;
  G.shotStart = performance.now();
}
