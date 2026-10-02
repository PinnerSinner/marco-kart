// Tuning constants for the race simulation. Everything here is a number someone may want to tweak,
// kept in one place so Race / ItemManager / AI never bury magic values.

export const RACE = Object.freeze({
  // Start
  rocketWindow: 0.6,          // s before GO in which pressing throttle earns a rocket start
  rocketSeconds: 1.0,         // boost duration of a rocket start
  rocketPower: 1.0,
  // Finish handling
  postHumanTimeout: 25,       // s the field keeps racing after the (last) human finishes
  humanGraceAfterAi: 60,      // s a human still gets once every AI has finished
  maxRaceTime: 900,           // s hard cap on a race
  // Progress / anti-cheat
  jumpMax: 30,                // m of centreline-`s` change per step that still counts as continuous driving
  rankHysteresis: 0.75,       // m a racer must lead before a place swap is registered (stops HUD flicker)
  overtakeCooldown: 1.5,      // s between overtake events for the same ordered pair
  overtakeGrace: 2.0,         // s after GO with no overtake events (grid shuffle)
  // Wrong way (human only)
  wrongWaySeconds: 1.5,
  wrongWaySpeed: 3.0,         // m/s backwards along the track that counts
  wrongWayClear: 0.4,         // s of forward driving that clears the warning
  // Respawn
  respawnInvincible: 1.5,
  respawnFx: 1.2,             // s that kart.status.respawning is held for (visual beam)
  fallDelay: 1.0,             // s of falling in the void before the respawn happens
  stuckSeconds: 5,
  stuckSpeed: 1.5,            // m/s under which a kart pressing throttle counts as stuck
  flipSeconds: 1.2,
  offRoadSeconds: 15,
  offRoadLateral: 20,         // m beyond the road edge for the off-road respawn rule
  respawnBack: 6,             // m behind the last valid position that the kart is put back
  // Items
  rouletteSeconds: 1.4,
  boxPickupHeight: 3.0,       // m vertical tolerance for an item-box pickup
  obstacleCooldown: 1.2,      // s before the same obstacle can hit the same racer again
  obstacleSpin: 1.4,
  obstacleBumpFactor: 0.55,   // speed multiplier after a 'bump' obstacle
  // Rubber banding: gap (m) at which the full `DIFFICULTIES[].rubber` is applied
  rubberFullGap: 160,
  rubberInterval: 0.25,       // s between rubber-band updates
  // Finished karts cruise at this fraction of their top speed
  cruiseSpeedFrac: 0.5,
  cruiseOffset: 6.5,          // m to the outside of the racing line so cruisers stay out of the way
});
