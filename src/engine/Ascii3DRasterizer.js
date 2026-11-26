import { DENSITY_RAMP } from './PureAsciiEngine.js';

// Sharper ~33° acute oblique projection: dramatic depth relief & visible distant horizons!
export const WORLD_TILT_Y = 0.62;
export const TILT_Y = 0.62;
export const LIFT_Z = 0.92;

// Normalized camera view direction INTO the scene (~33° acute oblique top-down angle looking North-Down)
const RAY_DY = -0.838671;
const RAY_DZ = -0.544639;

// Pre-normalized moonlight vector coming from upper-north-east slightly behind/above
const MOON_LX = -0.44;
const MOON_LY = -0.52;
const MOON_LZ = 0.73;

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash3(x, y, z) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

/** Rotate local point/vector around Z axis by `yaw` radians (0 = +X East, +PI/2 = +Y South). */
export function rotZ(x, y, z, yaw) {
  if (!yaw) return [x, y, z];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c - y * s, x * s + y * c, z];
}

/** Rotate around local Y axis (pitch), then around Z (yaw). */
export function transformLocal(x, y, z, yaw = 0, pitch = 0, ox = 0, oy = 0, oz = 0) {
  let px = x;
  let py = y;
  let pz = z;
  if (pitch) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const nx = px * cp + pz * sp;
    const nz = -px * sp + pz * cp;
    px = nx;
    pz = nz;
  }
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [ox + px * c - py * s, oy + px * s + py * c, oz + pz];
}

/**
 * True Semi-3D Software Z-Buffer -> Pure ASCII Character Rasterizer.
 *
 * All geometry lives in real 3D coordinates (x, y, z >= 0 height) and is ray-intersected per cell
 * under oblique 2.5D top-down projection:
 *   screenX = x
 *   screenY = y * TILT_Y - z * LIFT_Z
 * Supports ellipsoids/spheres, 3D bone capsules/tapered limbs, 3D oriented boxes (plates/shields/bricks),
 * hollow cylindrical stone towers/arches/spirals, and double-sided wing quads — with Z-occlusion,
 * 3D surface normals, dual lighting (Moonlight + warm Lantern/Campfire point light), Fresnel rim,
 * procedural 3D textures (stone, fur, plate, foliage, bone, crystal, ember), and normal/depth edge glyphs.
 */
export class Ascii3DBuffer {
  constructor(cols = 64, rows = 64, worldSpanX = 110, worldSpanY = 110, mirrorZ = false) {
    this.resize(cols, rows, worldSpanX, worldSpanY, mirrorZ);
  }

  resize(cols, rows, worldSpanX, worldSpanY, mirrorZ = false) {
    const len = cols * rows;
    if (!this.depth || this.depth.length < len) {
      this.depth = new Float32Array(len);
      this.nx = new Float32Array(len);
      this.ny = new Float32Array(len);
      this.nz = new Float32Array(len);
      this.ar = new Float32Array(len);
      this.ag = new Float32Array(len);
      this.ab = new Float32Array(len);
      this.em = new Float32Array(len);
      this.mat = new Uint8Array(len);
      this.wx = new Float32Array(len);
      this.wy = new Float32Array(len);
      this.wz = new Float32Array(len);
      this.noise = new Float32Array(len);
      this.sz = new Float32Array(len);
    }
    this.cols = cols;
    this.rows = rows;
    this.len = len;
    this.worldSpanX = worldSpanX;
    this.worldSpanY = worldSpanY;
    this.mirrorZ = mirrorZ;
    this.stepX = worldSpanX / cols;
    this.stepY = worldSpanY / rows;
    this.originX = -worldSpanX * 0.5;
    // Upright objects extend upward (-Z*lift); mirrored reflections hang downward (+Z*lift)
    this.originY = mirrorZ ? -worldSpanY * 0.24 : -worldSpanY * 0.72;
    this.yaw = 0;

    this.depth.fill(1e9, 0, len);
    this.mat.fill(0, 0, len);
    this.sz.fill(1.0, 0, len);
  }

  _mz(z) {
    return this.mirrorZ ? -z * 0.86 : z;
  }

  _projRect(minX, maxX, minY, maxY, minZ, maxZ, pad = 2) {
    const zm0 = this._mz(minZ);
    const zm1 = this._mz(maxZ);
    const zLo = Math.min(zm0, zm1);
    const zHi = Math.max(zm0, zm1);

    const syMin = minY * TILT_Y - zHi * LIFT_Z;
    const syMax = maxY * TILT_Y - zLo * LIFT_Z;

    const ix0 = Math.max(0, Math.floor((minX - this.originX) / this.stepX) - pad);
    const ix1 = Math.min(this.cols - 1, Math.ceil((maxX - this.originX) / this.stepX) + pad);
    const iy0 = Math.max(0, Math.floor((syMin - this.originY) / this.stepY) - pad);
    const iy1 = Math.min(this.rows - 1, Math.ceil((syMax - this.originY) / this.stepY) + pad);
    return [ix0, ix1, iy0, iy1];
  }

  _writePixel(idx, t, px, py, pz, nx, ny, nz, mat, nJitter = 0) {
    if (t >= this.depth[idx]) return;
    this.depth[idx] = t;
    const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    this.nx[idx] = nx * inv;
    this.ny[idx] = ny * inv;
    this.nz[idx] = nz * inv;
    this.wx[idx] = px;
    this.wy[idx] = py;
    this.wz[idx] = pz;
    this.ar[idx] = mat.r;
    this.ag[idx] = mat.g;
    this.ab[idx] = mat.b;
    this.em[idx] = mat.emissive || 0;
    this.mat[idx] = mat.typeId || 1;
    this.noise[idx] = nJitter;
    this.sz[idx] = mat.sizeBias || 1.0;
  }

