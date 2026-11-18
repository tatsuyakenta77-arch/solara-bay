// Solara Bay — story missions: five jobs for Rico and Mara, each with
// on-screen objectives, a waypoint beacon, timers where they fit, and a
// payout. Progress is saved so the player picks up where they left off.
import { CONFIG, MISSION_DEFS, dist2D } from './config.js';

export class Missions {
  constructor(G) {
    this.G = G;
    this.waypoint = null; // {x, z, label}
    this.checkpoints = [];
    this.checkpointIndex = 0;
    this.reachedThreeStars = false;
    this.stashPickup = null;
  }

  def() { return MISSION_DEFS[this.G.state.missionIndex] || null; }

  startMission(index) {
    const G = this.G;
    const state = G.state;
    const def = MISSION_DEFS[index];
    if (!def) return false;
    state.missionActive = true;
    state.missionId = def.id;
    state.missionIndex = index;
    state.missionStage = 0;
    state.missionFailed = false;
    state.missionTimer = def.timeLimit || 0;
    state.missionObjective = def.objective;
    this.checkpoints = [];
    this.checkpointIndex = 0;
    this.reachedThreeStars = false;
    G.combat.clearEnemies();
    const W = G.world.landmarks;
    if (def.id === 1) {
      this.setWaypoint(W.marina.x, W.marina.z, 'Marina Row');
      state.missionObjective = 'Steal a car (press E near one)';
    } else if (def.id === 2) {
      this.setWaypoint(W.northPier.x, W.northPier.z, 'North Pier');
      state.missionObjective = 'Get a car and deliver the package to North Pier';
    } else if (def.id === 3) {
      this.clearWaypoint();
      state.missionObjective = 'Cause trouble — reach 3 wanted stars';
    } else if (def.id === 4) {
      this.setWaypoint(W.warehouse.x, W.warehouse.z, 'Warehouse');
      G.combat.spawnEnemies(W.warehouse.x, W.warehouse.z - 6, 5, 16);
      G.world.spawnPickup('ammo', W.warehouse.x - 18, W.warehouse.z - 10);
      G.world.spawnPickup('health', W.warehouse.x + 16, W.warehouse.z + 12);
      state.missionObjective = 'Clear the warehouse yard — 5 gunmen left';
    } else if (def.id === 5) {
      G.police.addWanted(state, 3, 'The whole city is after you');
      this.checkpoints = [
        { x: -154, z: 154, label: 'Checkpoint 1/4' },
        { x: 154, z: 66, label: 'Checkpoint 2/4' },
        { x: -66, z: -154, label: 'Checkpoint 3/4' },
        { x: 110, z: -110, label: 'Checkpoint 4/4' },
      ];
      this.checkpointIndex = 0;
      this.setWaypoint(this.checkpoints[0].x, this.checkpoints[0].z, this.checkpoints[0].label);
      state.missionObjective = 'Hit all 4 checkpoints, then reach the hideout';
    }
    state.message = `${def.name} — ${def.giver}: ${def.brief}`;
    state.messageTimer = 6;
    return true;
  }

  setWaypoint(x, z, label) {
    this.waypoint = { x, z, label };
    this.G.world.setBeacon(x, z, true);
  }

  clearWaypoint() {
    this.waypoint = null;
    this.G.world.setBeacon(0, 0, false);
  }

  waypointDistance() {
    if (!this.waypoint) return null;
    const p = this.G.player.pos;
    return Math.round(dist2D(p.x, p.z, this.waypoint.x, this.waypoint.z));
  }

  completeMission() {
    const G = this.G;
    const state = G.state;
    const def = MISSION_DEFS[state.missionIndex];
    const reward = CONFIG.MISSION_REWARDS[state.missionIndex] || 500;
    state.money += reward;
    state.missionsDone += 1;
    state.missionActive = false;
    state.missionObjective = def ? `${def.name} complete — $${reward}` : 'Mission complete';
    state.message = `Mission complete! +$${reward}`;
    state.messageTimer = 5;
    G.audio.missionDone();
    this.clearWaypoint();
    G.combat.clearEnemies();
    if (this.stashPickup) { G.world.removePickup(this.stashPickup); this.stashPickup = null; }
    state.missionIndex = Math.min(state.missionIndex + 1, MISSION_DEFS.length);
    if (state.missionIndex >= MISSION_DEFS.length) {
      state.mode = 'complete';
      state.missionObjective = 'Story complete — Solara Bay is yours';
    }
    G.saveGame();
  }

