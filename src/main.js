import { PureAsciiEngine } from './engine/PureAsciiEngine.js';
import { WORLD_TILT_Y, LIFT_Z } from './engine/Ascii3DRasterizer.js';
import { ARCHETYPES, PASSIVE_TREE, CRAFT_MATERIALS, RUNE_PALETTE, formatItemMods } from './rpg/ArpgSystem.js';
import { WORLD_SIZE, WorldSketchMap } from './world/WorldSketchMap.js';
import { WorldEngine } from './world/WorldEngine.js';
import { renderCraftPreviewScene } from './entities/AsciiSprites.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeBar(val, max, w = 10) {
  const f = clamp(Math.round((val / Math.max(1, max)) * w), 0, w);
  return '[' + '|'.repeat(f) + '.'.repeat(w - f) + ']';
}

const canvas = document.getElementById('game-canvas');
const hudOverlay = document.getElementById('hud-overlay');
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
const minimapBgCanvas = document.createElement('canvas');
minimapBgCanvas.width = minimapCanvas.width;
minimapBgCanvas.height = minimapCanvas.height;

const bossBarWrap = document.getElementById('boss-bar-wrap');
const bossNameEl = document.getElementById('boss-name-el');
const bossFillEl = document.getElementById('boss-fill-el');
const hudTitleEl = document.getElementById('hud-title');
const hudHpEl = document.getElementById('hud-hp');
const hudStaminaEl = document.getElementById('hud-stamina');
const hudXpEl = document.getElementById('hud-xp');
const hudCombatEl = document.getElementById('hud-combat');
const hudModeEl = document.getElementById('hud-mode');
const hudLocEl = document.getElementById('hud-loc');
const hudMetaEl = document.getElementById('hud-meta');
const bottomMetaEl = document.getElementById('bottom-meta-el');
const logLinesEl = document.getElementById('log-lines');
const toastBannerEl = document.getElementById('toast-banner');
const interactPromptEl = document.getElementById('interact-prompt');
const dialogueBoxEl = document.getElementById('dialogue-box');
const dialogueHeaderEl = document.getElementById('dialogue-header');
const dialogueTextEl = document.getElementById('dialogue-text');

const autoZoomCheckbox = document.getElementById('auto-zoom-checkbox');
const autoZoomLabel = document.getElementById('auto-zoom-label');

const craftModal = document.getElementById('craft-modal');
const craftSlotTabs = document.getElementById('craft-slot-tabs');
const runePaletteBar = document.getElementById('rune-palette-bar');
const matGrid = document.getElementById('mat-grid');
const craftInfoEl = document.getElementById('craft-info-el');
const socketedRunesList = document.getElementById('socketed-runes-list');
const craftPreviewCanvas = document.getElementById('craft-preview-canvas');
const craftRenderer = new PureAsciiEngine(craftPreviewCanvas);
craftRenderer.horizonGlow = 0.0;

const gearModal = document.getElementById('gear-modal');
const treeModal = document.getElementById('tree-modal');
const archetypeBar = document.getElementById('archetype-bar');
const statsSummaryEl = document.getElementById('stats-summary');
const equippedListEl = document.getElementById('equipped-list');
const backpackListEl = document.getElementById('backpack-list');
const treeHeaderEl = document.getElementById('tree-header');
const treeGridEl = document.getElementById('tree-grid');
const treeInfoEl = document.getElementById('tree-info');

const ascii = new PureAsciiEngine(canvas);

const cam = {
  x: 0,
  y: -50,
  zoom: 1.38,
  targetZoom: 1.38,
  glyphScale: 1.0,
  vw: window.innerWidth,
  vh: window.innerHeight
};

let worldMap = null;
let engine = null;
let baseSize = 4;
let autoZoom = autoZoomCheckbox.checked;
let hudVisible = true;
let dialogueOpen = false;
let dialoguePages = [];
let dialogueIdx = 0;
let toastTimer = 0;

let craftYaw = 0.25;
let craftZoom = 1.15;
let craftDragging = false;
let craftLastX = 0;

