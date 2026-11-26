import { WORLD_SIZE, createRng } from './WorldSketchMap.js';
import { WORLD_TILT_Y, LIFT_Z } from '../engine/Ascii3DRasterizer.js';
import {
  ArpgBuild,
  rollLootDrop,
  formatItemMods
} from '../rpg/ArpgSystem.js';
import {
  emitPureAscii3DSprite,
  buildHeroKnight3D,
  buildBaseMob3D,
  buildBoss3D,
  buildAdventurer3D
} from '../entities/Ascii3DModels.js';
import {
  emitPureAscii3DProp,
  buildWatchtower3D,
  buildFortressGate3D,
  buildTree3D,
  buildBoulder3D,
  buildBridge3D,
  buildPillar3D,
  buildDestructible3D,
  buildCitadelHorizon3D,
  buildHorizonVistaTower3D
} from './Ascii3DScenery.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rotateTowardAngle(cur, target, maxDelta) {
  let diff = target - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return cur + Math.sign(diff) * maxDelta;
}

function hashInt(ix, iy) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const GRASS_BLADES = ['/', '\\', '|', "'", ',', '.', '^', ';', 'v', '`'];
const WATER_RIPPLES = '~-_=.:≈';
const MOON_CHARS = '@#%*=+~-:.';
const CLOUD_CHARS = '.:,;+*~';