  failMission(reason) {
    const G = this.G;
    const state = G.state;
    state.missionActive = false;
    state.missionFailed = true;
    state.missionObjective = `Failed: ${reason} — press Enter to retry`;
    state.message = `Mission failed: ${reason}`;
    state.messageTimer = 5;
    G.audio.missionFail();
    this.clearWaypoint();
    G.combat.clearEnemies();
    if (this.stashPickup) { G.world.removePickup(this.stashPickup); this.stashPickup = null; }
  }

  update(dt) {
    const G = this.G;
    const state = G.state;
    if (!state.missionActive) return;
    const def = MISSION_DEFS[state.missionIndex];
    if (!def) return;
    const p = G.player.pos;
    const inCar = state.inCar;
    if (def.timeLimit) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) { this.failMission('Out of time'); return; }
    }
    if (def.id === 1) {
      if (state.missionStage === 0) {
        if (inCar) {
          state.missionStage = 1;
          state.missionObjective = 'Drive to the marker at Marina Row';
          state.message = 'Nice wheels. Now bring it to Marina Row.';
          state.messageTimer = 3;
        }
      } else if (this.waypoint && dist2D(p.x, p.z, this.waypoint.x, this.waypoint.z) < 9) {
        this.completeMission();
      }
    } else if (def.id === 2) {
      if (this.waypoint && dist2D(p.x, p.z, this.waypoint.x, this.waypoint.z) < 10) {
        this.completeMission();
      }
    } else if (def.id === 3) {
      if (state.missionStage === 0) {
        if (state.wanted >= 3) {
          state.missionStage = 1;
          this.reachedThreeStars = true;
          state.missionObjective = 'Now lose the cops — stay hidden until the heat dies';
          state.message = 'Three stars! Now disappear.';
          state.messageTimer = 3;
        }
      } else if (state.wanted === 0) {
        this.completeMission();
      }
    } else if (def.id === 4) {
      const left = G.combat.aliveCount();
      if (state.missionStage === 0) {
        state.missionObjective = `Clear the warehouse yard — ${left} gunman${left === 1 ? '' : 'men'} left`;
        if (left === 0) {
          state.missionStage = 1;
          const W = G.world.landmarks.warehouse;
          this.stashPickup = G.world.spawnPickup('cash', W.x, W.z - 4);
          this.setWaypoint(W.x, W.z - 4, 'Stash');
          state.missionObjective = 'Grab the stash at the warehouse';
          state.message = 'Yard is clear. Grab the stash!';
          state.messageTimer = 3;
        }
      } else if (this.stashPickup && dist2D(p.x, p.z, this.stashPickup.x, this.stashPickup.z) < 3) {
        this.completeMission();
      }
    } else if (def.id === 5) {
      if (state.missionStage < 4) {
        const cp = this.checkpoints[this.checkpointIndex];
        if (cp && dist2D(p.x, p.z, cp.x, cp.z) < 12) {
          state.money += 200;
          state.message = `${cp.label} hit! +$200`;
          state.messageTimer = 2.5;
          G.audio.cash();
          this.checkpointIndex += 1;
          state.missionStage = this.checkpointIndex;
          if (this.checkpointIndex < this.checkpoints.length) {
            const next = this.checkpoints[this.checkpointIndex];
            this.setWaypoint(next.x, next.z, next.label);
            state.missionObjective = `Checkpoint ${this.checkpointIndex + 1}/4 — then reach the hideout`;
          } else {
            const W = G.world.landmarks.hideout;
            this.setWaypoint(W.x, W.z, 'Hideout');
            state.missionObjective = 'All checkpoints hit — reach the hideout!';
          }
        }
      } else if (this.waypoint && dist2D(p.x, p.z, this.waypoint.x, this.waypoint.z) < 10) {
        this.completeMission();
      }
    }
  }
}