const keys = new Set();
const logs = [];

function pushLog(msg) {
  logs.push(msg);
  if (logs.length > 4) logs.shift();
  logLinesEl.innerHTML = logs.map((m) => `<div class="log-entry">&gt; ${m}</div>`).join('');
}

function showToast(msg, dur = 3.0) {
  toastBannerEl.textContent = msg;
  toastBannerEl.style.display = 'block';
  toastTimer = dur;
}

function resizeAll() {
  cam.vw = window.innerWidth;
  cam.vh = window.innerHeight;
  ascii.resize(cam.vw, cam.vh);
}

function generateRealm(seed = Math.floor(Math.random() * 900000) + 100000) {
  dialogueOpen = false;
  dialogueBoxEl.style.display = 'none';
  worldMap = new WorldSketchMap(seed);
  worldMap.renderMinimap(minimapBgCanvas.getContext('2d'), minimapBgCanvas.width, minimapBgCanvas.height);
  engine = new WorldEngine(worldMap, engine ? engine.build.archetypeId : 'knight');
  cam.x = engine.x;
  cam.y = engine.y - 34 - ((engine.z || 0) * LIFT_Z) / WORLD_TILT_Y;
  cam.zoom = 1.38;
  cam.targetZoom = 1.38;

  pushLog(`Entered Ash-Script Realm #${seed}`);
  showToast(`REALM #${seed} — PURE ASCII MMORPG + ARPG`);
  refreshPanels();
}

function openDialogue(title, pages) {
  dialogueHeaderEl.textContent = title;
  dialoguePages = pages;
  dialogueIdx = 0;
  dialogueOpen = true;
  dialogueTextEl.textContent = pages[0] || '';
  dialogueBoxEl.style.display = 'block';
}

function handleInteract() {
  if (dialogueOpen) {
    dialogueIdx++;
    if (dialogueIdx >= dialoguePages.length) {
      dialogueOpen = false;
      dialogueBoxEl.style.display = 'none';
    } else {
      dialogueTextEl.textContent = dialoguePages[dialogueIdx] || '';
    }
    return;
  }

  const near = engine.getNearbyInteractable();
  if (!near) return;

  if (near.type === 'grave') {
    const idx = engine.graveMarkers.indexOf(near.target);
    if (idx !== -1) engine.graveMarkers.splice(idx, 1);
    engine.build.gold += near.target.gold;
    pushLog(`Reclaimed Soul Echo: +${near.target.gold}g restored!`);
    showToast(`SOUL ECHO RECLAIMED (+${near.target.gold}G)`);
    refreshPanels();
  } else if (near.type === 'loot') {
    const idx = engine.lootDrops.indexOf(near.target);
    if (idx !== -1) engine.lootDrops.splice(idx, 1);
    engine.build.backpack.unshift(near.target.item);
    pushLog(`Looted: ${near.target.item.name} ([C] to equip)`);
    showToast(`LOOT: ${near.target.item.name.toUpperCase()}`);
    refreshPanels();
  } else if (near.type === 'boss_talk') {
    openDialogue(near.target.name.toUpperCase(), near.target.dialogue);
    if (!near.target.talkedOnce) {
      near.target.talkedOnce = true;
      engine.loreDiscovered++;
    }
  } else if (near.type === 'lore') {
    if (!near.target.read) {
      near.target.read = true;
      engine.loreDiscovered++;
      if (engine.grantXp(45)) pushLog(`LEVEL UP -> Lv.${engine.build.level}! +1 Passive Point!`);
    }
    openDialogue(near.target.title, near.target.pages);
  } else if (near.type === 'chest' && !near.target.opened) {
    near.target.opened = true;
    engine.build.gold += near.target.gold;
    pushLog(`Opened Chest: +${near.target.gold}g, +${near.target.xp} XP`);
    if (engine.grantXp(near.target.xp)) showToast(`LEVEL UP! LV.${engine.build.level} (+1 PASSIVE POINT)`);
  } else if (near.type === 'campfire') {
    engine.hp = engine.build.computed.maxHp;
    engine.stamina = engine.build.computed.maxStamina;
    engine.flasks = engine.build.computed.maxFlasks || 3;
    engine.playerBleedTimer = 0;
    engine.lastCampfire = { x: near.target.x, y: near.target.y };
    pushLog('Rested by Campfire: Checkpoint bound, Full HP & Flasks refilled.');
    showToast('CAMPFIRE CHECKPOINT — HP & FLASKS FULL');
  }
}

