/**
 * MMORPG + ARPG Hybrid Progression, Multi-Layer Defenses, Damage Scaling,
 * Passive Skill Tree, Classless Gear System, and 4-Skill Tactical Loadout.
 */

export const CRAFT_MATERIALS = [
  { id: 'as_forged', code: '  ', name: 'As forged', hex: '#4a5058', trim: '#78828e', swordFx: 'steel', halo: false, mods: {} },
  { id: 'iron', code: '#%', name: 'Iron', hex: '#86909c', trim: '#b8c2ce', swordFx: 'steel', halo: false, mods: { armor: 18, dmgFlat: 2 } },
  { id: 'steel', code: '%*', name: 'Steel', hex: '#aebbc8', trim: '#e2ecf5', swordFx: 'steel', halo: false, mods: { armor: 26, dmgFlat: 5, blockChance: 4 } },
  { id: 'bronze', code: '$o', name: 'Bronze', hex: '#c88842', trim: '#f2b866', swordFx: 'ember', halo: false, mods: { armor: 20, maxHp: 28, dmgFlat: 4 } },
  { id: 'silver', code: '$%', name: 'Silver', hex: '#dbe7f2', trim: '#ffffff', swordFx: 'frost', halo: false, mods: { atkSpdPct: 8, evasion: 5, critChance: 4 } },
  { id: 'gold', code: '#*', name: 'Gold', hex: '#f5c238', trim: '#fff3a1', swordFx: 'ember', halo: false, mods: { critChance: 6, critMult: 22, moveSpdPct: 5 } },
  { id: 'moonsteel', code: '0*', name: 'Moonsteel', hex: '#6ed4ff', trim: '#e0f7ff', swordFx: 'frost', halo: true, mods: { critChance: 8, evasion: 8, dmgPct: 10 } },
  { id: 'nightglass', code: 'U:', name: 'Nightglass', hex: '#635bff', trim: '#b4afff', swordFx: 'frost', halo: false, mods: { evasion: 14, atkSpdPct: 12, critMult: 28 } },
  { id: 'blooderon', code: '0E', name: 'Blooderon', hex: '#db2b3c', trim: '#ff8a96', swordFx: 'crimson', halo: true, mods: { lifeOnHit: 5, dmgPct: 16, bleedChance: 25 } },
  { id: 'osite', code: '•~', name: 'Osite', hex: '#d8c094', trim: '#fff1d0', swordFx: 'steel', halo: false, mods: { blockChance: 10, armor: 32, maxHp: 35 } },
  { id: 'emberstone', code: '=*', name: 'Emberstone', hex: '#ff6418', trim: '#ffcf54', swordFx: 'ember', halo: true, mods: { dmgPct: 20, critChance: 8, critMult: 35 } },
  { id: 'dragonscale', code: 'V>', name: 'Dragonscale', hex: '#3ed67a', trim: '#ffe066', swordFx: 'ember', halo: true, mods: { armor: 46, maxHp: 55, dmgPct: 16, blockChance: 8 } }
];

export const RUNE_PALETTE = [
  { ch: '+', name: 'Rune of Vitality', desc: '+18 Max HP, +2 Leech', mods: { maxHp: 18, lifeOnHit: 2 } },
  { ch: '*', name: 'Rune of Fury', desc: '+4% Crit Chance, +15% Crit Dmg', mods: { critChance: 4, critMult: 15 } },
  { ch: '=', name: 'Rune of Bastion', desc: '+14 Armor, +4% Block', mods: { armor: 14, blockChance: 4 } },
  { ch: '-', name: 'Rune of Wind', desc: '+5% Evasion, +4% Move Spd', mods: { evasion: 5, moveSpdPct: 4 } },
  { ch: 'z', name: 'Rune of Sparks', desc: '+6% Attack Speed, +3 Dmg', mods: { atkSpdPct: 6, dmgFlat: 3 } },
  { ch: '~', name: 'Rune of Flow', desc: '+15 Max Stamina, +4% Evasion', mods: { maxStamina: 15, evasion: 4 } },
  { ch: '>', name: 'Rune of Piercing', desc: '+8% Physical Damage', mods: { dmgPct: 8 } },
  { ch: '/', name: 'Rune of Edge', desc: '+4 Dmg, +3% Crit Chance', mods: { dmgFlat: 4, critChance: 3 } },
  { ch: 'x', name: 'Rune of Spikes', desc: '+20% Thorns, +10 Armor', mods: { thornsPct: 20, armor: 10 } },
  { ch: 'V', name: 'Rune of Wyrm', desc: '+22% Crit Dmg, +10% Bleed', mods: { critMult: 22, bleedChance: 10 } },
  { ch: 'o', name: 'Rune of Shielding', desc: '+5% Block Chance', mods: { blockChance: 5 } },
  { ch: '$', name: 'Rune of Fortune', desc: '+6% Dmg, +10 Max HP', mods: { dmgPct: 6, maxHp: 10 } }
];