  /**
   * 3D Ellipsoid / Sphere centered at (cx, cy, cz) with radii (rx, ry, rz).
   * Supports optional Z-yaw rotation of the ellipsoid axes!
   */
  addEllipsoid(cx, cy, cz, rx, ry, rz, mat, yaw = 0, furAmt = 0) {
    if (rx <= 0.1 || ry <= 0.1 || rz <= 0.1) return;
    const zc = this._mz(cz);
    const rMaxXY = Math.max(rx, ry);
    const [ix0, ix1, iy0, iy1] = this._projRect(
      cx - rMaxXY, cx + rMaxXY,
      cy - rMaxXY, cy + rMaxXY,
      cz - rz, cz + rz
    );

    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const rdx = 0;
    const rdy = RAY_DY;
    const rdz = RAY_DZ;

    // Transform ray dir into ellipsoid local aligned frame
    const ldx = rdy * sinY;
    const ldy = rdy * cosY;
    const ldz = rdz;
    const invRx2 = 1 / (rx * rx);
    const invRy2 = 1 / (ry * ry);
    const invRz2 = 1 / (rz * rz);
    const A = ldx * ldx * invRx2 + ldy * ldy * invRy2 + ldz * ldz * invRz2;
    const inv2A = 1 / (2 * A);

    for (let row = iy0; row <= iy1; row++) {
      const sy = this.originY + (row + 0.5) * this.stepY;
      const py0 = sy / TILT_Y;
      const rowOff = row * this.cols;
      for (let col = ix0; col <= ix1; col++) {
        const idx = rowOff + col;
        const sx = this.originX + (col + 0.5) * this.stepX;
        const ox = sx - cx;
        const oy = py0 - cy;
        const oz = -zc;

        const lox = ox * cosY + oy * sinY;
        const loy = -ox * sinY + oy * cosY;
        const loz = oz;

        const B = 2 * (lox * ldx * invRx2 + loy * ldy * invRy2 + loz * ldz * invRz2);
        const C = lox * lox * invRx2 + loy * loy * invRy2 + loz * loz * invRz2 - 1;
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;

        const t = (-B - Math.sqrt(disc)) * inv2A;
        const hx = sx;
        const hy = py0 + t * rdy;
        const hz = t * rdz;

        const lx = lox + t * ldx;
        const ly = loy + t * ldy;
        const lz = loz + t * ldz;

        let nx = lx * invRx2 * cosY - ly * invRy2 * sinY;
        let ny = lx * invRx2 * sinY + ly * invRy2 * cosY;
        let nz = lz * invRz2;
        if (this.mirrorZ) nz = -nz;

        let nVal = 0;
        if (furAmt > 0) {
          nVal = hash3(hx * 0.65, hy * 0.65, hz * 0.65);
          nx += (nVal - 0.5) * furAmt;
          ny += (hash3(hy, hz, hx) - 0.5) * furAmt;
          nz += (hash3(hz, hx, hy) - 0.5) * furAmt * 0.7;
        }

        const worldHitZ = this.mirrorZ ? -hz / 0.86 : hz;
        this._writePixel(idx, t, hx, hy, worldHitZ, nx, ny, nz, mat, nVal);
      }
    }
  }

  /**
   * 3D Tapered Bone Capsule from A(ax,ay,az) to B(bx,by,bz) with radii rA -> rB!
   * Ideal for articulated horse legs, tarantula furry limbs, dragon tail/horns, tree trunks & arms.
   */
  addCapsule(ax, ay, az, bx, by, bz, rA, rB, mat, furAmt = 0) {
    const rMax = Math.max(rA, rB) + 0.5;
    const [ix0, ix1, iy0, iy1] = this._projRect(
      Math.min(ax, bx) - rMax, Math.max(ax, bx) + rMax,
      Math.min(ay, by) - rMax, Math.max(ay, by) + rMax,
      Math.min(az, bz) - rMax, Math.max(az, bz) + rMax
    );

    const za = this._mz(az);
    const zb = this._mz(bz);
    const abx = bx - ax;
    const aby = by - ay;
    const abz = zb - za;
    const abLenSq = abx * abx + aby * aby + abz * abz || 1e-4;
    const invAbLenSq = 1 / abLenSq;
    const rdy = RAY_DY;
    const rdz = RAY_DZ;

    // Closest point on ray to segment approximation + iterative sphere trace refinement (2 steps = exact capsule!)
    for (let row = iy0; row <= iy1; row++) {
      const sy = this.originY + (row + 0.5) * this.stepY;
      const py0 = sy / TILT_Y;
      const rowOff = row * this.cols;
      for (let col = ix0; col <= ix1; col++) {
        const idx = rowOff + col;
        const sx = this.originX + (col + 0.5) * this.stepX;

        // Project origin to midpoint depth first to get clean initial s along bone segment
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        const mz = (za + zb) * 0.5;
        let tApprox = ((my - py0) * rdy + mz * rdz);
        // Quick ray-capsule distance minimization around segment
        let bestT = 1e9;
        let bestNx = 0, bestNy = 0, bestNz = 1;
        let hit = false;

        // Solve minimum distance from ray O + t*D to line A + s*AB:
        const oax = sx - ax;
        const oay = py0 - ay;
        const oaz = -za;
        const dDotD = 1.0; // rdy^2 + rdz^2 == 1
        const abDotD = aby * rdy + abz * rdz;
        const oaDotD = oay * rdy + oaz * rdz;
        const oaDotAb = oax * abx + oay * aby + oaz * abz;
        const denom = Math.max(1e-4, abLenSq * dDotD - abDotD * abDotD);
        const sCenter = clamp((oaDotAb * dDotD - oaDotD * abDotD) / denom, 0, 1);

        // Intersect ray with sphere at clamped sCenter, then refine s once for cone slope!
        for (let pass = 0; pass < 2; pass++) {
          const s = pass === 0 ? sCenter : clamp(sCenter, 0, 1);
          const cx = ax + abx * s;
          const cy = ay + aby * s;
          const cz = za + abz * s;
          const rad = rA + (rB - rA) * s;
          const vx = sx - cx;
          const vy = py0 - cy;
          const vz = -cz;
          const b = 2 * (vy * rdy + vz * rdz);
          const c = vx * vx + vy * vy + vz * vz - rad * rad;
          const disc = b * b - 4 * c;
          if (disc < 0) {
            hit = false;
            break;
          }
          const t = (-b - Math.sqrt(disc)) * 0.5;
          const hx = sx;
          const hy = py0 + t * rdy;
          const hz = t * rdz;
          if (pass === 0) {
            // Update s on actual segment at hit point
            const sNew = clamp(((hx - ax) * abx + (hy - ay) * aby + (hz - za) * abz) * invAbLenSq, 0, 1);
            const nxC = ax + abx * sNew;
            const nyC = ay + aby * sNew;
            const nzC = za + abz * sNew;
            const rad2 = rA + (rB - rA) * sNew;
            const vx2 = sx - nxC;
            const vy2 = py0 - nyC;
            const vz2 = -nzC;
            const b2 = 2 * (vy2 * rdy + vz2 * rdz);
            const c2 = vx2 * vx2 + vy2 * vy2 + vz2 * vz2 - rad2 * rad2;
            const d2 = b2 * b2 - 4 * c2;
            if (d2 >= 0) {
              bestT = (-b2 - Math.sqrt(d2)) * 0.5;
              const hx2 = sx;
              const hy2 = py0 + bestT * rdy;
              const hz2 = bestT * rdz;
              bestNx = hx2 - nxC;
              bestNy = hy2 - nyC;
              bestNz = this.mirrorZ ? -(hz2 - nzC) : (hz2 - nzC);
              hit = true;
            }
            break;
          }
        }
        if (!hit || bestT >= this.depth[idx]) continue;

        const hy = py0 + bestT * rdy;
        const hz = bestT * rdz;
        const worldHitZ = this.mirrorZ ? -hz / 0.86 : hz;
        let nVal = 0;
        if (furAmt > 0) {
          nVal = hash3(sx * 0.75, hy * 0.75, worldHitZ * 0.75);
          bestNx += (nVal - 0.5) * furAmt;
          bestNy += (hash3(hy, worldHitZ, sx) - 0.5) * furAmt;
        }
        this._writePixel(idx, bestT, sx, hy, worldHitZ, bestNx, bestNy, bestNz, mat, nVal);
      }
    }
  }