function applyActionOutcome(res) {
  if (!res || !res.fired) return;
  if (res.xpGained > 0 && engine.grantXp(res.xpGained)) {
    showToast(`LEVEL UP -> LV.${engine.build.level}! (+1 PASSIVE POINT [P])`);
    pushLog(`LEVEL UP! +1 Passive Point ([P] Skill Tree)`);
    refreshPanels();
  }
  for (const m of res.messages || []) pushLog(m);
}

function refreshCraftUI() {
  if (!engine) return;
  const b = engine.build;
  const slots = ['Weapon', 'Helm', 'Shoulders', 'Chest', 'Gloves', 'Legs', 'Boots', 'Look'];
  craftSlotTabs.innerHTML = slots
    .map(
      (s) =>
        `<button class="ascii-btn ${b.craftFocusSlot === s ? 'active' : ''}" data-slot="${s}" type="button">${s}</button>`
    )
    .join('');
  craftSlotTabs.querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      b.craftFocusSlot = btn.dataset.slot;
      refreshCraftUI();
    };
  });

  runePaletteBar.innerHTML = RUNE_PALETTE.map(
    (r) => `<button class="ascii-btn" style="flex:0 0 auto;padding:2px 8px;" data-rune="${r.ch}" title="${r.name}: ${r.desc}" type="button">${r.ch}</button>`
  ).join('');
  runePaletteBar.querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      if (b.toggleSocketRune(btn.dataset.rune)) {
        engine.hp = Math.min(engine.hp, b.computed.maxHp);
        pushLog(`Socketed Rune [${btn.dataset.rune}]`);
        refreshPanels();
      } else {
        pushLog('All 8 Enchant slots full (click a socket below to remove one).');
      }
    };
  });

  matGrid.innerHTML = CRAFT_MATERIALS.map(
    (m) =>
      `<button class="mat-btn ${b.armorMaterialId === m.id ? 'active' : ''}" data-mat="${m.id}" type="button"><span style="color:${m.trim}">${m.code}</span> ${m.name}</button>`
  ).join('');
  matGrid.querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      b.setArmorMaterial(btn.dataset.mat);
      engine.hp = Math.min(engine.hp, b.computed.maxHp);
      pushLog(`Forged Armor Material -> ${b.computed.armorMaterial.name}`);
      refreshPanels();
    };
  });

  const mat = b.computed.armorMaterial;
  craftInfoEl.textContent =
    `Slot  : ${b.craftFocusSlot}\n` +
    `Metal : ${mat.name} (${mat.code.trim() || 'raw'})\n` +
    `Runes : ${b.socketedRunes.length} / 8\n` +
    `DPS   : ${b.computed.dps}  ARM: ${b.computed.armor}\n` +
    `CRIT  : ${b.computed.critChance}%  EVA: ${b.computed.evasion}%`;

  socketedRunesList.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const ch = b.socketedRunes[i];
    const btn = document.createElement('button');
    btn.className = 'ascii-btn';
    btn.style.flex = '0 0 auto';
    btn.textContent = ch ? `[${ch}]` : '[.]';
    btn.title = ch ? `Click to remove Rune [${ch}]` : 'Empty Enchant Slot';
    if (ch) {
      btn.onclick = () => {
        b.removeRuneAt(i);
        refreshPanels();
      };
    }
    socketedRunesList.appendChild(btn);
  }
}

