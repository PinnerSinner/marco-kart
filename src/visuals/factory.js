// Public model factory for characters, karts, items and the item box (SPEC section 7). This is the ONLY visuals module
// the UI needs to import for 3D previews. Shapes are documented on each implementation.
//
//   createCharacterMesh(charId, opts?)  -> THREE.Group  (userData: head, setExpression, lookSteer, setPose, setMotion, dispose)
//   createKartMesh(kartId, colour, accent?) -> { group, wheels[4], seat, exhausts[2], body, glow, steeringWheel, fans, animate(dt, steer, speed) }
//   createDriverKart(charId, kartId)    -> same as createKartMesh plus { driver, charId }
//   createItemMesh(itemId)              -> THREE.Group  (userData.update(t))
//   createItemBoxMesh()                 -> THREE.Group  (userData.update(t, pop))
export { createCharacterMesh } from './characters.js';
export { createKartMesh, createDriverKart, accentFor } from './karts.js';
export { createItemMesh, createItemBoxMesh, createFirewallBubble } from './itemMeshes.js';
export { EXPRESSIONS } from './faces.js';
export { addPreviewLights } from './preview.js';
