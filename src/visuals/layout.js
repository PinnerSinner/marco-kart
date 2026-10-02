// Shared layout constants so every kart cockpit and every driver rig agree on where the seat and steering wheel are.
// All values are in KART-local metres (origin = ground contact point, +Z forward, +X = the driver's LEFT).
import * as THREE from 'three';

/** Uniform scale applied to every driver model (authored ~1.7 tall, shown ~1.5). */
export const DRIVER_SCALE = 0.9;
/** Seat (hip) point in kart space. */
export const SEAT_POS = new THREE.Vector3(0, 0.80, -0.30);
/** Centre of the steering wheel in kart space. */
export const WHEEL_POS = new THREE.Vector3(0, 1.10, 0.44);
/** Unit normal of the steering wheel disc (points at the driver). */
export const WHEEL_NORMAL = new THREE.Vector3(0, 0.55, -0.835).normalize();
/** Wheel radius (m). */
export const WHEEL_RADIUS = 0.27;
