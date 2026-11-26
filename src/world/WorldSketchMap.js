/**
 * Daggerfall-Inspired Open World Region Sketch & Pure Procedural Math Geography (3200x3200).
 *
 * Strictly zero baked terrain images on the game screen:
 * every fjord coastline, winding silver river, arched stone bridge, cobblestone road,
 * mossy cliff canyon, shadow cast, and landmark elevation is computed purely in math
 * so `WorldEngine` draws 100% of the realm using living ASCII characters!
 */

export const WORLD_SIZE = 4400;
export const HALF_WORLD = WORLD_SIZE * 0.5;

export function createRng(seed) {
  let s = (seed >>> 0) || 1337;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  // C2 Quintic curve for silky-smooth terrain slopes & gradual hill climbs!
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - x1) * vx + (py - y1) * vy) / len2, 0, 1);
  const cx = x1 + vx * t;
  const cy = y1 + vy * t;
  return Math.hypot(px - cx, py - cy);
}

export class WorldSketchMap {
  constructor(seed = 842109) {
    this.seed = seed;
    const rng = createRng(seed);
    this.phaseX = rng() * 100;
    this.phaseY = rng() * 100;
    this.phaseB = rng() * 100;
    this.riverAmp = 42 + rng() * 44;
    this.riverFreq = 0.0072 + rng() * 0.0036;

    const jitterPt = (bx, by, rx, ry) => ({
      x: Math.round(bx + (rng() - 0.5) * 2 * rx),
      y: Math.round(by + (rng() - 0.5) * 2 * ry)
    });

    // Procedural Waterfall Glade & River Alignment per seed
    this.waterfallX = Math.round((rng() - 0.5) * 110);
    this.waterfallTopY = -360;
    this.waterfallBaseY = -170;
    this.plungePoolX = this.waterfallX;
    this.plungePoolY = -98;
    this.spawnPos = { x: this.waterfallX + Math.round((rng() - 0.5) * 36), y: -8 };

    // Autumn Mirror Lake (Procedurally shifted South-East / South-West Basin!)
    this.mirrorLakeX = Math.round(this.waterfallX + (rng() > 0.3 ? 130 + rng() * 90 : -150 - rng() * 80));
    this.mirrorLakeY = Math.round(545 + rng() * 85);

    // Stone Arched River Crossing Bridge placed directly over procedural river channel
    const brY = Math.round(150 + rng() * 65);
    this.bridgePos = { x: Math.round(this.getRiverCenterX(brY)), y: brY };

    // Procedurally scattered Regional Landmarks & Distant Reachable Horizons!
    const mirroredEastWest = rng() < 0.38 ? -1 : 1;
    this.towerPos = jitterPt(-290 * mirroredEastWest + this.waterfallX * 0.4, -305, 65, 45);
    this.darkwoodPos = jitterPt(-460 * mirroredEastWest, -45, 75, 80);
    this.spiderHollowPos = jitterPt(-740 * mirroredEastWest, -255, 95, 85);
    this.fortressGatePos = jitterPt(375 * mirroredEastWest, -205, 55, 40);
    this.bastionPos = jitterPt(720 * mirroredEastWest, -105, 95, 95);
    this.cryptPos = jitterPt(615 * mirroredEastWest, 280, 95, 90);
    this.highGroundPos = jitterPt(-565 * mirroredEastWest, 395, 95, 85);
    this.wyrmPeakPos = jitterPt(65 * mirroredEastWest, -875, 130, 80);
    this.harborPos = jitterPt(-760 * mirroredEastWest, 710, 110, 95);

    // Reachable Distant Horizon Regions (Procedurally seeded along Skyline!)
    this.citadelPos = jitterPt(45 * mirroredEastWest, -1560, 180, 85);
    this.obeliskPos = jitterPt(1560 * mirroredEastWest, 125, 110, 160);
    this.elderwoodPos = jitterPt(-1600 * mirroredEastWest, -150, 110, 150);

    // Seeded Procedural Rolling Hill Domes (creates gentle smooth climbs & valleys unique to each seed!)
    this.hillNodes = [];
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2;
      const d = 260 + rng() * 1450;
      this.hillNodes.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: 220 + rng() * 240,
        amp: (rng() > 0.25 ? 1 : -0.65) * (0.08 + rng() * 0.14)
      });
    }

    const mx = (ax, bx, t = 0.5, j = 45) => [
      Math.round(lerp(ax, bx, t) + (rng() - 0.5) * j),
      Math.round(lerp(ax, bx, t))
    ];
    const brEnd = this.bridgePos;
    const midWest = jitterPt((this.spawnPos.x + this.darkwoodPos.x) * 0.5, (this.spawnPos.y + this.darkwoodPos.y) * 0.5 - 30, 35, 35);
    const midGate = jitterPt((brEnd.x + this.fortressGatePos.x) * 0.5, (brEnd.y + this.fortressGatePos.y) * 0.5, 35, 35);
    const midWyrm = jitterPt((midGate.x + this.wyrmPeakPos.x) * 0.5, (midGate.y + this.wyrmPeakPos.y) * 0.5, 55, 45);
    const midCit = jitterPt((this.wyrmPeakPos.x + this.citadelPos.x) * 0.5, (this.wyrmPeakPos.y + this.citadelPos.y) * 0.5, 65, 40);
    const midElder = jitterPt((this.spiderHollowPos.x + this.elderwoodPos.x) * 0.5, (this.spiderHollowPos.y + this.elderwoodPos.y) * 0.5, 55, 55);
    const midObe = jitterPt((this.bastionPos.x + this.obeliskPos.x) * 0.5, (this.bastionPos.y + this.obeliskPos.y) * 0.5, 55, 55);

    // Procedural Road Spline Network linking every hub, boss lair & horizon citadel!
    this.roadSegments = [
      [this.spawnPos.x, this.spawnPos.y, brEnd.x - 140 * Math.sign(brEnd.x - this.spawnPos.x || 1), Math.round((this.spawnPos.y + brEnd.y) * 0.5)],
      [brEnd.x - 140 * Math.sign(brEnd.x - this.spawnPos.x || 1), Math.round((this.spawnPos.y + brEnd.y) * 0.5), brEnd.x, brEnd.y],
      [brEnd.x, brEnd.y, Math.round((brEnd.x + this.mirrorLakeX) * 0.5), Math.round(brEnd.y + 135)],
      [Math.round((brEnd.x + this.mirrorLakeX) * 0.5), Math.round(brEnd.y + 135), this.mirrorLakeX - 15, this.mirrorLakeY - 175],
      [this.spawnPos.x, this.spawnPos.y, midWest.x, midWest.y],
      [midWest.x, midWest.y, this.towerPos.x, this.towerPos.y + 42],
      [midWest.x, midWest.y, this.darkwoodPos.x, this.darkwoodPos.y],
      [this.darkwoodPos.x, this.darkwoodPos.y, this.spiderHollowPos.x, this.spiderHollowPos.y],
      [this.darkwoodPos.x, this.darkwoodPos.y, this.highGroundPos.x, this.highGroundPos.y - 50],
      [this.highGroundPos.x, this.highGroundPos.y + 50, this.harborPos.x, this.harborPos.y - 20],
      [this.spiderHollowPos.x, this.spiderHollowPos.y, midElder.x, midElder.y],
      [midElder.x, midElder.y, this.elderwoodPos.x, this.elderwoodPos.y],
      [brEnd.x, brEnd.y, midGate.x, midGate.y],
      [midGate.x, midGate.y, this.fortressGatePos.x, this.fortressGatePos.y],
      [this.fortressGatePos.x, this.fortressGatePos.y, this.bastionPos.x, this.bastionPos.y],
      [this.bastionPos.x, this.bastionPos.y, this.cryptPos.x, this.cryptPos.y],
      [this.bastionPos.x, this.bastionPos.y, midObe.x, midObe.y],
      [midObe.x, midObe.y, this.obeliskPos.x, this.obeliskPos.y],
      [midGate.x, midGate.y, midWyrm.x, midWyrm.y],
      [midWyrm.x, midWyrm.y, this.wyrmPeakPos.x, this.wyrmPeakPos.y + 95],
      [this.wyrmPeakPos.x, this.wyrmPeakPos.y - 95, midCit.x, midCit.y],
      [midCit.x, midCit.y, this.citadelPos.x, this.citadelPos.y + 95]
    ];
    this.roadBoxes = this.roadSegments.map((s) => [
      Math.min(s[0], s[2]) - 30,
      Math.max(s[0], s[2]) + 30,
      Math.min(s[1], s[3]) - 26,
      Math.max(s[1], s[3]) + 26
    ]);
    this.clearings = [
      [this.spawnPos.x, this.spawnPos.y + 8, 115, 0.22],
      [this.bastionPos.x, this.bastionPos.y, 160, 0.24],
      [this.cryptPos.x, this.cryptPos.y, 145, 0.23],
      [this.highGroundPos.x, this.highGroundPos.y, 145, 0.28],
      [this.spiderHollowPos.x, this.spiderHollowPos.y, 165, 0.24],
      [this.towerPos.x, this.towerPos.y, 108, 0.25],
      [this.fortressGatePos.x, this.fortressGatePos.y, 130, 0.23],
      [this.wyrmPeakPos.x, this.wyrmPeakPos.y, 185, 0.34],
      [this.bridgePos.x, this.bridgePos.y, 46, 0.25],
      [this.harborPos.x, this.harborPos.y, 155, 0.2],
      [this.citadelPos.x, this.citadelPos.y, 210, 0.42],
      [this.obeliskPos.x, this.obeliskPos.y, 190, 0.34],
      [this.elderwoodPos.x, this.elderwoodPos.y, 175, 0.32]
    ];
  }

  fbm(x, y) {
    const px = x * 0.0022 + this.phaseX;
    const py = y * 0.0022 + this.phaseY;
    const v1 = Math.sin(px * 1.1 + Math.cos(py * 1.3)) * 0.5 + 0.5;
    const v2 = Math.sin(px * 2.5 - py * 1.9 + this.phaseB) * 0.5 + 0.5;
    const v3 = Math.cos(px * 4.8 + py * 4.2) * 0.5 + 0.5;
    return v1 * 0.55 + v2 * 0.3 + v3 * 0.15;
  }

  /** Returns [0..1] indicating proximity to worn cobblestone road or river bridge! */
  getRoadFactor(x, y) {
    let best = 9999;
    const wobble = Math.sin(x * 0.025 + y * 0.021 + this.phaseB) * 6;
    const xw = x + wobble;
    for (let i = 0; i < this.roadSegments.length; i++) {
      const bb = this.roadBoxes[i];
      if (xw < bb[0] || xw > bb[1] || y < bb[2] || y > bb[3]) continue;
      const s = this.roadSegments[i];
      const d = distToSegment(xw, y, s[0], s[1], s[2], s[3]);
      if (d < best) best = d;
    }
    return clamp(1.0 - (best - 10) / 14, 0, 1);
  }

  isOnBridge(x, y) {
    return Math.abs(x - this.bridgePos.x) < 48 && Math.abs(y - this.bridgePos.y) < 18;
  }

  getBiomeId(x, y) {
    if (Math.hypot(x - this.citadelPos.x, y - this.citadelPos.y) < 350) return 'pale_citadel';
    if (Math.hypot(x - this.obeliskPos.x, y - this.obeliskPos.y) < 320) return 'obelisk_sanctum';
    if (Math.hypot(x - this.elderwoodPos.x, y - this.elderwoodPos.y) < 310) return 'elderwood_ridge';
    if (Math.hypot(x - this.harborPos.x, y - this.harborPos.y) < 245) return 'mire_harbor';
    if (Math.hypot(x - this.wyrmPeakPos.x, y - this.wyrmPeakPos.y) < 380 || y < -660) return 'ashen_peak';
    if (Math.hypot(x - this.spiderHollowPos.x, y - this.spiderHollowPos.y) < 245) return 'spider_hollow';
    if (Math.hypot(x - this.cryptPos.x, y - this.cryptPos.y) < 235) return 'sunken_crypt';
    if (Math.hypot(x - this.highGroundPos.x, y - this.highGroundPos.y) < 245) return 'high_ground';
    if (Math.hypot(x - this.mirrorLakeX, y - this.mirrorLakeY) < 420) return 'crimson_crag';
    if (Math.hypot(x - this.darkwoodPos.x, y - this.darkwoodPos.y) < 295) return 'darkwood';
    if (Math.hypot(x - this.bastionPos.x, y - this.bastionPos.y) < 305) return 'sunken_bastion';
    return 'waterfall_glade';
  }

  getBiomeName(x, y) {
    if (this.isOnBridge(x, y)) return 'ANCIENT ARCHED BRIDGE';
    if (this.isWater(x, y)) return 'BLACK MIRROR WATERS';
    if (Math.hypot(x - this.towerPos.x, y - this.towerPos.y) < 95) return 'MOSSY WATCHTOWER HIGH GROUND';
    const id = this.getBiomeId(x, y);
    switch (id) {
      case 'pale_citadel':
        return 'SHATTERED PALE CITADEL (HORIZON)';
      case 'obelisk_sanctum':
        return 'CRIMSON OBELISK SANCTUM (HORIZON)';
      case 'elderwood_ridge':
        return 'ELDERWOOD MOON-SPIRE RIDGE';
      case 'mire_harbor':
        return 'ABYSSAL MIRE CAUSEWAY';
      case 'ashen_peak':
        return "WYRM'S ASHEN PEAK";
      case 'spider_hollow':
        return 'DUSK WIDOW WEB HOLLOW';
      case 'sunken_crypt':
        return 'CINDERBONE CRYPT COURTYARD';
      case 'high_ground':
        return 'CLOUD-RIM HIGH GROUND';
      case 'crimson_crag':
        return 'CRIMSON AUTUMN CRAG';
      case 'darkwood':
        return 'WHISPERING DARKWOOD';
      case 'sunken_bastion':
        return 'SUNKEN STONE BASTION';
      default:
        return 'MOONLIT WATERFALL GLADE';
    }
  }

  getRiverCenterX(y) {
    const t = clamp((y + 80) / 515, 0, 1);
    const amp = this.riverAmp || 58;
    const freq = this.riverFreq || 0.0085;
    const wave = Math.sin((y + 80) * freq + this.phaseB) * amp;
    return lerp(this.plungePoolX, this.mirrorLakeX - 25, t) + wave;
  }

  /**
   * Returns continuous terrain height: <= 0.015 water, > 0.015 smooth rolling walkable hills, >= 0.55 cliff wall.
   */
  getElevation(x, y) {
    // Organic Fjord Continent + Rolling Topographic Hills + Distant Horizon Highlands
    const ang = Math.atan2(y, x);
    const fjordLobe = Math.sin(ang * 5 + this.phaseX) * 140 + Math.cos(ang * 3 - this.phaseY) * 105;
    const distCenter = Math.hypot(x * 0.88, y * 0.86);
    const edgeNoise = (this.fbm(x * 0.85, y * 0.85) - 0.5) * 260 + fjordLobe;

    // Gentle, C2-smooth rolling hills & valley contours (prevents jagged stair-step walls!)
    let hillDelta =
      Math.sin(x * 0.0032 + Math.cos(y * 0.0028) * 1.2 + this.phaseX) * 0.068 +
      Math.cos(y * 0.0038 - x * 0.0024 + this.phaseY) * 0.058 +
      (this.fbm(x * 0.9, y * 0.9) - 0.5) * 0.1;

    if (this.hillNodes) {
      for (let i = 0; i < this.hillNodes.length; i++) {
        const hn = this.hillNodes[i];
        const hd = Math.hypot(x - hn.x, y - hn.y);
        if (hd < hn.r) {
          const w = 1 - smoothstep(0, hn.r, hd);
          hillDelta += hn.amp * w;
        }
      }
    }

    // Gradual alpine climb toward Northern Ashen Peak / Pale Citadel
    const northSlope = y < -320 ? smoothstep(-320, -1720, y) * 0.18 : 0;
    const westHigh = x < -350 ? smoothstep(-350, -1720, x) * 0.08 : 0;

    let elev =
      0.21 +
      hillDelta +
      northSlope +
      westHigh -
      smoothstep(1400, 1940, distCenter + edgeNoise) * 0.54;

    // Reachable Distant Horizon Ridges & Causeways (never cut off by ocean dropoff!)
    const dCitadel = Math.hypot(x - this.citadelPos.x, y - this.citadelPos.y);
    if (dCitadel < 380) elev = Math.max(elev, 0.42 - smoothstep(170, 380, dCitadel) * 0.24);

    const dObelisk = Math.hypot(x - this.obeliskPos.x, y - this.obeliskPos.y);
    if (dObelisk < 360) elev = Math.max(elev, 0.35 - smoothstep(155, 360, dObelisk) * 0.22);

    const dElder = Math.hypot(x - this.elderwoodPos.x, y - this.elderwoodPos.y);
    if (dElder < 340) elev = Math.max(elev, 0.33 - smoothstep(155, 340, dElder) * 0.2);

    // Scenic Offshore Sanctuaries connected via shallow Moonlit Causeways
    const dSouthWestIsle = Math.hypot(x - this.harborPos.x, y - this.harborPos.y);
    if (dSouthWestIsle < 225) elev = Math.max(elev, 0.22 - smoothstep(140, 225, dSouthWestIsle) * 0.24);

    const dEastIsle = Math.hypot(x - 1040, y - 660);
    if (dEastIsle < 145) elev = Math.max(elev, 0.22 - smoothstep(95, 145, dEastIsle) * 0.25);

    // Keep cobblestone roads smoothly graded & comfortably above water
    const roadF = this.getRoadFactor(x, y);
    if (roadF > 0.15 && !this.isOnBridge(x, y)) {
      const roadFloor = 0.15 + northSlope * 0.65;
      elev = Math.max(elev, lerp(elev, Math.max(elev, roadFloor), roadF));
    }

    // 1. Waterfall Cliff Crescent Ridge above Glade & Handcrafted Clearings (smooth shoulder blends!)
    const dRidgeX = (x - this.waterfallX) / 225;
    const dRidgeY = (y - (this.waterfallTopY - 35)) / 115;
    const ridgeDist = Math.hypot(dRidgeX, dRidgeY);
    if (ridgeDist < 1.25 && y < this.waterfallBaseY - 18) {
      elev = Math.max(elev, 0.64 * (1.0 - smoothstep(0.1, 1.25, ridgeDist) * 0.72));
    }

    for (let i = 0; i < this.clearings.length; i++) {
      const c = this.clearings[i];
      const d = Math.hypot(x - c[0], y - c[1]);
      if (d < c[2]) {
        const blend = 1 - smoothstep(c[2] * 0.55, c[2], d);
        elev = Math.max(elev, lerp(elev, c[3], blend));
      }
    }

    // 2. Plunge Pool beneath Waterfall
    const poolDist = Math.hypot((x - this.plungePoolX) / 168, (y - this.plungePoolY) / 72);
    if (poolDist < 1.0) {
      elev = Math.min(elev, -0.36 * (1.0 - smoothstep(0.2, 1.0, poolDist)));
    }

    // 3. Winding River flowing from Plunge Pool to Crescent Mirror Lake
    if (y > -78 && y < this.mirrorLakeY - 90) {
      const targetRx = this.getRiverCenterX(y);
      const dRiv = Math.abs(x - targetRx);
      if (dRiv < 46 && !this.isOnBridge(x, y)) {
        elev = Math.min(elev, -0.26 * (1 - smoothstep(10, 46, dRiv)));
      }
    }

    // 4. Crescent Crimson Mirror Lake (moon reflection sanctuary!)
    const lakeDx = (x - this.mirrorLakeX) / 255;
    const lakeDy = (y - this.mirrorLakeY) / 150;
    const lakeWarp = (this.fbm(x * 1.1, y * 1.1) - 0.5) * 0.16;
    const lakeD = lakeDx * lakeDx + lakeDy * lakeDy + lakeWarp;
    if (lakeD < 0.88) {
      elev = Math.min(elev, -0.46 * (0.88 - lakeD));
    }

    return elev;
  }

  /**
   * Continuous world terrain height in 3D Z units with soft beach bevel (0 on water, up to 44 on ridges).
   */
  getTerrainZ(x, y, preElev = null) {
    if (this.isOnBridge(x, y)) return 0;
    const elev = preElev !== null ? preElev : this.getElevation(x, y);
    if (elev <= 0.015) return 0;
    const shoreEase = smoothstep(0.015, 0.095, elev);
    return clamp((elev - 0.015) * 72 * (0.55 + 0.45 * shoreEase), 0, 46);
  }

  getRiverFlow(x, y) {
    if (y > -78 && y < 445) {
      const cx0 = this.getRiverCenterX(y - 6);
      const cx1 = this.getRiverCenterX(y + 6);
      const dx = cx1 - cx0;
      const dy = 12;
      const len = Math.hypot(dx, dy) || 1;
      return { vx: dx / len, vy: dy / len };
    }
    return { vx: 0.25, vy: 0.85 };
  }

  isWater(x, y) {
    if (this.isOnBridge(x, y)) return false;
    return this.getElevation(x, y) <= 0.015;
  }

  isCliffBlocked(x, y) {
    if (this.isOnBridge(x, y) || this.getRoadFactor(x, y) > 0.4) return false;
    if (Math.hypot(x - this.spawnPos.x, y - this.spawnPos.y) < 105) return false;
    if (Math.hypot(x - this.wyrmPeakPos.x, y - this.wyrmPeakPos.y) < 165) return false;
    if (Math.hypot(x - this.citadelPos.x, y - this.citadelPos.y) < 185) return false;
    // Ruined Brick Fortress Gate wing walls block passage (center archway x in [-20..+20] stays open!)
    const fgDx = Math.abs(x - this.fortressGatePos.x);
    const fgDy = Math.abs(y - this.fortressGatePos.y);
    if (fgDx > 20 && fgDx < 90 && fgDy < 15) return true;
    return this.getElevation(x, y) >= 0.51;
  }

  /**
   * True 3D walkable vertical height (Z): natural terrain elevation + Spiral Watchtower + arched Bridge!
   */
  getWalkZ(x, y) {
    const baseZ = this.getTerrainZ(x, y);
    const tw = this.towerPos;
    const dx = x - tw.x;
    const dy = y - tw.y;
    const d = Math.hypot(dx, dy);
    if (d <= 36) return baseZ + 28;
    if (d <= 68) {
      let dAng = Math.atan2(dy, dx) - 1.75;
      while (dAng < 0) dAng += Math.PI * 2;
      while (dAng >= Math.PI * 2) dAng -= Math.PI * 2;
      const t = clamp(dAng / (Math.PI * 1.68), 0, 1);
      const blendOuter = d > 60 ? clamp(1 - (d - 60) / 8, 0, 1) : 1;
      return baseZ + t * 28 * blendOuter;
    }
    const br = this.bridgePos;
    if (this.isOnBridge(x, y)) {
      const span = clamp((x - br.x) / 48, -1, 1);
      return Math.max(baseZ, Math.max(0, Math.cos(span * Math.PI * 0.5)) * 10 + 10);
    }
    return baseZ;
  }

  /**
   * Renders rich Daggerfall-style Regional Sketch Minimap inside the compact top-right HUD box ONLY.
   */
  renderMinimap(ctx, w, h) {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let py = 0; py < h; py++) {
      const wy = ((py / h) - 0.5) * WORLD_SIZE;
      for (let px = 0; px < w; px++) {
        const wx = ((px / w) - 0.5) * WORLD_SIZE;
        const elev = this.getElevation(wx, wy);
        const idx = (py * w + px) * 4;
        if (this.isOnBridge(wx, wy)) {
          d[idx] = 158;
          d[idx + 1] = 148;
          d[idx + 2] = 128;
        } else if (elev <= 0.015) {
          const isShore = elev > -0.05;
          d[idx] = isShore ? 22 : 4;
          d[idx + 1] = isShore ? 48 : 11;
          d[idx + 2] = isShore ? 68 : 22;
        } else if (elev >= 0.51) {
          d[idx] = 98;
          d[idx + 1] = 76;
          d[idx + 2] = 68;
        } else if (this.getRoadFactor(wx, wy) > 0.52) {
          d[idx] = 88;
          d[idx + 1] = 82;
          d[idx + 2] = 66;
        } else {
          const b = this.getBiomeId(wx, wy);
          if (b === 'crimson_crag') {
            d[idx] = 82;
            d[idx + 1] = 36;
            d[idx + 2] = 20;
          } else if (b === 'obelisk_sanctum') {
            d[idx] = 98;
            d[idx + 1] = 44;
            d[idx + 2] = 26;
          } else if (b === 'pale_citadel') {
            d[idx] = 104;
            d[idx + 1] = 102;
            d[idx + 2] = 116;
          } else if (b === 'elderwood_ridge') {
            d[idx] = 24;
            d[idx + 1] = 72;
            d[idx + 2] = 52;
          } else if (b === 'mire_harbor') {
            d[idx] = 28;
            d[idx + 1] = 54;
            d[idx + 2] = 56;
          } else if (b === 'ashen_peak') {
            d[idx] = 56;
            d[idx + 1] = 48;
            d[idx + 2] = 54;
          } else if (b === 'sunken_crypt') {
            d[idx] = 54;
            d[idx + 1] = 38;
            d[idx + 2] = 76;
          } else if (b === 'high_ground') {
            d[idx] = 60;
            d[idx + 1] = 66;
            d[idx + 2] = 78;
          } else if (b === 'sunken_bastion') {
            d[idx] = 44;
            d[idx + 1] = 66;
            d[idx + 2] = 74;
          } else if (b === 'spider_hollow') {
            d[idx] = 32;
            d[idx + 1] = 44;
            d[idx + 2] = 46;
          } else {
            d[idx] = 20;
            d[idx + 1] = 64;
            d[idx + 2] = 36;
          }
        }
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