function refreshPanels() {
  if (!engine) return;
  refreshCraftUI();

  const b = engine.build;
  const c = b.computed;

  archetypeBar.innerHTML = '';
  for (const arch of Object.values(ARCHETYPES)) {
    const btn = document.createElement('button');
    btn.className = `ascii-btn ${b.archetypeId === arch.id ? 'active' : ''}`;
    btn.textContent = `${arch.name} (M${arch.might}/A${arch.agility}/F${arch.fortitude})`;
    btn.onclick = () => {
      b.setArchetype(arch.id);
      engine.hp = Math.min(engine.hp, b.computed.maxHp);
      pushLog(`Respecialized Focus: ${arch.name} (Any gear still allowed)`);
      refreshPanels();
    };
    archetypeBar.appendChild(btn);
  }

  statsSummaryEl.textContent =
    `LEVEL     : ${b.level}   (Unspent Passives: ${b.passivePoints})\n` +
    `STATS     : Might ${b.might} | Agi ${b.agility} | Fort ${b.fortitude}\n` +
    `DAMAGE    : ${c.minDmg}-${c.maxDmg}   | DPS: ${c.dps}\n` +
    `CRIT      : ${c.critChance}% Chance / ${c.critMult}% Mult\n` +
    `ARMOR     : ${c.armor} (${c.armorReductionPct}% Phys Reduct)\n` +
    `BLOCK     : ${c.blockChance}%   | EVASION: ${c.evasion}%\n` +
    `SUSTAIN   : +${c.lifeOnHit} Leech | +${c.lifeOnKill} On-Kill`;

  equippedListEl.innerHTML = ['weapon', 'armor', 'offhand', 'ring']
    .map((slot) => {
      const it = b.equipment[slot];
      if (!it) return `<div class="gear-row">[${slot.toUpperCase()}] Empty</div>`;
      return `<div class="gear-row" style="border-color:rgb(${it.rgb.map((x) => Math.round(x * 200)).join(',')});"><strong>[${slot.toUpperCase()}] ${it.name}</strong><br><span style="color:#8ce99a;">${formatItemMods(it)}</span></div>`;
    })
    .join('');

  backpackListEl.innerHTML = '';
  for (const it of b.backpack) {
    const btn = document.createElement('button');
    btn.className = 'gear-row';
    btn.innerHTML = `<strong>${it.name}</strong> <span style="color:#74c0fc;">[${it.slot}]</span><br><span style="color:#a9f5d0;">${formatItemMods(it)}</span>`;
    btn.onclick = () => {
      const eq = b.equipFromBackpack(it.id);
      if (eq) {
        engine.hp = Math.min(engine.hp, b.computed.maxHp);
        pushLog(`Equipped ${eq.name} (${formatItemMods(eq)})`);
        refreshPanels();
      }
    };
    backpackListEl.appendChild(btn);
  }

  treeHeaderEl.textContent = `+== [PASSIVE SKILL TREE] — POINTS AVAILABLE: ${b.passivePoints} ==+`;
  treeGridEl.innerHTML = '';
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 5; col++) {
      const node = PASSIVE_TREE.find((n) => n.row === r && n.col === col);
      if (!node) {
        treeGridEl.appendChild(document.createElement('div'));
        continue;
      }
      const unlocked = b.unlockedNodes.has(node.id);
      const avail = b.canUnlockNode(node.id);
      const btn = document.createElement('button');
      btn.className = `node-btn ${unlocked ? 'node-unlocked' : avail ? 'node-avail' : 'node-locked'}`;
      btn.innerHTML = `<div style="font-weight:bold;">${unlocked ? '[*]' : avail ? '[+]' : '[.]'} ${node.name}</div><div style="font-size:9px;">${node.branch}</div>`;
      btn.onmouseenter = () => {
        treeInfoEl.textContent = `${node.name} (${node.branch}): ${node.desc}${unlocked ? ' [UNLOCKED]' : avail ? ' [CLICK TO ALLOCATE]' : ' [Requires adjacent node]'}`;
      };
      btn.onclick = () => {
        if (b.unlockNode(node.id)) {
          engine.hp = Math.min(engine.hp, b.computed.maxHp);
          pushLog(`Passive Unlocked: ${node.name}!`);
          refreshPanels();
        }
      };
      treeGridEl.appendChild(btn);
    }
  }
}

