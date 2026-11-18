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
    const car = G.parked[0];
    car.pos.set(22, 0, 40);
    car.yaw = Math.PI / 2;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.yaw;
    G.player.reset(26, 36, Math.PI * 0.55);
    G.player.camYaw = Math.PI * 0.82;
    G.player.camPitch = 0.3;
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
    // Two cruisers right behind, one ahead cutting across.
    for (let i = 0; i < 3; i++) {
      const c = G.police._spawnCar(G.player.pos);
      if (c) {
        c.pos.set(-22 - 26 - i * 14, 0, -22 + (i % 2 ? 3 : -3));
        c.yaw = Math.PI / 2;
        c.mesh.position.copy(c.pos);
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
    G.player.reset(W.warehouse.x - 30, W.warehouse.z + 8, Math.PI * 0.5);
    G.player.camYaw = Math.PI * 0.72;
    G.player.camPitch = 0.34;
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
    // Street level on foot: pedestrians, traffic, storefronts.
    G.player.reset(66, 74, Math.PI * 0.9);
    G.player.camYaw = Math.PI * 1.02;
    G.player.camPitch = 0.22;
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
