import { Ascii3DBuffer, flushBakedStaticCells, clamp, lerp } from '../engine/Ascii3DRasterizer.js';
import { matRgb } from '../entities/Ascii3DModels.js';

const propBuf = new Ascii3DBuffer(64, 64, 120, 120, false);
const staticPropCache = new Map();

export function emitPureAscii3DProp({
  renderer,
  toScreenX,
  toScreenY,
  worldX,
  worldY,
  worldZ = 0,
  worldTiltY = 1.0,
  cols = 32,
  rows = 32,
  worldSpanX = 96,
  worldSpanY = 96,
  cellScreenSize = 4.2,
  alphaMult = 0.96,
  isReflection = false,
  mirrorClipCheck = null,
  rimColor = null,
  lanternPos = null,
  elapsed = 0,
  cacheKey = null,
  fogColor = null,
  fogAmt = 0,
  buildProp
}) {
  if (cacheKey) {
    let baked = staticPropCache.get(cacheKey);
    if (!baked) {
      if (staticPropCache.size > 600) staticPropCache.clear();
      propBuf.resize(cols, rows, worldSpanX, worldSpanY, isReflection);
      buildProp(propBuf);
      baked = propBuf.bakeStaticCells(worldX, worldY, worldZ);
      staticPropCache.set(cacheKey, baked);
    }
    flushBakedStaticCells(baked, {
      renderer,
      toScreenX,
      toScreenY,
      anchorX: worldX,
      anchorY: worldY,
      anchorZ: worldZ,
      worldTiltY,
      cellScreenSize,
      alphaMult,
      rimColor,
      lanternPos,
      mirrorClipCheck,
      elapsed
    });
    return;
  }

  propBuf.resize(cols, rows, worldSpanX, worldSpanY, isReflection);
  buildProp(propBuf);
  propBuf.flushToAscii({
    renderer,
    toScreenX,
    toScreenY,
    anchorX: worldX,
    anchorY: worldY,
    anchorZ: worldZ,
    worldTiltY,
    cellScreenSize,
    alphaMult,
    rimColor,
    lanternPos,
    mirrorClipCheck,
    elapsed,
    fogColor,
    fogAmt
  });
}

/**
 * 1. Spiral Mossy Watchtower High Ground (Download(3).mp4!)
 * Real 3D concentric hollow masonry ring + spiral ascending stairs + crenellated parapet + ivy + summit brazier!
 */
export function buildWatchtower3D(buf, elapsed) {
  const stoneOuter = matRgb(0.58, 0.63, 0.7, 3);
  const stoneInner = matRgb(0.46, 0.52, 0.58, 3);
  const stairStone = matRgb(0.68, 0.72, 0.78, 3);
  const moss = matRgb(0.26, 0.64, 0.24, 5);
  const fire = matRgb(1.0, 0.64, 0.18, 2, 0.95);

  // Outer cylindrical bastioned shell with open archway at South-West ground ramp (angle ~ 1.75)
  buf.addCylinderRing(0, 0, 0, 23, 69, 54, stoneOuter, {
    crenels: 14,
    crenelH: 5,
    archGapAngle: 1.75,
    archGapWidth: 0.45,
    archMaxZ: 18
  });

  // Spiral Ascending 3D Stone Staircase Steps circling clockwise around outer/inner drum!
  for (let s = 0; s < 14; s++) {
    const t = s / 13;
    const ang = 1.8 + t * Math.PI * 1.62;
    const rStep = lerp(52, 43, t);
    const sx = Math.cos(ang) * rStep;
    const sy = Math.sin(ang) * rStep;
    const sz = lerp(1.5, 26.5, t);
    buf.addBox(sx, sy, sz * 0.5, 7.5, 5.2, sz * 0.5 + 1.2, stairStone, ang);
    if (s % 4 === 1) {
      buf.addEllipsoid(sx + Math.cos(ang) * 5, sy + Math.sin(ang) * 5, sz + 2.5, 4.5, 4.5, 3.0, moss);
    }
  }

  // Central Elevated Keep Terrace (walkable Z = 28!) + Crenellated Summit Parapet
  buf.addCylinderRing(0, 0, 0, 28, 38, 0, stoneInner);
  buf.addCylinderRing(0, 0, 28, 35, 40, 34, stoneOuter, { crenels: 10, crenelH: 4 });

  // Creeping 3D Ivy & Moss Clusters over ancient weathered stone
  const mossSpots = [
    [-58, 22, 16, 8, 7, 5],
    [-40, 48, 12, 9, 6, 4],
    [48, 36, 18, 7, 8, 5],
    [-22, 34, 29, 7, 6, 3.5],
    [26, -24, 30, 6, 7, 3.5]
  ];
  for (const [mx, my, mz, rx, ry, rz] of mossSpots) {
    buf.addEllipsoid(mx, my, mz, rx, ry, rz, moss);
  }

  // Summit Brazier Stand + Flickering Fire Core (Z = 28..35)
  buf.addCylinderRing(0, 0, 28, 31.5, 5.2, 3.2, matRgb(0.28, 0.28, 0.32, 3));
  buf.addEllipsoid(0, 0, 32.5 + Math.sin(elapsed * 8) * 0.6, 3.8, 3.8, 3.6, fire);
}