function toggleModal(which) {
  const target = which === 'craft' ? craftModal : which === 'gear' ? gearModal : treeModal;
  const open = target.style.display !== 'block';
  craftModal.style.display = 'none';
  gearModal.style.display = 'none';
  treeModal.style.display = 'none';
  if (open) {
    target.style.display = 'block';
    refreshPanels();
  }
}

function renderMinimap() {
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  minimapCtx.drawImage(minimapBgCanvas, 0, 0);
  const toMapX = (wx) => ((wx + WORLD_SIZE * 0.5) / WORLD_SIZE) * w;
  const toMapY = (wy) => ((wy + WORLD_SIZE * 0.5) / WORLD_SIZE) * h;

  minimapCtx.fillStyle = '#66d9e8';
  for (const t of engine.loreTomes) minimapCtx.fillRect(toMapX(t.x) - 1.5, toMapY(t.y) - 1.5, 3, 3);
  minimapCtx.fillStyle = '#ffd43b';
  for (const c of engine.chests) if (!c.opened) minimapCtx.fillRect(toMapX(c.x) - 1.5, toMapY(c.y) - 1.5, 3, 3);

  for (const e of engine.enemies) {
    if (!e.alive) continue;
    const bx = toMapX(e.x);
    const by = toMapY(e.y);
    minimapCtx.fillStyle =
      e.kind === 'spider_boss'
        ? '#b197fc'
        : e.kind === 'lich_boss'
          ? '#74c0fc'
          : e.kind === 'golem_boss'
            ? '#ffa94d'
            : e.isBoss
              ? '#ff3b3b'
              : '#ff922b';
    const sz = e.isBoss ? 5.5 : 2.5;
    minimapCtx.fillRect(bx - sz * 0.5, by - sz * 0.5, sz, sz);
    if (e.isBoss) {
      minimapCtx.strokeStyle = '#000000';
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(bx - sz * 0.5, by - sz * 0.5, sz, sz);
    }
  }
  if (!engine.isMounted) {
    minimapCtx.fillStyle = '#ffffff';
    minimapCtx.font = 'bold 9px monospace';
    minimapCtx.fillText('H', toMapX(engine.horseX) - 3, toMapY(engine.horseY) + 3);
  }
  minimapCtx.save();
  minimapCtx.translate(toMapX(engine.x), toMapY(engine.y));
  minimapCtx.rotate(Math.atan2(engine.dirY, engine.dirX) + Math.PI * 0.5);
  minimapCtx.fillStyle = '#ffffff';
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -4.5);
  minimapCtx.lineTo(3, 3.5);
  minimapCtx.lineTo(-3, 3.5);
  minimapCtx.closePath();
  minimapCtx.fill();
  minimapCtx.restore();
}

// Craft Turntable Canvas Controls (Download(1).mp4: RMB/Drag spin + wheel zoom!)
craftPreviewCanvas.addEventListener('mousedown', (e) => {
  craftDragging = true;
  craftLastX = e.clientX;
});
window.addEventListener('mouseup', () => (craftDragging = false));
window.addEventListener('mousemove', (e) => {
  if (!craftDragging) return;
  craftYaw += (e.clientX - craftLastX) * 0.025;
  craftLastX = e.clientX;
});
craftPreviewCanvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    craftZoom = clamp(craftZoom * (1 - e.deltaY * 0.0012), 0.7, 2.2);
  },
  { passive: false }
);

autoZoomCheckbox.addEventListener('change', () => {
  autoZoom = autoZoomCheckbox.checked;
  autoZoomLabel.textContent = autoZoom ? '[ON]' : '[OFF]';
});
document.getElementById('craft-btn').onclick = () => toggleModal('craft');
document.getElementById('gear-btn').onclick = () => toggleModal('gear');
document.getElementById('tree-btn').onclick = () => toggleModal('tree');
document.getElementById('close-craft-btn').onclick = () => (craftModal.style.display = 'none');
document.getElementById('close-gear-btn').onclick = () => (gearModal.style.display = 'none');
document.getElementById('close-tree-btn').onclick = () => (treeModal.style.display = 'none');
document.getElementById('rain-btn').onclick = () => pushLog(engine.toggleRainStorm());
document.getElementById('mode-btn').onclick = () => pushLog(engine.toggleCombatMode());
document.getElementById('new-map-btn').onclick = () => generateRealm();
document.getElementById('hide-hud-btn').onclick = () => {
  hudVisible = !hudVisible;
  hudOverlay.style.display = hudVisible ? 'block' : 'none';
};