export const ARCHETYPES = {
  knight: {
    id: 'knight',
    name: 'Knight Errant',
    desc: 'Balanced steel plate, horseback charge, and steady swordsmanship.',
    might: 14,
    agility: 10,
    fortitude: 14
  },
  stalker: {
    id: 'stalker',
    name: 'Ash Stalker',
    desc: 'High crit, rapid evasion, razor bleed procs, and quick dashes.',
    might: 11,
    agility: 16,
    fortitude: 9
  },
  warden: {
    id: 'warden',
    name: 'Iron Warden',
    desc: 'Fortified shield mastery, deep armor scaling, and crushing parries.',
    might: 12,
    agility: 8,
    fortitude: 17
  }
};

export const PASSIVE_TREE = [
  // Origin root
  {
    id: 'root',
    name: 'Awakened Blood',
    branch: 'Core',
    row: 2,
    col: 2,
    req: [],
    desc: '+15 Max HP, +3 Base Damage, +2% Attack Speed',
    mods: { maxHp: 15, dmgFlat: 3, atkSpdPct: 2 }
  },
  // Vanguard / Defense Wing (Left column: cols 0-1)
  {
    id: 'iron_skin',
    name: 'Tempered Mail',
    branch: 'Juggernaut',
    row: 2,
    col: 1,
    req: ['root'],
    desc: '+28 Armor, +12 Max HP',
    mods: { armor: 28, maxHp: 12 }
  },
  {
    id: 'bulwark',
    name: 'Bastion Stance',
    branch: 'Juggernaut',
    row: 1,
    col: 1,
    req: ['iron_skin'],
    desc: '+9% Block Chance, +0.5s Shield Bash Stun',
    mods: { blockChance: 9, stunBonus: 0.5 }
  },
  {
    id: 'thorns',
    name: 'Retaliation Spikes',
    branch: 'Juggernaut',
    row: 2,
    col: 0,
    req: ['iron_skin'],
    desc: 'Reflect 35% of Blocked damage, +15% Armor',
    mods: { armorPct: 15, thornsPct: 35 }
  },
  {
    id: 'unbreakable',
    name: 'Citadel Heart',
    branch: 'Juggernaut',
    row: 0,
    col: 0,
    req: ['bulwark', 'thorns'],
    desc: '+45 Max HP, +8% Block Chance, +35 Armor',
    mods: { maxHp: 45, blockChance: 8, armor: 35 }
  },
  // Shadowblade / Crit & Evasion Wing (Top & Right)
  {
    id: 'swift_step',
    name: 'Mist Footwork',
    branch: 'Shadowblade',
    row: 1,
    col: 2,
    req: ['root'],
    desc: '+8% Evasion, +8% Move Speed, -15% Dash Cooldown',
    mods: { evasion: 8, moveSpdPct: 8, dashCdPct: 15 }
  },
  {
    id: 'keen_edge',
    name: 'Keen Edge',
    branch: 'Shadowblade',
    row: 0,
    col: 2,
    req: ['swift_step'],
    desc: '+9% Crit Chance, +25% Crit Multiplier',
    mods: { critChance: 9, critMult: 25 }
  },
  {
    id: 'serrated',
    name: 'Crimson Bleed',
    branch: 'Shadowblade',
    row: 0,
    col: 3,
    req: ['keen_edge'],
    desc: 'Critical strikes apply deep Bleed (45% weapon dmg / 3s)',
    mods: { bleedChance: 40, bleedDmgPct: 45 }
  },
  {
    id: 'phantom',
    name: 'Phantom Mirage',
    branch: 'Shadowblade',
    row: 1,
    col: 4,
    req: ['serrated', 'swift_step'],
    desc: '+10% Evasion, +8% Crit Chance, +10% Attack Speed',
    mods: { evasion: 10, critChance: 8, atkSpdPct: 10 }
  },
  // Executioner / Damage Wing (Bottom & Right)
  {
    id: 'heavy_cleave',
    name: 'Brutal Cleave',
    branch: 'Executioner',
    row: 2,
    col: 3,
    req: ['root'],
    desc: '+14% Physical Damage, +22% Cleave Reach',
    mods: { dmgPct: 14, reachPct: 22 }
  },
  {
    id: 'executioner',
    name: 'Headsman Oath',
    branch: 'Executioner',
    row: 3,
    col: 3,
    req: ['heavy_cleave'],
    desc: '+35% Damage against targets below 40% HP',
    mods: { executePct: 35, dmgFlat: 4 }
  },
  {
    id: 'blood_feast',
    name: 'Ashen Siphon',
    branch: 'Executioner',
    row: 3,
    col: 2,
    req: ['root', 'executioner'],
    desc: '+4 Life on Hit, +14 Life on Kill',
    mods: { lifeOnHit: 4, lifeOnKill: 14 }
  },
  {
    id: 'rend_master',
    name: 'Abyssal Tempest',
    branch: 'Executioner',
    row: 2,
    col: 4,
    req: ['heavy_cleave'],
    desc: '+22% Physical Damage, +35% Crit Mult, +12% Attack Speed',
    mods: { dmgPct: 22, critMult: 35, atkSpdPct: 12 }
  }
];

