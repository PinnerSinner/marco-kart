// The hall envelope: raised floor, ceiling, outer walls.
import * as THREE from 'three';

/** Hall extents derived from the route bounding box. */
export function hallBounds(R) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const cl = R.cl;
  for (let i = 0; i < cl.N; i += 4) { x0 = Math.min(x0, cl.x[i]); x1 = Math.max(x1, cl.x[i]); z0 = Math.min(z0, cl.z[i]); z1 = Math.max(z1, cl.z[i]); }
  const mx = 80, mz = 80;
  return { x0: x0 - mx, x1: x1 + mx, z0: z0 - mz, z1: z1 + mz, ceil: 34 };
}

function quadMesh(pts, uvs, material, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.name = name; m.frustumCulled = false; return m;
}

export function hallShell(kit, { R, M }) {
  const B = hallBounds(R), { x0, x1, z0, z1, ceil } = B;
  const W = x1 - x0, D = z1 - z0;
  // floor (tile repeat 4.8 m)
  const f = quadMesh([[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]], [[x0 / 4.8, z1 / 4.8], [x1 / 4.8, z1 / 4.8], [x1 / 4.8, z0 / 4.8], [x0 / 4.8, z0 / 4.8]], M.floor, 'hall-floor');
  f.receiveShadow = true; kit.add(f);
  // ceiling
  const c = quadMesh([[x0, ceil, z0], [x1, ceil, z0], [x1, ceil, z1], [x0, ceil, z1]], [[x0 / 20, z0 / 20], [x1 / 20, z0 / 20], [x1 / 20, z1 / 20], [x0 / 20, z1 / 20]], M.ceiling, 'hall-ceiling');
  c.userData.aerialHide = true; kit.add(c);
  // outer walls
  const wall = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    return quadMesh([[ax, 0, az], [bx, 0, bz], [bx, ceil, bz], [ax, ceil, az]], [[0, 0], [len / 24, 0], [len / 24, ceil / 40 * 2], [0, ceil / 40 * 2]], M.hallWall, 'hall-wall');
  };
  kit.add(wall(x0, z0, x1, z0)); kit.add(wall(x1, z0, x1, z1)); kit.add(wall(x1, z1, x0, z1)); kit.add(wall(x0, z1, x0, z0));
  return B;
}