document.querySelectorAll('.skill-slot').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = el.dataset.skill;
    if (s === 'flask') applyActionOutcome(engine.useHealingFlask());
    else if (s === '1') applyActionOutcome(engine.triggerCleave());
    else if (s === '2') applyActionOutcome(engine.triggerShieldBash());
    else if (s === '3') applyActionOutcome(engine.triggerRend());
    else if (s === '4') applyActionOutcome(engine.triggerBloodthirst());
    else if (s === 'dash') engine.triggerDash();
    else if (s === 'mount') pushLog(engine.toggleMount());
    else if (s === 'target') {
      const t = engine.cycleTabTarget();
      if (t) pushLog(`Locked Target: ${t.name} (Lv.${t.lv})`);
    } else if (s === 'craft') toggleModal('craft');
    else if (s === 'rain') pushLog(engine.toggleRainStorm());
    else if (s === 'tree') toggleModal('tree');
  });
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (e.repeat) {
    keys.add(e.code);
    return;
  }

  if (e.code === 'Escape') {
    craftModal.style.display = 'none';
    gearModal.style.display = 'none';
    treeModal.style.display = 'none';
    dialogueOpen = false;
    dialogueBoxEl.style.display = 'none';
  } else if (e.code === 'KeyK' || e.code === 'Digit8') {
    toggleModal('craft');
  } else if (e.code === 'KeyC') {
    toggleModal('gear');
  } else if (e.code === 'KeyP' || e.code === 'Digit0') {
    toggleModal('tree');
  } else if (e.code === 'KeyV' || e.code === 'Digit9') {
    pushLog(engine.toggleRainStorm());
  } else if (e.code === 'Tab') {
    pushLog(engine.toggleCombatMode());
  } else if (e.code === 'KeyT' || e.code === 'Digit7') {
    const t = engine.cycleTabTarget();
    if (t) pushLog(`Locked Target: ${t.name} (Lv.${t.lv} HP:${Math.round(t.hp)})`);
  } else if (e.code === 'KeyE') {
    handleInteract();
  } else if (e.code === 'KeyF' || e.code === 'Digit6') {
    pushLog(engine.toggleMount());
  } else if (e.code === 'KeyG') {
    pushLog(engine.callHorse());
  } else if (e.code === 'KeyQ') {
    applyActionOutcome(engine.useHealingFlask());
  } else if (e.code === 'Digit1') {
    applyActionOutcome(engine.triggerCleave());
  } else if (e.code === 'Digit2') {
    applyActionOutcome(engine.triggerShieldBash());
  } else if (e.code === 'Digit3') {
    applyActionOutcome(engine.triggerRend());
  } else if (e.code === 'Digit4') {
    applyActionOutcome(engine.triggerBloodthirst());
  } else if (e.code === 'Space' || e.code === 'Digit5') {
    engine.triggerDash();
  } else if (e.code === 'KeyM') {
    generateRealm();
  } else if (e.code === 'KeyH') {
    hudVisible = !hudVisible;
    hudOverlay.style.display = hudVisible ? 'block' : 'none';
  }

  keys.add(e.code);
});