const RARITY_LIST = [
  { key: 'common', label: 'Iron', mult: 1.0, rgb: [0.76, 0.8, 0.84], affixCount: 1 },
  { key: 'forged', label: 'Tempered', mult: 1.32, rgb: [0.42, 0.92, 0.56], affixCount: 2 },
  { key: 'runic', label: 'Runic', mult: 1.68, rgb: [0.45, 0.78, 1.0], affixCount: 3 },
  { key: 'relic', label: 'Ashen Relic', mult: 2.15, rgb: [1.0, 0.62, 0.24], affixCount: 4 }
];

const SWORD_FX_LIST = ['steel', 'ember', 'frost', 'crimson'];

export function createStarterGear() {
  return {
    weapon: {
      id: 'w_starter',
      slot: 'weapon',
      name: 'Worn Bastard Sword',
      rarity: 'common',
      rgb: [0.8, 0.84, 0.88],
      swordFx: 'steel',
      mods: { dmgMin: 12, dmgMax: 18, critChance: 4 }
    },
    armor: {
      id: 'a_starter',
      slot: 'armor',
      name: 'Traveler Chain Hauberk',
      rarity: 'common',
      rgb: [0.76, 0.8, 0.84],
      mods: { armor: 22, maxHp: 20 }
    },
    offhand: {
      id: 'o_starter',
      slot: 'offhand',
      name: 'Oakwood Heater Shield',
      rarity: 'common',
      rgb: [0.76, 0.8, 0.84],
      mods: { blockChance: 10, armor: 10 }
    },
    ring: {
      id: 'r_starter',
      slot: 'ring',
      name: 'Signet of the Clearing',
      rarity: 'forged',
      rgb: [0.42, 0.92, 0.56],
      mods: { moveSpdPct: 5, lifeOnHit: 2 }
    }
  };
}

