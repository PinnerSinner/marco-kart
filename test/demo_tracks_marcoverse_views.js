// Camera views for test/demo_tracks_marcoverse_shoot.js. Chase views: { s, lat, back, up, ahead, lookUp, fov }; free cameras: { pos, look, fov }.
// `time` = the animation clock (the traffic and the hazards are functions of it).
export default {
  start: { s: 0, back: 16, up: 5, ahead: 60, lookUp: 1 },
  grid: { s: -8, back: 12, up: 4.5, ahead: 60, lookUp: 1.5, fov: 70 },
  gantry: { s: 0, back: 34, up: 9, ahead: 30, lookUp: 3, fov: 62 },
  aerial: { pos: [-40, 900, 1050], look: [-60, 20, 280], fov: 55 },
  topdown: { pos: [-60, 1300, 290], look: [-60, 0, 290], fov: 55, topDown: true },
  wave: { s: 560, back: 22, up: 7, ahead: 70, lookUp: -1, fov: 68 },
  jump: { s: 2715, back: 20, up: 5, ahead: 60, lookUp: 0 },
  spiral: { s: 1180, back: 20, up: 7, ahead: 40, lookUp: -1, fov: 70 },
  tube: { s: 2250, back: 18, up: 4, ahead: 60, lookUp: 1 },
  edge: { s: 850, lat: 8.5, back: 14, up: 3, ahead: 40, lookLat: 14, lookUp: -3, fov: 74 },
  portal: { s: 250, back: 20, up: 5, ahead: 60, lookUp: 1 },
  // forks
  viaduct: { pos: [262, 52, 150], look: [228, 36, 260], fov: 68 },
  crossing: { pos: [330, 55, 300], look: [222, 28, 330], fov: 62 },
  under: { pos: [222, 31, 262], look: [222, 29, 345], fov: 70 },
  skyline: { pos: [-110, 50, 400], look: [-135, 38, 280], fov: 66 },
  // traffic (rampable from behind)
  taxi: { pos: [-100, 38, 540], look: [-150, 34, 538], fov: 62, time: 4 },
  taxiClose: { pos: [-121, 36.2, 541], look: [-137, 34.3, 538], fov: 55, time: 4 },
  droneClose: { pos: [92, 42, 570.5], look: [84, 39.8, 565], fov: 55, time: 4 },
  drone: { pos: [98, 46, 574], look: [84, 39, 565], fov: 62, time: 4 },
  sled: { pos: [-240, 46, 358], look: [-240, 38, 392], fov: 70, time: 7 },
  ladder: { s: 1930, back: 24, up: 9, ahead: 50, lookUp: -2, fov: 70 },
};