window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('mousedown', (e) => {
  if (dialogueOpen) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const wx = (sx - cam.vw * 0.5) / cam.zoom + cam.x;
  const wy = (sy - cam.vh * 0.5) / (cam.zoom * WORLD_TILT_Y) + (engine.z || 0) * (LIFT_Z / WORLD_TILT_Y) + cam.y;

  if (e.button === 0) {
    engine.selectTargetAtWorld(wx, wy);
    if (engine.combatMode === 'action') {
      const dx = wx - engine.x;
      const dy = wy - engine.y;
      const d = Math.hypot(dx, dy) || 1;
      engine.yaw = Math.atan2(dy, dx);
      engine.dirX = dx / d;
      engine.dirY = dy / d;
      engine.facing = Math.abs(engine.dirX) > Math.abs(engine.dirY) ? (engine.dirX > 0 ? 'right' : 'left') : engine.dirY > 0 ? 'down' : 'up';
    }
    applyActionOutcome(engine.triggerCleave());
  } else if (e.button === 2) {
    applyActionOutcome(engine.triggerShieldBash());
  }
});

window.addEventListener(
  'wheel',
  (e) => {
    if (craftModal.style.display === 'block') return;
    e.preventDefault();
    cam.targetZoom = clamp(cam.targetZoom * (1 - e.deltaY * 0.0011), 0.52, 3.0);
  },
  { passive: false }
);
window.addEventListener('resize', resizeAll);

resizeAll();
generateRealm(842109);