export function rollLootDrop(rng, itemLevel = 1, guaranteedRarity = null) {
  const rRoll = rng();
  const rarity =
    RARITY_LIST.find((x) => x.key === guaranteedRarity) ||
    (rRoll > 0.9 ? RARITY_LIST[3] : rRoll > 0.65 ? RARITY_LIST[2] : rRoll > 0.3 ? RARITY_LIST[1] : RARITY_LIST[0]);

  const slots = ['weapon', 'armor', 'offhand', 'ring'];
  const slot = slots[Math.floor(rng() * slots.length)];
  const lvlScale = 1 + (itemLevel - 1) * 0.22;
  const totalScale = rarity.mult * lvlScale;

  const mods = {};
  let name;
  let swordFx = 'steel';

  if (slot === 'weapon') {
    const bases = ['Greatsword', 'Claymore', 'Longblade', 'Executioner Blade', 'Chainblade'];
    swordFx = rarity.key === 'relic' ? 'ember' : SWORD_FX_LIST[Math.floor(rng() * SWORD_FX_LIST.length)];
    const minD = Math.round((11 + rng() * 5) * totalScale);
    const maxD = minD + Math.round((6 + rng() * 5) * totalScale);
    mods.dmgMin = minD;
    mods.dmgMax = maxD;
    name = `${rarity.label} ${bases[Math.floor(rng() * bases.length)]}`;
  } else if (slot === 'armor') {
    const bases = ['Plate Cuirass', 'Scale Coat', 'Brigandine', 'Nightguard Mail'];
    mods.armor = Math.round((24 + rng() * 14) * totalScale);
    mods.maxHp = Math.round((16 + rng() * 16) * totalScale);
    name = `${rarity.label} ${bases[Math.floor(rng() * bases.length)]}`;
  } else if (slot === 'offhand') {
    const bases = ['Kite Shield', 'Tower Bulwark', 'Spiked Targe', 'Parry Buckler'];
    mods.blockChance = Math.round((9 + rng() * 7) * rarity.mult);
    mods.armor = Math.round((12 + rng() * 8) * totalScale);
    name = `${rarity.label} ${bases[Math.floor(rng() * bases.length)]}`;
  } else {
    const bases = ['Band', 'Seal', 'Loop', 'Ring'];
    mods.critChance = Math.round((4 + rng() * 4) * rarity.mult);
    name = `${rarity.label} ${bases[Math.floor(rng() * bases.length)]}`;
  }

  const affixPool = [
    () => (mods.critChance = (mods.critChance || 0) + Math.round((3 + rng() * 5) * rarity.mult)),
    () => (mods.critMult = (mods.critMult || 0) + Math.round((14 + rng() * 18) * rarity.mult)),
    () => (mods.dmgPct = (mods.dmgPct || 0) + Math.round((8 + rng() * 10) * rarity.mult)),
    () => (mods.evasion = (mods.evasion || 0) + Math.round((4 + rng() * 6) * rarity.mult)),
    () => (mods.blockChance = (mods.blockChance || 0) + Math.round((4 + rng() * 5) * rarity.mult)),
    () => (mods.atkSpdPct = (mods.atkSpdPct || 0) + Math.round((5 + rng() * 7) * rarity.mult)),
    () => (mods.lifeOnHit = (mods.lifeOnHit || 0) + Math.max(1, Math.round(2 * totalScale))),
    () => (mods.moveSpdPct = (mods.moveSpdPct || 0) + Math.round((4 + rng() * 5) * rarity.mult)),
    () => (mods.armor = (mods.armor || 0) + Math.round((10 + rng() * 12) * totalScale))
  ];

  for (let i = 0; i < rarity.affixCount; i++) {
    affixPool[Math.floor(rng() * affixPool.length)]();
  }

  return {
    id: `item_${Date.now()}_${Math.floor(rng() * 999999)}`,
    slot,
    name,
    rarity: rarity.key,
    rgb: rarity.rgb,
    swordFx,
    mods
  };
}