  /**
   * 3D Oriented Rectangular Box / Slab (chest cuirass, cape plate, bridge span, fortress masonry wing, blade, shield).
   */
  addBox(cx, cy, cz, hx, hy, hz, mat, yaw = 0) {
    if (hx <= 0.05 || hy <= 0.05 || hz <= 0.05) return;
    const boundXY = Math.hypot(hx, hy);
    const [ix0, ix1, iy0, iy1] = this._projRect(
      cx - boundXY, cx + boundXY,
      cy - boundXY, cy + boundXY,
      cz - hz, cz + hz
    );
    const zc = this._mz(cz);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const rdx = 0;
    const rdy = RAY_DY;
    const rdz = RAY_DZ;

    const ldx = rdy * sinY;
    const ldy = rdy * cosY;
    const ldz = rdz;
    const invX = Math.abs(ldx) > 1e-6 ? 1 / ldx : 1e9;
    const invY = Math.abs(ldy) > 1e-6 ? 1 / ldy : 1e9;
    const invZ = Math.abs(ldz) > 1e-6 ? 1 / ldz : 1e9;

    for (let row = iy0; row <= iy1; row++) {
      const sy = this.originY + (row + 0.5) * this.stepY;
      const py0 = sy / TILT_Y;
      const rowOff = row * this.cols;
      for (let col = ix0; col <= ix1; col++) {
        const idx = rowOff + col;
        const sx = this.originX + (col + 0.5) * this.stepX;
        const ox = sx - cx;
        const oy = py0 - cy;
        const oz = -zc;

        const lox = ox * cosY + oy * sinY;
        const loy = -ox * sinY + oy * cosY;

        let tx1 = (-hx - lox) * invX;
        let tx2 = (hx - lox) * invX;
        let axis = 0;
        let sign = -1;
        if (tx1 > tx2) {
          const tmp = tx1; tx1 = tx2; tx2 = tmp;
          sign = 1;
        }
        let tNear = tx1;
        let tFar = tx2;

        let ty1 = (-hy - loy) * invY;
        let ty2 = (hy - loy) * invY;
        let sygn = -1;
        if (ty1 > ty2) {
          const tmp = ty1; ty1 = ty2; ty2 = tmp;
          sygn = 1;
        }
        if (ty1 > tNear) { tNear = ty1; axis = 1; sign = sygn; }
        if (ty2 < tFar) tFar = ty2;
        if (tNear > tFar) continue;

        let tz1 = (-hz - oz) * invZ;
        let tz2 = (hz - oz) * invZ;
        let szgn = -1;
        if (tz1 > tz2) {
          const tmp = tz1; tz1 = tz2; tz2 = tmp;
          szgn = 1;
        }
        if (tz1 > tNear) { tNear = tz1; axis = 2; sign = szgn; }
        if (tz2 < tFar) tFar = tz2;
        if (tNear > tFar) continue;
        if (tNear >= this.depth[idx]) continue;

        let lnx = axis === 0 ? sign : 0;
        let lny = axis === 1 ? sign : 0;
        let lnz = axis === 2 ? sign : 0;
        const wnx = lnx * cosY - lny * sinY;
        const wny = lnx * sinY + lny * cosY;
        const wnz = this.mirrorZ ? -lnz : lnz;

        const hyHit = py0 + tNear * rdy;
        const hzHit = tNear * rdz;
        const worldHitZ = this.mirrorZ ? -hzHit / 0.86 : hzHit;
        this._writePixel(idx, tNear, sx, hyHit, worldHitZ, wnx, wny, wnz, mat);
      }
    }
  }