let lastTime = performance.now();
let elapsed = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;

  const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');

  const res = engine.update(dt, elapsed, { forward, right, sprint });
  if (res.xpGained > 0 && engine.grantXp(res.xpGained)) {
    showToast(`LEVEL UP! LV.${engine.build.level} (+1 PASSIVE POINT [P])`);
    refreshPanels();
  }
  for (const m of res.messages) pushLog(m);

  if (engine.hp <= 0) {
    const lost = engine.handlePlayerDeath();
    pushLog(`Fell in battle! Revived at Campfire (${lost > 0 ? `dropped ${lost}g Soul Echo` : '65% HP'}).`);
    showToast('FALLEN — REVIVED AT CAMPFIRE CHECKPOINT');
  }

  cam.zoom = lerp(cam.zoom, cam.targetZoom, Math.min(1, dt * 10));
  const shakeX = engine.shakeIntensity > 0 ? Math.sin(elapsed * 48) * engine.shakeIntensity : 0;
  const shakeY = engine.shakeIntensity > 0 ? Math.cos(elapsed * 54) * engine.shakeIntensity * 0.8 : 0;
  const targetCamY = engine.y - 34 - ((engine.z || 0) * LIFT_Z) / WORLD_TILT_Y;
  cam.x = lerp(cam.x, engine.x + (engine.vx || 0) * 0.12, Math.min(1, dt * 6.5)) + shakeX;
  cam.y = lerp(cam.y, targetCamY + (engine.vy || 0) * 0.12, Math.min(1, dt * 6.5)) + shakeY;

  const autoBoost = autoZoom && cam.zoom > 1.38 ? lerp(1.0, 1.3, clamp((cam.zoom - 1.38) / (3.0 - 1.38), 0, 1)) : 1.0;
  const zoomOutScale = cam.zoom < 1.0 ? lerp(1.22, 1.0, clamp((cam.zoom - 0.52) / 0.48, 0, 1)) : 1.0;
  cam.glyphScale = clamp((baseSize / 4.0) * autoBoost * zoomOutScale, 0.72, 1.35);

  // 100% Pure ASCII Render over #000000!
  engine.render(ascii, cam, elapsed);
  ascii.render();

  if (craftModal.style.display === 'block') {
    if (!craftDragging) craftYaw += dt * 0.45;
    renderCraftPreviewScene(craftRenderer, 460, 300, craftYaw, craftZoom, engine.build, elapsed);
    craftRenderer.render();
  }

  if (hudVisible) {
    const b = engine.build;
    const c = b.computed;
    const archName = ARCHETYPES[b.archetypeId].name.toUpperCase();
    const mTag = engine.inWater ? 'WADING' : engine.isMounted ? 'MOUNTED' : 'FOOT';
    const cbtTag = engine.combatTimer > 0 ? 'COMBAT' : 'REST';
    const shStr = engine.guardShield > 0 ? ` +${Math.round(engine.guardShield)}` : '';
    const wndStr = engine.playerBleedTimer > 0 ? ' [BLEED!]' : engine.hp / c.maxHp < 0.3 ? ' [CRIT HP!]' : '';
    hudTitleEl.textContent = `+-- [LV.${b.level} ${archName} | ${mTag}/${cbtTag}] `.padEnd(39, '-') + '+';
    hudHpEl.textContent = `HP      ${makeBar(engine.hp, c.maxHp)} ${String(Math.round(engine.hp)).padStart(3)}/${c.maxHp}${shStr}${wndStr}`;
    hudStaminaEl.textContent = `STAMINA ${makeBar(engine.stamina, c.maxStamina)} ${String(Math.round(engine.stamina)).padStart(3)}/${c.maxStamina}`;
    hudXpEl.textContent = `XP      ${makeBar(b.xp, b.xpToNext)} ${String(b.xp).padStart(3)}/${b.xpToNext}`;
    hudCombatEl.textContent = `DPS:${c.dps} CRIT:${c.critChance}% ARM:${c.armor} BLK:${c.blockChance}% FLK:${engine.flasks}/${c.maxFlasks || 3}`;

    const tgt = engine.getLockedTarget();
    const tgtStr = tgt ? `${tgt.name.slice(0, 14)}(${Math.round(tgt.hp)}/${tgt.maxHp})` : 'NONE';
    hudModeEl.textContent = `COMBAT:[${engine.combatMode.toUpperCase()}] | TGT:${tgtStr}`;
    hudLocEl.textContent = `ZONE: ${worldMap.getBiomeName(engine.x, engine.y)}`;
    const totalLore = engine.loreTomes.length + engine.enemies.filter((e) => e.isBoss && e.dialogue).length;
    hudMetaEl.textContent = `+-- LORE:${engine.loreDiscovered}/${totalLore}  GOLD:${b.gold}  PASSIVES:${b.passivePoints} --+`;
    bottomMetaEl.textContent = `LV ${b.level} - ${b.xp} / ${b.xpToNext} XP | HP: ${Math.round(engine.hp)}/${c.maxHp} | FLASKS: ${engine.flasks}/${c.maxFlasks || 3} | METAL: ${c.armorMaterial.name}`;
    const flaskEl = document.getElementById('flask-slot-el');
    if (flaskEl) {
      flaskEl.textContent = `Q Flask ${engine.flasks}/${c.maxFlasks || 3}`;
      flaskEl.classList.toggle('cd', engine.flaskCooldown > 0 || engine.flasks <= 0);
    }

    // Top-Center Boss Healthbar (Dusk Widow / Warden / Cinderbone Lich / Colossus Gorrath / Vaelgorath!)
    const activeBoss =
      (tgt && tgt.isBoss ? tgt : null) ||
      engine.enemies.find((e) => e.alive && e.isBoss && Math.hypot(e.x - engine.x, e.y - engine.y) < 320);
    if (activeBoss) {
      bossBarWrap.style.display = 'block';
      bossNameEl.textContent = `${activeBoss.name} • Lv ${activeBoss.lv}`;
      bossFillEl.style.width = `${clamp((activeBoss.hp / activeBoss.maxHp) * 100, 0, 100)}%`;
    } else {
      bossBarWrap.style.display = 'none';
    }

    document.querySelector('[data-skill="2"]').classList.toggle('cd', engine.bashCooldown > 0);
    document.querySelector('[data-skill="3"]').classList.toggle('cd', engine.rendCooldown > 0);
    document.querySelector('[data-skill="4"]').classList.toggle('cd', engine.bloodCooldown > 0);
    document.querySelector('[data-skill="dash"]').classList.toggle('cd', engine.dashCooldown > 0);

    renderMinimap();

    const near = !dialogueOpen ? engine.getNearbyInteractable() : null;
    if (near) {
      interactPromptEl.textContent = near.label;
      interactPromptEl.style.display = 'block';
    } else {
      interactPromptEl.style.display = 'none';
    }
  }

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toastBannerEl.style.display = 'none';
  }
}

requestAnimationFrame(loop);