export function formatItemMods(item) {
  const parts = [];
  const m = item.mods;
  if (m.dmgMin !== undefined) parts.push(`${m.dmgMin}-${m.dmgMax} Dmg`);
  if (m.dmgPct) parts.push(`+${m.dmgPct}% Dmg`);
  if (m.critChance) parts.push(`+${m.critChance}% Crit`);
  if (m.critMult) parts.push(`+${m.critMult}% CritDmg`);
  if (m.atkSpdPct) parts.push(`+${m.atkSpdPct}% AtkSpd`);
  if (m.armor) parts.push(`+${m.armor} Armor`);
  if (m.blockChance) parts.push(`+${m.blockChance}% Block`);
  if (m.evasion) parts.push(`+${m.evasion}% Evasion`);
  if (m.maxHp) parts.push(`+${m.maxHp} HP`);
  if (m.lifeOnHit) parts.push(`+${m.lifeOnHit} Leech`);
  if (m.moveSpdPct) parts.push(`+${m.moveSpdPct}% Spd`);
  return parts.join(', ');
}

export class ArpgBuild {
  constructor(archetypeId = 'knight') {
    this.archetypeId = archetypeId;
    const arch = ARCHETYPES[archetypeId] || ARCHETYPES.knight;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 100;
    this.gold = 25;
    this.passivePoints = 2; // immediate build customization from level 1!
    this.unlockedNodes = new Set(['root']);

    this.might = arch.might;
    this.agility = arch.agility;
    this.fortitude = arch.fortitude;

    // Craft • Look System (Download(1).mp4: 12 Materials + 8 Rune Enchant Slots!)
    this.armorMaterialId = 'as_forged';
    this.craftFocusSlot = 'Look';
    this.socketedRunes = ['*', '>'];

    this.equipment = createStarterGear();
    this.backpack = [
      {
        id: 'bp_emberblade',
        slot: 'weapon',
        name: 'Ashen Emberblade',
        rarity: 'runic',
        rgb: [0.45, 0.78, 1.0],
        swordFx: 'ember',
        mods: { dmgMin: 17, dmgMax: 27, critChance: 8, critMult: 28, lifeOnHit: 2 }
      },
      {
        id: 'bp_shadowcloak',
        slot: 'armor',
        name: 'Ravenstalker Jerkin',
        rarity: 'forged',
        rgb: [0.42, 0.92, 0.56],
        mods: { armor: 18, evasion: 11, moveSpdPct: 7, critChance: 4 }
      }
    ];

    this.parryBuffTimer = 0;
    this.bloodthirstTimer = 0;
    this.computed = {};
    this.recompute();
  }

  setArchetype(id) {
    const arch = ARCHETYPES[id];
    if (!arch) return;
    this.archetypeId = id;
    this.might = arch.might + (this.level - 1) * 2;
    this.agility = arch.agility + (this.level - 1) * 2;
    this.fortitude = arch.fortitude + (this.level - 1) * 2;
    this.recompute();
  }

  canUnlockNode(nodeId) {
    if (this.passivePoints <= 0 || this.unlockedNodes.has(nodeId)) return false;
    const node = PASSIVE_TREE.find((n) => n.id === nodeId);
    if (!node) return false;
    return node.req.some((reqId) => this.unlockedNodes.has(reqId));
  }

  unlockNode(nodeId) {
    if (!this.canUnlockNode(nodeId)) return false;
    this.unlockedNodes.add(nodeId);
    this.passivePoints--;
    this.recompute();
    return true;
  }

  equipFromBackpack(itemId) {
    const idx = this.backpack.findIndex((x) => x.id === itemId);
    if (idx === -1) return null;
    const item = this.backpack[idx];
    const old = this.equipment[item.slot];
    this.equipment[item.slot] = item;
    if (old) this.backpack[idx] = old;
    else this.backpack.splice(idx, 1);
    this.recompute();
    return item;
  }