  /**
   * 3D Vertical Stone Cylinder / Hollow Watchtower Ring (`rOuter`, `rInner >= 0`, `zBot..zTop`)
   * with optional crenellated battlement notches around the crown + arrow slits + spiral texture!
   */
  addCylinderRing(cx, cy, zBot, zTop, rOuter, rInner, mat, opts = {}) {
    const [ix0, ix1, iy0, iy1] = this._projRect(
      cx - rOuter, cx + rOuter,
      cy - rOuter, cy + rOuter,
      zBot, zTop
    );
    const z0m = this._mz(zBot);
    const z1m = this._mz(zTop);
    const zLo = Math.min(z0m, z1m);
    const zHi = Math.max(z0m, z1m);

    const rdy = RAY_DY;
    const rdz = RAY_DZ;
    const A = rdy * rdy;
    const inv2A = 1 / (2 * A);
    const rOut2 = rOuter * rOuter;
    const rIn2 = rInner * rInner;
    const crenelCount = opts.crenels || 0;
    const archGapAngle = opts.archGapAngle ?? null;
    const archGapWidth = opts.archGapWidth ?? 0.35;
    const archMaxZ = opts.archMaxZ ?? (zBot + (zTop - zBot) * 0.55);

    for (let row = iy0; row <= iy1; row++) {
      const sy = this.originY + (row + 0.5) * this.stepY;
      const py0 = sy / TILT_Y;
      const rowOff = row * this.cols;
      for (let col = ix0; col <= ix1; col++) {
        const idx = rowOff + col;
        const sx = this.originX + (col + 0.5) * this.stepX;
        const ox = sx - cx;
        const oy = py0 - cy;

        let bestT = this.depth[idx];
        let hitData = null;

        const testSurface = (t, nx, ny, nz, hitZ) => {
          if (t >= bestT) return;
          const worldZ = this.mirrorZ ? -hitZ / 0.86 : hitZ;
          const ang = Math.atan2(oy + t * rdy, ox);
          // Crenellation cutouts near top lip
          if (crenelCount > 0 && worldZ > zTop - (opts.crenelH || 6)) {
            const phase = ((ang + Math.PI) / (Math.PI * 2)) * crenelCount;
            if (phase - Math.floor(phase) > 0.55) return;
          }
          // Walkable archway tunnel cutout
          if (archGapAngle !== null && worldZ < archMaxZ) {
            let da = Math.abs(ang - archGapAngle);
            if (da > Math.PI) da = Math.PI * 2 - da;
            if (da < archGapWidth) return;
          }
          bestT = t;
          hitData = [t, sx, py0 + t * rdy, worldZ, nx, ny, nz];
        };

        // 1. Top annular horizontal cap (`z = zTop`)
        const zCap = this.mirrorZ ? zLo : zHi;
        const tCap = zCap / rdz;
        const hyC = py0 + tCap * rdy;
        const dxC = sx - cx;
        const dyC = hyC - cy;
        const rad2C = dxC * dxC + dyC * dyC;
        if (rad2C <= rOut2 && rad2C >= rIn2) {
          testSurface(tCap, 0, 0, this.mirrorZ ? -1 : 1, zCap);
        }

        // 2. Outer cylindrical wall (front facing hit)
        const B = 2 * oy * rdy;
        const C = ox * ox + oy * oy - rOut2;
        const disc = B * B - 4 * A * C;
        if (disc >= 0) {
          const tO = (-B - Math.sqrt(disc)) * inv2A;
          const hzO = tO * rdz;
          if (hzO >= zLo && hzO <= zHi) {
            const dyO = oy + tO * rdy;
            testSurface(tO, ox / rOuter, dyO / rOuter, 0, hzO);
          }
        }

        // 3. Inner hollow wall (back hit facing inward toward center!)
        if (rInner > 0.5) {
          const Ci = ox * ox + oy * oy - rIn2;
          const discI = B * B - 4 * A * Ci;
          if (discI >= 0) {
            const tI = (-B + Math.sqrt(discI)) * inv2A;
            const hzI = tI * rdz;
            if (hzI >= zLo && hzI <= zHi) {
              const dyI = oy + tI * rdy;
              testSurface(tI, -ox / rInner, -dyI / rInner, 0, hzI);
            }
          }
        }

        if (hitData) {
          this._writePixel(idx, hitData[0], hitData[1], hitData[2], hitData[3], hitData[4], hitData[5], hitData[6], mat);
        }
      }
    }
  }

  /**
   * 3D Double-Sided Triangle (used for Dragon Wings, Capes & Tapered Ears/Spikes!).
   */
  addTri(ax, ay, az, bx, by, bz, cx, cy, cz, mat) {
    const [ix0, ix1, iy0, iy1] = this._projRect(
      Math.min(ax, bx, cx), Math.max(ax, bx, cx),
      Math.min(ay, by, cy), Math.max(ay, by, cy),
      Math.min(az, bz, cz), Math.max(az, bz, cz),
      1
    );
    const za = this._mz(az);
    const zb = this._mz(bz);
    const zc = this._mz(cz);
    const rdy = RAY_DY;
    const rdz = RAY_DZ;

    const e1x = bx - ax, e1y = by - ay, e1z = zb - za;
    const e2x = cx - ax, e2y = cy - ay, e2z = zc - za;

    // Cross product for geometric normal
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    if (ny * (-rdy) + nz * (-rdz) < 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }
    if (this.mirrorZ) nz = -nz;

    const px = rdy * e2z - rdz * e2y;
    const py = rdz * e2x;
    const pz = -rdy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-6) return;
    const invDet = 1 / det;