/**
 * 2. Ruined Brick Fortress Gate Archway Overtaken by Vines (Download(4).mp4!)
 */
export function buildFortressGate3D(buf) {
  const brickMain = matRgb(0.54, 0.6, 0.68, 3);
  const brickDark = matRgb(0.38, 0.42, 0.5, 3);
  const vineMoss = matRgb(0.22, 0.58, 0.22, 5);

  // Flanking Curtain Walls & Protruding Square Flanking Bastion Towers
  buf.addBox(-56, 0, 21, 34, 11, 21, brickMain, 0);
  buf.addBox(56, 0, 21, 34, 11, 21, brickMain, 0);
  buf.addBox(-84, 3, 25, 13, 15, 25, brickDark, 0);
  buf.addBox(84, 3, 25, 13, 15, 25, brickDark, 0);

  // Central Vaulted Arch Lintel above open walkway (Z = 24..46, open below Z = 24!)
  buf.addBox(0, 0, 36, 26, 12, 10, brickMain, 0);
  // Arched Voussoir Haunches curving inward cleanly around gateway opening
  buf.addBox(-19, 0, 21, 5.5, 11.5, 6, brickDark, 0.25);
  buf.addBox(19, 0, 21, 5.5, 11.5, 6, brickDark, -0.25);

  // Jagged Crumbling Merlon Battlements along roof crown
  for (let mx = -84; mx <= 84; mx += 16) {
    if (Math.abs(mx) === 12) continue;
    const hMerlon = Math.abs(mx) > 65 ? 5.5 : 4.2;
    buf.addBox(mx, 0, 44 + hMerlon, 5.2, 9.0, hMerlon, brickMain, 0);
  }

  // Overgrown Climbing 3D Ivy Vines draping over bricks & arch keystone
  const vines = [
    [-20, 8, 38, 10, 5, 8],
    [-16, 10, 28, 7, 4, 6],
    [22, 8, 34, 9, 5, 7],
    [48, 9, 26, 11, 5, 9],
    [-58, 9, 24, 12, 5, 9],
    [6, 10, 41, 8, 4, 6]
  ];
  for (const [vx, vy, vz, rx, ry, rz] of vines) {
    buf.addEllipsoid(vx, vy, vz, rx, ry, rz, vineMoss);
  }
}

/**
 * 3. Semi-3D Woodland Oak, Pine & Crimson Autumn Trees!
 */
export function buildTree3D(buf, t, elapsed) {
  const sc = t.scale || 1.0;
  const sway = Math.sin(elapsed * 1.7 + t.x * 0.03) * 2.2 * sc;
  const barkDark = t.kind === 'autumn' ? matRgb(0.4, 0.2, 0.12, 1) : matRgb(0.32, 0.22, 0.14, 1);
  const barkLit = matRgb(0.46, 0.34, 0.24, 1);

  // 4 Gnarled Buttress Roots anchored at Z = 0
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    buf.addCapsule(0, 0, 6 * sc, Math.cos(a) * 10 * sc, Math.sin(a) * 9 * sc, 0.8, 3.2 * sc, 1.4 * sc, barkDark);
  }

  // Tapered Vertical Bark Trunk + Forked Upper Boughs
  buf.addCapsule(0, 0, 1, sway * 0.2, 0, 28 * sc, 4.8 * sc, 3.0 * sc, barkLit);
  buf.addCapsule(sway * 0.15, 0, 22 * sc, -11 * sc + sway * 0.4, 5 * sc, 34 * sc, 2.4 * sc, 1.2 * sc, barkDark);
  buf.addCapsule(sway * 0.15, 0, 23 * sc, 11 * sc + sway * 0.4, -4 * sc, 35 * sc, 2.4 * sc, 1.2 * sc, barkLit);

  if (t.kind === 'dead') {
    buf.addCapsule(0, 0, 25 * sc, -14 * sc, -8 * sc, 38 * sc, 1.8 * sc, 0.6 * sc, barkLit);
    buf.addCapsule(0, 0, 24 * sc, 15 * sc, 6 * sc, 37 * sc, 1.8 * sc, 0.6 * sc, barkLit);
    return;
  }

  if (t.kind === 'pine') {
    const pineLeaf = matRgb(0.18, 0.44, 0.26, 5);
    const pineTop = matRgb(0.3, 0.6, 0.38, 5);
    buf.addEllipsoid(sway * 0.3, 0, 24 * sc, 24 * sc, 22 * sc, 8.5 * sc, pineLeaf);
    buf.addEllipsoid(sway * 0.55, 0, 34 * sc, 18 * sc, 16.5 * sc, 8.0 * sc, pineLeaf);
    buf.addEllipsoid(sway * 0.8, 0, 44 * sc, 12 * sc, 11 * sc, 8.5 * sc, pineTop);
    buf.addEllipsoid(sway, 0, 52 * sc, 6.2 * sc, 6.0 * sc, 6.5 * sc, pineTop);
    return;
  }

  // Lush 3D Domed Woodland & Autumn Crown Lobes
  const isAut = t.kind === 'autumn';
  const leafDark = isAut ? matRgb(0.58, 0.16, 0.06, 5) : matRgb(0.14, 0.38, 0.2, 5);
  const leafMid = isAut ? matRgb(0.78, 0.28, 0.08, 5) : matRgb(0.24, 0.54, 0.28, 5);
  const leafTop = isAut ? matRgb(0.95, 0.46, 0.14, 5) : matRgb(0.38, 0.68, 0.38, 5);

  const lobes = [
    [-16, -6, 33, 18, 16, 12, leafDark],
    [16, 5, 34, 18, 16, 12, leafMid],
    [-4, 14, 33, 18, 15, 11.5, leafDark],
    [5, -14, 35, 17, 15, 11.5, leafMid],
    [0, 0, 43, 21, 19, 13.5, leafTop]
  ];
  for (const [lx, ly, lz, rx, ry, rz, m] of lobes) {
    buf.addEllipsoid(lx * sc + sway * 0.7, ly * sc, lz * sc, rx * sc, ry * sc, rz * sc, m);
  }
}