  recompute() {
    const mods = {
      dmgMin: 4 + this.might * 0.7,
      dmgMax: 8 + this.might * 1.1,
      dmgFlat: 0,
      dmgPct: this.might * 1.6,
      critChance: 5 + this.agility * 0.65,
      critMult: 155,
      atkSpdPct: this.agility * 1.1,
      armor: 12 + this.fortitude * 2.2,
      armorPct: 0,
      blockChance: 4 + this.fortitude * 0.35,
      evasion: 4 + this.agility * 0.85,
      maxHp: 110 + this.fortitude * 9 + (this.level - 1) * 16,
      maxStamina: 100 + Math.round(this.agility * 1.5),
      flaskBonusPct: Math.round(this.fortitude * 1.2),
      maxFlasks: 3 + (this.unlockedNodes.has('unbreakable') ? 1 : 0),
      moveSpdPct: 0,
      lifeOnHit: 0,
      lifeOnKill: 0,
      bleedChance: 0,
      bleedDmgPct: 0,
      executePct: 0,
      thornsPct: 0,
      dashCdPct: 0,
      reachPct: 0,
      stunBonus: 0
    };

    for (const nodeId of this.unlockedNodes) {
      const node = PASSIVE_TREE.find((n) => n.id === nodeId);
      if (!node) continue;
      for (const [k, v] of Object.entries(node.mods)) {
        mods[k] = (mods[k] || 0) + v;
      }
    }

    for (const item of Object.values(this.equipment)) {
      if (!item) continue;
      for (const [k, v] of Object.entries(item.mods)) {
        mods[k] = (mods[k] || 0) + v;
      }
    }

    const craftMat = CRAFT_MATERIALS.find((m) => m.id === this.armorMaterialId) || CRAFT_MATERIALS[0];
    for (const [k, v] of Object.entries(craftMat.mods)) {
      mods[k] = (mods[k] || 0) + v;
    }

    for (const rCh of this.socketedRunes) {
      const rune = RUNE_PALETTE.find((r) => r.ch === rCh);
      if (!rune) continue;
      for (const [k, v] of Object.entries(rune.mods)) {
        mods[k] = (mods[k] || 0) + v;
      }
    }

    if (this.parryBuffTimer > 0) mods.blockChance += 35;
    if (this.bloodthirstTimer > 0) {
      mods.critChance += 18;
      mods.atkSpdPct += 25;
    }

    const totalArmor = Math.round(mods.armor * (1 + mods.armorPct / 100));
    const armorReduction = totalArmor / (totalArmor + 140);
    const dmgScale = 1 + mods.dmgPct / 100;
    const minDmg = Math.max(4, Math.round((mods.dmgMin + mods.dmgFlat) * dmgScale));
    const maxDmg = Math.max(minDmg + 2, Math.round((mods.dmgMax + mods.dmgFlat) * dmgScale));

    const critC = Math.min(85, mods.critChance);
    const critM = mods.critMult / 100;
    const atkRate = (1 + mods.atkSpdPct / 100) / 0.42;
    const avgHit = ((minDmg + maxDmg) * 0.5) * (1 + (critC / 100) * (critM - 1));
    const dps = Math.round(avgHit * atkRate);

    this.computed = {
      ...mods,
      armor: totalArmor,
      armorReductionPct: Math.round(armorReduction * 100),
      blockChance: Math.min(75, Math.round(mods.blockChance)),
      evasion: Math.min(75, Math.round(mods.evasion)),
      critChance: Math.round(critC),
      critMult: Math.round(mods.critMult),
      minDmg,
      maxDmg,
      dps,
      swordFx: craftMat.id !== 'as_forged' ? craftMat.swordFx : this.equipment.weapon?.swordFx || 'steel',
      armorMaterial: craftMat,
      attackSpeedMult: 1 + mods.atkSpdPct / 100
    };
  }

  setArmorMaterial(matId) {
    if (!CRAFT_MATERIALS.some((m) => m.id === matId)) return false;
    this.armorMaterialId = matId;
    this.recompute();
    return true;
  }

  toggleSocketRune(ch) {
    if (this.socketedRunes.length < 8) {
      this.socketedRunes.push(ch);
      this.recompute();
      return true;
    }
    return false;
  }

  removeRuneAt(idx) {
    if (idx < 0 || idx >= this.socketedRunes.length) return false;
    this.socketedRunes.splice(idx, 1);
    this.recompute();
    return true;
  }
}