    for (let row = iy0; row <= iy1; row++) {
      const sy = this.originY + (row + 0.5) * this.stepY;
      const py0 = sy / TILT_Y;
      const rowOff = row * this.cols;
      for (let col = ix0; col <= ix1; col++) {
        const idx = rowOff + col;
        const sx = this.originX + (col + 0.5) * this.stepX;
        const tx = sx - ax;
        const ty = py0 - ay;
        const tz = -za;

        const u = (tx * px + ty * py + tz * pz) * invDet;
        if (u < -0.02 || u > 1.02) continue;

        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (rdy * qy + rdz * qz) * invDet;
        if (v < -0.02 || u + v > 1.02) continue;

        const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (t >= this.depth[idx]) continue;

        const hy = py0 + t * rdy;
        const hz = t * rdz;
        const worldHitZ = this.mirrorZ ? -hz / 0.86 : hz;
        this._writePixel(idx, t, sx, hy, worldHitZ, nx, ny, nz, mat);
      }
    }
  }

  /**
   * Project & shade all filled 3D Z-buffer cells into 100% pure ASCII characters
   * via `renderer.drawGlyph(...)`!
   */
  flushToAscii({
    renderer,
    toScreenX,
    toScreenY,
    anchorX = 0,
    anchorY = 0,
    anchorZ = 0,
    worldTiltY = 1.0,
    cellScreenSize = 4.2,
    alphaMult = 0.98,
    rimColor = null,
    lanternPos = null,
    mirrorClipCheck = null,
    elapsed = 0,
    glowMask = false,
    fogColor = null,
    fogAmt = 0,
    enableMultiSize = false
  }) {
    const cols = this.cols;
    const rows = this.rows;
    const isRefl = this.mirrorZ;
    const zLiftAnchor = anchorZ * LIFT_Z;
    const edgeThresh = Math.max(this.stepX, this.stepY) * 1.85;

    for (let py = 0; py < rows; py++) {
      const ly = this.originY + (py + 0.5) * this.stepY;
      const fadeRefl = isRefl ? clamp(1.04 - (py / rows) * 0.45, 0.3, 1.0) : 1.0;
      const waveScreenX = isRefl
        ? Math.sin(py * 0.44 + elapsed * 4.4 + anchorY * 0.05) * (1.5 + (py / rows) * 2.0)
        : 0;
      const rowOff = py * cols;

      for (let px = 0; px < cols; px++) {
        const idx = rowOff + px;
        const tHit = this.depth[idx];
        if (tHit > 1e8) continue;

        const lxLocal = this.originX + (px + 0.5) * this.stepX;
        const worldHitX = anchorX + this.wx[idx];
        const worldHitY = anchorY + this.wy[idx];
        const worldHitZ = anchorZ + this.wz[idx];

        if (mirrorClipCheck) {
          if (!mirrorClipCheck(anchorX + lxLocal, anchorY + ly)) continue;
        }

        const nx = this.nx[idx];
        const ny = this.ny[idx];
        const nz = this.nz[idx];

        // 1. Directional Half-Lambert Moonlight Wrap + Anisotropic Specular + Fresnel Rim
        const nDotRaw = nx * MOON_LX + ny * MOON_LY + nz * MOON_LZ;
        const nDotM = clamp(nDotRaw, 0, 1);
        const wrapM = clamp((nDotRaw + 0.38) / 1.38, 0, 1);
        const hemi = 0.5 + 0.5 * nz;
        const halfY = (MOON_LY + (-RAY_DY)) * 0.5;
        const halfZ = (MOON_LZ + (-RAY_DZ)) * 0.5;
        const halfLen = Math.hypot(MOON_LX * 0.5, halfY, halfZ) || 1;
        const nDotH = clamp((nx * (MOON_LX * 0.5) + ny * halfY + nz * halfZ) / halfLen, 0, 1);
        const matType = this.mat[idx];
        const specPow = matType === 2 ? 14 : matType === 6 ? 10 : 9;
        const spec = Math.pow(nDotH, specPow);
        const viewDot = clamp(ny * (-RAY_DY) + nz * (-RAY_DZ), 0, 1);
        const fresnel = Math.pow(1 - viewDot, 1.75);

        // 2. Dynamic World Warm Point Light (Campfires, Tower Brazier, Torch Lantern!)
        let warmLight = 0;
        if (lanternPos) {
          const lx = lanternPos.x - worldHitX;
          const lyVec = lanternPos.y - worldHitY;
          const lz = (lanternPos.z || 28) - worldHitZ;
          const dist2 = lx * lx + lyVec * lyVec + lz * lz;
          if (dist2 < 30625) {
            const dist = Math.sqrt(dist2) || 1;
            const att = 1 - dist / 175;
            const nDotP = clamp((nx * lx + ny * lyVec + nz * lz) / dist, 0, 1);
            warmLight = (0.28 + nDotP * 0.88) * att * att * 1.18;
          }
        }

        const r = this.ar[idx];
        const g = this.ag[idx];
        const b = this.ab[idx];
        const emissive = this.em[idx];

        // 3. 3D Silhouette, Depth Crease & Normal-Angle Seam Detection (reveals armor lames, ribs & jawlines!)
        const idxL = px > 0 ? idx - 1 : -1;
        const idxR = px < cols - 1 ? idx + 1 : -1;
        const idxU = py > 0 ? idx - cols : -1;
        const idxD = py < rows - 1 ? idx + cols : -1;
        const tL = idxL >= 0 ? this.depth[idxL] : 1e9;
        const tR = idxR >= 0 ? this.depth[idxR] : 1e9;
        const tU = idxU >= 0 ? this.depth[idxU] : 1e9;
        const tD = idxD >= 0 ? this.depth[idxD] : 1e9;
        const isSil = tL > 1e8 || tR > 1e8 || tU > 1e8 || tD > 1e8;
        const isDepthCrease =
          Math.abs(tHit - tL) > edgeThresh ||
          Math.abs(tHit - tR) > edgeThresh ||
          Math.abs(tHit - tU) > edgeThresh ||
          Math.abs(tHit - tD) > edgeThresh;
        let isNormalCrease = false;
        if (!isSil && !isDepthCrease && (matType === 2 || matType === 6 || matType === 7)) {
          const dotL = nx * this.nx[idxL] + ny * this.ny[idxL] + nz * this.nz[idxL];
          const dotR = nx * this.nx[idxR] + ny * this.ny[idxR] + nz * this.nz[idxR];
          const dotU = nx * this.nx[idxU] + ny * this.ny[idxU] + nz * this.nz[idxU];
          const dotD = nx * this.nx[idxD] + ny * this.ny[idxD] + nz * this.nz[idxD];
          if (dotL < 0.56 || dotR < 0.56 || dotU < 0.56 || dotD < 0.56) {
            isNormalCrease = true;
          }
        }
        const isCrease = isDepthCrease || isNormalCrease;

        // 4. Procedural 3D Material Detail (Clean Cohesive ASCII Symbols, NO noisy letter soup!)
        let stoneSeam = false;
        let lit = clamp(
          0.22 +
            hemi * 0.14 +
            wrapM * (matType === 2 ? 0.58 : 0.54) +
            nDotM * 0.14 +
            warmLight * 0.55 +
            fresnel * (matType === 2 ? 0.36 : 0.28) +
            spec * (matType === 2 ? 0.65 : matType === 6 ? 0.4 : 0.22) +
            emissive,
          0.24,
          1.0
        );

        if (matType === 2) {
          // Fluted Gothic Steel Plate: crisp metallic bands & seam contrast without ragged noise
          const fluteBand = Math.sin(worldHitZ * 0.72 + worldHitX * 0.22) * 0.05;
          lit = clamp(lit + fluteBand, 0.26, 1.0);
          if (isNormalCrease && emissive < 0.4) lit *= 0.82;
        } else if (matType === 3) {
          // 3D Stone / Staggered Brick Coursework
          const mortarZ = Math.abs((worldHitZ % 7) - 3.5) < 0.75;
          const mortarAng = Math.abs(((worldHitX + worldHitY + Math.floor(worldHitZ / 7) * 5) % 10) - 5) < 0.75;
          if (mortarZ || mortarAng) {
            stoneSeam = true;
            lit *= 0.72;
          }
        } else if (matType === 4) {
          // 3D Silky Horse Coat / Wolf Fur / Flowing Mane
          const hFur = this.noise[idx] || hash3(worldHitX * 0.6, worldHitY * 0.6, worldHitZ * 0.6);
          lit = clamp(lit * (0.84 + hFur * 0.32), 0.26, 1.0);
        } else if (matType === 5) {
          // 3D Foliage Leaf Clusters (Vivid emerald/autumn visibility, crisp lacy silhouette, NO white-peach bloom!)
          const hLeaf = hash3(Math.round(worldHitX * 0.65), Math.round(worldHitY * 0.65), Math.round(worldHitZ * 0.65));
          if (isSil && !isRefl && hLeaf < 0.24 && fresnel > 0.40) continue;
          lit = clamp(0.26 + Math.max(0, nz) * 0.36 + wrapM * 0.28 + hLeaf * 0.16, 0.24, 0.84);
        } else if (matType === 8) {
          // Organic Tree Bark / Timber
          const hBark = hash3(Math.round(worldHitX * 0.8), Math.round(worldHitY * 0.8), Math.round(worldHitZ * 0.35));
          lit = clamp(0.26 + wrapM * 0.42 + hBark * 0.22, 0.24, 0.80);
        } else if (matType === 6) {
          // Stark High-Contrast Bone / Ivory Skull / Horn
          lit = clamp(Math.pow(lit, 0.82) * 1.1, 0.28, 1.0);
          if (isNormalCrease) lit *= 0.8;
        } else if (matType === 7) {
          // Diamond Overlapping Wyrm / Dragon Scales
          const scPat = Math.sin(worldHitX * 1.35 + worldHitZ * 1.25) * Math.cos(worldHitY * 1.35 - worldHitZ * 1.15);
          lit = clamp(lit * (0.84 + (scPat * 0.5 + 0.5) * 0.32), 0.26, 1.0);
        }

        let ch;
        if (stoneSeam && lit < 0.75) {
          ch = Math.abs(worldHitZ % 7) < 1.8 ? '═' : '≡';
        } else if (isSil && !isRefl && matType !== 5 && matType !== 8 && lit > 0.28 && lit < 0.86) {
          const gx = (tR > 1e8 ? 1 : 0) - (tL > 1e8 ? 1 : 0);
          const gy = (tD > 1e8 ? 1 : 0) - (tU > 1e8 ? 1 : 0);
          if (Math.abs(gx) > Math.abs(gy)) ch = '║';
          else if (Math.abs(gy) > Math.abs(gx)) ch = lit > 0.58 ? '═' : '─'.replace('─', '-');
          else if (gx !== 0 && gy !== 0) ch = gx * gy > 0 ? '╱' : '╲';
          else ch = '◈';
        } else if (matType === 2 && spec > 0.52) {
          ch = spec > 0.82 ? '✦' : spec > 0.66 ? '◆' : '◈';
        } else if (matType === 2) {
          const plateRamp = '·:░≡+†◊╬◈#%@✦';
          const ci = Math.min(plateRamp.length - 1, Math.max(0, Math.floor(lit * plateRamp.length)));
          ch = plateRamp[ci];
        } else if (matType === 3) {
          const stoneRamp = '·,:░-≡=+▒▓#%@';
          const ci = Math.min(stoneRamp.length - 1, Math.max(0, Math.floor(lit * stoneRamp.length)));
          ch = stoneRamp[ci];
        } else if (matType === 5) {
          const leafRamp = '.,\';:^*+&%♣';
          const ci = Math.min(leafRamp.length - 1, Math.max(0, Math.floor(lit * leafRamp.length)));
          ch = leafRamp[ci];
        } else if (matType === 8) {
          const barkRamp = '|!/:;#%▓';
          const ci = Math.min(barkRamp.length - 1, Math.max(0, Math.floor(lit * barkRamp.length)));
          ch = barkRamp[ci];
        } else if (matType === 4) {
          const furRamp = '·:;∼≈+*ψ▒%▓@';
          const ci = Math.min(furRamp.length - 1, Math.max(0, Math.floor(lit * furRamp.length)));
          ch = furRamp[ci];
        } else if (matType === 6) {
          const boneRamp = '·:░≡+*◊#%@◆';
          const ci = Math.min(boneRamp.length - 1, Math.max(0, Math.floor(lit * boneRamp.length)));
          ch = boneRamp[ci];
        } else if (matType === 7) {
          const scaleRamp = '·:^≈◊+*◈%◆@';
          const ci = Math.min(scaleRamp.length - 1, Math.max(0, Math.floor(lit * scaleRamp.length)));
          ch = scaleRamp[ci];
        } else {
          const clothRamp = '·:;∼≈░=+§¤▒*#%@';
          const ci = Math.min(clothRamp.length - 1, Math.max(0, Math.floor(lit * clothRamp.length)));
          ch = clothRamp[ci];
        }

        const effSpec = matType === 5 || matType === 8 ? 0 : matType === 4 ? spec * 0.35 : spec;
        const shadeBoost = isRefl
          ? 0.58
          : matType === 5 || matType === 8
            ? 0.68 + lit * 0.78
            : matType === 4
              ? 0.44 + lit * 0.70
              : matType === 2
                ? 0.44 + lit * 1.04
                : 0.48 + lit * 0.92;
        const silRim = isSil && !isRefl && matType !== 5 && matType !== 8 ? (rimColor ? 0.4 : 0.28) : 0;
        let rOut = r * shadeBoost + warmLight * (matType === 5 ? 0.24 : 0.48) + (rimColor ? rimColor[0] * silRim : silRim * 0.85) + effSpec * 0.42;
        let gOut = g * shadeBoost + warmLight * (matType === 5 ? 0.14 : 0.24) + (rimColor ? rimColor[1] * silRim : silRim * 0.92) + effSpec * 0.44;
        let bOut = b * (shadeBoost + (isRefl ? 0.12 : 0)) - warmLight * 0.06 + (rimColor ? rimColor[2] * silRim : silRim) + effSpec * 0.48;

        if (emissive > 0.45) {
          rOut = Math.max(rOut, r * (0.85 + emissive * 0.45));
          gOut = Math.max(gOut, g * (0.85 + emissive * 0.45));
          bOut = Math.max(bOut, b * (0.85 + emissive * 0.45));
        }

        if (fogAmt > 0 && fogColor) {
          rOut = lerp(rOut, fogColor[0], fogAmt);
          gOut = lerp(gOut, fogColor[1], fogAmt);
          bOut = lerp(bOut, fogColor[2], fogAmt);
        }

        let drawSize = cellScreenSize;
        if (enableMultiSize && !isRefl) {
          const hSize = hash3(Math.round(worldHitX * 0.7), Math.round(worldHitY * 0.7), Math.round(worldHitZ * 0.7));
          let sMult = (this.sz[idx] || 1.0) * lerp(0.84, 1.18, hSize);
          if (isSil || isNormalCrease) sMult *= 0.74;
          else if (matType === 5) sMult *= lit > 0.54 ? 1.16 : 0.86;
          else if (emissive > 0.45 || spec > 0.48) sMult *= 1.32 + Math.sin(elapsed * 6.5 + worldHitZ * 0.3) * 0.08;
          else if (matType === 2 || matType === 4 || matType === 1) sMult *= lit > 0.58 ? 1.18 : lit < 0.36 ? 0.80 : 0.98;
          else if (lit > 0.56) sMult *= 1.14;
          else if (lit < 0.36) sMult *= 0.82;
          drawSize *= clamp(sMult, 0.62, 1.62);
        }

        const sxScreen = toScreenX(anchorX + lxLocal) + waveScreenX;
        const syScreen = toScreenY(
          anchorY + (ly - (worldTiltY === 1.0 ? zLiftAnchor : 0)) / worldTiltY,
          worldTiltY === 1.0 ? 0 : anchorZ
        );

        renderer.drawGlyph(
          sxScreen,
          syScreen,
          drawSize,
          ch,
          clamp(rOut, 0, 1),
          clamp(gOut, 0, 1),
          clamp(bOut, 0, 1),
          alphaMult * fadeRefl,
          glowMask || emissive > 0.65
        );
      }
    }
  }

  /**
   * Bake non-empty Z-buffer cells of a static 3D prop (boulder, fortress gate, bridge, pillar)
   * so subsequent frames skip 100% of ray-geometry intersection & neighbor edge detection.
   */
  bakeStaticCells(anchorX = 0, anchorY = 0, anchorZ = 0) {
    const cols = this.cols;
    const rows = this.rows;
    const isRefl = this.mirrorZ;
    const edgeThresh = Math.max(this.stepX, this.stepY) * 1.85;
    const cells = [];

    for (let py = 0; py < rows; py++) {
      const ly = this.originY + (py + 0.5) * this.stepY;
      const rowOff = py * cols;
      for (let px = 0; px < cols; px++) {
        const idx = rowOff + px;
        const tHit = this.depth[idx];
        if (tHit > 1e8) continue;

        const lxLocal = this.originX + (px + 0.5) * this.stepX;
        const worldHitX = anchorX + this.wx[idx];
        const worldHitY = anchorY + this.wy[idx];
        const worldHitZ = anchorZ + this.wz[idx];
        const nx = this.nx[idx];
        const ny = this.ny[idx];
        const nz = this.nz[idx];

        const wrapM = clamp((nx * MOON_LX + ny * MOON_LY + nz * MOON_LZ + 0.38) / 1.38, 0, 1);
        const hemi = 0.5 + 0.5 * nz;
        const halfY = (MOON_LY + (-RAY_DY)) * 0.5;
        const halfZ = (MOON_LZ + (-RAY_DZ)) * 0.5;
        const halfLen = Math.hypot(MOON_LX * 0.5, halfY, halfZ) || 1;
        const spec = Math.pow(clamp((nx * (MOON_LX * 0.5) + ny * halfY + nz * halfZ) / halfLen, 0, 1), 10);
        const viewDot = clamp(ny * (-RAY_DY) + nz * (-RAY_DZ), 0, 1);
        const fresnel = Math.pow(1 - viewDot, 1.75);

        const matType = this.mat[idx];
        const emissive = this.em[idx];
        let stoneSeam = false;
        let lit = clamp(0.24 + hemi * 0.14 + wrapM * 0.56 + fresnel * 0.28 + spec * (matType === 2 ? 0.55 : 0.24) + emissive, 0.24, 1.0);
        if (matType === 3) {
          const mortarZ = Math.abs((worldHitZ % 7) - 3.5) < 0.75;
          const mortarAng = Math.abs(((worldHitX + worldHitY + Math.floor(worldHitZ / 7) * 5) % 10) - 5) < 0.75;
          if (mortarZ || mortarAng) {
            stoneSeam = true;
            lit *= 0.72;
          }
        } else if (matType === 5) {
          const hLeaf = hash3(Math.round(worldHitX * 0.65), Math.round(worldHitY * 0.65), Math.round(worldHitZ * 0.65));
          lit = clamp(0.22 + Math.max(0, nz) * 0.34 + wrapM * 0.26 + hLeaf * 0.18, 0.18, 0.78);
        } else if (matType === 8) {
          const hBark = hash3(Math.round(worldHitX * 0.8), Math.round(worldHitY * 0.8), Math.round(worldHitZ * 0.35));
          lit = clamp(0.22 + wrapM * 0.38 + hBark * 0.22, 0.2, 0.74);
        }

        const tL = px > 0 ? this.depth[idx - 1] : 1e9;
        const tR = px < cols - 1 ? this.depth[idx + 1] : 1e9;
        const tU = py > 0 ? this.depth[idx - cols] : 1e9;
        const tD = py < rows - 1 ? this.depth[idx + cols] : 1e9;
        const isSil = tL > 1e8 || tR > 1e8 || tU > 1e8 || tD > 1e8;

        if (matType === 5 && isSil && !isRefl && fresnel > 0.36) {
          const hEdge = hash3(Math.round(worldHitX * 0.65), Math.round(worldHitY * 0.65), Math.round(worldHitZ * 0.65));
          if (hEdge < 0.34) continue;
        }

        let ch;
        if (stoneSeam && lit < 0.75) {
          ch = Math.abs(worldHitZ % 7) < 1.8 ? '═' : '≡';
        } else if (isSil && !isRefl && matType !== 5 && matType !== 8 && lit > 0.28 && lit < 0.84) {
          const gx = (tR > 1e8 ? 1 : 0) - (tL > 1e8 ? 1 : 0);
          const gy = (tD > 1e8 ? 1 : 0) - (tU > 1e8 ? 1 : 0);
          if (Math.abs(gx) > Math.abs(gy)) ch = '║';
          else if (Math.abs(gy) > Math.abs(gx)) ch = lit > 0.58 ? '═' : '-';
          else if (gx !== 0 && gy !== 0) ch = gx * gy > 0 ? '╱' : '╲';
          else ch = '◈';
        } else if (matType === 5) {
          const leafRamp = '.,\';:^*+&%♣';
          const ci = Math.min(leafRamp.length - 1, Math.max(0, Math.floor(lit * leafRamp.length)));
          ch = leafRamp[ci];
        } else if (matType === 8) {
          const barkRamp = '|!/:;#%▓';
          const ci = Math.min(barkRamp.length - 1, Math.max(0, Math.floor(lit * barkRamp.length)));
          ch = barkRamp[ci];
        } else if (matType === 3) {
          const stoneRamp = '·,:░-≡=+▒▓#%@';
          const ci = Math.min(stoneRamp.length - 1, Math.max(0, Math.floor(lit * stoneRamp.length)));
          ch = stoneRamp[ci];
        } else {
          const rampVal = clamp(Math.pow(lit, 0.82), 0.24, 0.999);
          const ci = Math.min(DENSITY_RAMP.length - 1, Math.max(3, Math.floor(rampVal * DENSITY_RAMP.length)));
          ch = DENSITY_RAMP[ci];
        }

        const r = this.ar[idx];
        const g = this.ag[idx];
        const b = this.ab[idx];
        const effSpec = matType === 5 || matType === 8 ? 0 : spec;
        const shadeBoost = isRefl ? 0.58 : (matType === 5 || matType === 8) ? 0.68 + lit * 0.78 : 0.52 + lit * 0.88;
        let baseR = r * shadeBoost + effSpec * 0.28;
        let baseG = g * shadeBoost + effSpec * 0.3;
        let baseB = b * (shadeBoost + (isRefl ? 0.12 : 0)) + effSpec * 0.34;
        if (emissive > 0.45) {
          baseR = Math.max(baseR, r * (0.85 + emissive * 0.45));
          baseG = Math.max(baseG, g * (0.85 + emissive * 0.45));
          baseB = Math.max(baseB, b * (0.85 + emissive * 0.45));
        }

        const hSize = hash3(Math.round(worldHitX * 0.7), Math.round(worldHitY * 0.7), Math.round(worldHitZ * 0.7));
        const multiS = lerp(0.84, 1.18, hSize) * (isSil ? 0.84 : emissive > 0.5 ? 1.28 : lit > 0.60 ? 1.14 : 0.90);

        cells.push({
          py,
          lxLocal,
          ly,
          wx: worldHitX,
          wy: worldHitY,
          wz: worldHitZ,
          nx,
          ny,
          nz,
          ch,
          r: baseR,
          g: baseG,
          b: baseB,
          isSil,
          sMult: multiS,
          glow: emissive > 0.65
        });
      }
    }
    return { rows, isRefl, cells };
  }
}