export class WorldEngine {
  constructor(worldMap, archetypeId = 'knight') {
    this.worldMap = worldMap;
    this.rng = createRng(worldMap.seed + 991);
    this.build = new ArpgBuild(archetypeId);

    // Player & Horse State (Smooth continuous heading yaw + inertial velocity!)
    this.x = worldMap.spawnPos.x;
    this.y = worldMap.spawnPos.y;
    this.z = worldMap.getWalkZ ? worldMap.getWalkZ(this.x, this.y) : 0;
    this.horseX = worldMap.spawnPos.x - 16;
    this.horseY = worldMap.spawnPos.y + 4;
    this.facing = 'right';
    this.horseFacing = 'right';
    this.yaw = 0;
    this.horseYaw = 0;
    this.vx = 0;
    this.vy = 0;
    this.currentSpeed = 0;
    this.dirX = 1;
    this.dirY = 0;

    // Dismounted at the start near Mirror/Waterfall glade so both hero & horse are immediately obvious, [F] mounts instantly
    this.isMounted = true;
    this.callingHorse = false;
    this.inWater = false;
    this.isMoving = false;
    this.isGalloping = false;
    this.gaitPhase = 0;
    this.gallopBlend = 0;

    // Combat Control Mode: 'tab' (MMORPG Tab-Target) OR 'action' (ARPG Free Aim)
    this.combatMode = 'tab';
    this.targetEnemyId = null;

    this.hp = this.build.computed.maxHp;
    this.stamina = this.build.computed.maxStamina;
    this.flasks = this.build.computed.maxFlasks || 3;
    this.flaskCooldown = 0;
    this.flaskHotTimer = 0;
    this.guardShield = 0;
    this.combatTimer = 0;
    this.playerBleedTimer = 0;
    this.playerBleedDps = 0;
    this.lastCampfire = { x: worldMap.spawnPos.x, y: worldMap.spawnPos.y };
    this.graveMarkers = [];
    this.kills = 0;
    this.loreDiscovered = 0;

    // Skill Cooldowns & Active Combat States
    this.slashTimer = 0;
    this.slashDuration = 0.24;
    this.slashCooldown = 0;
    this.bashCooldown = 0;
    this.rendCooldown = 0;
    this.bloodCooldown = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashDirX = 1;
    this.dashDirY = 0;
    this.evadeIframeTimer = 0;

    this.dashGhosts = [];
    this.swordArcs = [];
    this.floatingTexts = [];
    this.combatParticles = [];
    for (let i = 0; i < 64; i++) {
      this.combatParticles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.45, ch: '*', size: 12, r: 1, g: 0.8, b: 0.3 });
    }

    // Finite water splash & ripple pools (ZERO emit when idle!)
    this.moveWakeGrace = 0;
    this.wakeParticles = [];
    for (let i = 0; i < 24; i++) {
      this.wakeParticles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.45, ch: 'o', size: 10 });
    }
    this.wakeSpawnAccum = 0;

    this.rippleRings = [];
    for (let i = 0; i < 4; i++) {
      this.rippleRings.push({ active: false, x: 0, y: 0, age: 0, life: 0.8 });
    }
    this.rippleSpawnAccum = 0;

    // Weather (Download(2), Download(6).mp4): toggleable Rain & Thunderstorm!
    this.rainEnabled = false;
    this.lightningFlash = 0;
    this.lightningTimer = 7.5;
    this.rainDrops = [];
    for (let i = 0; i < 120; i++) {
      this.rainDrops.push({
        ox: (this.rng() - 0.5) * 900,
        oy: (this.rng() - 0.5) * 650,
        speed: 440 + this.rng() * 180,
        splashAge: 0,
        splashing: false
      });
    }

    // Destructible structures, debris, reactive grass wakes, boss attacks & Spiderwebs
    this.cobwebs = [];
    this.webbedTimer = 0;
    this.debris = [];
    this.bossEffects = [];
    this.shakeIntensity = 0;
    this.grassImpulses = [];
    this.lastGrassTrailX = this.x;
    this.lastGrassTrailY = this.y;

    // World Features
    this.colliders = [];
    this.waterfallBoulders = this._buildWaterfallBoulders();
    this.autumnCliffs = this._buildAutumnCliffs();
    this.waterfallParticles = this._buildWaterfallParticles(280);
    this.waterfallSparkles = this._buildWaterfallSparkles(68);
    this.ambientMotifs = this._buildAmbientMotes(140);

    this.trees = [];
    this.boulders = [];
    this._populateTreesAndRocks();

    this.campfires = this._buildCampfires();
    this.chests = this._buildChests();
    this.loreTomes = this._buildLoreTomes();
    this.destructibles = this._buildDestructibles();
    this.lootDrops = [];
    this.enemies = this._buildEnemies();
    this.adventurers = this._buildMMOAdventurers();

    // Static Grass, Relief Height & Water Terrain Lookup Caches (8800x8800 vast world!)
    this._gHalf = 880;
    this._gDim = 1761;
    this._grassState = new Uint8Array(this._gDim * this._gDim);
    this._grassZ = new Float32Array(this._gDim * this._gDim);
    this._grassSlope = new Int8Array(this._gDim * this._gDim);
    this._wHalf = 390;
    this._wDim = 781;
    this._waterState = new Uint8Array(this._wDim * this._wDim);
    this._waterFlowVx = new Float32Array(this._wDim * this._wDim);
    this._waterFlowVy = new Float32Array(this._wDim * this._wDim);
  }

  _buildDestructibles() {
    const fg = this.worldMap.fortressGatePos;
    const tw = this.worldMap.towerPos;
    const bs = this.worldMap.bastionPos;
    const dw = this.worldMap.darkwoodPos;
    return [
      { id: 'd1', kind: 'scaffold', x: fg.x - 42, y: fg.y + 46, hp: 60, maxHp: 60, broken: false, lantern: true },
      { id: 'd2', kind: 'scaffold', x: fg.x + 44, y: fg.y + 46, hp: 60, maxHp: 60, broken: false, lantern: true },
      { id: 'd3', kind: 'crate', x: fg.x + 88, y: fg.y + 18, hp: 35, maxHp: 35, broken: false, lantern: false },
      { id: 'd4', kind: 'scaffold', x: tw.x - 62, y: tw.y + 54, hp: 55, maxHp: 55, broken: false, lantern: true },
      { id: 'd5', kind: 'crate', x: tw.x + 56, y: tw.y + 48, hp: 35, maxHp: 35, broken: false, lantern: false },
      { id: 'd6', kind: 'crate', x: bs.x - 86, y: bs.y + 72, hp: 40, maxHp: 40, broken: false, lantern: true },
      { id: 'd7', kind: 'crate', x: dw.x + 58, y: dw.y + 52, hp: 35, maxHp: 35, broken: false, lantern: false }
    ];
  }

  _buildWaterfallBoulders() {
    const cx = this.worldMap.waterfallX;
    const by = this.worldMap.waterfallBaseY;
    return [
      { x: cx - 108, y: by - 46, rx: 46, ry: 34, moss: true },
      { x: cx - 64, y: by - 66, rx: 44, ry: 34, moss: true },
      { x: cx - 42, y: by - 20, rx: 32, ry: 22, moss: true },
      { x: cx + 106, y: by - 50, rx: 46, ry: 34, moss: true },
      { x: cx + 62, y: by - 68, rx: 44, ry: 34, moss: true },
      { x: cx + 44, y: by - 20, rx: 32, ry: 22, moss: true },
      { x: cx, y: by - 120, rx: 64, ry: 40, moss: true },
      { x: cx - 92, y: by - 110, rx: 52, ry: 36, moss: false },
      { x: cx + 92, y: by - 106, rx: 52, ry: 36, moss: false }
    ];
  }

  _buildAutumnCliffs() {
    const mx = this.worldMap.mirrorLakeX;
    const my = this.worldMap.mirrorLakeY;
    return [
      { x: mx - 250, y: my - 90, rx: 72, ry: 120, autumn: true },
      { x: mx - 220, y: my + 85, rx: 64, ry: 78, autumn: true },
      { x: mx + 245, y: my - 80, rx: 76, ry: 125, autumn: true },
      { x: mx + 225, y: my + 95, rx: 68, ry: 85, autumn: true },
      { x: mx - 135, y: my - 125, rx: 42, ry: 28, autumn: false },
      { x: mx + 140, y: my - 122, rx: 44, ry: 28, autumn: false }
    ];
  }

  _buildWaterfallParticles(count) {
    const list = [];
    const cx = this.worldMap.waterfallX;
    const topY = this.worldMap.waterfallTopY + 35;
    const by = this.worldMap.waterfallBaseY + 12;
    for (let i = 0; i < count; i++) {
      const p = {
        x: cx,
        y: by,
        vx: 0,
        vy: 0,
        age: (i / count) * 1.8,
        life: 1.5,
        ch: 'o',
        baseSize: 12,
        zone: i % 3 === 0 ? 'top' : i % 3 === 1 ? 'stream' : 'plume'
      };
      this._resetWaterfallParticle(p, true);
      list.push(p);
    }
    return list;
  }

  _resetWaterfallParticle(p, randomAge = false) {
    const cx = this.worldMap.waterfallX;
    const topY = this.worldMap.waterfallTopY + 45;
    const by = this.worldMap.waterfallBaseY + 10;
    const sprayChars = '~=*+✦.:';
    if (p.zone === 'top') {
      p.x = cx + (this.rng() - 0.5) * 86;
      p.y = topY + (this.rng() - 0.5) * 32;
      p.vx = (this.rng() - 0.5) * 20;
      p.vy = -12 + (this.rng() - 0.5) * 18;
      p.life = 1.0 + this.rng() * 0.9;
      p.baseSize = 11 + this.rng() * 11;
    } else if (p.zone === 'stream') {
      p.x = cx + (this.rng() - 0.5) * 64;
      p.y = topY + this.rng() * (by - topY);
      p.vx = (this.rng() - 0.5) * 10;
      p.vy = 115 + this.rng() * 65;
      p.life = 0.55 + this.rng() * 0.65;
      p.baseSize = 9 + this.rng() * 9;
    } else {
      p.x = cx + (this.rng() - 0.5) * 95;
      p.y = by + (this.rng() - 0.5) * 18;
      p.vx = (p.x - cx) * (0.4 + this.rng() * 0.6) + (this.rng() - 0.5) * 28;
      p.vy = -26 - this.rng() * 34;
      p.life = 1.2 + this.rng() * 1.1;
      p.baseSize = 14 + this.rng() * 15;
    }
    p.ch = sprayChars[Math.floor(this.rng() * sprayChars.length)];
    p.age = randomAge ? this.rng() * p.life : 0;
  }

  _buildWaterfallSparkles(count) {
    const cx = this.worldMap.waterfallX;
    const by = this.worldMap.waterfallBaseY + 10;
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: cx + (this.rng() - 0.5) * 220,
        y: by - 170 + this.rng() * 210,
        size: 11 + this.rng() * 15,
        phase: this.rng() * Math.PI * 2,
        speed: 1.8 + this.rng() * 2.8,
        ch: this.rng() > 0.45 ? '+' : this.rng() > 0.4 ? '*' : '✦'
      });
    }
    return arr;
  }

  _buildAmbientMotes(count) {
    const motes = [];
    for (let i = 0; i < count; i++) {
      const inAutumn = i < 55;
      const wx = inAutumn
        ? this.worldMap.mirrorLakeX + (this.rng() - 0.5) * 520
        : (this.rng() - 0.5) * 7200;
      const wy = inAutumn
        ? this.worldMap.mirrorLakeY + (this.rng() - 0.5) * 420
        : (this.rng() - 0.5) * 7200;
      motes.push({
        x: wx,
        y: wy,
        vx: (this.rng() - 0.5) * 14,
        vy: inAutumn ? 10 + this.rng() * 16 : -4 + (this.rng() - 0.5) * 8,
        phase: this.rng() * Math.PI * 2,
        autumn: inAutumn,
        ch: inAutumn ? (this.rng() > 0.5 ? 'o' : '0') : this.rng() > 0.5 ? '*' : '.'
      });
    }
    return motes;
  }

  _populateTreesAndRocks() {
    const sx = this.worldMap.spawnPos.x;
    const sy = this.worldMap.spawnPos.y;
    const isClearOfPoi = (x, y) => {
      if (Math.hypot(x - sx, y - sy) < 115) return false;
      if (Math.hypot(x - this.worldMap.bridgePos.x, y - this.worldMap.bridgePos.y) < 120) return false;
      if (this.worldMap.bridgeNorthPos && Math.hypot(x - this.worldMap.bridgeNorthPos.x, y - this.worldMap.bridgeNorthPos.y) < 120) return false;
      if (Math.hypot(x - this.worldMap.towerPos.x, y - this.worldMap.towerPos.y) < 125) return false;
      if (Math.hypot(x - this.worldMap.fortressGatePos.x, y - this.worldMap.fortressGatePos.y) < 130) return false;
      if (Math.hypot(x - this.worldMap.mirrorLakeX, y - (this.worldMap.mirrorLakeY + 15)) < 195) return false;
      if (Math.hypot(x - this.worldMap.wyrmPeakPos.x, y - this.worldMap.wyrmPeakPos.y) < 185) return false;
      if (Math.hypot(x - this.worldMap.citadelPos.x, y - this.worldMap.citadelPos.y) < 220) return false;
      if (Math.hypot(x - this.worldMap.obeliskPos.x, y - this.worldMap.obeliskPos.y) < 195) return false;
      if (Math.hypot(x - this.worldMap.cryptPos.x, y - this.worldMap.cryptPos.y) < 175) return false;
      if (Math.hypot(x - this.worldMap.highGroundPos.x, y - this.worldMap.highGroundPos.y) < 175) return false;
      if (Math.hypot(x - this.worldMap.spiderHollowPos.x, y - this.worldMap.spiderHollowPos.y) < 160) return false;
      if (Math.hypot(x - this.worldMap.bastionPos.x, y - this.worldMap.bastionPos.y) < 165) return false;
      return true;
    };

    // Frame Starting Sanctuary Island Glade with spaced, crisp Willow & Pine trees
    const starterCandidates = [
      { x: sx - 175, y: sy - 10, kind: 'willow', scale: 1.15 },
      { x: sx + 170, y: sy + 18, kind: 'clearing_oak', scale: 1.1 },
      { x: sx - 135, y: sy - 135, kind: 'pine', scale: 1.08 },
      { x: sx + 140, y: sy - 125, kind: 'pine', scale: 1.05 }
    ];
    for (const st of starterCandidates) {
      if (!this.worldMap.isWater(st.x, st.y) && this.worldMap.getRoadFactor(st.x, st.y) < 0.35) {
        this.trees.push(st);
        this.colliders.push({ x: st.x, y: st.y, r: 14 });
      }
    }

    // Archipelago Forest Groves with wide 115u spacing across vast 8800x8800 world
    for (let i = 0; i < 8200 && this.trees.length < 340; i++) {
      const x = (this.rng() - 0.5) * 7800;
      const y = (this.rng() - 0.5) * 7800;
      const elev = this.worldMap.getElevation(x, y);
      if (elev < 0.08 || elev > 0.45) continue;
      if (this.worldMap.getRoadFactor(x, y) > 0.25) continue;
      if (this.worldMap.isOnBridge(x, y)) continue;
      if (!isClearOfPoi(x, y)) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.y - y) < 110)) continue;

      const biome = this.worldMap.getBiomeId(x, y);
      const kind =
        biome === 'crimson_crag' || biome === 'obelisk_sanctum'
          ? (this.rng() > 0.3 ? 'autumn' : 'pine')
          : biome === 'ashen_peak' || biome === 'pale_citadel'
            ? 'dead'
            : biome === 'sunken_crypt'
              ? (this.rng() > 0.45 ? 'dead' : 'autumn')
              : biome === 'darkwood' || biome === 'mire_harbor'
                ? (this.rng() > 0.4 ? 'willow' : 'pine')
                : this.rng() > 0.52
                  ? 'pine'
                  : 'clearing_oak';
      this.trees.push({ x, y, kind, scale: 0.88 + this.rng() * 0.42 });
      if (kind !== 'dead') this.colliders.push({ x, y, r: 15 });
    }

    // Scattered Shoreline & Field Boulders across vast 8800x8800 world
    for (let i = 0; i < 1800 && this.boulders.length < 68; i++) {
      const x = (this.rng() - 0.5) * 7600;
      const y = (this.rng() - 0.5) * 7600;
      const elev = this.worldMap.getElevation(x, y);
      if (elev < 0.06 || elev > 0.42) continue;
      if (this.worldMap.getRoadFactor(x, y) > 0.32) continue;
      if (this.worldMap.isOnBridge(x, y)) continue;
      if (Math.hypot(x - sx, y - sy) < 110) continue;
      if (Math.hypot(x - this.worldMap.bridgePos.x, y - this.worldMap.bridgePos.y) < 95) continue;
      if (Math.hypot(x - this.worldMap.mirrorLakeX, y - this.worldMap.mirrorLakeY) < 190) continue;
      if (Math.hypot(x - this.worldMap.cryptPos.x, y - this.worldMap.cryptPos.y) < 155) continue;
      if (Math.hypot(x - this.worldMap.highGroundPos.x, y - this.worldMap.highGroundPos.y) < 155) continue;
      if (Math.hypot(x - this.worldMap.citadelPos.x, y - this.worldMap.citadelPos.y) < 200) continue;
      const rx = 20 + this.rng() * 18;
      const ry = 14 + this.rng() * 14;
      const biome = this.worldMap.getBiomeId(x, y);
      this.boulders.push({ x, y, rx, ry, moss: this.rng() > 0.45, autumn: biome === 'crimson_crag' || biome === 'cinder_crypt' || biome === 'obelisk_sanctum' });
      this.colliders.push({ x, y, r: rx * 0.72 });
    }
  }

  _buildCampfires() {
    return [
      { x: this.worldMap.spawnPos.x - 54, y: this.worldMap.spawnPos.y + 42 },
      { x: this.worldMap.bridgePos.x - 62, y: this.worldMap.bridgePos.y - 26 },
      { x: this.worldMap.darkwoodPos.x + 40, y: this.worldMap.darkwoodPos.y + 40 },
      { x: this.worldMap.mirrorLakeX - 185, y: this.worldMap.mirrorLakeY - 120 },
      { x: this.worldMap.bastionPos.x - 105, y: this.worldMap.bastionPos.y + 60 },
      { x: this.worldMap.cryptPos.x - 95, y: this.worldMap.cryptPos.y + 45 },
      { x: this.worldMap.highGroundPos.x + 90, y: this.worldMap.highGroundPos.y - 45 },
      { x: this.worldMap.harborPos.x + 80, y: this.worldMap.harborPos.y - 55 },
      { x: this.worldMap.obeliskPos.x - 140, y: this.worldMap.obeliskPos.y + 45 },
      { x: this.worldMap.citadelPos.x + 75, y: this.worldMap.citadelPos.y + 135 }
    ];
  }

  _buildChests() {
    return [
      { id: 'c1', x: this.worldMap.spawnPos.x + 115, y: this.worldMap.spawnPos.y + 52, opened: false, gold: 45, xp: 40, rarity: 'forged' },
      { id: 'c2', x: this.worldMap.darkwoodPos.x - 130, y: this.worldMap.darkwoodPos.y - 70, opened: false, gold: 85, xp: 75, rarity: 'runic' },
      { id: 'c3', x: this.worldMap.mirrorLakeX + 210, y: this.worldMap.mirrorLakeY - 135, opened: false, gold: 110, xp: 90, rarity: 'runic' },
      { id: 'c4', x: this.worldMap.bastionPos.x + 95, y: this.worldMap.bastionPos.y - 80, opened: false, gold: 160, xp: 130, rarity: 'relic' },
      { id: 'c5', x: this.worldMap.cryptPos.x + 120, y: this.worldMap.cryptPos.y - 72, opened: false, gold: 185, xp: 150, rarity: 'relic' },
      { id: 'c6', x: this.worldMap.highGroundPos.x - 120, y: this.worldMap.highGroundPos.y + 68, opened: false, gold: 210, xp: 175, rarity: 'relic' }
    ];
  }

  /**
   * Author's Core Lore Vision:
   * Zero generic village errand dialogue! World lore is discovered through ancient writings,
   * ruins, and conversations with 1,000-year-old Bosses!
   */
  _buildLoreTomes() {
    return [
      {
        id: 'tome_clearing',
        x: this.worldMap.spawnPos.x + 76,
        y: this.worldMap.spawnPos.y - 36,
        title: 'CARVED OBELISK: THE ASHFALL SUNDERING',
        read: false,
        pages: [
          'INSCRIPTION I — THE SCRIPT OF FLESH AND STONE:',
          '"When Vaelgorath shattered the Pale Pillar, color drained into ink and form fractured into living Glyphs. Every blade, pine bough, and bone now endures only as woven runes over the Abyss."'
        ]
      },
      {
        id: 'tome_darkwood',
        x: this.worldMap.darkwoodPos.x + 18,
        y: this.worldMap.darkwoodPos.y - 68,
        title: 'WEATHERED GRIMOIRE: OATH OF THE DEAD',
        read: false,
        pages: [
          'PAGE IV — WHISPERING DARKWOOD:',
          '"None here remember their mothers, only steel. The Skeleton Knights still patrol beneath the hollow oaks, waiting for a blow heavy enough to scatter their bones into quiet ink."'
        ]
      },
      {
        id: 'tome_mirror',
        x: this.worldMap.mirrorLakeX - 110,
        y: this.worldMap.mirrorLakeY - 148,
        title: 'SHORELINE TABLET: THE SUNKEN MOON',
        read: false,
        pages: [
          'LAKE INSCRIPTION — CRIMSON AUTUMN CRAG:',
          '"Look south into the black mirror water when the crimson leaves fall. The Moon above fell long ago; its pale face watches from beneath the ripples, whispering tactical secrets to those who wait."'
        ]
      },
      {
        id: 'tome_bastion',
        x: this.worldMap.bastionPos.x - 45,
        y: this.worldMap.bastionPos.y - 95,
        title: 'BASTION LEDGER: ORDER OF IRON',
        read: false,
        pages: [
          'WARDEN ARCHIVE — SUNKEN BASTION:',
          '"Any warrior may wield any blade, plate, or shield — no bloodline binds our order. Carve your own Passive Oath in battle, raise your shield against death, and duel the High Warden."'
        ]
      },
      {
        id: 'tome_crypt',
        x: this.worldMap.cryptPos.x - 105,
        y: this.worldMap.cryptPos.y - 60,
        title: 'BONE-SCRIPT STELE: THE CINDERBONE PACT',
        read: false,
        pages: [
          'SANCTUM INSCRIPTION — CINDERBONE CRYPT:',
          '"Lord Sepulchral bound the eastern road in ash and silver phylacteries. Only knights who weather his orbiting skulls and step inside his Nova ring see the ember underneath the ink."'
        ]
      },
      {
        id: 'tome_highground',
        x: this.worldMap.highGroundPos.x + 95,
        y: this.worldMap.highGroundPos.y - 55,
        title: 'CLIFF CAIRN: WATCHER OF THE ABYSS',
        read: false,
        pages: [
          'PRECIPICE MARKER — CLOUD-RIM HIGH GROUND:',
          '"Above the rolling fog bank stands Gorrath, forged from mossy cragstone and ancient thunder. Mind the cloud drop at the ledge and dodge the triple-fissure slam when his gauntlets rise."'
        ]
      }
    ];
  }

  _buildEnemies() {
    const list = [];
    let eid = 1;
    const makeEnemy = (kind, name, x, y, lv, maxHp, dmg, armor, speed, xpReward, isBoss = false, dialogue = null, isElite = false) => ({
      id: `mob_${eid++}`,
      kind,
      name: isElite && !isBoss ? `✦ ${name}` : name,
      x,
      y,
      homeX: x,
      homeY: y,
      lv,
      hp: maxHp,
      maxHp,
      dmg,
      armor,
      speed,
      xpReward,
      isBoss,
      isElite,
      dialogue,
      talkedOnce: false,
      alive: true,
      respawnTimer: 0,
      hitFlash: 0,
      stunTimer: 0,
      bleedTimer: 0,
      bleedDps: 0,
      atkCooldown: 0,
      windup: 0,
      windupMax: isBoss ? 0.85 : isElite ? 0.72 : 0.6,
      aggroRange: isBoss ? 220 : isElite ? 195 : 175,
      atkRange: kind === 'dragon' || kind === 'hydra_boss' ? 84 : kind === 'behemoth_boss' ? 78 : kind === 'golem_boss' ? 74 : kind === 'lich_boss' || kind === 'reaper_boss' ? 136 : kind === 'warden_boss' ? 58 : kind === 'skeleton_archer' ? 145 : 44,
      dirX: 1,
      dirY: 0,
      moving: false,
      phase: this.rng() * Math.PI * 2,
      animState: 'idle',
      animTimer: 0,
      strikeTimer: 0,
      specialWindup: false,
      specialActive: false,
      enraged: false,
      specialCooldown: isBoss ? 3.4 + this.rng() * 1.2 : 99
    });

    // Landmark Guard Patrols around Procedural Spawn & Key Ruins
    const dw = this.worldMap.darkwoodPos;
    const ml = { x: this.worldMap.mirrorLakeX, y: this.worldMap.mirrorLakeY };
    const bs = this.worldMap.bastionPos;
    const cr = this.worldMap.cryptPos;
    const hgPt = this.worldMap.highGroundPos;
    const hbPt = this.worldMap.harborPos;
    const wp = this.worldMap.wyrmPeakPos;
    const obPt = this.worldMap.obeliskPos;
    const ctPt = this.worldMap.citadelPos;

    const biomePools = {
      waterfall_glade: [
        ['skeleton', 'Hollow Skeleton'],
        ['wolf', 'Silvermane Timberwolf'],
        ['skeleton_archer', 'Glade Bone-Bow'],
        ['briar_fiend', 'Thornwood Sapling']
      ],
      darkwood: [
        ['skeleton', 'Darkwood Revenant'],
        ['wolf', 'Nightfang Direwolf'],
        ['briar_fiend', 'Ancient Briar Fiend'],
        ['skeleton_archer', 'Risen Bowbone']
      ],
      spider_hollow: [
        ['wolf', 'Brood-Hound Stalker'],
        ['briar_fiend', 'Webbound Treant'],
        ['skeleton_archer', 'Venomwood Archer'],
        ['bog_stalker', 'Hollow Mire Hulk']
      ],
      sunken_bastion: [
        ['iron_sentinel', 'Bastion Iron Sentinel'],
        ['skeleton', 'Bastion Knight'],
        ['skeleton_archer', 'Rampart Marksman']
      ],
      sunken_crypt: [
        ['ash_wraith', 'Cinderbone Wraith'],
        ['skeleton', 'Crypt Swordsman'],
        ['skeleton_archer', 'Ossuary Deadeye'],
        ['crimson_gargoyle', 'Crypt Gargoyle']
      ],
      crimson_crag: [
        ['crimson_gargoyle', 'Crag Gargoyle'],
        ['wolf', 'Crimson Crag Stalker'],
        ['skeleton', 'Autumn Bone-Knight']
      ],
      high_ground: [
        ['bog_stalker', 'Cragstone Hulk'],
        ['iron_sentinel', 'Highland Golem-Guard'],
        ['crimson_gargoyle', 'Abyssal Gargoyle']
      ],
      mire_harbor: [
        ['bog_stalker', 'Abyssal Bog Hulk'],
        ['ash_wraith', 'Fjord Phantom'],
        ['wolf', 'Mire-Fang Hound']
      ],
      ashen_peak: [
        ['crimson_gargoyle', 'Wyrmfire Gargoyle'],
        ['ash_wraith', 'Ashen Choir Wraith'],
        ['iron_sentinel', 'Obsidian Sentinel'],
        ['skeleton', 'Wyrm Cult Boneguard']
      ],
      obelisk_sanctum: [
        ['crimson_gargoyle', 'Solar Obelisk Fiend'],
        ['ash_wraith', 'Cinder Seraph-Shade'],
        ['iron_sentinel', 'Sunguard Automaton']
      ],
      pale_citadel: [
        ['iron_sentinel', 'Pale Citadel Sentinel'],
        ['ash_wraith', 'Astral Wraith'],
        ['crimson_gargoyle', 'Moonstone Gargoyle']
      ],
      elderwood_ridge: [
        ['briar_fiend', 'Elderwood Colossus'],
        ['wolf', 'Moon-Spire Direwolf'],
        ['bog_stalker', 'Elder Mire Brute']
      ]
    };

    // Procedural Biome Monster Population (65+ diverse mobs + Elite Champions across the entire map!)
    const sx = this.worldMap.spawnPos.x;
    const sy = this.worldMap.spawnPos.y;
    const anchors = [
      [dw.x, dw.y], [dw.x - 120, dw.y + 90], [ml.x + 210, ml.y - 60], [ml.x - 230, ml.y + 70],
      [bs.x - 140, bs.y + 90], [cr.x + 110, cr.y - 90], [hgPt.x + 120, hgPt.y + 80],
      [hbPt.x + 140, hbPt.y - 110], [wp.x - 130, wp.y + 180], [wp.x + 160, wp.y + 160],
      [obPt.x - 160, obPt.y - 90], [ctPt.x - 150, ctPt.y + 180], [ctPt.x + 160, ctPt.y + 170]
    ];

    const pushMobAt = (mx, my, forceElite = false) => {
      if (this.worldMap.isWater(mx, my) || this.worldMap.isCliffBlocked(mx, my)) return false;
      if (Math.hypot(mx - sx, my - sy) < 115) return false;
      if (list.some((m) => Math.hypot(m.x - mx, m.y - my) < 62)) return false;
      const biome = this.worldMap.getBiomeId(mx, my);
      const pool = biomePools[biome] || biomePools.waterfall_glade;
      const pick = pool[Math.floor(this.rng() * pool.length)];
      const kind = pick[0];
      const name = pick[1];
      const lv = Math.max(1, Math.round(Math.hypot(mx, my) / 230) + 1);
      const isElite = forceElite || (lv >= 3 && this.rng() < 0.22);
      const baseHp = kind === 'bog_stalker' || kind === 'iron_sentinel' || kind === 'briar_fiend' ? 128 : kind === 'wolf' ? 76 : 94;
      const hp = Math.round((baseHp + lv * 28) * (isElite ? 1.65 : 1.0));
      const dmg = Math.round(((kind === 'bog_stalker' || kind === 'crimson_gargoyle' ? 16 : 13) + lv * 3.2) * (isElite ? 1.32 : 1.0));
      const spd = kind === 'wolf' ? 88 : kind === 'ash_wraith' || kind === 'crimson_gargoyle' ? 76 : kind === 'bog_stalker' ? 54 : 62;
      const xp = Math.round((38 + lv * 16) * (isElite ? 1.85 : 1.0));
      list.push(makeEnemy(kind, name, mx, my, lv, hp, dmg, lv * 6 + (isElite ? 14 : 0), spd, xp, false, null, isElite));
      return true;
    };

    for (let i = 0; i < anchors.length; i++) {
      pushMobAt(anchors[i][0], anchors[i][1], i % 3 === 0);
    }
    for (let attempts = 0; attempts < 2200 && list.length < 140; attempts++) {
      const mx = (this.rng() - 0.5) * 7500;
      const my = (this.rng() - 0.5) * 7500;
      pushMobAt(mx, my, false);
    }

    // Boss 1: High Warden Malakor at Sunken Stone Bastion (Talkable + Tactical Duel!)
    list.push(
      makeEnemy(
        'warden_boss',
        'High Warden Malakor',
        this.worldMap.bastionPos.x,
        this.worldMap.bastionPos.y,
        5,
        420,
        28,
        35,
        64,
        240,
        true,
        [
          'HIGH WARDEN MALAKOR (LORE BOSS):',
          '"Halt, steel-clad wanderer. Do you come seeking gilded loot, or do you remember what the Bastion held before the sky wrote itself in runes?"',
          '"I swore to test every warrior before letting them climb toward Vaelgorath on the Ashen Peak. Raise your shield — strike when my greataxe winds back!"'
        ]
      )
    );

    // Boss 2: Vaelgorath, the 1,000-Year-Old Ashen Wyrm! (Creator's exact lore centerpiece!)
    list.push(
      makeEnemy(
        'dragon',
        'Vaelgorath, 1000-Yr Ashen Wyrm',
        this.worldMap.wyrmPeakPos.x,
        this.worldMap.wyrmPeakPos.y,
        8,
        820,
        42,
        52,
        62,
        550,
        true,
        [
          'VAELGORATH — THE 1,000-YEAR-OLD ASHEN WYRM:',
          '"Speak not to me of village elders and trivial errands, little knight. I watched empires harden into charcoal long before mortals forgot how to bleed without glyphs."',
          '"It was not malice that shattered the Pale Pillar — only silence growing too heavy to bear. Your Moon still drowns cleanly in the black Mirror Lake south of here."',
          '"Step closer with blade drawn if you wish to test what Armor, Evasion, and your Passive Oath are truly worth — or carry my memory back into the living world."'
        ]
      )
    );

    // Boss 3: Dusk Widow (Lv 15 Giant Furry Tarantula Boss — Download.mp4!)
    const sw = this.worldMap.spiderHollowPos;
    const widow = makeEnemy(
      'spider_boss',
      'Dusk Widow',
      sw.x,
      sw.y,
      15,
      980,
      46,
      44,
      78,
      720,
      true,
      [
        'DUSK WIDOW — MATRIARCH OF SILK & INK:',
        '*Eight obsidian eyes shimmer from beneath bristling fur. Ancient silk threads quiver between the pines.*',
        '"Stay within the webs, iron morsel... Watch your footing when frost silk tightens around your stirrups."'
      ]
    );
    widow.atkRange = 64;
    widow.aggroRange = 230;
    widow.webCooldown = 2.0;
    list.push(widow);

    // Pre-place haunting silk cobwebs in Dusk Widow's clearing
    for (let w = 0; w < 5; w++) {
      const ang = (w / 5) * Math.PI * 2;
      this.cobwebs.push({
        x: sw.x + Math.cos(ang) * 95,
        y: sw.y + Math.sin(ang) * 75,
        radius: 34,
        age: 0,
        life: 999999
      });
    }

    // Boss 4: Lord Sepulchral, Cinderbone Lich at Cinderbone Crypt Courtyard!
    const cp = this.worldMap.cryptPos;
    const lich = makeEnemy(
      'lich_boss',
      'Lord Sepulchral, Cinderbone Lich',
      cp.x,
      cp.y,
      12,
      890,
      38,
      40,
      66,
      640,
      true,
      [
        'LORD SEPULCHRAL — ARCHITECT OF THE CINDERBONE CRYPT:',
        '*Three silver skull phylacteries orbit slowly above his ragged cowl. Cold ozone crackles along the flagstones.*',
        '"You cross my bridge seeking ink-carved power? Watch when the bone-nova circles widen — stand inside the storm or shatter into dust."'
      ]
    );
    lich.windupMax = 0.92;
    lich.aggroRange = 240;
    list.push(lich);

    // Boss 5: Ironhide Colossus Gorrath at Cloud-Rim High Ground!
    const hg = this.worldMap.highGroundPos;
    const golem = makeEnemy(
      'golem_boss',
      'Ironhide Colossus Gorrath',
      hg.x,
      hg.y,
      18,
      1480,
      62,
      72,
      58,
      1100,
      true,
      [
        'IRONHIDE COLOSSUS GORRATH — KEEPER OF THE HIGH PRECIPICE:',
        '*Molten forge-veins pulse beneath mossy granite boulders as his twin fists grind against the cliff edge.*',
        '"Only steel tempered in emberstone survives the Seismic Slam. When both stone fists rise above the fog, dash or fall!"'
      ]
    );
    golem.windupMax = 1.02;
    golem.aggroRange = 235;
    list.push(golem);

    // Boss 6: Scylla, Abyssal Mire Hydra at South-West Fjord Causeway!
    const hb = this.worldMap.harborPos;
    const hydra = makeEnemy(
      'hydra_boss',
      'Scylla, Abyssal Mire Hydra',
      hb.x,
      hb.y,
      14,
      1340,
      50,
      46,
      70,
      860,
      true,
      [
        'SCYLLA — THREE-HEADED ABYSSAL MIRE HYDRA:',
        '*Three horned serpentine heads hiss above the black causeway water, dripping bioluminescent venom.*',
        '"Each head remembers a ship swallowed by the Black Fjord. Step past our tidal surge if your shield dares!"'
      ]
    );
    hydra.windupMax = 0.88;
    hydra.aggroRange = 240;
    list.push(hydra);

    // Boss 7: Malphas, Seraph of Ash at Far-East Crimson Obelisk Sanctum (Reachable Horizon!)
    const ob = this.worldMap.obeliskPos;
    const reaper = makeEnemy(
      'reaper_boss',
      'Malphas, Seraph of Ash',
      ob.x,
      ob.y,
      21,
      1820,
      68,
      58,
      76,
      1450,
      true,
      [
        'MALPHAS — FALLEN SOLAR ARCHON OF THE OBELISKS:',
        '*Six burning wings unfurl beneath crimson monoliths on the eastern skyline.*',
        '"You rode all the way to the crimson edge of the world! Show me whether your armor holds against fallen sunlight!"'
      ]
    );
    reaper.windupMax = 0.86;
    reaper.aggroRange = 250;
    list.push(reaper);

    // Boss 8: Aurelius, Pale Citadel Sovereign at Far-North Reachable Horizon Citadel!
    const ct = this.worldMap.citadelPos;
    const sovereign = makeEnemy(
      'behemoth_boss',
      'Aurelius, Pale Citadel Sovereign',
      ct.x,
      ct.y + 40,
      25,
      2450,
      78,
      76,
      74,
      2200,
      true,
      [
        'AURELIUS — SOVEREIGN OF THE SHATTERED PALE CITADEL:',
        '*Moonsteel monoliths orbit his shoulders atop the northern horizon mountain peak.*',
        '"From the southern glade you saw our broken crown on the skyline — now stand inside the Pale Citadel and prove your legend!"'
      ]
    );
    sovereign.windupMax = 0.9;
    sovereign.aggroRange = 260;
    list.push(sovereign);

    return list;
  }

  _buildMMOAdventurers() {
    const sp = this.worldMap.spawnPos;
    const br = this.worldMap.bridgePos;
    const dw = this.worldMap.darkwoodPos;
    const ml = { x: this.worldMap.mirrorLakeX, y: this.worldMap.mirrorLakeY };
    const bs = this.worldMap.bastionPos;
    const names = [
      { name: 'Ser Kael', lv: 3, x: br.x - 110, y: br.y - 30, mounted: true, swordFx: 'steel', styleIdx: 0 },
      { name: 'Vespera', lv: 5, x: dw.x + 70, y: dw.y + 35, mounted: false, swordFx: 'crimson', styleIdx: 3 },
      { name: 'Thorne', lv: 4, x: ml.x - 90, y: ml.y - 190, mounted: false, swordFx: 'ember', styleIdx: 2 },
      { name: 'Astrid', lv: 6, x: bs.x - 140, y: bs.y + 40, mounted: true, swordFx: 'frost', styleIdx: 4 },
      { name: 'Lyra', lv: 4, x: sp.x + 110, y: sp.y - 60, mounted: false, swordFx: 'steel', styleIdx: 1 }
    ];
    return names.map((a, idx) => ({
      ...a,
      homeX: a.x,
      homeY: a.y,
      dirX: 1,
      dirY: 0,
      moving: false,
      slashTimer: 0,
      phase: idx * 1.7
    }));
  }

  getLanternPos() {
    const z = this.z || 0;
    return {
      x: this.x + Math.cos(this.yaw) * 10,
      y: this.y + Math.sin(this.yaw) * 4,
      z: z + (this.isMounted ? 36 : 22)
    };
  }

  toggleCombatMode() {
    this.combatMode = this.combatMode === 'tab' ? 'action' : 'tab';
    return this.combatMode === 'tab'
      ? 'Combat Mode: [TAB-TARGET] (T / Click targets, tactical lock-on)'
      : 'Combat Mode: [ACTION ARPG] (Free-aim slashes & dodges)';
  }

  cycleTabTarget() {
    const candidates = this.enemies
      .filter((e) => e.alive && Math.hypot(e.x - this.x, e.y - this.y) < 340)
      .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
    if (candidates.length === 0) {
      this.targetEnemyId = null;
      return null;
    }
    if (!this.targetEnemyId) {
      this.targetEnemyId = candidates[0].id;
      return candidates[0];
    }
    const curIdx = candidates.findIndex((c) => c.id === this.targetEnemyId);
    const next = candidates[(curIdx + 1) % candidates.length];
    this.targetEnemyId = next.id;
    return next;
  }

  getLockedTarget() {
    if (!this.targetEnemyId) return null;
    const e = this.enemies.find((m) => m.id === this.targetEnemyId && m.alive);
    if (!e || Math.hypot(e.x - this.x, e.y - this.y) > 420) {
      this.targetEnemyId = null;
      return null;
    }
    return e;
  }

  selectTargetAtWorld(wx, wy) {
    let best = null;
    let bestDist = 48;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - wx, e.y - wy);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    if (best) this.targetEnemyId = best.id;
    return best;
  }

  toggleMount() {
    if (this.isMounted) {
      this.isMounted = false;
      this.horseX = this.x - this.dirX * 26;
      this.horseY = this.y + 6;
      this.horseFacing = this.facing;
      return 'Dismounted White Warhorse (left behind as [H]).';
    }
    if (Math.hypot(this.x - this.horseX, this.y - this.horseY) < 95) {
      this.isMounted = true;
      this.callingHorse = false;
      this.x = this.horseX;
      this.y = this.horseY;
      return 'Mounted White Warhorse!';
    }
    this.callingHorse = true;
    return 'Too far — whistling your Warhorse to your side!';
  }

  callHorse() {
    if (this.isMounted) return 'Already mounted.';
    this.callingHorse = true;
    return 'Whistled for your Warhorse!';
  }

  triggerDash() {
    if (this.dashCooldown > 0 || this.stamina < 16) return { fired: false, msg: 'Dash on cooldown or low stamina!' };
    this.stamina -= 16;
    const cdReduce = 1 - Math.min(0.45, (this.build.computed.dashCdPct || 0) / 100);
    this.dashCooldown = 1.45 * cdReduce;
    this.dashTimer = 0.22;
    this.evadeIframeTimer = 0.34;
    this.dashDirX = this.dirX || 1;
    this.dashDirY = this.dirY || 0;
    const len = Math.hypot(this.dashDirX, this.dashDirY) || 1;
    this.dashDirX /= len;
    this.dashDirY /= len;

    // Emit initial dash burst ASCII sparks & wind gust whipping grass
    this._spawnParticles(this.x, this.y - 10, 10, '/', 11, 0.55, 0.95, 1.0, 95);
    this._emitGrassImpulse(this.x, this.y + 4, this.dashDirX, this.dashDirY, 44, 15, 0.85, true);
    return { fired: true };
  }

  _emitGrassImpulse(x, y, vx, vy, radius, strength, life, isBlast = false) {
    if (this.grassImpulses.length >= 42) this.grassImpulses.shift();
    this.grassImpulses.push({ x, y, vx, vy, radius, strength, age: 0, life, isBlast });
  }

  _spawnFloatingText(x, y, text, r = 1, g = 1, b = 1, size = 12) {
    this.floatingTexts.push({ x, y, text, r, g, b, size, age: 0, life: 0.95 });
  }

  _spawnParticles(x, y, count, ch, size, r, g, b, speed = 80) {
    let spawned = 0;
    for (const p of this.combatParticles) {
      if (p.active) continue;
      const ang = this.rng() * Math.PI * 2;
      const spd = (0.4 + this.rng() * 0.8) * speed;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.age = 0;
      p.life = 0.28 + this.rng() * 0.24;
      p.ch = ch;
      p.size = size;
      p.r = r;
      p.g = g;
      p.b = b;
      spawned++;
      if (spawned >= count) break;
    }
  }

  _applyHeroHit(target, baseMult, bonusCrit = 0, stunDur = 0, applyBleed = false) {
    const c = this.build.computed;
    this.combatTimer = 6.5;
    let rollBase = lerp(c.minDmg, c.maxDmg, this.rng()) * baseMult;
    const lowHpBonus = this.hp / c.maxHp < 0.3 ? 12 : 0; // Desperation Last Stand!
    const critChance = c.critChance + bonusCrit + lowHpBonus;
    const isCrit = this.rng() * 100 < critChance;
    let dmg = rollBase * (isCrit ? c.critMult / 100 : 1.0);

    if (target.hp / target.maxHp <= 0.4 && c.executePct > 0) {
      dmg *= 1 + c.executePct / 100;
    }

    const armorFactor = 100 / (100 + target.armor);
    const finalDmg = Math.max(2, Math.round(dmg * armorFactor));
    target.hp = Math.max(0, target.hp - finalDmg);
    target.hitFlash = 0.14;
    if (stunDur > 0) {
      target.stunTimer = Math.max(target.stunTimer, stunDur + (c.stunBonus || 0));
      target.windup = 0;
    }

    if (applyBleed || (isCrit && c.bleedChance > 0 && this.rng() * 100 < c.bleedChance)) {
      target.bleedTimer = 3.0;
      target.bleedDps = Math.max(4, Math.round(((c.minDmg + c.maxDmg) * 0.5) * 0.42));
    }

    // Leech / Life on Hit (Meaningful in-combat sustain!)
    if (c.lifeOnHit > 0) {
      this.hp = Math.min(c.maxHp, this.hp + c.lifeOnHit);
    }

    const fxCols = this._getSwordFxRgb();
    if (isCrit) this.shakeIntensity = Math.max(this.shakeIntensity, 2.8);
    this._spawnParticles(target.x, target.y - 12, isCrit ? 12 : 6, isCrit ? '✦' : '*', isCrit ? 14 : 11, fxCols[0], fxCols[1], fxCols[2], 115);

    this._spawnFloatingText(
      target.x + (this.rng() - 0.5) * 14,
      target.y - 26,
      isCrit ? `CRIT ${finalDmg}!` : `${finalDmg}`,
      isCrit ? 1.0 : 0.92,
      isCrit ? 0.84 : 0.95,
      isCrit ? 0.28 : 1.0,
      isCrit ? 14 : 11
    );

    this.targetEnemyId = target.id;

    // Boss Phase II Enrage (< 50% HP!)
    if (target.isBoss && target.hp > 0 && target.hp <= target.maxHp * 0.5 && !target.enraged) {
      target.enraged = true;
      target.speed = Math.round(target.speed * 1.24);
      target.dmg = Math.round(target.dmg * 1.25);
      target.specialCooldown = Math.min(target.specialCooldown, 0.8);
      this.shakeIntensity = Math.max(this.shakeIntensity, 6.0);
      this._spawnFloatingText(target.x, target.y - 54, 'PHASE II: ENRAGED!', 1.0, 0.28, 0.16, 13);
      this._emitGrassImpulse(target.x, target.y, 0, 0, 95, 20, 1.1, true);
    }

    const outcome = { killed: false, lootDropped: null, xp: 0, gold: 0, msg: null };
    if (target.hp <= 0) {
      target.alive = false;
      target.enraged = false;
      target.respawnTimer = target.isBoss ? 55 : 22;
      this.kills++;
      if (c.lifeOnKill > 0) this.hp = Math.min(c.maxHp, this.hp + c.lifeOnKill);
      const maxFl = c.maxFlasks || 3;
      if (this.flasks < maxFl && (target.isBoss || this.rng() < 0.3)) {
        this.flasks++;
        this._spawnFloatingText(this.x, this.y - 48, '+1 FLASK CHARGE', 0.45, 0.96, 0.6, 10);
      }
      outcome.killed = true;
      outcome.xp = target.xpReward;
      outcome.gold = 12 + target.lv * 8 + (target.isBoss ? 120 : 0);
      this.build.gold += outcome.gold;
      if (target.isBoss || this.rng() < 0.55) {
        const drop = rollLootDrop(this.rng, target.lv, target.isBoss ? 'relic' : null);
        this.lootDrops.push({ x: target.x, y: target.y, item: drop, age: 0 });
        outcome.lootDropped = drop;
      }
      outcome.msg = `Slain ${target.name}! +${outcome.xp} XP, +${outcome.gold}g`;
    }
    return outcome;
  }

  _getSwordFxRgb() {
    switch (this.build.computed.swordFx) {
      case 'ember':
        return [1.0, 0.58, 0.18];
      case 'frost':
        return [0.46, 0.82, 1.0];
      case 'crimson':
        return [0.95, 0.24, 0.36];
      default:
        return [0.85, 0.93, 1.0];
    }
  }

  toggleRainStorm() {
    this.rainEnabled = !this.rainEnabled;
    return this.rainEnabled ? 'Weather: [THUNDERSTORM RAIN] — Watch puddles & reflections.' : 'Weather: [MOONLIT CLEAR SKY].';
  }

  _shatterDestructible(d, hitDirX, hitDirY, res) {
    if (d.broken) return;
    d.hp -= 35;
    this._spawnParticles(d.x, d.y - 12, 8, '*', 12, 1.0, 0.72, 0.25, 110);
    if (d.hp > 0) {
      this._spawnFloatingText(d.x, d.y - 24, 'CRACK!', 1.0, 0.78, 0.35, 10);
      return;
    }
    d.broken = true;
    this._spawnFloatingText(d.x, d.y - 30, 'SHATTERED!', 1.0, 0.62, 0.2, 12);
    const debrisChars = ['#', '=', '/', '\\', '-', '*'];
    for (let i = 0; i < 18; i++) {
      const ang = Math.atan2(hitDirY, hitDirX) + (this.rng() - 0.5) * 1.9;
      const spd = 75 + this.rng() * 140;
      const isEmber = d.lantern && i < 6;
      this.debris.push({
        x: d.x + (this.rng() - 0.5) * 16,
        y: d.y - this.rng() * 18,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.7,
        z: 8 + this.rng() * 18,
        vz: 70 + this.rng() * 90,
        ch: isEmber ? '*' : debrisChars[Math.floor(this.rng() * debrisChars.length)],
        r: isEmber ? 1.0 : 0.68,
        g: isEmber ? 0.55 : 0.48,
        b: isEmber ? 0.16 : 0.28,
        age: 0,
        life: 3.2
      });
    }
    this.build.gold += 15;
    res.messages.push(`Shattered wooden ${d.kind}! +15 Gold`);
  }

  _spawnRiverSwordSplash(aimX, aimY) {
    if (!this.inWater && !this.worldMap.isWater(this.x + aimX * 26, this.y + aimY * 26)) return;
    const flow = this.worldMap.getRiverFlow(this.x, this.y);
    for (let i = 0; i < 18; i++) {
      const p = this.combatParticles.find((cp) => !cp.active);
      if (!p) break;
      const spread = (this.rng() - 0.5) * 1.6;
      const ang = Math.atan2(aimY, aimX) + spread;
      const spd = 65 + this.rng() * 110;
      p.active = true;
      p.x = this.x + Math.cos(ang) * 16;
      p.y = this.y + Math.sin(ang) * 12;
      p.vx = Math.cos(ang) * spd + flow.vx * 65;
      p.vy = Math.sin(ang) * spd + flow.vy * 65;
      p.age = 0;
      p.life = 0.45 + this.rng() * 0.25;
      p.ch = i % 3 === 0 ? 'o' : i % 2 === 0 ? '*' : '0';
      p.size = 9 + this.rng() * 5;
      // Glowing golden amber river spray (Download(9).mp4!)
      p.r = 1.0;
      p.g = 0.8 + this.rng() * 0.15;
      p.b = 0.32;
    }
  }

  /** [1 / LMB]: Cleave Strike */
  triggerCleave() {
    const res = { fired: false, xpGained: 0, messages: [] };
    if (this.slashCooldown > 0) return res;
    const c = this.build.computed;
    this.slashCooldown = 0.36 / c.attackSpeedMult;
    this.slashTimer = this.slashDuration;
    res.fired = true;

    let aimX = this.dirX;
    let aimY = this.dirY;
    const locked = this.combatMode === 'tab' ? this.getLockedTarget() : null;
    if (locked) {
      const dx = locked.x - this.x;
      const dy = locked.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      aimX = dx / d;
      aimY = dy / d;
      this.yaw = rotateTowardAngle(this.yaw, Math.atan2(aimY, aimX), 1.4);
      this.dirX = aimX;
      this.dirY = aimY;
      this.facing = Math.abs(aimX) > Math.abs(aimY) ? (aimX > 0 ? 'right' : 'left') : aimY > 0 ? 'down' : 'up';
    }

    const fxRgb = this._getSwordFxRgb();
    this.swordArcs.push({
      x: this.x,
      y: this.y - 10,
      ang: Math.atan2(aimY, aimX),
      age: 0,
      life: 0.22,
      rad: 36 * (1 + (c.reachPct || 0) / 100),
      r: fxRgb[0],
      g: fxRgb[1],
      b: fxRgb[2],
      whirl: false
    });

    this._spawnRiverSwordSplash(aimX, aimY);
    this._emitGrassImpulse(this.x + aimX * 20, this.y + 4 + aimY * 14, aimX, aimY, 42, 13, 0.72, true);

    const reach = (this.combatMode === 'tab' ? 78 : 68) * (1 + (c.reachPct || 0) / 100);
    for (const d of this.destructibles) {
      if (!d.broken && Math.hypot(d.x - this.x, d.y - this.y) <= reach) {
        this._shatterDestructible(d, aimX, aimY, res);
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach) continue;
      const dot = (dx * aimX + dy * aimY) / Math.max(1, dist);
      if (dist < 28 || dot > 0.25 || (locked && e.id === locked.id)) {
        const out = this._applyHeroHit(e, 1.0, 0, 0, false);
        res.xpGained += out.xp;
        if (out.msg) res.messages.push(out.msg);
      }
    }
    return res;
  }

  /** [Q]: Drink Crimson Vitality Flask (Rapid Heal + Bleed Cleanse!) */
  useHealingFlask() {
    const res = { fired: false, messages: [] };
    const c = this.build.computed;
    if (this.flasks <= 0) {
      res.messages.push('Flask empty! Rest at a Campfire [E] or slay foes to refill.');
      return res;
    }
    if (this.flaskCooldown > 0) return res;
    if (this.hp >= c.maxHp && this.playerBleedTimer <= 0) {
      res.messages.push('Health already full.');
      return res;
    }
    this.flasks--;
    this.flaskCooldown = 2.4;
    this.flaskHotTimer = 1.25;
    this.playerBleedTimer = 0;
    const totalHeal = Math.round(c.maxHp * (0.45 + (c.flaskBonusPct || 0) / 100));
    this.flaskHealRate = totalHeal / 1.25;
    this._spawnFloatingText(this.x, this.y - 44, `FLASK +${totalHeal} HP`, 0.45, 1.0, 0.58, 12);
    this._spawnParticles(this.x, this.y - 10, 16, '+', 13, 0.42, 0.96, 0.52, 90);
    res.fired = true;
    res.messages.push(`Crimson Flask (${this.flasks}/${c.maxFlasks || 3} left): +${totalHeal} HP & Cleansed!`);
    return res;
  }

  /** [2 / RMB]: Shield Bash / Tactical Parry + Guard Barrier */
  triggerShieldBash() {
    const res = { fired: false, xpGained: 0, messages: [] };
    if (this.bashCooldown > 0 || this.stamina < 18) return res;
    this.stamina -= 18;
    this.bashCooldown = 4.0;
    this.build.parryBuffTimer = 2.8;
    this.build.recompute();
    const c = this.build.computed;
    const barrier = Math.round(c.maxHp * 0.16 + c.armor * 0.45);
    this.guardShield = Math.max(this.guardShield, barrier);
    this.playerBleedTimer = 0;
    res.fired = true;

    this._spawnFloatingText(this.x, this.y - 42, `GUARD +${barrier}`, 0.45, 0.85, 1.0, 11);
    this._spawnParticles(this.x, this.y - 10, 12, '+', 13, 0.95, 0.85, 0.3, 100);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) <= 76) {
        const out = this._applyHeroHit(e, 0.78, 0, 1.6, false);
        res.xpGained += out.xp;
        if (out.msg) res.messages.push(out.msg);
      }
    }
    return res;
  }

  /** [3]: Crimson Rend (360° AoE Bleed Whirlwind) */
  triggerRend() {
    const res = { fired: false, xpGained: 0, messages: [] };
    if (this.rendCooldown > 0 || this.stamina < 24) return res;
    this.stamina -= 24;
    this.rendCooldown = 6.0;
    this.slashTimer = 0.28;
    res.fired = true;

    this.swordArcs.push({
      x: this.x,
      y: this.y - 10,
      ang: 0,
      age: 0,
      life: 0.32,
      rad: 68,
      r: 0.96,
      g: 0.26,
      b: 0.34,
      whirl: true
    });

    this._spawnRiverSwordSplash(this.dirX, this.dirY);
    this._emitGrassImpulse(this.x, this.y + 4, this.dirX, this.dirY, 68, 16, 0.88, true);
    for (const d of this.destructibles) {
      if (!d.broken && Math.hypot(d.x - this.x, d.y - this.y) <= 84) {
        this._shatterDestructible(d, d.x - this.x, d.y - this.y, res);
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) <= 84) {
        const out = this._applyHeroHit(e, 1.45, 18, 0, true);
        res.xpGained += out.xp;
        if (out.msg) res.messages.push(out.msg);
      }
    }
    return res;
  }

  /** [4]: Bloodthirst Warrior Sustain (Heal + Guard + Cleanse + Crit/AtkSpd surge) */
  triggerBloodthirst() {
    const res = { fired: false, messages: [] };
    if (this.bloodCooldown > 0) return res;
    this.bloodCooldown = 10.0;
    this.build.bloodthirstTimer = 4.5;
    this.build.recompute();
    const heal = Math.round(this.build.computed.maxHp * 0.22);
    const guard = Math.round(this.build.computed.maxHp * 0.1);
    this.hp = Math.min(this.build.computed.maxHp, this.hp + heal);
    this.guardShield = Math.max(this.guardShield, guard);
    this.playerBleedTimer = 0;
    this.stamina = Math.min(this.build.computed.maxStamina, this.stamina + 30);
    this._spawnFloatingText(this.x, this.y - 44, `+${heal} HP & FURY`, 0.4, 0.95, 0.55, 12);
    this._spawnParticles(this.x, this.y - 12, 14, '*', 12, 1.0, 0.35, 0.3, 85);
    res.fired = true;
    res.messages.push(`Bloodthirst: +${heal} HP, +${guard} Guard, Bleed Cleansed!`);
    return res;
  }

  grantXp(amount) {
    this.build.xp += amount;
    let leveled = false;
    while (this.build.xp >= this.build.xpToNext) {
      this.build.xp -= this.build.xpToNext;
      this.build.level++;
      this.build.passivePoints++;
      this.build.might += 2;
      this.build.agility += 2;
      this.build.fortitude += 2;
      this.build.xpToNext = Math.round(this.build.xpToNext * 1.42);
      this.build.recompute();
      this.hp = this.build.computed.maxHp;
      this.stamina = this.build.computed.maxStamina;
      this.flasks = this.build.computed.maxFlasks || 3;
      this.playerBleedTimer = 0;
      leveled = true;
    }
    return leveled;
  }

  handlePlayerDeath() {
    const lostGold = Math.round(this.build.gold * 0.15);
    if (lostGold > 0) {
      this.build.gold -= lostGold;
      this.graveMarkers.push({ x: this.x, y: this.y, gold: lostGold, age: 0 });
    }
    this.x = this.lastCampfire.x;
    this.y = this.lastCampfire.y;
    if (this.isMounted) {
      this.horseX = this.x;
      this.horseY = this.y;
    }
    this.hp = Math.round(this.build.computed.maxHp * 0.65);
    this.guardShield = 0;
    this.playerBleedTimer = 0;
    this.combatTimer = 0;
    this.flasks = this.build.computed.maxFlasks || 3;
    this.bossEffects.length = 0;
    // Wounded bosses recover upon player wipe so boss encounters demand tactical survival!
    for (const e of this.enemies) {
      if (e.alive && e.isBoss && e.hp < e.maxHp) {
        e.hp = e.maxHp;
        e.enraged = false;
        e.windup = 0;
        e.specialWindup = false;
        e.x = e.homeX;
        e.y = e.homeY;
      }
    }
    return lostGold;
  }

  getNearbyInteractable() {
    for (const gm of this.graveMarkers) {
      if (Math.hypot(gm.x - this.x, gm.y - this.y) < 55) {
        return { type: 'grave', target: gm, label: `[E] Reclaim Soul Echo (+${gm.gold}g)` };
      }
    }
    for (const drop of this.lootDrops) {
      if (Math.hypot(drop.x - this.x, drop.y - this.y) < 52) {
        return { type: 'loot', target: drop, label: `[E] Equip/Take: ${drop.item.name}` };
      }
    }
    for (const b of this.enemies) {
      if (b.alive && b.isBoss && b.dialogue && Math.hypot(b.x - this.x, b.y - this.y) < 120) {
        return { type: 'boss_talk', target: b, label: `[E] Parley with ${b.name}` };
      }
    }
    for (const t of this.loreTomes) {
      if (Math.hypot(t.x - this.x, t.y - this.y) < 58) {
        return { type: 'lore', target: t, label: `[E] Read ${t.title}` };
      }
    }
    for (const c of this.chests) {
      if (!c.opened && Math.hypot(c.x - this.x, c.y - this.y) < 52) {
        return { type: 'chest', target: c, label: '[E] Open Ancient Chest' };
      }
    }
    for (const f of this.campfires) {
      if (Math.hypot(f.x - this.x, f.y - this.y) < 62) {
        return { type: 'campfire', target: f, label: '[E] Rest by Campfire (Full Heal & Refill Flasks)' };
      }
    }
    return null;
  }

  _tryMove(nx, ny) {
    if (nx < -WORLD_SIZE * 0.48 || nx > WORLD_SIZE * 0.48 || ny < -WORLD_SIZE * 0.48 || ny > WORLD_SIZE * 0.48) return false;
    if (this.worldMap.isCliffBlocked(nx, ny)) return false;
    for (const c of this.colliders) {
      if (Math.hypot(nx - c.x, ny - c.y) < c.r + 7) return false;
    }
    return true;
  }

  update(dt, elapsed, input) {
    const out = { damageToPlayer: 0, xpGained: 0, messages: [] };

    // Cooldowns & Buff Timers
    if (this.slashTimer > 0) this.slashTimer = Math.max(0, this.slashTimer - dt);
    if (this.slashCooldown > 0) this.slashCooldown = Math.max(0, this.slashCooldown - dt);
    if (this.bashCooldown > 0) this.bashCooldown = Math.max(0, this.bashCooldown - dt);
    if (this.rendCooldown > 0) this.rendCooldown = Math.max(0, this.rendCooldown - dt);
    if (this.bloodCooldown > 0) this.bloodCooldown = Math.max(0, this.bloodCooldown - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.evadeIframeTimer > 0) this.evadeIframeTimer = Math.max(0, this.evadeIframeTimer - dt);
    if (this.shakeIntensity > 0) this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 16);

    const hadParry = this.build.parryBuffTimer > 0;
    const hadBlood = this.build.bloodthirstTimer > 0;
    if (this.build.parryBuffTimer > 0) this.build.parryBuffTimer = Math.max(0, this.build.parryBuffTimer - dt);
    if (this.build.bloodthirstTimer > 0) this.build.bloodthirstTimer = Math.max(0, this.build.bloodthirstTimer - dt);
    if ((hadParry && this.build.parryBuffTimer === 0) || (hadBlood && this.build.bloodthirstTimer === 0)) {
      this.build.recompute();
    }

    // Smooth Continuous Movement, Rotational Turning Arcs & Acceleration/Braking Inertia
    const moveSpdMult = 1 + (this.build.computed.moveSpdPct || 0) / 100;
    let mx = input.right;
    let my = -input.forward;
    const mLen = Math.hypot(mx, my);

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      const dashSpd = 385 * moveSpdMult;
      const dx = this.dashDirX * dashSpd * dt;
      const dy = this.dashDirY * dashSpd * dt;
      if (this._tryMove(this.x + dx, this.y)) this.x += dx;
      if (this._tryMove(this.x, this.y + dy)) this.y += dy;
      this.vx = this.dashDirX * dashSpd;
      this.vy = this.dashDirY * dashSpd;
      if (Math.floor(this.dashTimer * 40) !== Math.floor((this.dashTimer + dt) * 40)) {
        this.dashGhosts.push({
          x: this.x,
          y: this.y,
          facing: this.facing,
          yaw: this.yaw,
          mounted: this.isMounted,
          age: 0,
          life: 0.28
        });
      }
    } else {
      if (mLen > 0.01) {
        mx /= mLen;
        my /= mLen;
        const targetYaw = Math.atan2(my, mx);
        const turnRate = this.isMounted ? 6.2 : 10.4; // Smooth equestrian sweeps, zero sudden snaps!
        this.yaw = rotateTowardAngle(this.yaw, targetYaw, turnRate * dt);

        this.isGalloping = input.sprint && this.stamina > 8;
        if (this.isGalloping) this.stamina = Math.max(0, this.stamina - 16 * dt);
        else this.stamina = Math.min(this.build.computed.maxStamina, this.stamina + 20 * dt);

        let diff = Math.abs(targetYaw - this.yaw);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        const turnFactor = this.isMounted ? 0.56 + 0.44 * Math.max(0, Math.cos(diff)) : 0.78 + 0.22 * Math.max(0, Math.cos(diff));

        const baseSpd = this.isMounted ? (this.isGalloping ? 225 : 148) : (this.isGalloping ? 148 : 104);
        const waterSlow = this.inWater ? 0.62 : 1.0;
        const webSlow = this.webbedTimer > 0 ? 0.55 : 1.0;
        const targetSpd = baseSpd * waterSlow * webSlow * moveSpdMult * turnFactor;
        const accel = this.isMounted ? 420 : 540;
        this.currentSpeed = Math.min(targetSpd, this.currentSpeed + accel * dt);
        if (this.currentSpeed > targetSpd) {
          this.currentSpeed = Math.max(targetSpd, this.currentSpeed - accel * 0.8 * dt);
        }
      } else {
        this.isGalloping = false;
        this.stamina = Math.min(this.build.computed.maxStamina, this.stamina + 26 * dt);
        const decel = this.isMounted ? 360 : 520;
        this.currentSpeed = Math.max(0, this.currentSpeed - decel * dt);
      }

      this.dirX = Math.cos(this.yaw);
      this.dirY = Math.sin(this.yaw);
      this.facing = Math.abs(this.dirX) > Math.abs(this.dirY) ? (this.dirX > 0 ? 'right' : 'left') : this.dirY > 0 ? 'down' : 'up';

      if (this.currentSpeed > 1) {
        this.vx = this.dirX * this.currentSpeed;
        this.vy = this.dirY * this.currentSpeed;
        const stepX = this.vx * dt;
        const stepY = this.vy * dt;
        if (this._tryMove(this.x + stepX, this.y)) this.x += stepX;
        if (this._tryMove(this.x, this.y + stepY)) this.y += stepY;
      } else {
        this.vx = 0;
        this.vy = 0;
      }
    }

    this.isMoving = this.currentSpeed > 14 || this.dashTimer > 0;

    if (this.isMounted) {
      this.horseX = this.x;
      this.horseY = this.y;
      this.horseYaw = rotateTowardAngle(this.horseYaw, this.yaw, 9.5 * dt);
      this.horseFacing = this.facing;
    } else if (this.callingHorse) {
      const hdx = this.x - this.horseX;
      const hdy = this.y - this.horseY;
      const d = Math.hypot(hdx, hdy);
      if (d < 42) {
        this.callingHorse = false;
        this.isMounted = true;
      } else {
        const targetHYaw = Math.atan2(hdy, hdx);
        this.horseYaw = rotateTowardAngle(this.horseYaw, targetHYaw, 8.5 * dt);
        this.horseX += Math.cos(this.horseYaw) * 210 * dt;
        this.horseY += Math.sin(this.horseYaw) * 210 * dt;
        this.horseFacing = Math.abs(hdx) > Math.abs(hdy) ? (hdx > 0 ? 'right' : 'left') : hdy > 0 ? 'down' : 'up';
      }
    }

    this.gaitPhase += dt * (this.isMoving ? (this.isGalloping ? 12.5 : 8.5) * (0.4 + 0.6 * clamp(this.currentSpeed / 140, 0, 1.3)) : 0);
    this.gallopBlend = lerp(this.gallopBlend, this.isGalloping && this.isMoving ? 1 : 0, Math.min(1, dt * 8));
    const targetZ = this.worldMap.getWalkZ ? this.worldMap.getWalkZ(this.x, this.y) : 0;
    this.z = lerp(this.z, targetZ, Math.min(1, dt * 11));

    // Combat Health State: zero passive regen in active combat; Flask HoT, Guard & Bleed!
    if (this.combatTimer > 0) this.combatTimer = Math.max(0, this.combatTimer - dt);
    if (this.flaskCooldown > 0) this.flaskCooldown = Math.max(0, this.flaskCooldown - dt);
    if (this.flaskHotTimer > 0) {
      this.flaskHotTimer = Math.max(0, this.flaskHotTimer - dt);
      this.hp = Math.min(this.build.computed.maxHp, this.hp + (this.flaskHealRate || 0) * dt);
    }
    if (this.playerBleedTimer > 0) {
      this.playerBleedTimer = Math.max(0, this.playerBleedTimer - dt);
      const bLoss = this.playerBleedDps * dt;
      this.hp = Math.max(1, this.hp - bLoss);
      if (Math.floor(this.playerBleedTimer * 1.5) !== Math.floor((this.playerBleedTimer + dt) * 1.5)) {
        this._spawnFloatingText(this.x, this.y - 30, `-${Math.max(1, Math.round(this.playerBleedDps * 0.65))} BLEED`, 0.96, 0.22, 0.26, 9);
      }
    } else if (this.combatTimer <= 0) {
      const mHp = this.build.computed.maxHp;
      this.hp = Math.min(mHp, this.hp + (1.2 + mHp * 0.01) * dt);
      if (this.guardShield > 0) this.guardShield = Math.max(0, this.guardShield - 6 * dt);
    }

    // Water & Finite Particles (ONLY emit when actively moving in water!)
    this.inWater = this.worldMap.isWater(this.x, this.y);
    if (this.inWater && (this.isMoving || this.dashTimer > 0)) {
      this.moveWakeGrace = 0.08;
    } else {
      this.moveWakeGrace = Math.max(0, this.moveWakeGrace - dt);
    }

    if (this.moveWakeGrace > 0) {
      this.wakeSpawnAccum += dt;
      while (this.wakeSpawnAccum >= 0.085) {
        this.wakeSpawnAccum -= 0.085;
        const p = this.wakeParticles.find((w) => !w.active);
        if (p) {
          p.active = true;
          p.x = this.x + (this.rng() - 0.5) * 14;
          p.y = this.y + 4 + (this.rng() - 0.5) * 8;
          p.vx = -this.dirX * 18 + (this.rng() - 0.5) * 20;
          p.vy = -this.dirY * 18 + (this.rng() - 0.5) * 18;
          p.age = 0;
          p.life = 0.36 + this.rng() * 0.2;
          p.ch = this.rng() > 0.5 ? 'o' : '~';
          p.size = 9 + this.rng() * 4;
        }
      }
      this.rippleSpawnAccum += dt;
      while (this.rippleSpawnAccum >= 0.25) {
        this.rippleSpawnAccum -= 0.25;
        const r = this.rippleRings.find((rr) => !rr.active);
        if (r) {
          r.active = true;
          r.x = this.x;
          r.y = this.y + 4;
          r.age = 0;
          r.life = 0.72;
        }
      }
    }

    for (const p of this.wakeParticles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) p.active = false;
      else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    for (const rr of this.rippleRings) {
      if (!rr.active) continue;
      rr.age += dt;
      if (rr.age >= rr.life) rr.active = false;
    }

    // Persistent springy grass wakes left behind footsteps/hooves & sword wind blasts!
    if (!this.inWater && this.isMoving) {
      const movedSinceWake = Math.hypot(this.x - this.lastGrassTrailX, this.y - this.lastGrassTrailY);
      if (movedSinceWake >= 11) {
        this.lastGrassTrailX = this.x;
        this.lastGrassTrailY = this.y;
        this._emitGrassImpulse(this.x, this.y + 5, this.dirX, this.dirY, this.isMounted ? 30 : 21, this.isGalloping ? 13 : 9.5, 1.35, false);
      }
    }
    for (let i = this.grassImpulses.length - 1; i >= 0; i--) {
      this.grassImpulses[i].age += dt;
      if (this.grassImpulses[i].age >= this.grassImpulses[i].life) this.grassImpulses.splice(i, 1);
    }

    // Waterfall mist & ambient spores
    for (const p of this.waterfallParticles) {
      p.age += dt;
      if (p.age >= p.life) this._resetWaterfallParticle(p, false);
      else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    for (const m of this.ambientMotifs) {
      m.x += (m.vx + Math.sin(elapsed * 1.4 + m.phase) * 8) * dt;
      m.y += m.vy * dt;
      if (m.autumn && m.y > this.worldMap.mirrorLakeY + 170) m.y = this.worldMap.mirrorLakeY - 170;
    }

    // Dash Ghosts, Sword Arcs, Combat Sparks, Floating Combat Text
    for (let i = this.dashGhosts.length - 1; i >= 0; i--) {
      this.dashGhosts[i].age += dt;
      if (this.dashGhosts[i].age >= this.dashGhosts[i].life) this.dashGhosts.splice(i, 1);
    }
    for (let i = this.swordArcs.length - 1; i >= 0; i--) {
      this.swordArcs[i].age += dt;
      if (this.swordArcs[i].age >= this.swordArcs[i].life) this.swordArcs.splice(i, 1);
    }
    for (const cp of this.combatParticles) {
      if (!cp.active) continue;
      cp.age += dt;
      if (cp.age >= cp.life) cp.active = false;
      else {
        cp.x += cp.vx * dt;
        cp.y += cp.vy * dt;
      }
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].age += dt;
      this.floatingTexts[i].y -= 24 * dt;
      if (this.floatingTexts[i].age >= this.floatingTexts[i].life) this.floatingTexts.splice(i, 1);
    }

    // Rainstorm + Lightning Flash + Flying Shattered Debris + Spiderweb Snares
    if (this.rainEnabled) {
      if (this.lightningFlash > 0) this.lightningFlash = Math.max(0, this.lightningFlash - dt * 2.4);
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningFlash = 0.85;
        this.lightningTimer = 6.0 + this.rng() * 8.0;
      }
      for (const rd of this.rainDrops) {
        if (rd.splashing) {
          rd.splashAge += dt;
          if (rd.splashAge > 0.32) {
            rd.splashing = false;
            rd.ox = (this.rng() - 0.5) * 900;
            rd.oy = -340 - this.rng() * 140;
          }
        } else {
          rd.ox -= rd.speed * 0.22 * dt;
          rd.oy += rd.speed * dt;
          if (rd.oy > 340) {
            rd.splashing = true;
            rd.splashAge = 0;
          }
        }
      }
    } else {
      this.lightningFlash = 0;
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const db = this.debris[i];
      db.age += dt;
      if (db.age >= db.life) {
        this.debris.splice(i, 1);
        continue;
      }
      db.x += db.vx * dt;
      db.y += db.vy * dt;
      db.vz -= 290 * dt;
      db.z += db.vz * dt;
      if (db.z < 0) {
        db.z = 0;
        db.vz = -db.vz * 0.35;
        db.vx *= 0.65;
        db.vy *= 0.65;
      }
    }

    if (this.webbedTimer > 0) this.webbedTimer = Math.max(0, this.webbedTimer - dt);
    for (let i = this.cobwebs.length - 1; i >= 0; i--) {
      const cw = this.cobwebs[i];
      cw.age += dt;
      if (cw.age >= cw.life) {
        this.cobwebs.splice(i, 1);
        continue;
      }
      if (Math.hypot(cw.x - this.x, cw.y - this.y) < cw.radius && this.evadeIframeTimer <= 0) {
        if (this.webbedTimer <= 0) this._spawnFloatingText(this.x, this.y - 34, 'WEBBED!', 0.85, 0.95, 1.0, 10);
        this.webbedTimer = 0.35;
      }
    }

    // Update active Boss Special Projectiles / Shockwaves / Fissures
    const c = this.build.computed;
    this._updateBossEffects(dt, out, c);

    // Enemies Tactical AI, Multi-State Animation & Multi-Layer Player Defense (Evasion -> Block -> Armor -> Thorns)
    for (const e of this.enemies) {
      if (!e.alive) {
        e.respawnTimer -= dt;
        if (e.respawnTimer <= 0) {
          e.alive = true;
          e.hp = e.maxHp;
          e.x = e.homeX;
          e.y = e.homeY;
          e.stunTimer = 0;
          e.bleedTimer = 0;
          e.windup = 0;
          e.strikeTimer = 0;
          e.specialWindup = false;
          e.specialActive = false;
          e.animState = 'idle';
        }
        continue;
      }

      e.animTimer = (e.animTimer || 0) + dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.atkCooldown > 0) e.atkCooldown = Math.max(0, e.atkCooldown - dt);
      if (e.strikeTimer > 0) {
        e.strikeTimer = Math.max(0, e.strikeTimer - dt);
        if (e.strikeTimer === 0) e.specialActive = false;
      }
      if (e.isBoss && e.specialCooldown > 0) e.specialCooldown = Math.max(0, e.specialCooldown - dt);

      if (e.stunTimer > 0) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
        e.moving = false;
        e.windup = 0;
        e.specialWindup = false;
        e.animState = 'stagger';
        continue;
      }

      if (e.bleedTimer > 0) {
        e.bleedTimer = Math.max(0, e.bleedTimer - dt);
        const bleedChunk = e.bleedDps * dt;
        e.hp -= bleedChunk;
        if (Math.floor(e.bleedTimer * 2) !== Math.floor((e.bleedTimer + dt) * 2)) {
          this._spawnFloatingText(e.x, e.y - 24, `-${Math.round(e.bleedDps * 0.5)} BLD`, 0.96, 0.28, 0.35, 10);
        }
        if (e.hp <= 0) {
          e.hp = 0;
          e.alive = false;
          e.respawnTimer = e.isBoss ? 45 : 22;
          this.kills++;
          out.xpGained += e.xpReward;
          out.messages.push(`${e.name} succumbed to Bleed! +${e.xpReward} XP`);
          continue;
        }
      }

      const dx = this.x - e.x;
      const dy = this.y - e.y;
      const dist = Math.hypot(dx, dy);

      if (e.windup > 0) {
        e.windup -= dt;
        e.moving = false;
        e.dirX = dx / Math.max(1, dist);
        e.dirY = dy / Math.max(1, dist);
        if (e.windup <= 0) {
          e.strikeTimer = e.specialWindup ? 0.44 : 0.34;
          e.specialActive = e.specialWindup;
          if (e.specialWindup) {
            this._triggerBossSpecial(e, out, c);
            e.specialWindup = false;
          } else {
            if (e.kind === 'lich_boss') {
              // Ranged bone-lance projectile even on primary attack
              this.bossEffects.push({
                kind: 'bolt',
                owner: e,
                x: e.x,
                y: e.y,
                vx: e.dirX * 230,
                vy: e.dirY * 230,
                radius: 16,
                dmg: e.dmg,
                ch: '*',
                r: 0.68,
                g: 0.85,
                b: 1.0,
                age: 0,
                life: 1.35,
                hitPlayer: false
              });
            } else if (dist <= e.atkRange + 24) {
              this._resolvePlayerDamage(e, e.dmg, out, c);
            }
          }
          e.atkCooldown = e.isBoss ? 1.45 : 1.35;
        }
      } else if (dist < e.aggroRange && !e.isBoss) {
        e.dirX = dx / Math.max(1, dist);
        e.dirY = dy / Math.max(1, dist);
        if (dist > e.atkRange * 0.85) {
          const step = e.speed * dt;
          if (!this.worldMap.isCliffBlocked(e.x + e.dirX * step, e.y + e.dirY * step)) {
            e.x += e.dirX * step;
            e.y += e.dirY * step;
          }
          e.moving = true;
        } else {
          e.moving = false;
          if (e.atkCooldown <= 0) {
            e.specialWindup = false;
            e.windup = e.windupMax;
          }
        }
      } else if (e.isBoss && (e.hp < e.maxHp || dist < 115 || e.kind === 'spider_boss')) {
        e.dirX = dx / Math.max(1, dist);
        e.dirY = dy / Math.max(1, dist);
        if (e.kind === 'spider_boss' && dist < 240) {
          e.webCooldown = (e.webCooldown || 0) - dt;
          if (e.webCooldown <= 0) {
            e.webCooldown = 4.2;
            this.cobwebs.push({
              x: this.x + (this.rng() - 0.5) * 32,
              y: this.y + (this.rng() - 0.5) * 24,
              radius: 36,
              age: 0,
              life: 14.0
            });
            this._spawnParticles(e.x, e.y, 14, '*', 12, 0.72, 0.92, 1.0, 125);
          }
        }
        const specialRange = e.kind === 'lich_boss' || e.kind === 'dragon' ? e.atkRange * 1.65 : e.atkRange * 1.25;
        if (e.specialCooldown <= 0 && dist <= specialRange && e.atkCooldown <= 0) {
          e.moving = false;
          e.specialWindup = true;
          e.windup = e.windupMax * 1.18;
          e.specialCooldown = e.kind === 'lich_boss' ? 5.0 : 5.8;
          const labels = {
            warden_boss: 'WHIRLWIND!',
            dragon: 'ASHEN BREATH!',
            spider_boss: 'VENOM BARRAGE!',
            lich_boss: 'BONE NOVA!',
            golem_boss: 'SEISMIC SLAM!',
            hydra_boss: 'TIDAL VENOM!',
            reaper_boss: 'SOLAR JUDGEMENT!',
            behemoth_boss: 'ASTRAL SUPERNOVA!'
          };
          this._spawnFloatingText(e.x, e.y - 46, labels[e.kind] || 'SURGE!', 1.0, 0.55, 0.25, 11);
        } else if (dist < 320 && dist > e.atkRange * 0.85) {
          const step = e.speed * dt;
          if (!this.worldMap.isCliffBlocked(e.x + e.dirX * step, e.y + e.dirY * step)) {
            e.x += e.dirX * step;
            e.y += e.dirY * step;
          }
          e.moving = true;
          if (Math.floor(e.animTimer * 3.5) !== Math.floor((e.animTimer - dt) * 3.5)) {
            this._emitGrassImpulse(e.x, e.y + 8, e.dirX, e.dirY, 34, e.kind === 'golem_boss' ? 14 : 9, 0.9, false);
          }
        } else {
          e.moving = false;
          if (e.atkCooldown <= 0 && dist <= e.atkRange + 14) {
            e.specialWindup = false;
            e.windup = e.windupMax;
          }
        }
      } else {
        e.moving = false;
        const hd = Math.hypot(e.homeX - e.x, e.homeY - e.y);
        if (hd > 18) {
          e.x += ((e.homeX - e.x) / hd) * e.speed * 0.5 * dt;
          e.y += ((e.homeY - e.y) / hd) * e.speed * 0.5 * dt;
          e.moving = true;
        }
      }

      e.animState =
        e.stunTimer > 0
          ? 'stagger'
          : e.windup > 0
            ? (e.specialWindup ? 'special_windup' : 'windup')
            : e.strikeTimer > 0
              ? (e.specialActive ? 'special' : 'strike')
              : e.moving
                ? 'walk'
                : 'idle';
    }

    // Living MMORPG Adventurers wandering cleanly
    for (const a of this.adventurers) {
      const ang = elapsed * 0.35 + a.phase;
      const tx = a.homeX + Math.cos(ang) * 75;
      const ty = a.homeY + Math.sin(ang * 0.8) * 55;
      const adx = tx - a.x;
      const ady = ty - a.y;
      const ad = Math.hypot(adx, ady);
      if (ad > 4) {
        a.dirX = adx / ad;
        a.dirY = ady / ad;
        a.x += a.dirX * 42 * dt;
        a.y += a.dirY * 42 * dt;
        a.moving = true;
      } else {
        a.moving = false;
      }
      if (a.slashTimer > 0) a.slashTimer = Math.max(0, a.slashTimer - dt);
    }

    return out;
  }

  _resolvePlayerDamage(sourceEnemy, rawDmg, out, c) {
    this.combatTimer = 6.5;
    if (this.evadeIframeTimer > 0 || this.rng() * 100 < c.evasion) {
      this._spawnFloatingText(this.x, this.y - 34, 'EVADED!', 0.45, 0.96, 0.88, 11);
      return 0;
    }
    let incoming = rawDmg * (1 - c.armorReductionPct / 100);
    const blocked = this.rng() * 100 < c.blockChance;
    if (blocked) {
      incoming *= this.build.parryBuffTimer > 0 ? 0.18 : 0.32;
      this._spawnFloatingText(this.x, this.y - 34, 'BLOCKED!', 0.45, 0.78, 1.0, 11);
      if (sourceEnemy && c.thornsPct > 0) {
        const ret = Math.max(2, Math.round((rawDmg - incoming) * (c.thornsPct / 100)));
        sourceEnemy.hp = Math.max(1, sourceEnemy.hp - ret);
        this._spawnFloatingText(sourceEnemy.x, sourceEnemy.y - 20, `THORN ${ret}`, 0.95, 0.65, 0.3, 10);
      }
    }
    let taken = Math.max(1, Math.round(incoming));
    if (this.guardShield > 0) {
      const absorbed = Math.min(this.guardShield, taken);
      this.guardShield -= absorbed;
      taken -= absorbed;
      this._spawnFloatingText(this.x, this.y - 38, `GUARDED -${absorbed}`, 0.48, 0.86, 1.0, 10);
    }
    if (taken > 0) {
      this.hp = Math.max(0, this.hp - taken);
      out.damageToPlayer += taken;
      this._spawnFloatingText(this.x, this.y - 24, `-${taken}`, 1.0, 0.25, 0.25, 12);
      if (!blocked && (rawDmg >= 20 || (sourceEnemy && (sourceEnemy.kind === 'wolf' || sourceEnemy.kind === 'spider_boss' || sourceEnemy.kind === 'hydra_boss'))) && this.rng() < 0.32) {
        this.playerBleedTimer = 4.0;
        this.playerBleedDps = Math.max(2, Math.round(rawDmg * 0.14));
        this._spawnFloatingText(this.x, this.y - 46, 'WOUNDED!', 1.0, 0.35, 0.35, 10);
      }
    }
    return taken;
  }

  _triggerBossSpecial(e, out, c) {
    const baseAng = Math.atan2(this.y - e.y, this.x - e.x);
    if (e.kind === 'warden_boss') {
      // 360° Whirlwind Cleave ring
      this.bossEffects.push({
        kind: 'ring',
        owner: e,
        x: e.x,
        y: e.y,
        maxRadius: 96,
        dmg: Math.round(e.dmg * 1.45),
        ch: '/',
        r: 1.0,
        g: 0.48,
        b: 0.22,
        age: 0,
        life: 0.48,
        hitPlayer: false
      });
      this._emitGrassImpulse(e.x, e.y, 0, 0, 96, 18, 1.15, true);
      this.shakeIntensity = Math.max(this.shakeIntensity, 4.5);
      this._spawnParticles(e.x, e.y, 18, '/', 13, 1.0, 0.65, 0.3, 160);
    } else if (e.kind === 'dragon') {
      // Sweeping 5-bolt Ashen Fire Breath Cone
      for (let i = -2; i <= 2; i++) {
        const a = baseAng + i * 0.22;
        this.bossEffects.push({
          kind: 'bolt',
          owner: e,
          x: e.x + Math.cos(a) * 26,
          y: e.y + Math.sin(a) * 26,
          vx: Math.cos(a) * 240,
          vy: Math.sin(a) * 240,
          radius: 22,
          dmg: Math.round(e.dmg * 1.25),
          ch: i % 2 === 0 ? '#' : '*',
          r: 1.0,
          g: 0.36,
          b: 0.12,
          age: 0,
          life: 0.95,
          hitPlayer: false
        });
      }
      this._emitGrassImpulse(e.x + Math.cos(baseAng) * 55, e.y + Math.sin(baseAng) * 55, Math.cos(baseAng), Math.sin(baseAng), 72, 16, 1.05, true);
      this.shakeIntensity = Math.max(this.shakeIntensity, 5.0);
    } else if (e.kind === 'spider_boss') {
      // Venom Silk Barrage (3 fan projectiles + fresh snare)
      for (let i = -1; i <= 1; i++) {
        const a = baseAng + i * 0.28;
        this.bossEffects.push({
          kind: 'bolt',
          owner: e,
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 255,
          vy: Math.sin(a) * 255,
          radius: 17,
          dmg: Math.round(e.dmg * 1.15),
          ch: 'x',
          r: 0.72,
          g: 0.95,
          b: 0.55,
          age: 0,
          life: 1.05,
          hitPlayer: false
        });
      }
      this._spawnParticles(e.x, e.y, 16, '*', 11, 0.75, 0.95, 1.0, 145);
    } else if (e.kind === 'lich_boss') {
      // Cinderbone Nova Ring + 6 Orbiting Bone-Bolts!
      this.bossEffects.push({
        kind: 'ring',
        owner: e,
        x: e.x,
        y: e.y,
        maxRadius: 138,
        dmg: Math.round(e.dmg * 1.3),
        ch: '+',
        r: 0.58,
        g: 0.85,
        b: 1.0,
        age: 0,
        life: 0.72,
        hitPlayer: false
      });
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 + (e.animTimer || 0) * 0.5;
        this.bossEffects.push({
          kind: 'bolt',
          owner: e,
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 195,
          vy: Math.sin(a) * 195,
          radius: 15,
          dmg: Math.round(e.dmg * 1.05),
          ch: '✦',
          r: 0.75,
          g: 0.65,
          b: 1.0,
          age: 0,
          life: 1.25,
          hitPlayer: false
        });
      }
      this.shakeIntensity = Math.max(this.shakeIntensity, 4.2);
      this._spawnParticles(e.x, e.y, 20, '+', 12, 0.65, 0.88, 1.0, 155);
    } else if (e.kind === 'golem_boss') {
      // Seismic Fissure Slam (Shockwave Ring + 3 Shattering Earth Fissures + Flying Rocks!)
      this.bossEffects.push({
        kind: 'ring',
        owner: e,
        x: e.x,
        y: e.y,
        maxRadius: 125,
        dmg: Math.round(e.dmg * 1.45),
        ch: '^',
        r: 1.0,
        g: 0.58,
        b: 0.16,
        age: 0,
        life: 0.58,
        hitPlayer: false
      });
      for (let i = -1; i <= 1; i++) {
        const a = baseAng + i * 0.34;
        this.bossEffects.push({
          kind: 'bolt',
          owner: e,
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 215,
          vy: Math.sin(a) * 215,
          radius: 20,
          dmg: Math.round(e.dmg * 1.2),
          ch: '#',
          r: 0.95,
          g: 0.45,
          b: 0.15,
          age: 0,
          life: 1.05,
          hitPlayer: false
        });
      }
      this._emitGrassImpulse(e.x, e.y, 0, 0, 125, 22, 1.35, true);
      this.shakeIntensity = Math.max(this.shakeIntensity, 7.0);
      this._spawnParticles(e.x, e.y, 22, '#', 14, 0.98, 0.55, 0.22, 170);
    } else if (e.kind === 'hydra_boss') {
      // Triple Acidic Fang Volley + Tidal Surge Ring!
      this.bossEffects.push({
        kind: 'ring',
        owner: e,
        x: e.x,
        y: e.y,
        maxRadius: 118,
        dmg: Math.round(e.dmg * 1.35),
        ch: '~',
        r: 0.35,
        g: 0.95,
        b: 0.85,
        age: 0,
        life: 0.62,
        hitPlayer: false
      });
      const count = e.enraged ? 5 : 3;
      const half = Math.floor(count / 2);
      for (let i = -half; i <= half; i++) {
        const a = baseAng + i * 0.24;
        this.bossEffects.push({
          kind: 'bolt',
          owner: e,
          x: e.x + Math.cos(a) * 20,
          y: e.y + Math.sin(a) * 20,
          vx: Math.cos(a) * 245,
          vy: Math.sin(a) * 245,
          radius: 18,
          dmg: Math.round(e.dmg * 1.15),
          ch: 'o',
          r: 0.42,
          g: 1.0,
          b: 0.62,
          age: 0,
          life: 1.15,
          hitPlayer: false
        });
      }
      this.shakeIntensity = Math.max(this.shakeIntensity, 4.5);
    } else if (e.kind === 'reaper_boss') {
      // Malphas Solar Cross Beams + Judgment Ring!
      this.bossEffects.push({
        kind: 'ring',
        owner: e,
        x: e.x,
        y: e.y,
        maxRadius: 132,
        dmg: Math.round(e.dmg * 1.38),
        ch: '✦',
        r: 1.0,
        g: 0.65,
        b: 0.18,
        age: 0,
        life: 0.65,
        hitPlayer: false
      });
      const dirs = e.enraged ? 6 : 4;
      for (let i = 0; i < dirs; i++) {
        const a = baseAng + (i / dirs) * Math.PI * 2;
        this.bossEffects.push({
          kind: 'bolt',
          owner: e,
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 265,
          vy: Math.sin(a) * 265,
          radius: 18,
          dmg: Math.round(e.dmg * 1.2),
          ch: '/',
          r: 1.0,
          g: 0.78,
          b: 0.24,
          age: 0,
          life: 1.1,
          hitPlayer: false
        });
      }
      this.shakeIntensity = Math.max(this.shakeIntensity, 5.5);
    } else if (e.kind === 'behemoth_boss') {
      // Pale Sovereign Astral Supernova + 8-Way Starburst!
      this.bossEffects.push({
        kind: 'ring',
        owner: e,
        x: e.x,
        y: e.y,
        maxRadius: 155,
        dmg: Math.round(e.dmg * 1.45),
        ch: '*',
        r: 0.52,
        g: 0.92,
        b: 1.0,
        age: 0,
        life: 0.72,
        hitPlayer: false
      });
      const stars = e.enraged ? 10 : 8;
      for (let i = 0; i < stars; i++) {
        const a = (i / stars) * Math.PI * 2 + (e.animTimer || 0) * 0.4;
        this.bossEffects.push({
          kind: 'bolt',
          owner: e,
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 235,
          vy: Math.sin(a) * 235,
          radius: 18,
          dmg: Math.round(e.dmg * 1.18),
          ch: '✦',
          r: 0.55,
          g: 0.94,
          b: 1.0,
          age: 0,
          life: 1.35,
          hitPlayer: false
        });
      }
      this.shakeIntensity = Math.max(this.shakeIntensity, 6.8);
      this._emitGrassImpulse(e.x, e.y, 0, 0, 145, 24, 1.3, true);
    }
  }

  _updateBossEffects(dt, out, c) {
    for (let i = this.bossEffects.length - 1; i >= 0; i--) {
      const fx = this.bossEffects[i];
      fx.age += dt;
      if (fx.age >= fx.life) {
        this.bossEffects.splice(i, 1);
        continue;
      }
      if (fx.kind === 'bolt') {
        fx.x += fx.vx * dt;
        fx.y += fx.vy * dt;
        if (!fx.hitPlayer && Math.hypot(fx.x - this.x, fx.y - this.y) <= fx.radius) {
          fx.hitPlayer = true;
          this._resolvePlayerDamage(fx.owner, fx.dmg, out, c);
        }
      } else if (fx.kind === 'ring') {
        const curR = (fx.age / fx.life) * fx.maxRadius;
        const d = Math.hypot(this.x - fx.x, this.y - fx.y);
        if (!fx.hitPlayer && Math.abs(d - curR) < 22) {
          fx.hitPlayer = true;
          this._resolvePlayerDamage(fx.owner, fx.dmg, out, c);
        }
      }
    }
  }

  /**
   * 100% PURE ASCII SCENE RENDERER (ZERO canvas drawings/rectangles on screen!)
   */
  render(renderer, cam, elapsed) {
    renderer.beginFrame();

    const viewW = cam.vw / cam.zoom;
    const viewH = cam.vh / (cam.zoom * WORLD_TILT_Y);
    const minX = cam.x - viewW * 0.51;
    const maxX = cam.x + viewW * 0.51;
    const minY = cam.y - viewH * 0.52 - 55;
    const maxY = cam.y + viewH * 0.52 + 75;

    const toScreenX = (wx) => (wx - cam.x) * cam.zoom + cam.vw * 0.5;
    const toScreenY = (wy, wz = 0) => ((wy - cam.y) * WORLD_TILT_Y - wz * LIFT_Z) * cam.zoom + cam.vh * 0.5;
    const lp = this.getLanternPos();
    const gScale = cam.zoom * (cam.glyphScale || 1.0);
    const slashProgress = this.slashTimer > 0 ? 1.0 - this.slashTimer / this.slashDuration : 0;
    const entityLod = clamp(cam.zoom / 1.12, 0.5, 1.0);
    const propLod = clamp(cam.zoom / 1.18, 0.44, 1.0);
    const lodTier = Math.round(propLod * 4);
    const scaledSprite = (bCols, bRows, bCell) => {
      const cols = Math.max(20, Math.round(bCols * entityLod));
      const rows = Math.max(20, Math.round(bRows * entityLod));
      return { cols, rows, cellScreenSize: bCell * (bCols / cols) * gScale };
    };
    const scaledProp = (bCols, bRows, bCell) => {
      const cols = Math.max(8, Math.round(bCols * propLod));
      const rows = Math.max(8, Math.round(bRows * propLod));
      return { cols, rows, cellScreenSize: bCell * (bCols / cols) * gScale };
    };

    // 0. REACHABLE DISTANT HORIZON VISTA (Looming Pale Citadel, Crimson Obelisks & Elderwood Skyline!)
    this._emitDistantHorizonVista(renderer, cam, minX, maxX, minY, toScreenX, gScale, elapsed);

    // Gather directional 2.5D shadow casters (trees, boulders, monoliths, Hero, Horse & Mobs)
    const shadowCasters = [];
    for (const t of this.trees) {
      if (t.x > minX - 100 && t.x < maxX + 100 && t.y > minY - 100 && t.y < maxY + 100 && t.kind !== 'dead') {
        shadowCasters.push({ x: t.x + 12, y: t.y + 8, rx: 42 * t.scale, ry: 28 * t.scale });
      }
    }
    for (const b of this.boulders) {
      if (b.x > minX - 70 && b.x < maxX + 70 && b.y > minY - 70 && b.y < maxY + 70) {
        shadowCasters.push({ x: b.x + 10, y: b.y + 10, rx: b.rx * 1.15, ry: b.ry * 0.85 });
      }
    }
    shadowCasters.push({ x: this.x + 8, y: this.y + 12, rx: this.isMounted ? 26 : 15, ry: 12 });
    for (const e of this.enemies) {
      if (!e.alive || e.x < minX - 90 || e.x > maxX + 90 || e.y < minY - 90 || e.y > maxY + 90) continue;
      shadowCasters.push({ x: e.x + 10, y: e.y + 12, rx: e.kind === 'spider_boss' || e.kind === 'golem_boss' ? 40 : e.isBoss ? 32 : 15, ry: e.kind === 'spider_boss' || e.kind === 'golem_boss' ? 24 : e.isBoss ? 16 : 8 });
    }

    // Physical Grass Collision Crushers (Download(4).mp4: parted & trampled radially around feet/hooves/bosses!)
    const grassCrushers = [{ x: this.x, y: this.y + 6, r: this.isMounted ? 26 : 17 }];
    if (!this.isMounted) grassCrushers.push({ x: this.horseX, y: this.horseY + 6, r: 22 });
    for (const a of this.adventurers) {
      if (a.x > minX - 40 && a.x < maxX + 40 && a.y > minY - 40 && a.y < maxY + 40) {
        grassCrushers.push({ x: a.x, y: a.y + 5, r: a.mounted ? 22 : 16 });
      }
    }
    for (const e of this.enemies) {
      if (e.alive && e.x > minX - 60 && e.x < maxX + 60 && e.y > minY - 60 && e.y < maxY + 60) {
        grassCrushers.push({ x: e.x, y: e.y + 6, r: e.kind === 'spider_boss' || e.kind === 'golem_boss' || e.kind === 'dragon' ? 44 : e.isBoss ? 34 : 16 });
      }
    }

    const visCampfires = [];
    for (let i = 0; i < this.campfires.length; i++) {
      const cf = this.campfires[i];
      if (cf.x >= minX - 165 && cf.x <= maxX + 165 && cf.y >= minY - 165 && cf.y <= maxY + 165) {
        visCampfires.push(cf);
      }
    }

    let _outShadow = 1.0;
    let _outWarm = 0.0;
    const computeShadowAndWarmth = (wx, wy) => {
      let shadow = 1.0;
      for (let i = 0; i < shadowCasters.length; i++) {
        const sc = shadowCasters[i];
        const adx = wx - sc.x;
        if (adx <= -sc.rx || adx >= sc.rx) continue;
        const ady = wy - sc.y;
        if (ady <= -sc.ry || ady >= sc.ry) continue;
        const dx = adx / sc.rx;
        const dy = ady / sc.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1.0) shadow = Math.min(shadow, 0.2 + d2 * 0.48);
      }

      const dlx = wx - lp.x;
      const dly = wy - lp.y;
      let warm = dlx > -138 && dlx < 138 && dly > -138 && dly < 138 ? clamp(1.0 - Math.hypot(dlx, dly) / 138, 0, 1) : 0;
      for (let i = 0; i < visCampfires.length; i++) {
        const cf = visCampfires[i];
        const dcx = wx - cf.x;
        if (dcx <= -155 || dcx >= 155) continue;
        const dcy = wy - cf.y;
        if (dcy <= -155 || dcy >= 155) continue;
        const dc = Math.hypot(dcx, dcy);
        if (dc < 155) {
          warm = Math.max(warm, (1.0 - dc / 155) * (0.86 + Math.sin(elapsed * 8 + cf.x) * 0.1));
        }
      }
      _outShadow = shadow;
      _outWarm = warm;
    };

    // 1. BLACK MIRROR WATER: Reflected Full Moon + Moonlight Shimmer Path + Clouds + Shoreline Ripples
    this._emitReflectedMoonAndClouds(renderer, minX, maxX, minY, maxY, toScreenX, toScreenY, gScale, elapsed, cam.zoom);

    const wStep = 11.5;
    const wx0 = Math.floor(Math.max(-4380, minX) / wStep);
    const wx1 = Math.ceil(Math.min(4380, maxX) / wStep);
    const wy0 = Math.floor(Math.max(-4380, minY) / wStep);
    const wy1 = Math.ceil(Math.min(4380, maxY) / wStep);
    const poolX = this.worldMap.plungePoolX;
    const poolY = this.worldMap.plungePoolY;
    const waterOddFade = clamp((cam.zoom - 0.72) / 0.36, 0, 1);
    const waterSizeBoost = lerp(1.36, 1.0, waterOddFade);
    const wHalf = this._wHalf;
    const wDim = this._wDim;

    for (let iy = wy0; iy <= wy1; iy++) {
      const iyOdd = (iy & 1) !== 0;
      const wRowOff = (iy + wHalf) * wDim + wHalf;
      for (let ix = wx0; ix <= wx1; ix++) {
        const isOdd = iyOdd || (ix & 1) !== 0;
        if (isOdd && waterOddFade <= 0.04) continue;
        const h1 = hashInt(ix + 11, iy + 29);
        if (h1 > 0.44) continue;
        const h2 = hashInt(ix - 41, iy + 71);
        const wx = ix * wStep + (h1 - 0.22) * 14;
        const wy = iy * wStep + (h2 - 0.5) * 10;

        const wIdx = wRowOff + ix;
        let ws = this._waterState[wIdx];
        if (ws === 0) {
          const elev = this.worldMap.getElevation(wx, wy);
          if (elev > 0.015) {
            this._waterState[wIdx] = 1;
            continue;
          }
          ws = elev > -0.075 ? 3 : 2;
          this._waterState[wIdx] = ws;
          if (Math.abs(wx - this.worldMap.getRiverCenterX(wy)) < 68) {
            const flow = this.worldMap.getRiverFlow(wx, wy);
            this._waterFlowVx[wIdx] = flow.vx;
            this._waterFlowVy[wIdx] = flow.vy;
          }
        } else if (ws === 1) {
          continue;
        }

        const isShore = ws === 3;
        const fvy = this._waterFlowVy[wIdx];
        const hasFlow = fvy !== 0;
        const flowShift = hasFlow ? ((elapsed * 70 + h2 * 40) % 24) - 12 : 0;
        const wave = hasFlow ? this._waterFlowVx[wIdx] * flowShift : Math.sin(elapsed * 2.4 + wy * 0.11 + wx * 0.025) * 2.6;
        const waveY = hasFlow ? fvy * flowShift : 0;
        const ch = isShore
          ? (h2 > 0.62 ? '≈' : h2 > 0.3 ? '~' : '_')
          : hasFlow && h2 > 0.64
            ? (h1 > 0.25 ? '≈' : '=')
            : WATER_RIPPLES[Math.floor(h2 * WATER_RIPPLES.length) % WATER_RIPPLES.length];
        const dl = Math.hypot(wx - lp.x, wy - lp.y);
        const warm = Math.max(0, 1.0 - dl / 155);
        const dPool = Math.hypot(wx - poolX, wy - poolY);
        const poolBright = dPool < 165 ? (1 - dPool / 165) * 0.32 : hasFlow && h2 > 0.62 ? 0.25 : 0;
        const lodFade = isOdd ? waterOddFade : 1.0;
        const wSizeVar = ch === '·' || ch === '.' || ch === ':' ? 0.72 : ch === '≈' || ch === '~' ? 1.24 : 0.98;

        renderer.drawGlyph(
          toScreenX(wx + wave),
          toScreenY(wy + waveY),
          (isShore ? 6.8 : 5.4 + h2 * 2.4) * wSizeVar * gScale * (isOdd ? 1.0 : waterSizeBoost),
          ch,
          (isShore ? 0.36 : 0.16) + warm * 0.48 + poolBright * 0.48,
          (isShore ? 0.56 : 0.32) + warm * 0.32 + poolBright * 0.5,
          (isShore ? 0.72 : 0.54) - warm * 0.14 + poolBright * 0.55,
          ((isShore ? 0.38 : 0.16) + h2 * 0.16 + poolBright) * lodFade,
          false
        );
      }
    }

    // 2. MIRRORED WATER REFLECTIONS (3D Cliffs, Trees, Skeletons, Bosses, Knight, Horse)
    const wfCx = this.worldMap.waterfallX;
    const wfBy = this.worldMap.waterfallBaseY;
    if (wfCx + 280 > minX && wfCx - 280 < maxX && wfBy + 240 > minY && wfBy - 240 < maxY) {
      for (const b of this.waterfallBoulders) {
        if (b.y < wfBy - 95) continue;
        const distAbove = Math.max(0, wfBy + 12 - b.y);
        const g = scaledProp(clamp(Math.round(b.rx * 0.42), 12, 26), clamp(Math.round(b.ry * 0.5), 12, 26), 4.4);
        emitPureAscii3DProp({
          renderer,
          toScreenX,
          toScreenY,
          worldX: b.x,
          worldY: wfBy + 14 + distAbove * 0.72,
          worldTiltY: WORLD_TILT_Y,
          cols: g.cols,
          rows: g.rows,
          worldSpanX: b.rx * 2.2,
          worldSpanY: b.ry * 2.6,
          cellScreenSize: g.cellScreenSize,
          alphaMult: 0.46,
          isReflection: true,
          mirrorClipCheck: (rx, ry) => this.worldMap.isWater(rx, ry),
          lanternPos: lp,
          elapsed,
          cacheKey: `wfb_r_${b.x}_${b.y}_${lodTier}`,
          buildProp: (buf) => buildBoulder3D(buf, b.rx, b.ry * 0.8, b.moss, false)
        });
      }
    }

    for (const c of this.autumnCliffs) {
      if (c.x < minX - 110 || c.x > maxX + 110 || c.y < minY - 110 || c.y > maxY + 140) continue;
      const g = scaledProp(clamp(Math.round(c.rx * 0.34), 14, 26), clamp(Math.round(c.ry * 0.34), 14, 28), 4.6);
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: c.x,
        worldY: c.y + 85,
        worldTiltY: WORLD_TILT_Y,
        cols: g.cols,
        rows: g.rows,
        worldSpanX: c.rx * 2.2,
        worldSpanY: c.ry * 2.6,
        cellScreenSize: g.cellScreenSize,
        alphaMult: 0.46,
        isReflection: true,
        mirrorClipCheck: (rx, ry) => this.worldMap.isWater(rx, ry),
        lanternPos: lp,
        elapsed,
        cacheKey: `ac_r_${c.x}_${c.y}_${lodTier}`,
        buildProp: (buf) => buildBoulder3D(buf, c.rx, c.ry * 0.65, false, c.autumn)
      });
    }

    for (const t of this.trees) {
      if (t.x < minX - 80 || t.x > maxX + 80 || t.y < minY - 80 || t.y > maxY + 90) continue;
      if (!this.worldMap.isWater(t.x, t.y + 34) && !this.worldMap.isWater(t.x, t.y + 18)) continue;
      const sc = t.scale || 1.0;
      const g = scaledProp(32, 36, 2.55);
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: t.x,
        worldY: t.y + 6,
        worldTiltY: WORLD_TILT_Y,
        cols: g.cols,
        rows: g.rows,
        worldSpanX: 84 * sc,
        worldSpanY: 96 * sc,
        cellScreenSize: g.cellScreenSize,
        alphaMult: 0.48,
        isReflection: true,
        mirrorClipCheck: (rx, ry) => this.worldMap.isWater(rx, ry),
        lanternPos: lp,
        elapsed,
        buildProp: (buf) => buildTree3D(buf, t, elapsed)
      });
    }

    // Mirrored 3D Skeletons, Wolves, All 8 Bosses, Hero Knight & Horse in Water!
    for (const e of this.enemies) {
      if (!e.alive || e.x < minX - 80 || e.x > maxX + 80 || e.y < minY - 80 || e.y > maxY + 80) continue;
      if (!this.worldMap.isWater(e.x, e.y + 18) && !this.worldMap.isWater(e.x, e.y + 34)) continue;
      if (!e.isBoss) {
        const g = scaledSprite(40, 40, 2.2);
        emitPureAscii3DSprite({
          renderer,
          toScreenX,
          toScreenY,
          worldX: e.x,
          worldY: e.y + 6,
          worldTiltY: WORLD_TILT_Y,
          cols: g.cols,
          rows: g.rows,
          worldSpan: 44,
          cellScreenSize: g.cellScreenSize,
          alphaMult: 0.56,
          isReflection: true,
          mirrorClipCheck: (rx, ry) => this.worldMap.isWater(rx, ry),
          lanternPos: lp,
          elapsed,
          buildModel: (buf) => buildBaseMob3D(buf, e, elapsed)
        });
      } else {
        const isDragon = e.kind === 'dragon' || e.kind === 'hydra_boss';
        const isGolem = e.kind === 'golem_boss' || e.kind === 'behemoth_boss';
        const isSpider = e.kind === 'spider_boss';
        const g = scaledSprite(isDragon ? 58 : isSpider ? 54 : 50, isDragon ? 58 : isSpider ? 54 : 50, isDragon ? 3.8 : 2.95);
        emitPureAscii3DSprite({
          renderer,
          toScreenX,
          toScreenY,
          worldX: e.x,
          worldY: e.y + 8,
          worldTiltY: WORLD_TILT_Y,
          cols: g.cols,
          rows: g.rows,
          worldSpan: isDragon ? 148 : isGolem ? 116 : isSpider ? 104 : 96,
          cellScreenSize: g.cellScreenSize,
          alphaMult: 0.54,
          isReflection: true,
          mirrorClipCheck: (rx, ry) => this.worldMap.isWater(rx, ry),
          lanternPos: lp,
          elapsed,
          buildModel: (buf) => buildBoss3D(buf, e, elapsed)
        });
      }
    }

    if (this.worldMap.isWater(this.horseX, this.horseY + 24) || this.worldMap.isWater(this.horseX, this.horseY + 4)) {
      const g = scaledSprite(62, 62, 2.55);
      emitPureAscii3DSprite({
        renderer,
        toScreenX,
        toScreenY,
        worldX: this.horseX,
        worldY: this.horseY + 6,
        worldTiltY: WORLD_TILT_Y,
        cols: g.cols,
        rows: g.rows,
        worldSpan: 102,
        cellScreenSize: g.cellScreenSize,
        alphaMult: 0.58,
        isReflection: true,
        mirrorClipCheck: (rx, ry) => this.worldMap.isWater(rx, ry),
        lanternPos: lp,
        elapsed,
        buildModel: (buf) =>
          buildHeroKnight3D(buf, {
            facing: this.horseFacing,
            headingYaw: this.horseYaw,
            isMounted: this.isMounted,
            isMoving: (this.isMounted && this.isMoving) || this.callingHorse,
            gaitPhase: this.gaitPhase,
            gallopBlend: this.gallopBlend,
            slashProgress: this.isMounted ? slashProgress : 0,
            swordFx: this.build.computed.swordFx,
            armorMaterial: this.build.computed.armorMaterial,
            elapsed,
            showMountBody: true,
            showRiderBody: this.isMounted
          })
      });
    }

    if (!this.isMounted && (this.worldMap.isWater(this.x, this.y + 22) || this.worldMap.isWater(this.x, this.y + 4))) {
      const g = scaledSprite(50, 50, 2.45);
      emitPureAscii3DSprite({
        renderer,
        toScreenX,
        toScreenY,
        worldX: this.x,
        worldY: this.y + 6,
        worldTiltY: WORLD_TILT_Y,
        cols: g.cols,
        rows: g.rows,
        worldSpan: 72,
        cellScreenSize: g.cellScreenSize,
        alphaMult: 0.6,
        isReflection: true,
        mirrorClipCheck: (rx, ry) => this.worldMap.isWater(rx, ry),
        lanternPos: lp,
        elapsed,
        buildModel: (buf) =>
          buildHeroKnight3D(buf, {
            facing: this.facing,
            headingYaw: this.yaw,
            isMounted: false,
            isMoving: this.isMoving,
            gaitPhase: this.gaitPhase,
            gallopBlend: this.gallopBlend,
            slashProgress,
            swordFx: this.build.computed.swordFx,
            armorMaterial: this.build.computed.armorMaterial,
            elapsed,
            showMountBody: false,
            showRiderBody: true
          })
      });
    }

    // 3. TOPOGRAPHIC 3D RELIEF, CLIFF STRATA & LUSH CLUMPED GRASS TUFTS!
    const gStep = 5.0;
    const gx0 = Math.floor(Math.max(-4380, minX) / gStep);
    const gx1 = Math.ceil(Math.min(4380, maxX) / gStep);
    const gy0 = Math.floor(Math.max(-4380, minY) / gStep);
    const gy1 = Math.ceil(Math.min(4380, maxY) / gStep);
    const grassOddFade = clamp((cam.zoom - 1.02) / 0.36, 0, 1);
    const grassQuartFade = clamp((cam.zoom - 0.56) / 0.38, 0.28, 1.0);
    const grassSizeBoost = lerp(1.52, 1.0, grassOddFade * 0.72 + grassQuartFade * 0.28);

    const visImpulses = [];
    for (let k = 0; k < this.grassImpulses.length; k++) {
      const imp = this.grassImpulses[k];
      if (imp.x + imp.radius >= minX && imp.x - imp.radius <= maxX && imp.y + imp.radius >= minY && imp.y - imp.radius <= maxY) {
        visImpulses.push(imp);
      }
    }

    const gHalf = this._gHalf;
    const gDim = this._gDim;

    for (let iy = gy0; iy <= gy1; iy++) {
      const iyOdd = (iy & 1) !== 0;
      const iyQ = (iy & 2) !== 0;
      const gRowOff = (iy + gHalf) * gDim + gHalf;
      for (let ix = gx0; ix <= gx1; ix++) {
        const isOdd = iyOdd || (ix & 1) !== 0;
        let lodFade = 1.0;
        if (isOdd) {
          if (grassOddFade <= 0.04) continue;
          lodFade = grassOddFade;
        } else if (iyQ || (ix & 2) !== 0) {
          lodFade = grassQuartFade;
        }
        const h1 = hashInt(ix, iy);
        if (h1 > 0.84) continue;

        const gIdx = gRowOff + ix;
        let gs = this._grassState[gIdx];
        const h2 = hashInt(ix + 193, iy - 419);
        const h3 = hashInt(ix - 73, iy + 311);
        const wx = ix * gStep + (h1 - 0.41) * gStep * 1.15;
        const wy = iy * gStep + (h2 - 0.5) * gStep * 0.95;

        if (gs === 0) {
          const elev = this.worldMap.getElevation(wx, wy);
          if (elev <= 0.022) {
            this._grassState[gIdx] = 1;
            continue;
          }
          const wz = this.worldMap.getTerrainZ(wx, wy, elev);
          this._grassZ[gIdx] = wz;
          const zN = this.worldMap.getTerrainZ(wx, wy - 10);
          const zS = this.worldMap.getTerrainZ(wx, wy + 10);
          this._grassSlope[gIdx] = clamp(Math.round((zS - zN) * 2), -24, 24);

          const roadF = this.worldMap.getRoadFactor(wx, wy);
          if (roadF > 0.45 && !this.worldMap.isOnBridge(wx, wy)) {
            this._grassState[gIdx] = 2;
            gs = 2;
          } else if (elev >= 0.44 || (elev > 0.14 && Math.abs(zS - zN) > 9.5)) {
            this._grassState[gIdx] = 6; // Steep cliff crag / ridge face!
            gs = 6;
          } else {
            const bStr = this.worldMap.getBiomeId(wx, wy);
            gs =
              bStr === 'crimson_crag' || bStr === 'obelisk_sanctum'
                ? 4
                : bStr === 'ashen_peak' || bStr === 'pale_citadel'
                  ? 5
                  : 3;
            this._grassState[gIdx] = gs;
          }
        } else if (gs === 1) {
          continue;
        }

        const wz = this._grassZ[gIdx];
        const slope = this._grassSlope[gIdx];

        // Steep Topographic Cliff Faces & Smooth Crag Strata (no blocky ▓ walls along shore!)
        if (gs === 6) {
          if (h1 < 0.68) {
            computeShadowAndWarmth(wx, wy);
            const hillSh = clamp(1.0 + slope * 0.025, 0.7, 1.24);
            const chC = h3 > 0.76 ? '^' : h3 > 0.52 ? '/' : h3 > 0.34 ? '=' : h2 > 0.45 ? '~' : ':';
            const cSize = chC === '^' ? 1.06 : chC === ':' ? 0.76 : 0.92;
            const rC = (0.34 + h2 * 0.22 + _outWarm * 0.34) * hillSh * _outShadow;
            const gC = (0.38 + h2 * 0.22 + _outWarm * 0.20) * hillSh * _outShadow;
            const bC = (0.48 + h3 * 0.22 - _outWarm * 0.06) * hillSh * _outShadow;
            renderer.drawGlyph(toScreenX(wx), toScreenY(wy, wz), (5.4 + h3 * 1.4) * cSize * gScale * grassSizeBoost, chC, clamp(rC, 0, 1), clamp(gC, 0, 1), clamp(bC, 0, 1), 0.72 * lodFade, false);
          }
          continue;
        }

        // Scenic Worn Cobblestone Flagstones following Smooth Hill Contours (NEVER over water!)
        if (gs === 2) {
          if (h1 < 0.50 && !this.worldMap.isWater(wx, wy)) {
            computeShadowAndWarmth(wx, wy);
            const stCh = h3 > 0.72 ? '=' : h3 > 0.38 ? '-' : h2 > 0.5 ? ':' : '·';
            const stSize = stCh === '·' || stCh === ':' ? 0.74 : 0.96;
            const rS = (0.44 + h2 * 0.16 + _outWarm * 0.42) * _outShadow;
            const gS = (0.43 + h2 * 0.16 + _outWarm * 0.26) * _outShadow;
            const bS = (0.40 + h3 * 0.14 - _outWarm * 0.08) * _outShadow;
            renderer.drawGlyph(toScreenX(wx), toScreenY(wy, wz), (5.2 + h3 * 1.3) * stSize * gScale * grassSizeBoost, stCh, rS, gS, bS, (0.58 + _outWarm * 0.22) * lodFade, false);
          }
          continue;
        }

        // Lush Velvety Meadow Grass Carpet & Contoured Earth Lanes
        const clumpVal =
          Math.sin(wx * 0.029 + 1.1) * Math.cos(wy * 0.032 - 0.7) +
          Math.sin((wx - wy) * 0.052) * 0.42;
        if (clumpVal < -0.34 && h1 > 0.28) continue;

        computeShadowAndWarmth(wx, wy);
        const shadow = Math.max(0.36, _outShadow * clamp(1.0 + slope * 0.028, 0.68, 1.2));
        const warm = _outWarm;

        const isCrimson = gs === 4;
        const isAshen = gs === 5;

        // Flowing wind gust wave bands + fine tip shiver
        const windWave = Math.sin(wx * 0.015 - elapsed * 2.6 + wy * 0.012);
        const gust =
          windWave * 0.58 +
          Math.sin(elapsed * 4.4 - wx * 0.022 + wy * 0.032) * 0.42;
        const rainShiver = this.rainEnabled ? Math.sin(elapsed * 19 + wx * 0.4 + wy * 0.3) * 0.9 : 0;
        let swayX = gust * (2.2 + h2 * 2.4) + rainShiver;
        let swayY = windWave * 0.7;
        let bendMag = 0;
        let crushed = false;
        let revealFlower = false;

        // Physical Grass Bending under Hero, Horse, Adventurers & Bosses (never erases blades under feet!)
        for (let ci = 0; ci < grassCrushers.length; ci++) {
          const gc = grassCrushers[ci];
          const gdx = wx - gc.x;
          if (gdx <= -gc.r || gdx >= gc.r) continue;
          const gdy = wy - gc.y;
          if (gdy <= -gc.r || gdy >= gc.r) continue;
          const gd = Math.hypot(gdx, gdy);
          if (gd < gc.r) {
            const p = 1 - gd / gc.r;
            const nx = gdx / Math.max(1, gd);
            const ny = gdy / Math.max(1, gd);
            const push = p * 4.2;
            swayX += nx * push;
            swayY += ny * push * 0.45;
            bendMag += p * 1.15;
            if (p > 0.32) crushed = true;
            if (p > 0.2 && h3 > 0.84) revealFlower = true;
          }
        }

        // Springy Trailing Wake Memory & Sword/Dash Shockwave Bounce!
        for (let wi = 0; wi < visImpulses.length; wi++) {
          const imp = visImpulses[wi];
          const idx = wx - imp.x;
          const effR = imp.isBlast ? imp.radius * (0.4 + (imp.age / imp.life) * 0.8) : imp.radius;
          if (idx <= -effR || idx >= effR) continue;
          const idy = wy - imp.y;
          if (idy <= -effR || idy >= effR) continue;
          const id = Math.hypot(idx, idy);
          if (id < effR) {
            const falloff = 1 - id / effR;
            const decay = Math.exp(-imp.age * (imp.isBlast ? 3.2 : 2.1));
            const springOsc = Math.cos(imp.age * (imp.isBlast ? 12.0 : 8.5));
            const nx = idx / Math.max(1, id);
            const ny = idy / Math.max(1, id);
            const push = falloff * imp.strength * decay * springOsc;
            swayX += (nx * 0.8 + imp.vx * 0.4) * push;
            swayY += (ny * 0.6 + imp.vy * 0.3) * push;
            bendMag += Math.abs(push) * 0.08;
            if (falloff > 0.45 && decay > 0.5 && h3 > 0.82) revealFlower = true;
          }
        }

        const isTallBlade = h2 > 0.22;
        const naturalFlower = isTallBlade && h3 > 0.962 && !isAshen;
        let ch;
        if (revealFlower || naturalFlower) {
          ch = h2 > 0.72 ? '✦' : h2 > 0.45 ? '*' : 'o';
        } else if (crushed) {
          ch = swayX > 0.5 ? '/' : swayX < -0.5 ? '\\' : '~';
        } else if (!isTallBlade) {
          ch = h3 > 0.55 ? ',' : '.';
        } else if (swayX > 1.75) {
          ch = '/';
        } else if (swayX < -1.75) {
          ch = '\\';
        } else {
          ch = GRASS_BLADES[Math.floor((h3 * 0.85 + Math.abs(gust) * 0.15) * GRASS_BLADES.length) % GRASS_BLADES.length];
        }

        let cr, cg, cb;
        const flashBoost = this.lightningFlash * 0.38;
        const crestWave = isTallBlade && h2 > 0.58 && windWave > 0.15 ? (windWave - 0.15) * 0.36 : 0;
        const wakeSheen = clamp(bendMag * 0.28, 0, 0.32);

        if (revealFlower || naturalFlower) {
          cr = isCrimson ? 0.96 : 0.92;
          cg = isCrimson ? 0.52 : 0.97;
          cb = isCrimson ? 0.24 : 0.95;
        } else if (isAshen) {
          cr = 0.27 + h2 * 0.16 + wakeSheen * 0.2;
          cg = 0.26 + h2 * 0.14 + wakeSheen * 0.2;
          cb = 0.3 + h3 * 0.12 + wakeSheen * 0.2;
        } else if (isCrimson && h3 > 0.66) {
          cr = 0.64 + h2 * 0.32 + wakeSheen * 0.2;
          cg = 0.26 + h2 * 0.18 + wakeSheen * 0.12;
          cb = 0.09 + h3 * 0.06;
        } else {
          cr = (isTallBlade ? 0.07 : 0.04) + h2 * 0.13 + crestWave * 0.55 + wakeSheen * 0.35 + flashBoost;
          cg = (isTallBlade ? 0.35 : 0.22) + h2 * 0.4 + crestWave * 0.52 + wakeSheen * 0.42 + flashBoost;
          cb = (isTallBlade ? 0.16 : 0.09) + h3 * 0.18 + crestWave * 0.42 + wakeSheen * 0.28 + flashBoost;
        }

        if (warm > 0.12) {
          cr = lerp(cr, 0.99, warm * 0.76);
          cg = lerp(cg, 0.75, warm * 0.68);
          cb = lerp(cb, 0.26, warm * 0.56);
        }

        const mult = shadow;
        cr *= mult;
        cg *= mult;
        cb *= mult;
        const alpha = clamp((isTallBlade ? 0.58 : 0.4) + h2 * 0.38 * shadow + warm * 0.25 + wakeSheen * 0.2, 0.26, 0.96) * lodFade;
        const sizeHier = ch === '.' || ch === ',' || ch === "'" || ch === '`' ? 0.74 : ch === '✦' || ch === '*' ? 0.96 : 1.04;
        const sizeWorld = ((revealFlower ? 3.8 : isTallBlade ? 4.8 : 3.4) + h3 * 1.8) * sizeHier * (isOdd ? 1.0 : grassSizeBoost);
        const sxGrass = toScreenX(wx + swayX);
        const syGrass = toScreenY(wy + swayY, wz - (crushed ? 1.8 : 0));

        renderer.drawGlyph(sxGrass, syGrass, sizeWorld * gScale, ch, clamp(cr, 0, 1), clamp(cg, 0, 1), clamp(cb, 0, 1), alpha, false);

        // Multi-Blade Lush Tuft Cluster inside rich meadow clumps (bends sideways under feet instead of vanishing!)
        if (clumpVal > 0.28 && cam.zoom >= 1.1 && h2 > 0.36) {
          const ch2 = crushed ? (swayX >= 0 ? '/' : '\\') : swayX > 1.2 ? '/' : swayX < -1.2 ? '\\' : h3 > 0.55 ? "'" : '|';
          renderer.drawGlyph(
            toScreenX(wx + swayX * 1.22 + (h1 - 0.4) * 4.4),
            toScreenY(wy + swayY - 2.4, wz + 2.2),
            sizeWorld * 0.94 * gScale,
            ch2,
            clamp(cr * 1.18, 0, 1),
            clamp(cg * 1.18, 0, 1),
            clamp(cb * 1.14, 0, 1),
            alpha * 0.9,
            false
          );
          if (clumpVal > 0.72 && h2 > 0.72) {
            renderer.drawGlyph(
              toScreenX(wx + swayX * 1.3 - (h2 - 0.5) * 4.2),
              toScreenY(wy + swayY - 4.0, wz + 3.6),
              sizeWorld * 0.86 * gScale,
              naturalFlower ? '*' : h3 > 0.5 ? ',' : ';',
              clamp(cr * 1.26, 0, 1),
              clamp(cg * 1.26, 0, 1),
              clamp(cb * 1.2, 0, 1),
              alpha * 0.84,
              false
            );
          }
        }
      }
    }

    // 4. Semi-3D Architectural Landmarks: Spiral Watchtower, Fortress Gate, Bridge, Bastion, Crypt & Horizon Citadels!
    this._emitLandmarksAscii(renderer, minX, maxX, minY, maxY, toScreenX, toScreenY, gScale, elapsed, lp, propLod, lodTier);

    // 5. Semi-3D Stratified Cliff Boulders, Autumn Crimson Canyon Walls & Twin Waterfall
    const emitBoulder3DProp = (bx, by, rx, ry, hasMoss, isAutumn, cachePrefix) => {
      const cols = clamp(Math.round(rx * 0.92), 22, 46);
      const rows = clamp(Math.round(ry * 0.72), 16, 34);
      const bCell = ((ry * 3.1) / rows) * 1.24;
      const g = scaledProp(cols, rows, bCell);
      const bz = this.worldMap.getTerrainZ(bx, by);
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: bx,
        worldY: by,
        worldZ: bz,
        worldTiltY: WORLD_TILT_Y,
        cols: g.cols,
        rows: g.rows,
        worldSpanX: rx * 2.3,
        worldSpanY: ry * 3.0,
        cellScreenSize: g.cellScreenSize,
        alphaMult: 0.98,
        lanternPos: lp,
        elapsed,
        enableMultiSize: true,
        cacheKey: `${cachePrefix}_${Math.round(bx)}_${Math.round(by)}_${lodTier}`,
        buildProp: (buf) => buildBoulder3D(buf, rx, ry, hasMoss, isAutumn)
      });
    };

    if (wfCx + 280 > minX && wfCx - 280 < maxX && wfBy + 240 > minY && wfBy - 240 < maxY) {
      for (const b of this.waterfallBoulders) {
        emitBoulder3DProp(b.x, b.y, b.rx, b.ry, b.moss, false, 'wfb');
      }
      this._emitWaterfallAscii(renderer, wfCx, this.worldMap.waterfallTopY + 35, wfBy + 14, 84, elapsed, lp, toScreenX, toScreenY, gScale);
    }

    for (const c of this.autumnCliffs) {
      if (c.x < minX - 110 || c.x > maxX + 110 || c.y < minY - 120 || c.y > maxY + 120) continue;
      emitBoulder3DProp(c.x, c.y, c.rx, c.ry, false, c.autumn, 'ac');
    }

    for (const b of this.boulders) {
      if (b.x > minX - 70 && b.x < maxX + 70 && b.y > minY - 70 && b.y < maxY + 70) {
        emitBoulder3DProp(b.x, b.y, b.rx, b.ry, b.moss, b.autumn, 'bld');
      }
    }

    // 6. Crisp High-Resolution Sculpted Trees (Y-sorted back-to-front so trunks & crowns never clip awkwardly!)
    const tGrid = scaledProp(44, 48, 2.65);
    const visTrees = [];
    for (const t of this.trees) {
      if (t.x < minX - 95 || t.x > maxX + 95 || t.y < minY - 95 || t.y > maxY + 110) continue;
      visTrees.push(t);
    }
    visTrees.sort((a, b) => a.y - b.y);
    for (const t of visTrees) {
      const sc = t.scale || 1.0;
      const tz = this.worldMap.getTerrainZ(t.x, t.y);
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: t.x,
        worldY: t.y,
        worldZ: tz,
        worldTiltY: WORLD_TILT_Y,
        cols: tGrid.cols,
        rows: tGrid.rows,
        worldSpanX: 84 * sc,
        worldSpanY: 96 * sc,
        cellScreenSize: tGrid.cellScreenSize,
        alphaMult: 0.96,
        lanternPos: lp,
        elapsed,
        enableMultiSize: true,
        buildProp: (buf) => buildTree3D(buf, t, elapsed)
      });
    }

    // 7. Interactive Campfires, Grave Soul Echoes, Loot Orbs, Chests, Lore Tomes, Cobwebs, Destructibles & Shattered Debris
    for (const cw of this.cobwebs) {
      if (cw.x < minX - 70 || cw.x > maxX + 70 || cw.y < minY - 70 || cw.y > maxY + 70) continue;
      const cwZ = this.worldMap.getTerrainZ(cw.x, cw.y);
      for (let spoke = 0; spoke < 8; spoke++) {
        const ang = (spoke / 8) * Math.PI * 2;
        for (let stepR = 8; stepR <= cw.radius; stepR += 8) {
          renderer.drawGlyph(
            toScreenX(cw.x + Math.cos(ang) * stepR),
            toScreenY(cw.y + Math.sin(ang) * stepR * 0.78, cwZ),
            6.5 * gScale,
            spoke % 2 === 0 ? '/' : '\\',
            0.78,
            0.88,
            0.96,
            0.46,
            false
          );
        }
      }
    }

    const dGrid = scaledProp(14, 18, 3.8);
    for (const d of this.destructibles) {
      if (d.broken || d.x < minX - 70 || d.x > maxX + 70 || d.y < minY - 70 || d.y > maxY + 70) continue;
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: d.x,
        worldY: d.y,
        worldZ: this.worldMap.getTerrainZ(d.x, d.y),
        worldTiltY: WORLD_TILT_Y,
        cols: dGrid.cols,
        rows: dGrid.rows,
        worldSpanX: 36,
        worldSpanY: 50,
        cellScreenSize: dGrid.cellScreenSize,
        alphaMult: 0.96,
        lanternPos: lp,
        elapsed,
        cacheKey: `dst_${d.id}_${lodTier}`,
        buildProp: (buf) => buildDestructible3D(buf, d)
      });
    }

    for (const db of this.debris) {
      const dbZ = this.worldMap.getTerrainZ(db.x, db.y) + db.z * 0.55;
      renderer.drawGlyph(
        toScreenX(db.x),
        toScreenY(db.y, dbZ),
        8.2 * gScale,
        db.ch,
        db.r,
        db.g,
        db.b,
        clamp(1 - db.age / db.life, 0.15, 0.95),
        db.r > 0.9
      );
    }

    for (const gm of this.graveMarkers) {
      const gz = this.worldMap.getTerrainZ(gm.x, gm.y);
      const pulse = 0.75 + Math.sin(elapsed * 4.2) * 0.25;
      renderer.drawText(toScreenX(gm.x), toScreenY(gm.y, gz + 12), 11 * gScale, '[✝]', 1.0, 0.85, 0.38, pulse, true);
    }

    for (const cf of this.campfires) {
      if (cf.x < minX - 70 || cf.x > maxX + 70 || cf.y < minY - 70 || cf.y > maxY + 70) continue;
      const cfZ = this.worldMap.getTerrainZ(cf.x, cf.y);
      renderer.drawText(toScreenX(cf.x), toScreenY(cf.y, cfZ), 9 * gScale, '(*)', 0.95, 0.55, 0.18, 0.94, true);
      for (let i = 0; i < 8; i++) {
        const lift = (elapsed * 26 + i * 6.5) % 26;
        const alpha = 1.0 - lift / 26;
        renderer.drawGlyph(
          toScreenX(cf.x + Math.sin(elapsed * 5.2 + i * 1.9) * 7),
          toScreenY(cf.y, cfZ + lift),
          (6.0 + (i % 3) * 2) * gScale,
          i % 3 === 0 ? '✦' : i % 2 === 0 ? '*' : '^',
          1.0,
          0.78 - lift * 0.02,
          0.22,
          alpha,
          true
        );
      }
    }

    for (const t of this.loreTomes) {
      if (t.x < minX - 50 || t.x > maxX + 50 || t.y < minY - 50 || t.y > maxY + 50) continue;
      const tZ = this.worldMap.getTerrainZ(t.x, t.y);
      const pulse = 0.72 + Math.sin(elapsed * 3 + t.x) * 0.25;
      renderer.drawText(toScreenX(t.x), toScreenY(t.y, tZ + 12), 9.5 * gScale, '[?]', t.read ? 0.5 : 0.45, t.read ? 0.7 : 0.95, 1.0, pulse, true);
    }

    for (const c of this.chests) {
      if (c.x < minX - 50 || c.x > maxX + 50 || c.y < minY - 50 || c.y > maxY + 50) continue;
      const cZ = this.worldMap.getTerrainZ(c.x, c.y);
      renderer.drawText(toScreenX(c.x), toScreenY(c.y, cZ), 9.5 * gScale, c.opened ? '[.]' : '[=]', c.opened ? 0.45 : 1.0, c.opened ? 0.4 : 0.82, 0.24, 0.95, !c.opened);
    }

    for (const drop of this.lootDrops) {
      if (drop.x < minX - 50 || drop.x > maxX + 50 || drop.y < minY - 50 || drop.y > maxY + 50) continue;
      const dZ = this.worldMap.getTerrainZ(drop.x, drop.y);
      const bob = Math.sin(elapsed * 4 + drop.x) * 3;
      const col = drop.item.rgb;
      renderer.drawGlyph(toScreenX(drop.x), toScreenY(drop.y, dZ + 8 - bob), 10.5 * gScale, '✦', col[0], col[1], col[2], 0.95, true);
    }

    // 8. 3D Dash Ghost Afterimages (smooth 360° headingYaw preserved!)
    const ghostGrid = scaledSprite(46, 46, 2.45);
    for (const gh of this.dashGhosts) {
      const alpha = (1.0 - gh.age / gh.life) * 0.48;
      emitPureAscii3DSprite({
        renderer,
        toScreenX,
        toScreenY,
        worldX: gh.x,
        worldY: gh.y,
        worldZ: this.z || 0,
        worldTiltY: WORLD_TILT_Y,
        cols: ghostGrid.cols,
        rows: ghostGrid.rows,
        worldSpan: 92,
        cellScreenSize: ghostGrid.cellScreenSize,
        alphaMult: alpha,
        rimColor: [0.4, 0.92, 1.0],
        elapsed,
        glowMask: true,
        buildModel: (buf) => buildHeroKnight3D(buf, { facing: gh.facing, headingYaw: gh.yaw, isMounted: gh.mounted, isDashing: true, showMountBody: gh.mounted, showRiderBody: true })
      });
    }

    // 9. High-Detail MMORPG Adventurers (Multi-size ASCII)
    const advGrid = scaledSprite(84, 62, 2.35);
    for (const a of this.adventurers) {
      if (a.x < minX - 70 || a.x > maxX + 70 || a.y < minY - 70 || a.y > maxY + 70) continue;
      const aZ = this.worldMap.getWalkZ ? this.worldMap.getWalkZ(a.x, a.y) : 0;
      emitPureAscii3DSprite({
        renderer,
        toScreenX,
        toScreenY,
        worldX: a.x,
        worldY: a.y,
        worldZ: aZ,
        worldTiltY: WORLD_TILT_Y,
        cols: advGrid.cols,
        rows: advGrid.rows,
        worldSpan: 86,
        cellScreenSize: advGrid.cellScreenSize,
        alphaMult: 0.99,
        rimColor: [0.68, 0.92, 1.0],
        lanternPos: lp,
        elapsed,
        enableMultiSize: true,
        buildModel: (buf) => buildAdventurer3D(buf, a, elapsed)
      });
      renderer.drawText(toScreenX(a.x), toScreenY(a.y, aZ + 48), 7.5 * gScale, `<${a.name} L${a.lv}>`, 0.45, 0.88, 1.0, 0.84, false);
    }

    // 10. Ultra-Detailed High-Res Monsters (8 Distinct Types + Elites) & ALL 8 Formidable Bosses!
    const mobGrid = scaledSprite(72, 54, 2.32);
    for (const e of this.enemies) {
      if (!e.alive || e.x < minX - 130 || e.x > maxX + 130 || e.y < minY - 130 || e.y > maxY + 130) continue;
      const ez = this.worldMap.getWalkZ ? this.worldMap.getWalkZ(e.x, e.y) : 0;

      if (e.windup > 0) {
        const ringGlyphs = e.specialWindup ? 18 : 12;
        const wr = e.specialWindup ? e.atkRange * 1.18 : e.atkRange;
        const wChar = e.specialWindup ? (e.kind === 'golem_boss' ? '^' : e.kind === 'lich_boss' || e.kind === 'behemoth_boss' ? '+' : '#') : '*';
        for (let k = 0; k < ringGlyphs; k++) {
          const ang = (k / ringGlyphs) * Math.PI * 2 + elapsed * (e.specialWindup ? 4.2 : 3.0);
          renderer.drawGlyph(
            toScreenX(e.x + Math.cos(ang) * wr),
            toScreenY(e.y + Math.sin(ang) * wr * 0.78, ez),
            (e.specialWindup ? 10.0 : 8.5) * gScale,
            wChar,
            1.0,
            e.specialWindup ? 0.45 : 0.28,
            e.specialWindup ? 0.14 : 0.22,
            0.84,
            true
          );
        }
      }

      const isDragon = e.kind === 'dragon' || e.kind === 'hydra_boss';
      const isSpider = e.kind === 'spider_boss';
      const isGolem = e.kind === 'golem_boss' || e.kind === 'behemoth_boss';
      const isLich = e.kind === 'lich_boss' || e.kind === 'reaper_boss';
      const isBoss = e.isBoss;
      const dl = Math.hypot(e.x - lp.x, e.y - lp.y);
      const mobRim = e.enraged
        ? [1.0, 0.25, 0.18]
        : e.isElite && !isBoss
          ? [1.0, 0.86, 0.3]
          : dl < 140
            ? [1.0, 0.72, 0.32]
            : isLich
              ? [0.62, 0.86, 1.0]
              : isGolem
                ? [0.95, 0.68, 0.32]
                : [0.66, 0.84, 1.0];

      if (e.id === this.targetEnemyId || (isSpider && Math.hypot(e.x - this.x, e.y - this.y) < 230)) {
        const ringR = isSpider || isGolem ? 36 : isBoss ? 38 : 18;
        for (let rIdx = 0; rIdx < 16; rIdx++) {
          const ra = (rIdx / 16) * Math.PI * 2;
          renderer.drawGlyph(toScreenX(e.x + Math.cos(ra) * ringR), toScreenY(e.y + 8 + Math.sin(ra) * ringR, ez), 7 * gScale, '-', 0.92, 0.24, 0.22, 0.65, false);
        }
      }

      if (!isBoss) {
        emitPureAscii3DSprite({
          renderer,
          toScreenX,
          toScreenY,
          worldX: e.x,
          worldY: e.y,
          worldZ: ez,
          worldTiltY: WORLD_TILT_Y,
          cols: mobGrid.cols,
          rows: mobGrid.rows,
          worldSpan: e.isElite ? 52 : 44,
          cellScreenSize: mobGrid.cellScreenSize * (e.isElite ? 1.16 : 1.0),
          alphaMult: 0.99,
          rimColor: mobRim,
          lanternPos: lp,
          elapsed,
          enableMultiSize: true,
          buildModel: (buf) => buildBaseMob3D(buf, e, elapsed)
        });
      } else {
        const bGrid = e.kind === 'dragon' || e.kind === 'behemoth_boss' ? 82 : e.kind === 'hydra_boss' || isSpider || e.kind === 'reaper_boss' ? 76 : isGolem ? 72 : 68;
        const bRows = Math.round(bGrid * 0.74);
        const spanW = e.kind === 'dragon' ? 154 : e.kind === 'hydra_boss' ? 132 : e.kind === 'behemoth_boss' ? 118 : e.kind === 'reaper_boss' ? 116 : isGolem ? 92 : isSpider ? 104 : 78;
        const bCell = (spanW / bRows) * 1.18;
        const bg = scaledSprite(bGrid, bRows, bCell);
        emitPureAscii3DSprite({
          renderer,
          toScreenX,
          toScreenY,
          worldX: e.x,
          worldY: e.y,
          worldZ: ez,
          worldTiltY: WORLD_TILT_Y,
          cols: bg.cols,
          rows: bg.rows,
          worldSpan: spanW,
          cellScreenSize: bg.cellScreenSize,
          alphaMult: 0.99,
          rimColor: mobRim,
          lanternPos: lp,
          elapsed,
          enableMultiSize: true,
          buildModel: (buf) => buildBoss3D(buf, e, elapsed)
        });
      }

      const tagZ = ez + (isDragon || e.kind === 'behemoth_boss' ? 68 : isGolem ? 64 : isBoss ? 56 : 36);
      const enrTag = e.enraged ? ' [ENRAGE]' : '';
      if (e.id === this.targetEnemyId) {
        renderer.drawText(toScreenX(e.x), toScreenY(e.y, tagZ), 8.2 * gScale, `${e.name} • Lv ${e.lv}${enrTag}`, 1.0, 0.42, 0.36, 0.96, true);
      } else if (isBoss) {
        renderer.drawText(toScreenX(e.x), toScreenY(e.y, tagZ - 2), 8.0 * gScale, `${e.name} • Lv ${e.lv}${enrTag}`, 1.0, e.enraged ? 0.32 : 0.76, e.enraged ? 0.25 : 0.32, 0.92, false);
      } else if (e.isElite && Math.hypot(e.x - this.x, e.y - this.y) < 300) {
        renderer.drawText(toScreenX(e.x), toScreenY(e.y, tagZ), 7.4 * gScale, `${e.name} • Lv ${e.lv}`, 1.0, 0.86, 0.32, 0.86, false);
      }
    }

    // 11. Ultra-Detailed Semi-3D Hero Armor Knight & White Warhorse (Monospace-packed + Glossy Silver Rim!)
    const activeMat = this.build.computed.armorMaterial;
    const heroZ = this.z || 0;
    const horseZ = this.isMounted ? heroZ : (this.worldMap.getWalkZ ? this.worldMap.getWalkZ(this.horseX, this.horseY) : heroZ);
    const mountGrid = scaledSprite(96, 72, 2.55);
    emitPureAscii3DSprite({
      renderer,
      toScreenX,
      toScreenY,
      worldX: this.horseX,
      worldY: this.horseY,
      worldZ: horseZ,
      worldTiltY: WORLD_TILT_Y,
      cols: mountGrid.cols,
      rows: mountGrid.rows,
      worldSpan: 86,
      cellScreenSize: mountGrid.cellScreenSize,
      alphaMult: 0.99,
      rimColor: this.playerBleedTimer > 0 ? [1.0, 0.25, 0.28] : this.guardShield > 0 ? [0.45, 0.88, 1.0] : activeMat?.halo ? [1.0, 0.68, 0.28] : [1.0, 0.84, 0.48],
      lanternPos: lp,
      elapsed,
      enableMultiSize: true,
      buildModel: (buf) =>
        buildHeroKnight3D(buf, {
          facing: this.horseFacing,
          headingYaw: this.horseYaw,
          isMounted: this.isMounted,
          isMoving: (this.isMounted && this.isMoving) || this.callingHorse,
          gaitPhase: this.gaitPhase,
          gallopBlend: this.gallopBlend,
          slashProgress: this.isMounted ? slashProgress : 0,
          isDashing: this.isMounted && this.dashTimer > 0,
          swordFx: this.build.computed.swordFx,
          armorMaterial: activeMat,
          elapsed,
          showMountBody: true,
          showRiderBody: this.isMounted
        })
    });

    if (!this.isMounted) {
      const footGrid = scaledSprite(76, 58, 2.45);
      emitPureAscii3DSprite({
        renderer,
        toScreenX,
        toScreenY,
        worldX: this.x,
        worldY: this.y,
        worldZ: heroZ,
        worldTiltY: WORLD_TILT_Y,
        cols: footGrid.cols,
        rows: footGrid.rows,
        worldSpan: 60,
        cellScreenSize: footGrid.cellScreenSize,
        alphaMult: 0.99,
        rimColor: this.playerBleedTimer > 0 ? [1.0, 0.25, 0.28] : this.guardShield > 0 ? [0.45, 0.88, 1.0] : activeMat?.halo ? [1.0, 0.68, 0.28] : [1.0, 0.84, 0.48],
        lanternPos: lp,
        elapsed,
        enableMultiSize: true,
        buildModel: (buf) =>
          buildHeroKnight3D(buf, {
            facing: this.facing,
            headingYaw: this.yaw,
            isMounted: false,
            isMoving: this.isMoving,
            gaitPhase: this.gaitPhase,
            gallopBlend: this.gallopBlend,
            slashProgress,
            isDashing: this.dashTimer > 0,
            swordFx: this.build.computed.swordFx,
            armorMaterial: activeMat,
            elapsed,
            showMountBody: false,
            showRiderBody: true
          })
      });
      renderer.drawText(toScreenX(this.horseX), toScreenY(this.horseY, horseZ + 52 + Math.sin(elapsed * 3) * 2), 9 * gScale, '[H]', 0.45, 0.96, 1.0, 0.95, true);
    }

    if (this.guardShield > 0) {
      for (let i = 0; i < 6; i++) {
        const ga = elapsed * 2.8 + (i / 6) * Math.PI * 2;
        renderer.drawGlyph(toScreenX(this.x + Math.cos(ga) * 22), toScreenY(this.y + Math.sin(ga) * 16, heroZ + 18), 8.2 * gScale, '+', 0.45, 0.88, 1.0, 0.62, true);
      }
    }

    renderer.drawGlyph(toScreenX(lp.x), toScreenY(lp.y, (this.z || 0) + (this.isMounted ? 28 : 16)), 10 * gScale, '✦', 1.0, 0.85, 0.35, 0.88, true);

    // 12. Sword Slash Arcs, Falling Autumn Petals, Waterfall Mist, Sparkles, Water Wakes & Combat Text
    for (const arc of this.swordArcs) {
      const p = arc.age / arc.life;
      const steps = arc.whirl ? 16 : 9;
      for (let i = 0; i < steps; i++) {
        const a = arc.whirl ? (i / steps) * Math.PI * 2 + p * 4.5 : arc.ang + lerp(-1.15, 1.15, i / (steps - 1));
        const rDist = arc.rad * (0.85 + p * 0.28);
        renderer.drawGlyph(
          toScreenX(arc.x + Math.cos(a) * rDist),
          toScreenY(arc.y + Math.sin(a) * rDist),
          (arc.whirl ? 12.5 : 14) * gScale,
          i % 3 === 0 ? '✦' : i % 2 === 0 ? '/' : '*',
          arc.r,
          arc.g,
          arc.b,
          (1 - p) * 0.95,
          true
        );
      }
    }

    for (const m of this.ambientMotifs) {
      if (m.x < minX - 30 || m.x > maxX + 30 || m.y < minY - 30 || m.y > maxY + 30) continue;
      if (m.autumn) {
        renderer.drawGlyph(toScreenX(m.x), toScreenY(m.y), 7.5 * gScale, m.ch, 0.98, 0.44, 0.14, 0.84, true);
      } else {
        const tw = 0.35 + 0.55 * Math.max(0, Math.sin(elapsed * 2 + m.phase));
        renderer.drawGlyph(toScreenX(m.x), toScreenY(m.y), 6.5 * gScale, m.ch, 0.65, 0.95, 0.72, tw, true);
      }
    }

    if (wfCx + 280 > minX && wfCx - 280 < maxX && wfBy + 240 > minY && wfBy - 240 < maxY) {
      for (const p of this.waterfallParticles) {
        const t = p.age / p.life;
        const a = Math.sin(t * Math.PI) * 0.86;
        if (a < 0.06) continue;
        const dl = Math.hypot(p.x - lp.x, p.y - lp.y);
        const warm = Math.max(0, 1 - dl / 150);
        renderer.drawGlyph(
          toScreenX(p.x),
          toScreenY(p.y),
          p.baseSize * (0.8 + 0.3 * Math.sin(t * Math.PI)) * (cam.zoom / 1.38) * (cam.glyphScale || 1.0),
          p.ch,
          0.84 + warm * 0.16,
          0.92 - warm * 0.08,
          1.0 - warm * 0.48,
          a,
          p.baseSize > 16
        );
      }

      for (const sp of this.waterfallSparkles) {
        const a = Math.pow(Math.max(0, Math.sin(elapsed * sp.speed + sp.phase)), 2.2) * 0.92;
        if (a < 0.08) continue;
        renderer.drawGlyph(
          toScreenX(sp.x + Math.sin(elapsed * 1.4 + sp.phase) * 4),
          toScreenY(sp.y + ((elapsed * 22 + sp.phase * 14) % 36)),
          sp.size * (cam.zoom / 1.38) * (cam.glyphScale || 1.0),
          sp.ch,
          0.9,
          0.97,
          1.0,
          a,
          true
        );
      }
    }

    for (const wp of this.wakeParticles) {
      if (!wp.active) continue;
      renderer.drawGlyph(toScreenX(wp.x), toScreenY(wp.y), wp.size * gScale * 0.85, wp.ch, 0.84, 0.96, 1.0, (1 - wp.age / wp.life) * 0.85, true);
    }
    for (const rr of this.rippleRings) {
      if (!rr.active) continue;
      const t = rr.age / rr.life;
      const radX = 12 + t * 28;
      const radY = 6 + t * 14;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        renderer.drawGlyph(toScreenX(rr.x + Math.cos(ang) * radX), toScreenY(rr.y + Math.sin(ang) * radY), 7 * gScale, '~', 0.72, 0.9, 1.0, (1 - t) * 0.68, false);
      }
    }

    for (const fx of this.bossEffects) {
      const p = fx.age / fx.life;
      if (fx.kind === 'ring') {
        const curR = 14 + p * (fx.maxRadius - 14);
        const pts = 24;
        for (let i = 0; i < pts; i++) {
          const a = (i / pts) * Math.PI * 2 + elapsed * 2;
          renderer.drawGlyph(
            toScreenX(fx.x + Math.cos(a) * curR),
            toScreenY(fx.y + Math.sin(a) * curR * 0.72),
            (11.5 - p * 3.5) * gScale,
            i % 2 === 0 ? fx.ch : '*',
            fx.r,
            fx.g,
            fx.b,
            (1 - p) * 0.92,
            true
          );
        }
      } else if (fx.kind === 'bolt') {
        renderer.drawGlyph(toScreenX(fx.x), toScreenY(fx.y), 13 * gScale, fx.ch, fx.r, fx.g, fx.b, (1 - p * 0.4) * 0.96, true);
        renderer.drawGlyph(
          toScreenX(fx.x - fx.vx * 0.03),
          toScreenY(fx.y - fx.vy * 0.03),
          9.5 * gScale,
          '+',
          fx.r,
          fx.g,
          fx.b,
          (1 - p) * 0.65,
          true
        );
      }
    }

    for (const cp of this.combatParticles) {
      if (!cp.active) continue;
      renderer.drawGlyph(toScreenX(cp.x), toScreenY(cp.y), cp.size * gScale * 0.8, cp.ch, cp.r, cp.g, cp.b, 1 - cp.age / cp.life, true);
    }

    for (const ft of this.floatingTexts) {
      const a = 1 - Math.pow(ft.age / ft.life, 1.6);
      renderer.drawText(toScreenX(ft.x), toScreenY(ft.y), ft.size * (cam.zoom / 1.38), ft.text, ft.r, ft.g, ft.b, a, true);
    }

    // 13. Atmospheric Rainstorm Streaks & Expanding Puddle Splash Circles (Download(2).mp4 & Download(6).mp4!)
    if (this.rainEnabled) {
      for (const rd of this.rainDrops) {
        const sx = cam.vw * 0.5 + rd.ox * cam.zoom;
        const sy = cam.vh * 0.5 + rd.oy * cam.zoom;
        if (rd.splashing) {
          const spA = 1 - rd.splashAge / 0.32;
          const glyph = rd.splashAge < 0.14 ? 'o' : '(o)';
          renderer.drawText(sx, sy, 8.5 * gScale * 0.7, glyph, 0.72, 0.88, 1.0, spA * 0.68, false);
        } else {
          renderer.drawGlyph(sx, sy, 10.5 * (cam.zoom / 1.38), '/', 0.72, 0.86, 1.0, 0.42 + this.lightningFlash * 0.3, false);
        }
      }
    }
  }

  _emitReflectedMoonAndClouds(renderer, minX, maxX, minY, maxY, toScreenX, toScreenY, gScale, elapsed, camZoom = 1.38) {
    const lakeLod = clamp(camZoom / 1.15, 0.46, 1.0);
    const stepMul = 1 / lakeLod;
    const sizeBoost = Math.sqrt(stepMul);

    // 1. Subtle Drifting Night Clouds in Plunge Pool (north glade water)
    const px = this.worldMap.plungePoolX;
    const py = this.worldMap.plungePoolY + 12;
    if (px + 170 >= minX && px - 170 <= maxX && py + 130 >= minY && py - 130 <= maxY) {
      const pStep = 6.5 * stepMul;
      for (let cy = -65; cy <= 65; cy += pStep) {
        const wy = py + cy;
        const rippleX = Math.sin(wy * 0.24 + elapsed * 2.3) * 1.8;
        for (let cx = -110; cx <= 110; cx += pStep) {
          const wx = px + cx;
          if (!this.worldMap.isWater(wx, wy)) continue;
          const n =
            Math.sin((wx + elapsed * 6.5) * 0.025 + Math.cos(wy * 0.03)) * 0.52 +
            Math.cos((wx - elapsed * 4.5) * 0.048 - wy * 0.026) * 0.48;
          if (n < 0.16) continue;
          const env = clamp(1 - Math.hypot(cx * 0.72, cy) / 96, 0, 1);
          if (env <= 0.08) continue;
          const d = clamp((n - 0.16) * env, 0, 1);
          const ch = CLOUD_CHARS[Math.floor(d * CLOUD_CHARS.length * 1.6) % CLOUD_CHARS.length];
          renderer.drawGlyph(toScreenX(wx + rippleX), toScreenY(wy), 5.6 * gScale * sizeBoost, ch, 0.56, 0.68, 0.84, d * 0.34, false);
        }
      }
    }

    // 2. Mirror Lake: Volumetric Moonlit Night Clouds + Cratered Full Moon + Lunar Corona + Shimmer Path
    const mx = this.worldMap.mirrorLakeX;
    const my = this.worldMap.mirrorLakeY + 16;
    const radius = 68;
    if (mx + 290 < minX || mx - 290 > maxX || my + 240 < minY || my - 240 > maxY) return;

    // Soft Silver-Blue Atmospheric Lunar Halo / Corona Ring in Dark Water
    for (let ring = 0; ring < 3; ring++) {
      const rHalo = radius + 7 + ring * 13;
      const pts = Math.max(18, Math.round((32 + ring * 10) * lakeLod));
      const pulse = 0.85 + 0.15 * Math.sin(elapsed * 1.9 + ring);
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2 + elapsed * (ring % 2 === 0 ? 0.04 : -0.03);
        const hx = mx + Math.cos(a) * rHalo + Math.sin(my + Math.sin(a) * rHalo * 0.25 + elapsed * 2.5) * 1.8;
        const hy = my + Math.sin(a) * rHalo;
        if (!this.worldMap.isWater(hx, hy)) continue;
        const ch = ring === 0 ? '+' : ring === 1 ? '*' : '.';
        renderer.drawGlyph(
          toScreenX(hx),
          toScreenY(hy),
          (6.2 - ring * 0.8) * gScale * sizeBoost,
          ch,
          0.62,
          0.74,
          0.94,
          (0.28 - ring * 0.075) * pulse,
          ring === 0
        );
      }
    }

    // Volumetric Multi-Octave Moonlight Clouds (Bright Silver Tops facing Moon, Cool Slate Undersides)
    const cloudStep = 5.2 * stepMul;
    for (let cy = -112; cy <= 108; cy += cloudStep) {
      const wy = my + cy;
      const scanWave = Math.sin(wy * 0.21 + elapsed * 2.15) * 2.4;
      for (let cx = -235; cx <= 215; cx += cloudStep) {
        const wx = mx + cx;
        if (!this.worldMap.isWater(wx, wy)) continue;

        const wDx = wx + elapsed * 7.2;
        const oct1 = Math.sin(wDx * 0.019 + Math.cos(wy * 0.027)) * 0.5;
        const oct2 = Math.cos((wx - elapsed * 4.4) * 0.041 - wy * 0.025) * 0.34;
        const oct3 = Math.sin((wx + elapsed * 10.5) * 0.078 + wy * 0.055) * 0.16;
        const density = oct1 + oct2 + oct3;
        if (density < 0.04) continue;

        const env = clamp(1 - Math.hypot(cx * 0.52, cy * 0.88) / 155, 0, 1);
        if (env <= 0.04) continue;

        const distMoon = Math.hypot(cx, cy);
        const moonRimLit = clamp(1 - Math.abs(distMoon - (radius + 26)) / 92, 0, 1);
        const discClear = distMoon < radius - 4 ? 0.16 : distMoon < radius + 12 ? 0.58 : 1.0;
        const dense = clamp((density - 0.04) * env * discClear * 1.45, 0, 1);
        if (dense < 0.06) continue;

        const crestLight = clamp(0.35 + moonRimLit * 0.62 + (-oct2) * 0.25, 0.2, 1.0);
        const ch = dense > 0.62 ? (crestLight > 0.7 ? '*' : '+') : CLOUD_CHARS[Math.floor(dense * CLOUD_CHARS.length) % CLOUD_CHARS.length];
        renderer.drawGlyph(
          toScreenX(wx + scanWave),
          toScreenY(wy),
          (5.4 + dense * 1.4) * gScale * sizeBoost,
          ch,
          0.42 + crestLight * 0.44,
          0.5 + crestLight * 0.4,
          0.66 + crestLight * 0.32,
          clamp(dense * 0.46, 0.06, 0.48),
          moonRimLit > 0.65 && dense > 0.55
        );
      }
    }

    // Hyper-Detailed Cratered Moon (Mare Basins, Crater Rims, Spherical Limb Shading & Ripple Scanlines)
    const mStep = 3.9 * stepMul;
    const craters = [
      { cx: -22, cy: -18, r: 15, rim: 0.26 },
      { cx: 24, cy: -10, r: 12, rim: 0.24 },
      { cx: -8, cy: 26, r: 18, rim: 0.32 },
      { cx: 16, cy: 22, r: 9, rim: 0.2 }
    ];
    for (let dy = -radius; dy <= radius; dy += mStep) {
      const wy = my + dy;
      const ripple = Math.sin(wy * 0.29 + elapsed * 3.1) * (1.4 + Math.max(0, dy / radius) * 2.1);
      for (let dx = -radius; dx <= radius; dx += mStep) {
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;
        const wx = mx + dx;
        if (!this.worldMap.isWater(wx, wy)) continue;

        const nx = dx / radius;
        const ny = dy / radius;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const sphereLight = clamp(0.46 + nz * 0.56 - nx * 0.14 - ny * 0.1, 0.15, 1.0);

        const mare =
          Math.sin(dx * 0.075 + 1.2) * Math.cos(dy * 0.09 - 0.8) * 0.26 +
          Math.sin(dx * 0.14 - dy * 0.11) * 0.12;
        let craterMod = 0;
        for (let ci = 0; ci < craters.length; ci++) {
          const cr = craters[ci];
          const dc = Math.hypot(dx - cr.cx, dy - cr.cy);
          if (dc < cr.r) {
            const rt = dc / cr.r;
            craterMod += rt > 0.72 ? cr.rim : -0.22 * (1 - rt);
          }
        }
        const shade = clamp(sphereLight + mare + craterMod, 0.12, 1.0);
        const charIdx = Math.floor((1 - shade) * MOON_CHARS.length) % MOON_CHARS.length;
        const ch = MOON_CHARS[charIdx];
        renderer.drawGlyph(
          toScreenX(wx + ripple),
          toScreenY(wy),
          4.9 * gScale * sizeBoost,
          ch,
          0.78 + shade * 0.22,
          0.84 + shade * 0.16,
          0.92 + shade * 0.08,
          clamp(0.32 + shade * 0.62, 0.28, 0.96),
          shade > 0.84
        );
      }
    }

    // Broken Shimmering Moonlight Column Across South Water Ripples
    const shStepY = 5.5 * stepMul;
    const shStepX = 6.2 * stepMul;
    for (let yOff = radius + 5; yOff < radius + 78; yOff += shStepY) {
      const wy = my + yOff;
      const falloff = 1 - (yOff - radius) / 78;
      const bandWidth = (42 - falloff * 14) * falloff + 6;
      const rowSway = Math.sin(wy * 0.34 + elapsed * 3.6) * (3.5 + (1 - falloff) * 4);
      for (let sx = -bandWidth; sx <= bandWidth; sx += shStepX) {
        const wx = mx + sx + rowSway;
        if (!this.worldMap.isWater(wx, wy)) continue;
        const h = hashInt(Math.round(sx / 6), Math.round(yOff / 5));
        if (h < 0.28) continue;
        const core = 1 - Math.abs(sx) / Math.max(1, bandWidth);
        const shimmer = 0.55 + 0.45 * Math.sin(elapsed * 4.5 + yOff * 0.25 + h * 6);
        const ch = core > 0.65 && h > 0.7 ? '=' : core > 0.4 ? '-' : '~';
        renderer.drawGlyph(
          toScreenX(wx),
          toScreenY(wy),
          (5.2 + core * 1.4) * gScale * sizeBoost,
          ch,
          0.76 + core * 0.22,
          0.86 + core * 0.14,
          0.98,
          clamp(falloff * core * shimmer * 0.68, 0.06, 0.72),
          core > 0.72 && shimmer > 0.8
        );
      }
    }
  }

  _emitWaterfallAscii(renderer, cx, topY, botY, width, elapsed, lp, toScreenX, toScreenY, gScale) {
    const cols = 7;
    const span = botY - topY;
    for (let c = 0; c < cols; c++) {
      const frac = c / (cols - 1);
      const bx = cx + (frac - 0.5) * width * 0.88;
      for (let ry = 0; ry < span; ry += 10.5) {
        const animY = topY + ((ry + elapsed * 155 + c * 21) % span);
        const h = hashInt(c * 41, Math.floor((ry + elapsed * 8) % 97));
        if (h > 0.8) continue;
        const spreadX = bx + ((animY - topY) / span) * (frac - 0.5) * width * 0.32;
        const ch = h < 0.28 ? '|' : h < 0.55 ? '0' : 'o';
        const warm = clamp(1 - Math.hypot(spreadX - lp.x, animY - lp.y) / 145, 0, 1);
        renderer.drawGlyph(
          toScreenX(spreadX),
          toScreenY(animY),
          (8.0 + h * 4.2) * gScale,
          ch,
          0.84 + warm * 0.16,
          0.93 - warm * 0.08,
          1.0 - warm * 0.42,
          0.76,
          true
        );
      }
    }
  }

  _emitDistantHorizonVista(renderer, cam, minX, maxX, minY, toScreenX, gScale, elapsed) {
    // True 3D Twilight Forest Horizon + Multi-Tower Raytraced Citadel + Luminous Blooming Cloud Wisps!
    const skyY = clamp(cam.vh * 0.16, 48, 175);
    const parScale = clamp(cam.zoom / 1.38, 0.45, 1.35);

    // 1. Atmospheric Distant Twilight Woodland Tree-Crown Band along upper skyline
    const forestCols = Math.ceil(cam.vw / 22);
    for (let i = 0; i <= forestCols; i++) {
      const sx = (i / forestCols) * cam.vw;
      const worldParallaxX = sx + cam.x * 0.22;
      const ridgeH =
        16 +
        Math.sin(worldParallaxX * 0.014) * 10 +
        Math.cos(worldParallaxX * 0.037) * 7 +
        Math.sin(worldParallaxX * 0.08) * 4;
      const layers = Math.max(2, Math.floor(ridgeH / 7));
      for (let ly = 0; ly < layers; ly++) {
        const yPos = skyY + 30 - ly * 6.5;
        const h = hashInt(Math.round(worldParallaxX * 0.12), ly * 17);
        const ch = ly === layers - 1 ? (h > 0.5 ? '^' : '*') : h > 0.65 ? '%' : h > 0.35 ? '#' : ';';
        const tint = ly / Math.max(1, layers);
        renderer.drawGlyph(
          sx,
          yPos,
          6.8 * Math.max(0.75, parScale * 0.9),
          ch,
          0.08 + tint * 0.12,
          0.19 + tint * 0.16,
          0.22 + tint * 0.24,
          0.56 - tint * 0.18,
          false
        );
      }
    }

    // 2. Drifting Volumetric Luminous Twilight Cloud Banks (Bloom-lit over Valley!)
    for (let cIdx = 0; cIdx < 5; cIdx++) {
      const cwSpeed = 8.5 + (cIdx % 3) * 3.5;
      const rawCx = ((cIdx * 430 + elapsed * cwSpeed - cam.x * 0.14) % (cam.vw + 520));
      const baseCx = (rawCx < -260 ? rawCx + cam.vw + 520 : rawCx) - 180;
      const baseCy = skyY - 12 + (cIdx % 3) * 20;
      const cloudW = 135 + (cIdx % 2) * 55;
      const cloudH = 26 + (cIdx % 3) * 8;

      for (let gy = -cloudH; gy <= cloudH; gy += 7.5) {
        for (let gx = -cloudW; gx <= cloudW; gx += 7.5) {
          const h = hashInt(Math.round(gx * 0.25) + cIdx * 31, Math.round(gy * 0.25) + 19);
          const ell = (gx / cloudW) * (gx / cloudW) + (gy / cloudH) * (gy / cloudH) + (h - 0.5) * 0.35;
          if (ell > 0.92) continue;
          const topLit = clamp(0.45 - gy / (cloudH * 1.6), 0.1, 1.0);
          const puff = clamp((1.0 - ell) * 0.72, 0.15, 0.92);
          const ch = puff > 0.62 ? '&' : puff > 0.42 ? '%' : puff > 0.24 ? '*' : '.';
          const isCrest = puff > 0.58 && topLit > 0.52;
          renderer.drawGlyph(
            baseCx + gx,
            baseCy + gy,
            (5.5 + puff * 3.0) * Math.max(0.8, parScale),
            ch,
            lerp(0.48, 0.92, topLit),
            lerp(0.56, 0.96, topLit),
            lerp(0.68, 1.0, topLit),
            puff * 0.52,
            isCrest
          );
        }
      }
    }
  }

  _emitLandmarksAscii(renderer, minX, maxX, minY, maxY, toScreenX, toScreenY, gScale, elapsed, lp, propLod = 1.0, lodTier = 4) {
    const pilCols = Math.max(6, Math.round(11 * propLod));
    const pilRows = Math.max(12, Math.round(24 * propLod));
    const pilCell = 4.0 * (11 / pilCols) * gScale;

    // Sunken Stone Bastion Ruin Pillars + Archways
    const bx = this.worldMap.bastionPos.x;
    const by = this.worldMap.bastionPos.y;
    if (bx > minX - 180 && bx < maxX + 180 && by > minY - 180 && by < maxY + 180) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const px = bx + Math.cos(a) * 118;
        const py = by + Math.sin(a) * 86;
        emitPureAscii3DProp({
          renderer,
          toScreenX,
          toScreenY,
          worldX: px,
          worldY: py,
          worldZ: this.worldMap.getTerrainZ(px, py),
          worldTiltY: WORLD_TILT_Y,
          cols: pilCols,
          rows: pilRows,
          worldSpanX: 28,
          worldSpanY: 72,
          cellScreenSize: pilCell,
          lanternPos: lp,
          elapsed,
          cacheKey: `pil_bastion_${i}_${lodTier}`,
          buildProp: (buf) => buildPillar3D(buf, 'bastion')
        });
      }
    }

    // Northern Wyrm Ashen Peak Bone & Obsidian Monoliths
    const wx = this.worldMap.wyrmPeakPos.x;
    const wy = this.worldMap.wyrmPeakPos.y;
    if (wx > minX - 240 && wx < maxX + 240 && wy > minY - 240 && wy < maxY + 240) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        const px = wx + Math.cos(a) * 138;
        const py = wy + Math.sin(a) * 96;
        emitPureAscii3DProp({
          renderer,
          toScreenX,
          toScreenY,
          worldX: px,
          worldY: py,
          worldZ: this.worldMap.getTerrainZ(px, py),
          worldTiltY: WORLD_TILT_Y,
          cols: pilCols,
          rows: pilRows,
          worldSpanX: 28,
          worldSpanY: 72,
          cellScreenSize: pilCell,
          lanternPos: lp,
          elapsed,
          cacheKey: `pil_wyrm_${i}_${lodTier}`,
          buildProp: (buf) => buildPillar3D(buf, 'wyrm')
        });
      }
    }

    // 1. Mossy Spiral Watchtower High Ground (Download(3).mp4!)
    const tw = this.worldMap.towerPos;
    if (tw.x > minX - 180 && tw.x < maxX + 180 && tw.y > minY - 180 && tw.y < maxY + 180) {
      const twCols = Math.max(22, Math.round(48 * propLod));
      const twRows = Math.max(24, Math.round(52 * propLod));
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: tw.x,
        worldY: tw.y,
        worldZ: this.worldMap.getTerrainZ(tw.x, tw.y),
        worldTiltY: WORLD_TILT_Y,
        cols: twCols,
        rows: twRows,
        worldSpanX: 156,
        worldSpanY: 176,
        cellScreenSize: 4.6 * (48 / twCols) * gScale,
        lanternPos: lp,
        elapsed,
        buildProp: (buf) => buildWatchtower3D(buf, elapsed)
      });
    }

    // 2. Ruined Brick Fortress Gate Archway Overtaken by Vines (Download(4).mp4!)
    const fg = this.worldMap.fortressGatePos;
    if (fg.x > minX - 190 && fg.x < maxX + 190 && fg.y > minY - 170 && fg.y < maxY + 170) {
      const fgCols = Math.max(26, Math.round(60 * propLod));
      const fgRows = Math.max(14, Math.round(32 * propLod));
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: fg.x,
        worldY: fg.y,
        worldZ: this.worldMap.getTerrainZ(fg.x, fg.y),
        worldTiltY: WORLD_TILT_Y,
        cols: fgCols,
        rows: fgRows,
        worldSpanX: 210,
        worldSpanY: 110,
        cellScreenSize: 4.6 * (60 / fgCols) * gScale,
        lanternPos: lp,
        elapsed,
        cacheKey: `fgate_${lodTier}`,
        buildProp: (buf) => buildFortressGate3D(buf)
      });
    }

    // 3. Ancient Carved River Monoliths Casting Long Diagonal Shadows (Download(9).mp4!)
    const monoliths = [
      { x: this.worldMap.plungePoolX - 96, y: this.worldMap.plungePoolY + 135 },
      { x: this.worldMap.mirrorLakeX - 140, y: this.worldMap.mirrorLakeY - 210 }
    ];
    for (let mi = 0; mi < monoliths.length; mi++) {
      const m = monoliths[mi];
      if (m.x < minX - 80 || m.x > maxX + 80 || m.y < minY - 80 || m.y > maxY + 80) continue;
      const mz = this.worldMap.getTerrainZ(m.x, m.y);
      for (let s = 1; s <= 5; s++) {
        renderer.drawText(toScreenX(m.x + s * 6), toScreenY(m.y + s * 3.5, mz), 7.5 * gScale, ':::', 0.04, 0.08, 0.06, 0.45, false);
      }
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: m.x,
        worldY: m.y,
        worldZ: mz,
        worldTiltY: WORLD_TILT_Y,
        cols: pilCols,
        rows: pilRows,
        worldSpanX: 28,
        worldSpanY: 72,
        cellScreenSize: pilCell,
        lanternPos: lp,
        elapsed,
        cacheKey: `pil_mono_${mi}_${lodTier}`,
        buildProp: (buf) => buildPillar3D(buf, 'bastion')
      });
    }

    // 4. High Ground Plateau Abyssal Cloud Sea (Download(7).mp4!)
    const hg = this.worldMap.highGroundPos;
    if (hg.x > minX - 240 && hg.x < maxX + 240 && hg.y > minY - 220 && hg.y < maxY + 220) {
      const hgz = this.worldMap.getTerrainZ(hg.x, hg.y);
      for (let i = 0; i < 36; i++) {
        const cx = hg.x - 120 + (i % 9) * 28 + Math.sin(elapsed * 0.6 + i) * 14;
        const cy = hg.y + 45 + Math.floor(i / 9) * 18;
        renderer.drawText(toScreenX(cx), toScreenY(cy, hgz), 8.8 * gScale, i % 2 === 0 ? '...:..' : '::*.:', 0.78, 0.85, 0.94, 0.34, false);
      }
    }

    // 5. Ancient Arched Sea-Strait Bridges (Central & North Gorge) & Sunken Crypt Courtyard Pillared Sanctum!
    const bridges = [this.worldMap.bridgePos];
    if (this.worldMap.bridgeNorthPos) bridges.push(this.worldMap.bridgeNorthPos);
    for (let bi = 0; bi < bridges.length; bi++) {
      const br = bridges[bi];
      if (br.x > minX - 100 && br.x < maxX + 100 && br.y > minY - 80 && br.y < maxY + 80) {
        const brCols = Math.max(16, Math.round(34 * propLod));
        const brRows = Math.max(10, Math.round(22 * propLod));
        emitPureAscii3DProp({
          renderer,
          toScreenX,
          toScreenY,
          worldX: br.x,
          worldY: br.y,
          worldZ: 0,
          worldTiltY: WORLD_TILT_Y,
          cols: brCols,
          rows: brRows,
          worldSpanX: 104,
          worldSpanY: 64,
          cellScreenSize: 4.2 * (34 / brCols) * gScale,
          lanternPos: lp,
          elapsed,
          cacheKey: `bridge_${bi}_${lodTier}`,
          buildProp: (buf) => buildBridge3D(buf)
        });
      }
    }

    const cr = this.worldMap.cryptPos;
    if (cr.x > minX - 180 && cr.x < maxX + 180 && cr.y > minY - 180 && cr.y < maxY + 180) {
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const ox = cr.x + Math.cos(ang) * 95;
        const oy = cr.y + Math.sin(ang) * 72;
        emitPureAscii3DProp({
          renderer,
          toScreenX,
          toScreenY,
          worldX: ox,
          worldY: oy,
          worldZ: this.worldMap.getTerrainZ(ox, oy),
          worldTiltY: WORLD_TILT_Y,
          cols: pilCols,
          rows: pilRows,
          worldSpanX: 28,
          worldSpanY: 72,
          cellScreenSize: pilCell,
          lanternPos: lp,
          elapsed,
          cacheKey: `pil_crypt_${i}_${lodTier}`,
          buildProp: (buf) => buildPillar3D(buf, 'crypt')
        });
      }
    }

    // 6. Northern Crown Obsidian Sanctum Pillars (clean grounded stone arena)
    const ct = this.worldMap.citadelPos;
    if (ct.x > minX - 380 && ct.x < maxX + 380 && ct.y > minY - 460 && ct.y < maxY + 340) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = ct.x + Math.cos(a) * 145;
        const py = ct.y + Math.sin(a) * 105;
        emitPureAscii3DProp({
          renderer,
          toScreenX,
          toScreenY,
          worldX: px,
          worldY: py,
          worldZ: this.worldMap.getTerrainZ(px, py),
          worldTiltY: WORLD_TILT_Y,
          cols: pilCols,
          rows: pilRows,
          worldSpanX: 28,
          worldSpanY: 72,
          cellScreenSize: pilCell,
          lanternPos: lp,
          elapsed,
          cacheKey: `pil_crown_${i}_${lodTier}`,
          buildProp: (buf) => buildPillar3D(buf, 'wyrm')
        });
      }
    }

    const ob = this.worldMap.obeliskPos;
    if (ob.x > minX - 340 && ob.x < maxX + 340 && ob.y > minY - 340 && ob.y < maxY + 340) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const ox = ob.x + Math.cos(a) * 110;
        const oy = ob.y + Math.sin(a) * 85;
        emitPureAscii3DProp({
          renderer,
          toScreenX,
          toScreenY,
          worldX: ox,
          worldY: oy,
          worldZ: this.worldMap.getTerrainZ(ox, oy),
          worldTiltY: WORLD_TILT_Y,
          cols: 16,
          rows: 34,
          worldSpanX: 38,
          worldSpanY: 118,
          cellScreenSize: 4.4 * gScale,
          lanternPos: lp,
          elapsed,
          buildProp: (buf) => buildHorizonVistaTower3D(buf, 'obelisk', elapsed)
        });
      }
    }

    const ew = this.worldMap.elderwoodPos;
    if (ew.x > minX - 320 && ew.x < maxX + 320 && ew.y > minY - 320 && ew.y < maxY + 320) {
      emitPureAscii3DProp({
        renderer,
        toScreenX,
        toScreenY,
        worldX: ew.x,
        worldY: ew.y,
        worldZ: this.worldMap.getTerrainZ(ew.x, ew.y),
        worldTiltY: WORLD_TILT_Y,
        cols: 22,
        rows: 38,
        worldSpanX: 56,
        worldSpanY: 120,
        cellScreenSize: 4.5 * gScale,
        lanternPos: lp,
        elapsed,
        buildProp: (buf) => buildHorizonVistaTower3D(buf, 'elderwood', elapsed)
      });
    }
  }
}