/**
 * 4. 3D Stratified Boulder / Cliff Formation + Sunlit Moss Cap!
 */
export function buildBoulder3D(buf, rx, ry, hasMoss, isAutumn) {
  const stoneMain = isAutumn ? matRgb(0.58, 0.22, 0.12, 3) : matRgb(0.42, 0.48, 0.56, 3);
  const stoneRim = isAutumn ? matRgb(0.72, 0.3, 0.16, 3) : matRgb(0.56, 0.62, 0.72, 3);
  const moss = matRgb(0.28, 0.62, 0.26, 5);
  const hZ = ry * 1.1;

  buf.addEllipsoid(0, 0, hZ * 0.45, rx * 0.92, ry * 0.88, hZ * 0.7, stoneMain);
  buf.addEllipsoid(rx * 0.24, -ry * 0.16, hZ * 0.72, rx * 0.58, ry * 0.54, hZ * 0.55, stoneRim);
  if (hasMoss) {
    buf.addEllipsoid(-rx * 0.14, -ry * 0.12, hZ * 0.98, rx * 0.52, ry * 0.48, hZ * 0.22, moss);
  }
}

/**
 * 5. Ancient Arched Stone River Bridge with Parapets & 4 Glowing Corner Lanterns!
 */
export function buildBridge3D(buf) {
  const deckStone = matRgb(0.48, 0.52, 0.58, 3);
  const railStone = matRgb(0.68, 0.72, 0.78, 3);
  const ember = matRgb(1.0, 0.76, 0.24, 2, 0.95);

  for (let i = -4; i <= 4; i++) {
    const bx = i * 10;
    const archZ = Math.max(0, Math.cos((bx / 48) * Math.PI * 0.5)) * 10;
    buf.addBox(bx, 0, archZ * 0.5 + 1.5, 6, 17, archZ * 0.5 + 2.0, deckStone, 0);
    buf.addBox(bx, -17, archZ + 6, 5.5, 2.2, 4.0, railStone, 0);
    buf.addBox(bx, 17, archZ + 6, 5.5, 2.2, 4.0, railStone, 0);
  }
  for (const ex of [-43, 43]) {
    for (const ey of [-18, 18]) {
      buf.addCylinderRing(ex, ey, 3, 14, 3.0, 0, railStone);
      buf.addEllipsoid(ex, ey, 16, 2.6, 2.6, 2.6, ember);
    }
  }
}

/**
 * 6. Ruined 3D Stone / Crypt Pillars & Bone Monoliths!
 */
export function buildPillar3D(buf, variant = 'bastion') {
  const stone = variant === 'crypt' ? matRgb(0.42, 0.38, 0.56, 3) : variant === 'wyrm' ? matRgb(0.62, 0.64, 0.7, 3) : matRgb(0.56, 0.64, 0.72, 3);
  const flame = variant === 'crypt' ? matRgb(0.45, 0.92, 0.85, 2, 0.95) : variant === 'wyrm' ? matRgb(1.0, 0.42, 0.18, 2, 0.95) : matRgb(1.0, 0.68, 0.2, 2, 0.95);
  buf.addCylinderRing(0, 0, 0, 6, 9, 0, stone);
  buf.addCylinderRing(0, 0, 6, 32, 5.8, 0, stone);
  buf.addCylinderRing(0, 0, 30, 35, 8.2, 0, stone);
  buf.addEllipsoid(0, 0, 38, 3.4, 3.4, 3.4, flame);
}