export function flushBakedStaticCells(
  baked,
  {
    renderer,
    toScreenX,
    toScreenY,
    anchorX = 0,
    anchorY = 0,
    anchorZ = 0,
    worldTiltY = 1.0,
    cellScreenSize = 4.2,
    alphaMult = 0.96,
    rimColor = null,
    lanternPos = null,
    mirrorClipCheck = null,
    elapsed = 0
  }
) {
  const { rows, isRefl, cells } = baked;
  const zLiftAnchor = anchorZ * LIFT_Z;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (mirrorClipCheck && !mirrorClipCheck(anchorX + c.lxLocal, anchorY + c.ly)) continue;

    let warmLight = 0;
    if (lanternPos) {
      const lx = lanternPos.x - c.wx;
      const lyVec = lanternPos.y - c.wy;
      const lz = (lanternPos.z || 28) - c.wz;
      const dist2 = lx * lx + lyVec * lyVec + lz * lz;
      if (dist2 < 30625) {
        const dist = Math.sqrt(dist2) || 1;
        const att = 1 - dist / 175;
        const nDotP = clamp((c.nx * lx + c.ny * lyVec + c.nz * lz) / dist, 0, 1);
        warmLight = (0.28 + nDotP * 0.85) * att * att * 1.15;
      }
    }

    const fadeRefl = isRefl ? clamp(1.04 - (c.py / rows) * 0.45, 0.3, 1.0) : 1.0;
    const waveScreenX = isRefl
      ? Math.sin(c.py * 0.44 + elapsed * 4.4 + anchorY * 0.05) * (1.5 + (c.py / rows) * 2.0)
      : 0;

    const rOut = c.r + warmLight * 0.46 + (c.isSil && rimColor && !isRefl ? rimColor[0] * 0.28 : 0);
    const gOut = c.g + warmLight * 0.22 + (c.isSil && rimColor && !isRefl ? rimColor[1] * 0.28 : 0);
    const bOut = c.b - warmLight * 0.08 + (c.isSil && rimColor && !isRefl ? rimColor[2] * 0.28 : 0);

    renderer.drawGlyph(
      toScreenX(anchorX + c.lxLocal) + waveScreenX,
      toScreenY(
        anchorY + (c.ly - (worldTiltY === 1.0 ? zLiftAnchor : 0)) / worldTiltY,
        worldTiltY === 1.0 ? 0 : anchorZ
      ),
      cellScreenSize * (c.sMult || 1.0),
      c.ch,
      clamp(rOut, 0, 1),
      clamp(gOut, 0, 1),
      clamp(bOut, 0, 1),
      alphaMult * fadeRefl,
      c.glow
    );
  }
}
