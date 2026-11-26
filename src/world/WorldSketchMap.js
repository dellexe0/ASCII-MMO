/**
 * Shattered Crescent Archipelago & Twin-Strait Basin (4400x4400).
 *
 * Completely redesigned multi-island continent divided by a diagonal Emerald Sea Strait,
 * Crescent Moon Lagoon, Northern Alpine Crown, Eastern Crimson Terraces, and 2 Monumental Stone Bridges!
 */

export const WORLD_SIZE = 8800;
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
    this.riverAmp = 96 + rng() * 88;
    this.riverFreq = 0.0028 + rng() * 0.0014;

    const jitterPt = (bx, by, rx, ry) => ({
      x: Math.round(bx + (rng() - 0.5) * 2 * rx),
      y: Math.round(by + (rng() - 0.5) * 2 * ry)
    });

    const flipNS = rng() < 0.35 ? -1 : 1;

    // 1. West-Central Sanctuary Island + West Highland Cascade (vast 8800x8800 scale!)
    this.waterfallX = Math.round(-1360 + (rng() - 0.5) * 140);
    this.waterfallTopY = Math.round(-470 * flipNS);
    this.waterfallBaseY = Math.round(-110 * flipNS);
    this.plungePoolX = this.waterfallX;
    this.plungePoolY = Math.round(50 * flipNS);
    this.spawnPos = {
      x: Math.round(-940 + (rng() - 0.5) * 90),
      y: Math.round(270 * flipNS + (rng() - 0.5) * 70)
    };

    // 2. Southern Crescent Moon Mirror Lagoon (West-South coastal cove)
    this.mirrorLakeX = Math.round(-620 + (rng() - 0.5) * 140);
    this.mirrorLakeY = Math.round(1540 * flipNS);

    // 3. Central-East Sea-Strait Bridge + Northern Gorge Causeway Bridge
    const brY = Math.round(440 * flipNS);
    this.bridgePos = { x: Math.round(this.getRiverCenterX(brY)), y: brY };
    const brNorthY = Math.round(-880 * flipNS);
    this.bridgeNorthPos = { x: Math.round(this.getRiverCenterX(brNorthY)), y: brNorthY };

    // 4. Archipelago Biomes & Boss Strongholds across 6 Distinct Landmasses
    this.towerPos        = jitterPt(-1700,  560 * flipNS, 110, 90);
    this.darkwoodPos     = jitterPt(-1180, -1040 * flipNS, 150, 130);
    this.spiderHollowPos = jitterPt(-2080, -1360 * flipNS, 170, 150);
    this.fortressGatePos = jitterPt(630,   350 * flipNS, 90, 70);
    this.bastionPos      = jitterPt(1480,  480 * flipNS, 170, 150);
    this.cryptPos        = jitterPt(1840, -720 * flipNS, 170, 160);
    this.highGroundPos   = jitterPt(940,  1640 * flipNS, 180, 150);
    this.wyrmPeakPos     = jitterPt(520, -1820 * flipNS, 220, 140);
    this.harborPos       = jitterPt(-1960, 1780 * flipNS, 180, 160);

    // Distant Reachable Horizon Landmarks
    this.citadelPos   = jitterPt(840, -3180 * flipNS, 260, 150);
    this.obeliskPos   = jitterPt(3120, -220 * flipNS, 190, 260);
    this.elderwoodPos = jitterPt(-2960, -1920 * flipNS, 200, 220);

    // Multi-island elevation nodes defining the 6 vast archipelago landmasses
    this.islandCores = [
      { x: -1160, y:  240 * flipNS, rx: 1380, ry: 1120, h: 0.22 },
      { x: -1880, y: -1240 * flipNS, rx: 1040, ry: 880,  h: 0.25 },
      { x: -1680, y:  1680 * flipNS, rx: 840,  ry: 680,  h: 0.19 },
      { x:  1380, y:  280 * flipNS, rx: 1520, ry: 1380, h: 0.25 },
      { x:  640,  y: -1920 * flipNS, rx: 1320, ry: 1120, h: 0.31 },
      { x:  980,  y:  1660 * flipNS, rx: 960,  ry: 720,  h: 0.32 }
    ];

    // Procedural Rolling Hills
    this.hillNodes = [];
    for (let i = 0; i < 32; i++) {
      const a = rng() * Math.PI * 2;
      const d = 480 + rng() * 2900;
      this.hillNodes.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: 340 + rng() * 420,
        amp: (rng() > 0.28 ? 1 : -0.55) * (0.07 + rng() * 0.13)
      });
    }

    const midSw  = jitterPt((this.spawnPos.x + this.bridgePos.x) * 0.5, (this.spawnPos.y + this.bridgePos.y) * 0.5, 30, 30);
    const midDw  = jitterPt((this.spawnPos.x + this.darkwoodPos.x) * 0.5, (this.spawnPos.y + this.darkwoodPos.y) * 0.5, 40, 35);
    const midEst = jitterPt((this.bridgePos.x + this.fortressGatePos.x) * 0.5, (this.bridgePos.y + this.fortressGatePos.y) * 0.5, 30, 30);
    const midCry = jitterPt((this.bastionPos.x + this.cryptPos.x) * 0.5, (this.bastionPos.y + this.cryptPos.y) * 0.5, 45, 45);
    const midWyr = jitterPt((this.bridgeNorthPos.x + this.wyrmPeakPos.x) * 0.5, (this.bridgeNorthPos.y + this.wyrmPeakPos.y) * 0.5, 45, 40);
    const midCit = jitterPt((this.wyrmPeakPos.x + this.citadelPos.x) * 0.5, (this.wyrmPeakPos.y + this.citadelPos.y) * 0.5, 55, 35);

    // Caravan Road Network linking all 4 islands via the 2 monumental bridges
    this.roadSegments = [
      // West Sanctuary Hub -> Watchtower, Lagoon, Darkwood, Central Bridge
      [this.spawnPos.x, this.spawnPos.y, this.towerPos.x + 48, this.towerPos.y],
      [this.spawnPos.x, this.spawnPos.y, this.mirrorLakeX - 60, this.mirrorLakeY - 175 * flipNS],
      [this.mirrorLakeX - 60, this.mirrorLakeY - 175 * flipNS, this.harborPos.x + 80, this.harborPos.y - 25 * flipNS],
      [this.spawnPos.x, this.spawnPos.y, midDw.x, midDw.y],
      [midDw.x, midDw.y, this.darkwoodPos.x, this.darkwoodPos.y],
      [this.darkwoodPos.x, this.darkwoodPos.y, this.spiderHollowPos.x, this.spiderHollowPos.y],
      [this.spiderHollowPos.x, this.spiderHollowPos.y, this.elderwoodPos.x, this.elderwoodPos.y],
      [this.spawnPos.x, this.spawnPos.y, midSw.x, midSw.y],
      [midSw.x, midSw.y, this.bridgePos.x - 42, this.bridgePos.y],

      // Central Strait Bridge -> Fortress Gate -> East Crimson Bastion -> Crypt -> Obelisk
      [this.bridgePos.x - 44, this.bridgePos.y, this.bridgePos.x + 44, this.bridgePos.y],
      [this.bridgePos.x + 42, this.bridgePos.y, midEst.x, midEst.y],
      [midEst.x, midEst.y, this.fortressGatePos.x, this.fortressGatePos.y],
      [this.fortressGatePos.x, this.fortressGatePos.y, this.bastionPos.x, this.bastionPos.y],
      [this.bastionPos.x, this.bastionPos.y, this.highGroundPos.x, this.highGroundPos.y - 45 * flipNS],
      [this.bastionPos.x, this.bastionPos.y, midCry.x, midCry.y],
      [midCry.x, midCry.y, this.cryptPos.x, this.cryptPos.y],
      [this.cryptPos.x, this.cryptPos.y, this.obeliskPos.x, this.obeliskPos.y],

      // North Gorge Bridge linking Darkwood/East -> Wyrm's Ashen Peak -> Pale Citadel
      [this.darkwoodPos.x, this.darkwoodPos.y, this.bridgeNorthPos.x - 42, this.bridgeNorthPos.y],
      [this.bridgeNorthPos.x - 44, this.bridgeNorthPos.y, this.bridgeNorthPos.x + 44, this.bridgeNorthPos.y],
      [this.bridgeNorthPos.x + 42, this.bridgeNorthPos.y, this.cryptPos.x, this.cryptPos.y],
      [this.bridgeNorthPos.x + 42, this.bridgeNorthPos.y, midWyr.x, midWyr.y],
      [midWyr.x, midWyr.y, this.wyrmPeakPos.x, this.wyrmPeakPos.y + 85 * flipNS],
      [this.wyrmPeakPos.x, this.wyrmPeakPos.y - 85 * flipNS, midCit.x, midCit.y],
      [midCit.x, midCit.y, this.citadelPos.x, this.citadelPos.y + 90 * flipNS]
    ];

    this.roadBoxes = this.roadSegments.map((s) => [
      Math.min(s[0], s[2]) - 30,
      Math.max(s[0], s[2]) + 30,
      Math.min(s[1], s[3]) - 26,
      Math.max(s[1], s[3]) + 26
    ]);

    this.clearings = [
      [this.spawnPos.x, this.spawnPos.y, 120, 0.22],
      [this.towerPos.x, this.towerPos.y, 112, 0.26],
      [this.darkwoodPos.x, this.darkwoodPos.y, 130, 0.22],
      [this.spiderHollowPos.x, this.spiderHollowPos.y, 165, 0.25],
      [this.fortressGatePos.x, this.fortressGatePos.y, 135, 0.24],
      [this.bastionPos.x, this.bastionPos.y, 165, 0.25],
      [this.cryptPos.x, this.cryptPos.y, 150, 0.25],
      [this.highGroundPos.x, this.highGroundPos.y, 155, 0.30],
      [this.wyrmPeakPos.x, this.wyrmPeakPos.y, 185, 0.34],
      [this.harborPos.x, this.harborPos.y, 155, 0.21],
      [this.citadelPos.x, this.citadelPos.y, 210, 0.42],
      [this.obeliskPos.x, this.obeliskPos.y, 190, 0.34],
      [this.elderwoodPos.x, this.elderwoodPos.y, 175, 0.32]
    ];
  }

  fbm(x, y) {
    const px = x * 0.0024 + this.phaseX;
    const py = y * 0.0024 + this.phaseY;
    const v1 = Math.sin(px * 1.15 + Math.cos(py * 1.35)) * 0.5 + 0.5;
    const v2 = Math.sin(px * 2.6 - py * 1.9 + this.phaseB) * 0.5 + 0.5;
    const v3 = Math.cos(px * 5.0 + py * 4.3) * 0.5 + 0.5;
    return v1 * 0.55 + v2 * 0.3 + v3 * 0.15;
  }

  getRoadFactor(x, y) {
    let best = 9999;
    const wobble = Math.sin(x * 0.024 + y * 0.022 + this.phaseB) * 6;
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
    const onMain = Math.abs(x - this.bridgePos.x) < 48 && Math.abs(y - this.bridgePos.y) < 18;
    const onNorth = this.bridgeNorthPos && Math.abs(x - this.bridgeNorthPos.x) < 48 && Math.abs(y - this.bridgeNorthPos.y) < 18;
    return onMain || onNorth;
  }

  getBiomeId(x, y) {
    if (Math.hypot(x - this.citadelPos.x, y - this.citadelPos.y) < 580) return 'pale_citadel';
    if (Math.hypot(x - this.obeliskPos.x, y - this.obeliskPos.y) < 540) return 'obelisk_sanctum';
    if (Math.hypot(x - this.elderwoodPos.x, y - this.elderwoodPos.y) < 520) return 'elderwood_ridge';
    if (Math.hypot(x - this.harborPos.x, y - this.harborPos.y) < 440) return 'mire_harbor';
    if (Math.hypot(x - this.wyrmPeakPos.x, y - this.wyrmPeakPos.y) < 680 || y < -1600) return 'ashen_peak';
    if (Math.hypot(x - this.spiderHollowPos.x, y - this.spiderHollowPos.y) < 440) return 'spider_hollow';
    if (Math.hypot(x - this.cryptPos.x, y - this.cryptPos.y) < 430) return 'sunken_crypt';
    if (Math.hypot(x - this.highGroundPos.x, y - this.highGroundPos.y) < 450) return 'high_ground';
    if (Math.hypot(x - this.bastionPos.x, y - this.bastionPos.y) < 560 || x > 820) return 'crimson_crag';
    if (Math.hypot(x - this.darkwoodPos.x, y - this.darkwoodPos.y) < 510) return 'darkwood';
    if (Math.hypot(x - this.fortressGatePos.x, y - this.fortressGatePos.y) < 360) return 'sunken_bastion';
    return 'waterfall_glade';
  }

  getBiomeName(x, y) {
    if (this.isOnBridge(x, y)) return 'ANCIENT SEA-STRAIT BRIDGE';
    if (this.isWater(x, y)) return 'EMERALD ABYSSAL STRAIT';
    if (Math.hypot(x - this.towerPos.x, y - this.towerPos.y) < 95) return 'WEST CLIFF WATCHTOWER';
    const id = this.getBiomeId(x, y);
    switch (id) {
      case 'pale_citadel':    return 'SHATTERED PALE CITADEL (NORTH CROWN)';
      case 'obelisk_sanctum': return 'CRIMSON OBELISK SANCTUM (FAR EAST)';
      case 'elderwood_ridge': return 'ELDERWOOD MOON-SPIRE HEADLAND';
      case 'mire_harbor':     return 'ABYSSAL ATOLL HARBOR';
      case 'ashen_peak':      return "WYRM'S ASHEN CROWN";
      case 'spider_hollow':   return 'DUSK WIDOW SILK CANYON';
      case 'sunken_crypt':    return 'CINDERBONE CRYPT TERRACE';
      case 'high_ground':     return 'CLOUD-RIM BASALT MESA';
      case 'crimson_crag':    return 'CRIMSON MAPLE HIGHLANDS';
      case 'darkwood':        return 'WHISPERING WILLOW GROVE';
      case 'sunken_bastion':  return 'SUNKEN GATEWAY BASTION';
      default:                return 'WESTERN SANCTUARY GLADE';
    }
  }

  /** Winding central Sea-Strait channel cutting N -> S between West & East continents! */
  getRiverCenterX(y) {
    const wave =
      Math.sin(y * (this.riverFreq || 0.0062) + this.phaseB) * (this.riverAmp || 68) +
      Math.cos(y * 0.0024 - this.phaseX) * 52;
    return -15 + wave;
  }

  getElevation(x, y) {
    const warpX = x + (this.fbm(x * 0.9, y * 0.9) - 0.5) * 140;
    const warpY = y + (this.fbm(y * 0.9, x * 0.9) - 0.5) * 140;

    // Combine archipelago landmasses smoothly
    let islandElev = -0.34;
    for (let i = 0; i < this.islandCores.length; i++) {
      const c = this.islandCores[i];
      const d = Math.hypot((warpX - c.x) / c.rx, (warpY - c.y) / c.ry);
      if (d < 1.35) {
        const fall = 1 - smoothstep(0.45, 1.35, d);
        const h = lerp(-0.22, c.h, fall);
        if (h > islandElev) islandElev = h;
      }
    }

    // Rolling organic hill domes
    let hillDelta =
      Math.sin(x * 0.0034 + Math.cos(y * 0.003) * 1.1 + this.phaseX) * 0.055 +
      (this.fbm(x * 1.1, y * 1.1) - 0.5) * 0.085;

    for (let i = 0; i < this.hillNodes.length; i++) {
      const hn = this.hillNodes[i];
      const hd = Math.hypot(x - hn.x, y - hn.y);
      if (hd < hn.r) {
        hillDelta += hn.amp * (1 - smoothstep(0, hn.r, hd));
      }
    }

    let elev = islandElev + hillDelta;

    // Keep cobblestone roads smoothly graded ONLY on dry land (never draw causeways across deep sea/strait!)
    const straitCx = this.getRiverCenterX(y);
    const straitW = 58 + Math.sin(y * 0.005 + this.phaseX) * 14;
    const dStrait = Math.abs(x - straitCx);
    const roadF = this.getRoadFactor(x, y);
    if (roadF > 0.15 && !this.isOnBridge(x, y) && islandElev > -0.02 && dStrait >= straitW) {
      elev = Math.max(elev, lerp(elev, Math.max(elev, 0.16), roadF));
    }

    // 1. West Cascade Ridge above Waterfall
    const dRidgeX = (x - this.waterfallX) / 210;
    const dRidgeY = (y - (this.waterfallTopY - 30)) / 105;
    const ridgeDist = Math.hypot(dRidgeX, dRidgeY);
    if (ridgeDist < 1.2 && y < this.waterfallBaseY) {
      elev = Math.max(elev, 0.60 * (1.0 - smoothstep(0.12, 1.2, ridgeDist) * 0.72));
    }

    // 2. Handcrafted Landmark Clearings
    for (let i = 0; i < this.clearings.length; i++) {
      const c = this.clearings[i];
      const d = Math.hypot(x - c[0], y - c[1]);
      if (d < c[2]) {
        const blend = 1 - smoothstep(c[2] * 0.55, c[2], d);
        elev = Math.max(elev, lerp(elev, c[3], blend));
      }
    }

    // 3. Central Emerald Sea Strait dividing West & East Continents
    if (dStrait < straitW && !this.isOnBridge(x, y)) {
      elev = Math.min(elev, -0.28 * (1 - smoothstep(14, straitW, dStrait)));
    }

    // 4. West Waterfall Plunge Pool & Outflow Stream into Strait
    const poolDist = Math.hypot((x - this.plungePoolX) / 145, (y - this.plungePoolY) / 68);
    if (poolDist < 1.0) {
      elev = Math.min(elev, -0.34 * (1 - smoothstep(0.2, 1.0, poolDist)));
    }

    // 5. Crescent Moon Mirror Lagoon (Southern Cove)
    const lakeDx = (x - this.mirrorLakeX) / 240;
    const lakeDy = (y - this.mirrorLakeY) / 145;
    const lakeD = lakeDx * lakeDx + lakeDy * lakeDy + (this.fbm(x * 1.1, y * 1.1) - 0.5) * 0.16;
    if (lakeD < 0.88) {
      elev = Math.min(elev, -0.44 * (0.88 - lakeD));
    }

    return elev;
  }

  getTerrainZ(x, y, preElev = null) {
    if (this.isOnBridge(x, y)) return 0;
    const elev = preElev !== null ? preElev : this.getElevation(x, y);
    if (elev <= 0.015) return 0;
    const shoreEase = smoothstep(0.015, 0.095, elev);
    return clamp((elev - 0.015) * 72 * (0.55 + 0.45 * shoreEase), 0, 46);
  }

  getRiverFlow(x, y) {
    const cx0 = this.getRiverCenterX(y - 8);
    const cx1 = this.getRiverCenterX(y + 8);
    const dx = cx1 - cx0;
    const dy = 16;
    const len = Math.hypot(dx, dy) || 1;
    return { vx: dx / len, vy: dy / len };
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
    const fgDx = Math.abs(x - this.fortressGatePos.x);
    const fgDy = Math.abs(y - this.fortressGatePos.y);
    if (fgDx > 20 && fgDx < 90 && fgDy < 15) return true;
    return this.getElevation(x, y) >= 0.51;
  }

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
    if (this.isOnBridge(x, y)) {
      const br = Math.abs(y - this.bridgePos.y) < 22 ? this.bridgePos : this.bridgeNorthPos;
      const span = clamp((x - br.x) / 48, -1, 1);
      return Math.max(baseZ, Math.max(0, Math.cos(span * Math.PI * 0.5)) * 10 + 10);
    }
    return baseZ;
  }

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
          d[idx] = 178; d[idx + 1] = 166; d[idx + 2] = 138;
        } else if (elev <= 0.015) {
          const isShore = elev > -0.055;
          d[idx] = isShore ? 20 : 4;
          d[idx + 1] = isShore ? 58 : 13;
          d[idx + 2] = isShore ? 78 : 26;
        } else if (elev >= 0.51) {
          d[idx] = 98; d[idx + 1] = 76; d[idx + 2] = 68;
        } else if (this.getRoadFactor(wx, wy) > 0.52) {
          d[idx] = 96; d[idx + 1] = 88; d[idx + 2] = 68;
        } else {
          const b = this.getBiomeId(wx, wy);
          if (b === 'crimson_crag')         { d[idx] = 88;  d[idx + 1] = 36; d[idx + 2] = 20; }
          else if (b === 'obelisk_sanctum') { d[idx] = 104; d[idx + 1] = 44; d[idx + 2] = 24; }
          else if (b === 'pale_citadel')    { d[idx] = 112; d[idx + 1] = 108; d[idx + 2] = 122; }
          else if (b === 'elderwood_ridge') { d[idx] = 24;  d[idx + 1] = 74; d[idx + 2] = 56; }
          else if (b === 'mire_harbor')     { d[idx] = 28;  d[idx + 1] = 58; d[idx + 2] = 62; }
          else if (b === 'ashen_peak')      { d[idx] = 58;  d[idx + 1] = 50; d[idx + 2] = 58; }
          else if (b === 'sunken_crypt')    { d[idx] = 56;  d[idx + 1] = 38; d[idx + 2] = 82; }
          else if (b === 'high_ground')     { d[idx] = 64;  d[idx + 1] = 70; d[idx + 2] = 84; }
          else if (b === 'sunken_bastion')  { d[idx] = 48;  d[idx + 1] = 68; d[idx + 2] = 78; }
          else if (b === 'spider_hollow')   { d[idx] = 32;  d[idx + 1] = 46; d[idx + 2] = 50; }
          else if (b === 'darkwood')        { d[idx] = 18;  d[idx + 1] = 54; d[idx + 2] = 44; }
          else                              { d[idx] = 22;  d[idx + 1] = 68; d[idx + 2] = 38; }
        }
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