/**
 * 7. Destructible 3D Wooden Scaffolds, Supply Crates & Glowing Hanging Lanterns!
 */
export function buildDestructible3D(buf, d) {
  const wood = matRgb(0.6, 0.42, 0.22, 1);
  const iron = matRgb(0.48, 0.52, 0.58, 2);
  const fire = matRgb(1.0, 0.68, 0.2, 2, 0.95);
  if (d.kind === 'scaffold') {
    for (const sx of [-10, 10]) {
      for (const sy of [-6, 6]) {
        buf.addCapsule(sx, sy, 0, sx, sy, 24, 1.5, 1.3, wood);
      }
    }
    buf.addBox(0, 0, 23, 13, 8, 1.8, wood, 0);
    buf.addBox(0, 0, 11, 12, 7, 1.2, iron, 0);
  } else {
    buf.addBox(0, 0, 7.5, 8, 8, 7.5, wood, 0.15);
    buf.addBox(0, 0, 7.5, 8.3, 1.6, 7.8, iron, 0.15);
  }
  if (d.lantern) {
    buf.addEllipsoid(11, 2, 19, 3.2, 3.2, 3.5, fire);
  }
}

/**
 * 8. Shattered Pale Citadel Horizon Landmark (Far North Reachable Skyline!)
 */
export function buildCitadelHorizon3D(buf, elapsed) {
  const paleStone = matRgb(0.76, 0.82, 0.9, 3);
  const darkStone = matRgb(0.36, 0.4, 0.48, 3);
  const goldSpire = matRgb(0.95, 0.78, 0.34, 2, 0.25);
  const runeGlow = matRgb(0.5, 0.88, 1.0, 2, 0.88);

  // Twin flanking bastion spires + central shattered keep crown
  buf.addCylinderRing(-64, -12, 0, 74, 22, 14, darkStone, { crenels: 8, crenelH: 6 });
  buf.addCylinderRing(64, -12, 0, 74, 22, 14, darkStone, { crenels: 8, crenelH: 6 });
  buf.addCylinderRing(0, -18, 0, 102, 34, 22, paleStone, { crenels: 10, crenelH: 7, archGapAngle: 1.57, archGapWidth: 0.4, archMaxZ: 28 });

  // Broken spanning viaduct arches between towers
  buf.addBox(-38, -14, 46, 22, 7, 5, paleStone, 0);
  buf.addBox(38, -14, 46, 22, 7, 5, paleStone, 0);
  buf.addBox(0, -18, 92, 14, 14, 5, goldSpire, 0.78);

  // Floating Astral Crystal & Orbiting Runes above Shattered Crown
  const hover = Math.sin(elapsed * 2.2) * 3.5;
  buf.addEllipsoid(0, -18, 118 + hover, 7.5, 7.5, 11.5, runeGlow);
  for (let i = 0; i < 4; i++) {
    const a = elapsed * 1.4 + (i * Math.PI) / 2;
    buf.addBox(Math.cos(a) * 26, -18 + Math.sin(a) * 20, 114 + Math.sin(elapsed * 3 + i) * 3, 2.5, 2.5, 5.5, goldSpire, a);
  }
}

/**
 * 9. Far-East Crimson Obelisk Sanctum & Far-West Elderwood Horizon Ridge Spires!
 */
export function buildHorizonVistaTower3D(buf, variant = 'obelisk', elapsed = 0) {
  if (variant === 'obelisk') {
    const obsidian = matRgb(0.32, 0.22, 0.28, 3);
    const crimson = matRgb(0.85, 0.24, 0.16, 2, 0.72);
    buf.addBox(0, 0, 38, 13, 13, 38, obsidian, 0.2);
    buf.addBox(0, 0, 78, 8, 8, 12, crimson, 0.2);
    buf.addEllipsoid(0, 0, 96 + Math.sin(elapsed * 3) * 2.5, 5.5, 5.5, 7.5, matRgb(1.0, 0.62, 0.2, 2, 0.92));
  } else {
    const stone = matRgb(0.42, 0.5, 0.56, 3);
    const beacon = matRgb(0.65, 0.92, 1.0, 2, 0.9);
    buf.addCylinderRing(0, 0, 0, 68, 18, 10, stone, { crenels: 6, crenelH: 5 });
    buf.addEllipsoid(0, 0, 76, 6.2, 6.2, 6.2, beacon);
  }
}
