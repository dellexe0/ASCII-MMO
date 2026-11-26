import { DENSITY_RAMP } from '../engine/PureAsciiEngine.js';
import { emitPureAscii3DSprite, buildHeroKnight3D } from './Ascii3DModels.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

let samplerCanvas = null;
let samplerCtx = null;

function ensureSampler(gridRes) {
  if (!samplerCanvas && typeof document !== 'undefined') {
    samplerCanvas = document.createElement('canvas');
    samplerCtx = samplerCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!samplerCanvas || !samplerCtx) return null;
  if (samplerCanvas.width !== gridRes || samplerCanvas.height !== gridRes) {
    samplerCanvas.width = gridRes;
    samplerCanvas.height = gridRes;
  }
  return samplerCtx;
}

/**
 * Pure ASCII Entity Rasterizer with Structural Edge Detection (ZERO painted images on screen):
 * evaluates `drawStencil(ctx)` into a memory alpha/RGB grid, detects silhouette edges & directional slopes
 * so armor plates, bones, swords, horse legs and dragon wings crisp up with /, \, |, =, [, ], #, @ glyphs.
 */
export function emitPureAsciiSprite({
  renderer,
  screenX,
  screenY,
  gridRes = 40,
  worldSpan = 96,
  cellScreenSize = 4.2,
  zoom = 1.0,
  alphaMult = 0.96,
  isReflection = false,
  mirrorClipCheck = null,
  worldX = 0,
  worldY = 0,
  elapsed = 0,
  rimColor = null,
  drawStencil
}) {
  const ctx = ensureSampler(gridRes);
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, gridRes, gridRes);
  ctx.save();
  const s = gridRes / worldSpan;
  ctx.scale(s, s);
  ctx.translate(worldSpan * 0.5, worldSpan * 0.68);
  drawStencil(ctx);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, gridRes, gridRes).data;
  const stepScreen = (worldSpan * zoom) / gridRes;
  const stepWorld = worldSpan / gridRes;
  const originX = screenX - (worldSpan * zoom) * 0.5;
  const originY = screenY - (worldSpan * zoom) * 0.68;

  const alphaAt = (gx, gy) => {
    if (gx < 0 || gx >= gridRes || gy < 0 || gy >= gridRes) return 0;
    return imgData[(gy * gridRes + gx) * 4 + 3] / 255;
  };

  for (let py = 0; py < gridRes; py++) {
    const wyScreen = originY + (py + 0.5) * stepScreen;
    const offYWorld = (py + 0.5 - gridRes * 0.68) * stepWorld;
    // Reflections smoothly dissolve downward across water ripples
    const fadeRefl = isReflection ? clamp(1.05 - (py / gridRes) * 0.45, 0.35, 1.0) : 1.0;
    const waveShiftScreen = isReflection
      ? Math.sin(py * 0.42 + elapsed * 4.5 + worldY * 0.06) * (1.8 + (py / gridRes) * 2.2)
      : 0;

    for (let px = 0; px < gridRes; px++) {
      const idx = (py * gridRes + px) * 4;
      const a = imgData[idx + 3] / 255;
      if (a < 0.22) continue;

      if (mirrorClipCheck) {
        const offXWorld = (px + 0.5 - gridRes * 0.5) * stepWorld;
        if (!mirrorClipCheck(worldX + offXWorld, worldY + offYWorld)) continue;
      }

      const r = imgData[idx] / 255;
      const g = imgData[idx + 1] / 255;
      const b = imgData[idx + 2] / 255;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      // Edge/slope inspection for hyper-crisp anatomical contour glyphs
      const aL = alphaAt(px - 1, py);
      const aR = alphaAt(px + 1, py);
      const aU = alphaAt(px, py - 1);
      const aD = alphaAt(px, py + 1);
      const isEdge = aL < 0.25 || aR < 0.25 || aU < 0.25 || aD < 0.25;

      let ch;
      if (isEdge && luma > 0.25 && luma < 0.72) {
        const gx = aR - aL;
        const gy = aD - aU;
        if (Math.abs(gx) > Math.abs(gy) * 1.6) ch = '|';
        else if (Math.abs(gy) > Math.abs(gx) * 1.6) ch = luma > 0.5 ? '=' : '-';
        else ch = gx * gy > 0 ? '/' : '\\';
      } else {
        const mapped = clamp(Math.pow(luma, 0.76), 0.14, 0.999);
        const chIdx = Math.min(DENSITY_RAMP.length - 1, Math.max(2, Math.floor(mapped * DENSITY_RAMP.length)));
        ch = DENSITY_RAMP[chIdx];
      }

      const wxScreen = originX + (px + 0.5) * stepScreen + waveShiftScreen;
      const boost = isReflection ? 0.58 : 1.18;
      let rOut = clamp(r * boost + (isReflection ? 0.03 : 0.04), 0, 1);
      let gOut = clamp(g * boost + (isReflection ? 0.06 : 0.04), 0, 1);
      let bOut = clamp(b * boost + (isReflection ? 0.13 : 0.04), 0, 1);

      if (rimColor && isEdge && !isReflection) {
        rOut = lerp(rOut, rimColor[0], 0.28);
        gOut = lerp(gOut, rimColor[1], 0.28);
        bOut = lerp(bOut, rimColor[2], 0.28);
      }

      renderer.drawGlyph(
        wxScreen,
        wyScreen,
        cellScreenSize,
        ch,
        rOut,
        gOut,
        bOut,
        a * alphaMult * fadeRefl,
        false
      );
    }
  }
}

function drawLimb(ctx, x1, y1, x2, y2, w1, w2, color, jointColor = null, tipColor = null) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const px = -Math.sin(angle);
  const py = Math.cos(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 + px * w1, y1 + py * w1);
  ctx.lineTo(x2 + px * w2, y2 + py * w2);
  ctx.lineTo(x2 - px * w2, y2 - py * w2);
  ctx.lineTo(x1 - px * w1, y1 - py * w1);
  ctx.closePath();
  ctx.fill();

  if (jointColor) {
    ctx.fillStyle = jointColor;
    ctx.beginPath();
    ctx.arc((x1 + x2) * 0.5, (y1 + y2) * 0.5, Math.max(1.1, (w1 + w2) * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
  if (tipColor) {
    ctx.fillStyle = tipColor;
    ctx.beginPath();
    ctx.arc(x2, y2, Math.max(1.2, w2 * 1.15), 0, Math.PI * 2);
    ctx.fill();
  }
}

function getSwordBladeColors(swordFx) {
  switch (swordFx) {
    case 'ember':
      return { base: '#ff8c28', edge: '#fff0b3', glow: '#ff6014' };
    case 'frost':
      return { base: '#6bc4ff', edge: '#ebf8ff', glow: '#409cff' };
    case 'crimson':
      return { base: '#e0364c', edge: '#ffd6dd', glow: '#ff2640' };
    default:
      return { base: '#8fa6ba', edge: '#f5f8fa', glow: '#ced8e2' };
  }
}

/**
 * Hyper-Detailed Continuous 360° Oblique Hero Knight & Anatomical White Warhorse
 * (Smooth turning at EVERY angle without abrupt 4-way snapping — matching Download(2), (3), (7), (9).mp4!)
 */
export function drawHeroKnightStencil(
  ctx,
  {
    facing = 'right',
    headingYaw = null,
    isMounted = true,
    isMoving = false,
    gaitPhase = 0,
    gallopBlend = 0,
    slashProgress = 0,
    isDashing = false,
    swordFx = 'steel',
    armorMaterial = null,
    yawTurn = null,
    elapsed = 0,
    isReflection = false,
    showMountBody = true,
    showRiderBody = true
  }
) {
  ctx.save();
  if (isReflection) ctx.globalAlpha = 0.78;

  let yaw = headingYaw;
  if (yaw === null || yaw === undefined) {
    yaw = facing === 'left' ? Math.PI : facing === 'up' ? -Math.PI * 0.5 : facing === 'down' ? Math.PI * 0.5 : 0;
  }
  if (yawTurn !== null) yaw = yawTurn;

  const cosA = Math.cos(yaw);
  const sinA = Math.sin(yaw);

  // Continuous 2.5D Oblique Axes: spine axis foreshortens Y cleanly at any 0..360 degree heading!
  const ax = cosA;
  const ay = sinA * 0.52;
  const px = -sinA;
  const py = cosA * 0.52;
  const sideFlip = cosA >= 0 ? 1 : -1;

  const bob = isMoving
    ? Math.sin(gaitPhase * 2) * (isMounted ? 2.0 + gallopBlend * 1.8 : 1.5)
    : Math.sin(elapsed * 2.2) * 0.55;

  const bladeCols = getSwordBladeColors(swordFx);
  const matHex = armorMaterial?.hex || '#9aa6b4';
  const matTrim = armorMaterial?.trim || '#f1f5f9';
  const hasHalo = Boolean(armorMaterial?.halo);

  const drawArmorKnight = (kx, ky, onHorse, reinsPt = null) => {
    const stride = isMoving && !onHorse ? Math.sin(gaitPhase) * 6.0 : 0;
    const armSwing = isMoving && !onHorse ? Math.cos(gaitPhase) * 4.0 : 0;
    const flutter = Math.sin(elapsed * (isMoving ? 9.5 : 3.8)) * (onHorse ? 4.8 : 3.0);

    // Trail cape smoothly away from continuous heading vector (-ax, -ay)
    const cxBack = -ax * (onHorse ? 16 : 12);
    const cyBack = -ay * (onHorse ? 10 : 8) + 8;

    // Outer Shadow Layer of Scarlet Velvet Cloak
    ctx.fillStyle = '#4f0c14';
    ctx.beginPath();
    ctx.moveTo(kx - ax * 4 + px * 5, ky - 14);
    ctx.lineTo(kx - ax * 4 - px * 5, ky - 14);
    ctx.quadraticCurveTo(
      kx + cxBack * 0.8 + px * (7 + flutter * 0.3),
      ky + cyBack * 0.5,
      kx + cxBack - px * (6 + flutter * 0.4),
      ky + cyBack + 4
    );
    ctx.lineTo(kx + cxBack * 0.9 + px * (5 + flutter * 0.25), ky + cyBack + 5);
    ctx.closePath();
    ctx.fill();

    // Inner Bright Fold of Cloak
    ctx.fillStyle = '#b91c2b';
    ctx.beginPath();
    ctx.moveTo(kx - ax * 2 + px * 3, ky - 13);
    ctx.quadraticCurveTo(kx + cxBack * 0.55, ky + cyBack * 0.4, kx + cxBack * 0.82, ky + cyBack + 1);
    ctx.lineTo(kx - ax * 1 - px * 3, ky + 6);
    ctx.closePath();
    ctx.fill();

    // Articulated Steel Greaves & Warboots
    if (!onHorse) {
      drawLimb(
        ctx,
        kx + px * 3.8,
        ky + 2,
        kx + px * 3.8 + ax * stride * 0.7,
        ky + 17 + ay * stride * 0.7,
        2.7,
        2.0,
        '#475569',
        '#94a3b8',
        '#1e293b'
      );
      drawLimb(
        ctx,
        kx - px * 3.8,
        ky + 2,
        kx - px * 3.8 - ax * stride * 0.7,
        ky + 17 - ay * stride * 0.7,
        2.7,
        2.0,
        '#64748b',
        '#e2e8f0',
        '#1e293b'
      );
    } else {
      // Rider boot resting cleanly in stirrup
      const stirX = kx + px * 5.2 + ax * 1.5;
      const stirY = ky + py * 3.5 + 11.5;
      drawLimb(ctx, kx + px * 3.5, ky + 1, stirX, stirY, 3.0, 1.9, '#64748b', '#cbd5e1', '#3d2514');
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(stirX - 1.5, stirY - 1, 3, 2.5);
    }

    // Layered Fluted Plate Cuirass + Tassets Skirt + Gold Belt
    const torsoGrad = ctx.createLinearGradient(kx - 8, ky - 16, kx + 8, ky + 6);
    torsoGrad.addColorStop(0, matTrim);
    torsoGrad.addColorStop(0.45, matHex);
    torsoGrad.addColorStop(1, '#1c232b');
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.roundRect(kx - 7.5, ky - 15.5, 15.0, 19.0, 3.8);
    ctx.fill();

    // Central Breastplate Specular Crest
    ctx.fillStyle = matTrim;
    ctx.fillRect(kx + ax * 2.2 - 1.2, ky - 14.5, 2.4, 10.5);

    // Waist Belt + Gold Clasp + Tassets
    ctx.fillStyle = '#252e38';
    ctx.fillRect(kx - 7.4, ky - 2.8, 14.8, 2.4);
    ctx.fillStyle = '#ffd43b';
    ctx.fillRect(kx + ax * 2.5 - 1.6, ky - 3.3, 3.2, 3.2);

    // Fluted Layered Shoulder Pauldrons
    for (const sSide of [-1, 1]) {
      const spx = kx + px * (sSide * 6.8);
      const spy = ky - 12.8 + py * (sSide * 2.8);
      ctx.fillStyle = matTrim;
      ctx.beginPath();
      ctx.ellipse(spx, spy, 4.4, 3.3, yaw * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    // Optional Emberstone/Moonsteel/Blooderon Crown Halo (Download(1).mp4!)
    if (hasHalo) {
      ctx.strokeStyle = matTrim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(kx, ky - 23.8, 9.2, Math.PI * 0.85, Math.PI * 2.15);
      ctx.stroke();
    }

    // Barbute / Greathelm with Sharp T-Visor & Plume Crest
    const headX = kx + ax * 1.4;
    const headY = ky - 21.6 + ay * 0.6;
    const helmGrad = ctx.createRadialGradient(headX - 1.5, headY - 2, 1, headX, headY, 6.2);
    helmGrad.addColorStop(0, '#ffffff');
    helmGrad.addColorStop(0.55, matTrim);
    helmGrad.addColorStop(1, '#334155');
    ctx.fillStyle = helmGrad;
    ctx.beginPath();
    ctx.arc(headX, headY, 5.7, 0, Math.PI * 2);
    ctx.fill();

    // T-Visor Dark Slit facing forward (hidden cleanly when facing North/away)
    if (sinA > -0.65) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(headX + ax * 2.2 - 2.6, headY - 1.2, 5.2, 1.7);
      ctx.fillRect(headX + ax * 2.2 - 0.8, headY - 0.2, 1.6, 4.0);
    }

    // Crimson Helm Plume sweeping gracefully back
    ctx.fillStyle = '#c92a2a';
    ctx.beginPath();
    ctx.moveTo(headX, headY - 5.5);
    ctx.quadraticCurveTo(headX - ax * 5, headY - 9, headX - ax * 8, headY - 3.5);
    ctx.lineTo(headX - ax * 2, headY - 3.5);
    ctx.closePath();
    ctx.fill();

    // Off-Hand: Leather Reins & Detailed Heater Shield with Gold Cross
    const shieldArmX = kx - px * 7.2 + ax * 3.0;
    const shieldArmY = ky - 5.0 - py * 2.2 + ay * 2.0;
    if (reinsPt) {
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(shieldArmX, shieldArmY);
      ctx.quadraticCurveTo((shieldArmX + reinsPt.x) * 0.5, Math.max(shieldArmY, reinsPt.y) + 3, reinsPt.x, reinsPt.y);
      ctx.stroke();
    }

    if (sinA > -0.82) {
      ctx.fillStyle = matHex;
      ctx.beginPath();
      ctx.moveTo(shieldArmX - 3.6, shieldArmY - 5.5);
      ctx.lineTo(shieldArmX + 3.6, shieldArmY - 5.5);
      ctx.lineTo(shieldArmX + 3.2, shieldArmY + 2.8);
      ctx.lineTo(shieldArmX, shieldArmY + 6.8);
      ctx.lineTo(shieldArmX - 3.2, shieldArmY + 2.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = matTrim;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(shieldArmX - 0.9, shieldArmY - 3.4, 1.8, 6.8);
    }

    // Main Sword Arm & Serrated Faceted Greatsword
    const baseSwordYaw = yaw + 0.55;
    const swingOff = slashProgress > 0 ? lerp(-1.55, 1.55, Math.sin(slashProgress * Math.PI)) : 0;
    const effArmYaw = yaw + swingOff + armSwing * 0.04;
    const shX = kx + px * 6.8;
    const shY = ky - 11.2 + py * 2.2;
    const handX = shX + Math.cos(effArmYaw) * 6.5;
    const handY = shY + Math.sin(effArmYaw) * 4.5 + 2.0;
    drawLimb(ctx, shX, shY, handX, handY, 2.2, 1.8, '#cbd5e1', '#94a3b8', '#f8fafc');

    const bladeAng = slashProgress > 0 ? effArmYaw : baseSwordYaw;
    const bladeLen = 25;
    const tipX = handX + Math.cos(bladeAng) * bladeLen;
    const tipY = handY + Math.sin(bladeAng) * bladeLen * 0.72 - 5;

    ctx.strokeStyle = bladeCols.base;
    ctx.lineWidth = 3.1;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = bladeCols.edge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Sword Serrations + Crossguard
    ctx.fillStyle = bladeCols.edge;
    for (let sIdx = 1; sIdx <= 4; sIdx++) {
      const f = sIdx * 0.2;
      const sx = lerp(handX, tipX, f) - Math.sin(bladeAng) * 2.1;
      const sy = lerp(handY, tipY, f) + Math.cos(bladeAng) * 1.5;
      ctx.fillRect(sx - 0.8, sy - 0.8, 1.7, 1.7);
    }

    const gAng = Math.atan2(tipY - handY, tipX - handX);
    ctx.strokeStyle = '#ffd43b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(handX - Math.sin(gAng) * 4.8, handY + Math.cos(gAng) * 4.8);
    ctx.lineTo(handX + Math.sin(gAng) * 4.8, handY - Math.cos(gAng) * 4.8);
    ctx.stroke();
  };

  if (!showMountBody) {
    ctx.scale(1.18, 1.18);
    if (showRiderBody) drawArmorKnight(0, bob - 8, false, null);
    ctx.restore();
    return;
  }

  // Full Mounted Warhorse + Knight at Smooth Continuous 360° Angle!
  ctx.scale(1.14, 1.14);

  const strideFL = isMoving ? Math.sin(gaitPhase) : 0;
  const strideFR = isMoving ? Math.cos(gaitPhase + gallopBlend * 0.7) : 0;
  const strideBL = isMoving ? Math.sin(gaitPhase + Math.PI * 0.85) : 0;
  const strideBR = isMoving ? Math.cos(gaitPhase + Math.PI * 0.95) : 0;

  const liftFL = isMoving ? Math.max(0, -Math.cos(gaitPhase)) * (5.2 + gallopBlend * 4.5) : 0;
  const liftFR = isMoving ? Math.max(0, Math.sin(gaitPhase)) * (5.2 + gallopBlend * 4.5) : 0;
  const liftBL = isMoving ? Math.max(0, -Math.cos(gaitPhase + Math.PI)) * (5.0 + gallopBlend * 4.0) : 0;
  const liftBR = isMoving ? Math.max(0, Math.sin(gaitPhase + Math.PI)) * (5.0 + gallopBlend * 4.0) : 0;

  const croupX = -ax * 14.5;
  const croupY = -ay * 12 + 0.5 + bob;
  const chestX = ax * 14.5;
  const chestY = ay * 12 - 1.0 + bob;
  const midX = 0;
  const midY = bob;

  const drawHorseLeg = (hipX, hipY, stride, lift, isFront, bright) => {
    const swingX = ax * stride * 10.5;
    const swingY = ay * stride * 8.5;
    const kneeX = hipX + swingX * 0.45 + (isFront ? ax * 1.5 : -ax * 2.0);
    const kneeY = hipY + 9.5 - lift * 0.45 + swingY * 0.4;
    const hoofX = hipX + swingX;
    const hoofY = hipY + 21.5 - lift * 0.85 + swingY;

    drawLimb(ctx, hipX, hipY, kneeX, kneeY, 4.1, 2.5, bright ? '#e2e8f0' : '#94a3b8');
    drawLimb(ctx, kneeX, kneeY, hoofX, hoofY, 2.4, 1.7, bright ? '#ffffff' : '#cbd5e1', '#94a3b8', '#0f172a');
  };

  // 1. Far-Side Legs (drawn behind trunk)
  drawHorseLeg(croupX - px * 5.2, croupY - py * 4.2 + 3, strideBL, liftBL, false, false);
  drawHorseLeg(chestX - px * 5.0, chestY - py * 4.2 + 2, strideFR, liftFR, true, false);

  // 2. Flowing Multi-Strand Silver Tail billowing behind Croup
  const tailWag = Math.sin(elapsed * (isMoving ? 9.5 : 3.2)) * 3.8;
  const tailTipX = croupX - ax * 19 + px * tailWag;
  const tailTipY = croupY - ay * 10 + 17 + ay * -2;
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(croupX - ax * 5, croupY - 5);
  ctx.quadraticCurveTo(croupX - ax * 22 + px * tailWag * 0.6, croupY + 1, tailTipX, tailTipY);
  ctx.quadraticCurveTo(croupX - ax * 11, croupY + 11, croupX - ax * 3, croupY + 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(croupX - ax * 4, croupY - 5);
  ctx.quadraticCurveTo(croupX - ax * 17 + px * tailWag * 0.4, croupY - 2, lerp(croupX, tailTipX, 0.8), lerp(croupY, tailTipY, 0.72));
  ctx.quadraticCurveTo(croupX - ax * 10, croupY + 7, croupX - ax * 3, croupY + 1);
  ctx.closePath();
  ctx.fill();

  // 3. Three-Capsule Sculpted Muscular Horse Trunk (Croup -> Barrel -> Forequarter Chest)
  const drawBodyOrb = (bx, by, rx, ry, rot) => {
    const bGrad = ctx.createLinearGradient(bx, by - ry, bx, by + ry);
    bGrad.addColorStop(0, '#ffffff');
    bGrad.addColorStop(0.55, '#dbe3ee');
    bGrad.addColorStop(1, '#475569');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.ellipse(bx, by, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  };

  const trunkRot = Math.atan2(chestY - croupY, chestX - croupX);
  drawBodyOrb(croupX, croupY, 11.5, 9.8, trunkRot);
  drawBodyOrb(midX, midY, 14.5 + Math.abs(cosA) * 5, 10.6, trunkRot);
  drawBodyOrb(chestX, chestY, 11.2, 9.8, trunkRot);

  // 4. Near-Side Legs
  drawHorseLeg(croupX + px * 5.2, croupY + py * 4.2 + 3, strideBR, liftBR, false, true);
  drawHorseLeg(chestX + px * 5.0, chestY + py * 4.2 + 2, strideFL, liftFL, true, true);

  // 5. Royal Crimson Caparison Cloth & Molded War Saddle
  ctx.fillStyle = '#8b1520';
  ctx.beginPath();
  ctx.ellipse(midX - ax * 1.5, midY - 4.5, 9.5 + Math.abs(cosA) * 3.5, 6.2, trunkRot, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd43b';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.fillStyle = '#3f2210';
  ctx.beginPath();
  ctx.ellipse(midX, midY - 6.5, 6.5 + Math.abs(cosA) * 1.5, 4.5, trunkRot, 0, Math.PI * 2);
  ctx.fill();

  // 6. Sculpted Arching Neck + Chiseled Horse Head + Ears + Bridle + Mane
  const hBob = bob * 0.78 + Math.sin(gaitPhase) * (isMoving ? 2.0 : 0);
  const neckBaseX = chestX + ax * 1.5;
  const neckBaseY = chestY - 2.0;
  const headX = chestX + ax * 12.0;
  const headY = chestY + ay * 8.0 - 22.5 + hBob;

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(neckBaseX - ax * 4, neckBaseY - 3);
  ctx.lineTo(headX - ax * 2, headY - 3);
  ctx.lineTo(headX + ax * 3.5, headY + 3.5);
  ctx.lineTo(neckBaseX + ax * 5, neckBaseY + 5);
  ctx.closePath();
  ctx.fill();

  // 6 Flowing Wind-Swept Mane Strands
  ctx.fillStyle = '#e2e8f0';
  for (let m = 0; m < 6; m++) {
    const f = m / 5;
    const mx = lerp(neckBaseX, headX, f) - ax * 3;
    const my = lerp(neckBaseY, headY, f) - 3;
    const wave = Math.sin(elapsed * 7 + m * 0.9) * 2.2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx - ax * 6.5 + px * wave, my - 2.5);
    ctx.lineTo(mx - ax * 1.5, my - 4.5);
    ctx.closePath();
    ctx.fill();
  }

  // Two Upright Pointed Ears
  for (const eSide of [-1, 1]) {
    const ex = headX - ax * 1.2 + px * (eSide * 2.5);
    const ey = headY - 4.2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(ex - 1.4, ey + 2);
    ctx.lineTo(ex + px * eSide * 0.8, ey - 5.2);
    ctx.lineTo(ex + 1.5, ey + 2);
    ctx.closePath();
    ctx.fill();
  }

  // Chiseled Head & Snout extending seamlessly along continuous (ax, ay)
  const muzzleX = headX + ax * 9.5;
  const muzzleY = headY + ay * 6.5 + 3.8;
  drawLimb(ctx, headX, headY, muzzleX, muzzleY, 5.2, 2.7, '#ffffff', '#e2e8f0', '#cbd5e1');

  // Leather Headstall Bridle + Dark Eye + Silver Bit
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(headX + ax * 2, headY - 2);
  ctx.lineTo(muzzleX - ax * 1.5, muzzleY - 0.5);
  ctx.stroke();

  if (Math.abs(cosA) > 0.25) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(headX + ax * 2.8 - 0.8, headY - 1.8, 1.8, 1.8);
  }

  // 7. Armored Hero Knight Seated in War Saddle
  if (showRiderBody) {
    drawArmorKnight(midX - ax * 1.5, midY - 9.0, true, { x: muzzleX - ax * 2, y: muzzleY + 1 });
  }

  ctx.restore();
}

/**
 * Detailed Enemy Stencils: Skeleton Warrior, Bone Marksman, Nightfang Wolf,
 * Hollow Warden Boss, Vaelgorath 1,000-Yr Ashen Wyrm!
 */
export function drawEnemyStencil(ctx, e, elapsed, isReflection = false) {
  ctx.save();
  if (isReflection) ctx.globalAlpha = 0.72;

  const animState = e.animState || (e.stunTimer > 0 ? 'stagger' : e.windup > 0 ? 'windup' : e.moving ? 'walk' : 'idle');
  const isStunned = e.stunTimer > 0 || animState === 'stagger';
  const isWindup = animState === 'windup' || animState === 'special_windup' || e.windup > 0;
  const isSpecialWindup = animState === 'special_windup';
  const isStrike = animState === 'strike';
  const isSpecial = animState === 'special';
  const strikeP = (isStrike || isSpecial) ? clamp(1 - (e.strikeTimer || 0) / 0.44, 0, 1) : 0;
  const flash = e.hitFlash > 0;
  const bob = e.alive ? Math.sin(elapsed * (e.moving ? 8.5 : 3.0) + e.phase) * (isStunned ? 0.5 : 1.4) : 0;
  const stride = e.moving ? Math.sin(elapsed * 8.5 + e.phase) * 5.2 : 0;
  if (e.dirX < -0.1 && e.kind !== 'dragon' && e.kind !== 'spider_boss') ctx.scale(-1, 1);
  if (isStunned) ctx.rotate(Math.sin(elapsed * 18) * 0.14);

  if (e.kind === 'skeleton' || e.kind === 'skeleton_archer') {
    const boneBright = flash ? '#ffffff' : isStunned ? '#ffe066' : '#f1f5f9';
    const boneMid = flash ? '#ffffff' : '#94a3b8';
    const boneDark = flash ? '#ffffff' : '#475569';

    ctx.fillStyle = '#2d3748';
    ctx.beginPath();
    ctx.moveTo(-4, -12 + bob);
    ctx.lineTo(-9, 10 + bob);
    ctx.lineTo(-1, 7 + bob);
    ctx.closePath();
    ctx.fill();

    drawLimb(ctx, -3, 3 + bob, -4.5 - stride * 0.55, 17 + bob, 1.6, 1.2, boneDark, boneMid, boneDark);
    drawLimb(ctx, 3, 3 + bob, 4.5 + stride * 0.55, 17 + bob, 1.6, 1.2, boneMid, boneBright, boneDark);

    ctx.fillStyle = boneMid;
    ctx.fillRect(-4.5, 1 + bob, 9, 2.8);

    ctx.fillStyle = boneDark;
    ctx.fillRect(-1.1, -11 + bob, 2.2, 13);
    ctx.fillStyle = boneBright;
    for (let r = 0; r < 4; r++) {
      const rw = 9.5 - r * 0.8;
      ctx.fillRect(-rw * 0.5, -10.5 + r * 2.8 + bob, rw, 1.5);
    }
    ctx.fillRect(-6, -11.5 + bob, 12, 2.0);

    ctx.fillStyle = boneBright;
    ctx.beginPath();
    ctx.arc(0, -16 + bob, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = boneMid;
    ctx.fillRect(-2.6, -13 + bob, 5.2, 2.6);
    ctx.fillStyle = '#09090b';
    ctx.fillRect(-2.5, -17 + bob, 1.7, 1.8);
    ctx.fillRect(0.8, -17 + bob, 1.7, 1.8);
    ctx.fillRect(-0.5, -14.8 + bob, 1.0, 1.2);

    const atkAng = e.windup > 0 ? -1.45 : 0.42 + Math.sin(elapsed * 4 + e.phase) * 0.12;
    const hx = 6.5 + Math.cos(atkAng) * 5.2;
    const hy = -6 + bob + Math.sin(atkAng) * 5.2;
    drawLimb(ctx, 5, -9.5 + bob, hx, hy, 1.5, 1.1, boneBright, boneMid);

    if (e.kind === 'skeleton') {
      ctx.strokeStyle = e.windup > 0 ? '#ff6b6b' : '#cbd5e1';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(atkAng - 0.35) * 16, hy + Math.sin(atkAng - 0.35) * 16);
      ctx.stroke();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy - 2);
      ctx.lineTo(hx + 2, hy + 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(hx + 2, hy, 8, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(hx + 4, hy);
      ctx.lineTo(hx + 12, hy);
      ctx.stroke();
    }
  } else if (e.kind === 'wolf') {
    const furDark = flash ? '#ffffff' : '#475569';
    const furLight = flash ? '#ffffff' : '#cbd5e1';

    drawLimb(ctx, -10, 2, -13 - stride * 0.8, 14, 2.3, 1.3, furDark, furDark, '#1e293b');
    drawLimb(ctx, -7, 2, -6 + stride * 0.6, 14, 2.3, 1.3, furLight, furDark, '#1e293b');
    drawLimb(ctx, 8, 2, 12 + stride * 0.8, 14, 2.2, 1.3, furLight, furDark, '#1e293b');
    drawLimb(ctx, 10, 2, 7 - stride * 0.6, 14, 2.1, 1.3, furDark, furDark, '#1e293b');

    ctx.fillStyle = furLight;
    ctx.beginPath();
    ctx.moveTo(-12, -2 + bob);
    ctx.quadraticCurveTo(-22, -8 + bob, -23, 3 + bob);
    ctx.quadraticCurveTo(-16, 4 + bob, -11, 2 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = furLight;
    ctx.beginPath();
    ctx.ellipse(0, -2 + bob, 13.5, 6.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.ellipse(8, -4 + bob, 7.2, 6.5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(14.5, -7 + bob, 6.5, 4.0, 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11, -10 + bob);
    ctx.lineTo(9, -15 + bob);
    ctx.lineTo(14, -11 + bob);
    ctx.fill();
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(14.5, -9.2 + bob, 2.2, 1.8);
  } else if (e.kind === 'spider_boss') {
    // DUSK WIDOW (Lv 15) — Giant Furry Tarantula Boss (Multi-pose windup/strike/special/stagger!)
    const stepPhase = elapsed * (e.moving ? 9.8 : 3.2) + e.phase;
    const furMain = flash ? '#ffffff' : isSpecialWindup ? '#ff6b35' : isWindup ? '#b85a32' : '#4a3d33';
    const furLight = flash ? '#ffffff' : isSpecial ? '#ffd8a8' : '#9c8468';
    const hairStroke = flash ? '#ffffff' : isSpecialWindup ? '#ffa94d' : '#c7ab88';

    const ang = Math.atan2(e.dirY || 1, e.dirX || 0);
    ctx.rotate(ang + Math.PI * 0.5);
    const lungeShift = isStrike ? -Math.sin(strikeP * Math.PI) * 9 : isSpecial ? -Math.sin(strikeP * Math.PI) * 6 : isWindup ? 4.5 : 0;
    ctx.translate(0, lungeShift);

    // 8 Articulated 3-Segment Furry Legs (front pair rears up high on windup & strike!)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const alt = (i + (side > 0 ? 1 : 0)) % 2 === 0 ? 1 : -1;
        const swing = Math.sin(stepPhase + i * 0.9 + (side > 0 ? Math.PI : 0)) * (e.moving ? 6.5 : 1.5);
        const frontRaise = i === 0 ? (isWindup ? -12 : isStrike ? -7 + strikeP * 14 : isSpecial ? -10 : 0) : i === 1 && isSpecialWindup ? -8 : 0;
        const baseAng = (side > 0 ? 0.1 : Math.PI - 0.1) + side * (-0.52 + i * 0.34);
        const rootX = side * 9;
        const rootY = -8 + i * 5.2;
        const kneeX = rootX + Math.cos(baseAng) * 20 + side * 6;
        const kneeY = rootY + Math.sin(baseAng) * 16 + swing * 0.6 + frontRaise * 0.5;
        const tarsX = kneeX + Math.cos(baseAng * 1.1) * 19 + side * 5;
        const tarsY = kneeY + Math.sin(baseAng * 1.2) * 16 + alt * 2 + swing + frontRaise;

        drawLimb(ctx, rootX, rootY, kneeX, kneeY, 3.8, 2.7, furMain, furLight);
        drawLimb(ctx, kneeX, kneeY, tarsX, tarsY, 2.6, 1.4, furMain, null, '#1a1512');

        ctx.strokeStyle = hairStroke;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let h = 1; h <= 4; h++) {
          const lx = lerp(rootX, kneeX, h * 0.22);
          const ly = lerp(rootY, kneeY, h * 0.22);
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + side * 4.5, ly - 3.5);
          const lx2 = lerp(kneeX, tarsX, h * 0.22);
          const ly2 = lerp(kneeY, tarsY, h * 0.22);
          ctx.moveTo(lx2, ly2);
          ctx.lineTo(lx2 + side * 3.8, ly2 + 2.8);
        }
        ctx.stroke();
      }
    }

    // Giant Bulbous Furred Abdomen + Spinneret Silk Glow on Special
    const abdGrad = ctx.createRadialGradient(-3, 20, 4, 0, 22, 24);
    abdGrad.addColorStop(0, furLight);
    abdGrad.addColorStop(0.55, furMain);
    abdGrad.addColorStop(1, '#1e1916');
    ctx.fillStyle = abdGrad;
    ctx.beginPath();
    ctx.ellipse(0, 20 + bob * 0.4, 18.5, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isSpecialWindup || isSpecial) {
      ctx.fillStyle = '#74c0fc';
      ctx.beginPath();
      ctx.arc(0, 38, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = hairStroke;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let a = 0; a < 22; a++) {
      const ha = (a / 22) * Math.PI * 2;
      const hx1 = Math.cos(ha) * 16.5;
      const hy1 = 20 + Math.sin(ha) * 19.5;
      ctx.moveTo(hx1, hy1);
      ctx.lineTo(hx1 * 1.18, 20 + Math.sin(ha) * 23);
    }
    ctx.stroke();

    // Cephalothorax + Animating Venom Fangs + Glowing Clustered Eyes
    ctx.fillStyle = furLight;
    ctx.beginPath();
    ctx.ellipse(0, -4 + bob * 0.5, 11.5, 12.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const fangSpread = isWindup ? 3.5 : isStrike ? -2.5 : 0;
    drawLimb(ctx, -4, -14, -7 - fangSpread, -24 + (isStrike ? -3 : 0), 2.3, 0.8, '#2b2520', null, '#ff4d4d');
    drawLimb(ctx, 4, -14, 7 + fangSpread, -24 + (isStrike ? -3 : 0), 2.3, 0.8, '#2b2520', null, '#ff4d4d');
    ctx.fillStyle = isWindup || isStrike ? '#ff3b3b' : '#ffd8a8';
    for (const ex of [-4.5, -2.0, 2.0, 4.5]) {
      ctx.fillRect(ex - 0.8, -13, 1.8, 1.8);
    }
  } else if (e.kind === 'warden_boss') {
    ctx.scale(1.55, 1.55);
    const steel = flash ? '#ffffff' : isSpecialWindup ? '#ff5722' : isWindup ? '#ff922b' : '#cbd5e1';
    const cloakSway = Math.sin(elapsed * 4.5) * 2.5 + (isSpecial ? 6 : 0);

    // Armored cape behind Warden
    ctx.fillStyle = '#3b151e';
    ctx.beginPath();
    ctx.moveTo(-8, -13 + bob);
    ctx.lineTo(-15 - cloakSway, 16 + bob);
    ctx.lineTo(6 - cloakSway * 0.5, 14 + bob);
    ctx.closePath();
    ctx.fill();

    // Heavy iron legs
    drawLimb(ctx, -4, 4, -5.5 - stride * 0.45, 17, 3.2, 2.4, '#475569', '#94a3b8');
    drawLimb(ctx, 4, 4, 5.5 + stride * 0.45, 17, 3.2, 2.4, '#64748b', '#cbd5e1');

    // Fluted cuirass & pauldrons
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-8.5, -14.5 + bob, 17, 19.5);
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.ellipse(-9, -12.5 + bob, 5.2, 4.0, -0.35, 0, Math.PI * 2);
    ctx.ellipse(9, -12.5 + bob, 5.2, 4.0, 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Shield raised on left arm
    const shOff = isWindup ? -3 : isStrike ? 2 : 0;
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(-14.5, -9 + bob + shOff, 6.2, 13, 2);
    ctx.fill();
    ctx.strokeStyle = steel;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Horned iron helm
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.arc(0, -20.5 + bob, 5.6, 0, Math.PI * 2);
    ctx.fill();
    drawLimb(ctx, -4, -22 + bob, -12, -32 + bob, 2.2, 0.7, '#f8fafc');
    drawLimb(ctx, 4, -22 + bob, 12, -32 + bob, 2.2, 0.7, '#f8fafc');
    ctx.fillStyle = isWindup || isSpecial ? '#ff3b3b' : '#ef4444';
    ctx.fillRect(-2.6, -21 + bob, 5.2, 1.6);

    // Multi-animation Halberd / Greataxe Cleave & Whirlwind Tempest!
    const axeAng = isSpecial
      ? -1.8 + strikeP * Math.PI * 2.2
      : isWindup
        ? -2.35
        : isStrike
          ? lerp(-2.1, 0.95, strikeP)
          : -0.78 + Math.sin(elapsed * 2.6) * 0.12;
    const handX = 8.5 + Math.cos(axeAng) * 3;
    const handY = -7 + bob + Math.sin(axeAng) * 3;
    const bladeX = handX + Math.cos(axeAng) * 19;
    const bladeY = handY + Math.sin(axeAng) * 19;
    drawLimb(ctx, 7, -10 + bob, handX, handY, 2.4, 2.0, steel);
    ctx.strokeStyle = isWindup || isSpecial ? '#ff6b6b' : '#e2e8f0';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(bladeX, bladeY);
    ctx.stroke();
    ctx.fillStyle = isSpecialWindup ? '#ffa94d' : '#f1f5f9';
    ctx.beginPath();
    ctx.arc(bladeX, bladeY, 7.2, axeAng - 0.85, axeAng + 1.15);
    ctx.fill();
  } else if (e.kind === 'lich_boss') {
    // BOSS 4: LORD SEPULCHRAL, CINDERBONE LICH (Levitating Arch-Necromancer + 3 Orbiting Skulls!)
    ctx.scale(1.42, 1.42);
    const hoverY = Math.sin(elapsed * 2.8 + e.phase) * 3.8;
    const shroudCol = flash ? '#ffffff' : isSpecialWindup ? '#b197fc' : isWindup ? '#9775fa' : '#312e81';
    const boneCol = flash ? '#ffffff' : '#e2e8f0';
    const soulFlame = isSpecialWindup || isSpecial ? '#66d9e8' : isWindup ? '#da77f2' : '#74c0fc';

    // Spectral Necrotic Skirt & Floating Tatters (swirling during Bone Nova!)
    const spread = isSpecial ? 10 : isSpecialWindup ? 6 : 2;
    ctx.fillStyle = shroudCol;
    ctx.beginPath();
    ctx.moveTo(-7, -14 + hoverY);
    ctx.lineTo(-14 - spread, 20 + Math.sin(elapsed * 5) * 2);
    ctx.lineTo(-4, 17 + hoverY);
    ctx.lineTo(0, 22 + hoverY * 0.5);
    ctx.lineTo(6, 17 + hoverY);
    ctx.lineTo(15 + spread, 20 + Math.cos(elapsed * 5) * 2);
    ctx.lineTo(8, -14 + hoverY);
    ctx.closePath();
    ctx.fill();

    // Ribcage Core & Vertebral Collar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6.5, -13 + hoverY, 13, 15);
    ctx.fillStyle = boneCol;
    for (let r = 0; r < 4; r++) {
      ctx.fillRect(-5.5, -12 + r * 3.2 + hoverY, 11, 1.6);
    }
    ctx.fillStyle = soulFlame;
    ctx.beginPath();
    ctx.arc(0, -6 + hoverY, 2.8 + (isSpecialWindup ? 1.4 : 0), 0, Math.PI * 2);
    ctx.fill();

    // Jagged Spiked Bone Mantle Shoulders
    ctx.fillStyle = boneCol;
    ctx.beginPath();
    ctx.ellipse(-9.5, -13 + hoverY, 4.6, 3.4, -0.45, 0, Math.PI * 2);
    ctx.ellipse(9.5, -13 + hoverY, 4.6, 3.4, 0.45, 0, Math.PI * 2);
    ctx.fill();
    drawLimb(ctx, -10, -14 + hoverY, -15, -22 + hoverY, 2.0, 0.7, boneCol);
    drawLimb(ctx, 10, -14 + hoverY, 15, -22 + hoverY, 2.0, 0.7, boneCol);

    // Horned Lich Skull Crown
    ctx.fillStyle = boneCol;
    ctx.beginPath();
    ctx.arc(0, -21 + hoverY, 5.4, 0, Math.PI * 2);
    ctx.fill();
    drawLimb(ctx, -4, -24 + hoverY, -9.5, -34 + hoverY, 2.0, 0.6, '#cbd5e1', null, soulFlame);
    drawLimb(ctx, 4, -24 + hoverY, 9.5, -34 + hoverY, 2.0, 0.6, '#cbd5e1', null, soulFlame);
    ctx.fillStyle = soulFlame;
    ctx.fillRect(-2.6, -22 + hoverY, 1.8, 1.8);
    ctx.fillRect(0.8, -22 + hoverY, 1.8, 1.8);

    // Arms & Skull-Crown Staff (Raised aloft on windup, wide outward cast on Bone Nova!)
    const leftAng = isSpecial ? Math.PI + 0.35 : isWindup ? -Math.PI * 0.65 : Math.PI * 0.72;
    const rightAng = isSpecial ? -0.35 : isWindup ? -1.42 : isStrike ? lerp(-1.4, 0.35, strikeP) : -0.42;
    const lhx = -8 + Math.cos(leftAng) * 8;
    const lhy = -8 + hoverY + Math.sin(leftAng) * 8;
    const rhx = 8 + Math.cos(rightAng) * 8;
    const rhy = -8 + hoverY + Math.sin(rightAng) * 8;
    drawLimb(ctx, -8, -11 + hoverY, lhx, lhy, 2.0, 1.4, '#64748b', boneCol);
    drawLimb(ctx, 8, -11 + hoverY, rhx, rhy, 2.0, 1.4, '#64748b', boneCol);

    // Glowing arcane sigil at left claw + Long Staff at right claw
    ctx.fillStyle = soulFlame;
    ctx.beginPath();
    ctx.arc(lhx, lhy, isWindup || isSpecial ? 4.2 : 2.5, 0, Math.PI * 2);
    ctx.fill();

    const sTopX = rhx + Math.cos(rightAng - 0.5) * 16;
    const sTopY = rhy + Math.sin(rightAng - 0.5) * 16 - 4;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(rhx - Math.cos(rightAng - 0.5) * 8, rhy - Math.sin(rightAng - 0.5) * 8 + 8);
    ctx.lineTo(sTopX, sTopY);
    ctx.stroke();
    ctx.fillStyle = soulFlame;
    ctx.beginPath();
    ctx.arc(sTopX, sTopY, isWindup || isSpecial ? 4.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 3 Orbiting Ghostly Skull Phylacteries!
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const oa = elapsed * 2.6 + (sIdx * Math.PI * 2) / 3;
      const orbR = isSpecial ? 29 : 21;
      const ox = Math.cos(oa) * orbR;
      const oy = Math.sin(oa) * (orbR * 0.45) - 6 + hoverY;
      ctx.fillStyle = boneCol;
      ctx.beginPath();
      ctx.arc(ox, oy, 2.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = soulFlame;
      ctx.fillRect(ox - 1.4, oy - 0.6, 2.8, 1.2);
    }
  } else if (e.kind === 'golem_boss') {
    // BOSS 5: IRONHIDE COLOSSUS GORRATH (Towering Mossy Cragstone + Molten Crystal Core + Twin Boulder Gauntlets!)
    ctx.scale(1.62, 1.62);
    const stoneDark = flash ? '#ffffff' : '#2d3748';
    const stoneMid = flash ? '#ffffff' : isSpecialWindup ? '#b45309' : '#64748b';
    const stoneRim = flash ? '#ffffff' : '#cbd5e1';
    const magmaGlow = isSpecialWindup || isSpecial ? '#ff4500' : isWindup ? '#ff922b' : '#38bdf8';

    const slamDrop = isSpecial ? Math.sin(strikeP * Math.PI) * 5.5 : 0;

    // Heavy piston stone legs
    drawLimb(ctx, -6, 6, -8 - stride * 0.45, 20, 4.8, 3.8, stoneDark, stoneMid, stoneRim);
    drawLimb(ctx, 6, 6, 8 + stride * 0.45, 20, 4.8, 3.8, stoneDark, stoneMid, stoneRim);

    // Jagged Cragstone Torso with Glowing Molten/Crystal Vein Network
    ctx.fillStyle = stoneDark;
    ctx.beginPath();
    ctx.moveTo(-14, -14 + bob + slamDrop);
    ctx.lineTo(-10, -21 + bob + slamDrop);
    ctx.lineTo(10, -21 + bob + slamDrop);
    ctx.lineTo(14, -13 + bob + slamDrop);
    ctx.lineTo(10, 7 + bob + slamDrop);
    ctx.lineTo(-10, 7 + bob + slamDrop);
    ctx.closePath();
    ctx.fill();

    // Mossy boulder shoulder crests + stone head anvil
    ctx.fillStyle = '#4d7c0f';
    ctx.beginPath();
    ctx.ellipse(-12, -16 + bob + slamDrop, 6.2, 4.4, -0.3, 0, Math.PI * 2);
    ctx.ellipse(12, -16 + bob + slamDrop, 6.2, 4.4, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = stoneRim;
    ctx.fillRect(-5.2, -25 + bob + slamDrop, 10.4, 7.2);
    ctx.fillStyle = magmaGlow;
    ctx.fillRect(-3.6, -22 + bob + slamDrop, 7.2, 1.8); // visor fissure
    // glowing chest rune fissures
    ctx.beginPath();
    ctx.moveTo(-5, -13 + bob + slamDrop);
    ctx.lineTo(0, -6 + bob + slamDrop);
    ctx.lineTo(5, -12 + bob + slamDrop);
    ctx.moveTo(0, -6 + bob + slamDrop);
    ctx.lineTo(0, 3 + bob + slamDrop);
    ctx.strokeStyle = magmaGlow;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Twin Giant Boulder Fists (Raise OVERHEAD on windup/special_windup, slam INTO EARTH on special, hook on strike!)
    let lFistX = -17;
    let lFistY = 2 + bob + stride * 0.3;
    let rFistX = 17;
    let rFistY = 2 + bob - stride * 0.3;
    if (isSpecialWindup) {
      lFistX = -11;
      lFistY = -30 + bob;
      rFistX = 11;
      rFistY = -30 + bob;
    } else if (isSpecial) {
      const smashY = lerp(-28, 17, Math.min(1, strikeP * 1.45));
      lFistX = -14;
      lFistY = smashY;
      rFistX = 14;
      rFistY = smashY;
    } else if (isWindup) {
      rFistX = 15;
      rFistY = -22 + bob;
    } else if (isStrike) {
      rFistX = 21 + Math.sin(strikeP * Math.PI) * 5;
      rFistY = lerp(-18, 9, strikeP);
    }

    drawLimb(ctx, -12, -14 + bob + slamDrop, lFistX, lFistY, 4.2, 5.2, stoneMid, stoneRim);
    drawLimb(ctx, 12, -14 + bob + slamDrop, rFistX, rFistY, 4.2, 5.2, stoneMid, stoneRim);
    ctx.fillStyle = stoneRim;
    ctx.beginPath();
    ctx.arc(lFistX, lFistY, 5.6, 0, Math.PI * 2);
    ctx.arc(rFistX, rFistY, 5.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'dragon') {
    const flapSpeed = isWindup || isSpecial ? 6.0 : 2.5;
    const flapAmp = isSpecialWindup ? -14 : isSpecial ? Math.sin(strikeP * Math.PI) * 18 : Math.sin(elapsed * flapSpeed) * 8;
    const scaleDark = flash ? '#ffffff' : isSpecialWindup ? '#b91c1c' : isWindup ? '#ff922b' : '#3e4451';
    const scaleRim = flash ? '#ffffff' : '#cbd5e1';
    const bellyFire = isWindup || isSpecial ? '#ff3300' : '#f59f00';
    const lungeY = isStrike ? Math.sin(strikeP * Math.PI) * 8 : isSpecialWindup ? -5 : 0;
    ctx.translate(0, lungeY);

    for (const side of [-1, 1]) {
      ctx.fillStyle = '#252932';
      ctx.beginPath();
      ctx.moveTo(side * 8, -12 + bob);
      ctx.lineTo(side * 62, -46 + flapAmp);
      ctx.lineTo(side * 54, -14 + flapAmp * 0.7);
      ctx.lineTo(side * 42, 6 + flapAmp * 0.5);
      ctx.lineTo(side * 26, 2 + bob);
      ctx.lineTo(side * 14, 12 + bob);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = scaleRim;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(side * 8, -12 + bob);
      ctx.lineTo(side * 62, -46 + flapAmp);
      ctx.moveTo(side * 30, -26 + flapAmp * 0.5);
      ctx.lineTo(side * 54, -14 + flapAmp * 0.7);
      ctx.moveTo(side * 24, -18 + flapAmp * 0.4);
      ctx.lineTo(side * 40, 4 + flapAmp * 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = scaleDark;
    ctx.lineWidth = 8.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 16 + bob);
    ctx.quadraticCurveTo(-28, 38, -50, 26 + Math.sin(elapsed * 2.2) * 6);
    ctx.stroke();
    ctx.fillStyle = scaleRim;
    ctx.beginPath();
    ctx.moveTo(-50, 26 + Math.sin(elapsed * 2.2) * 6);
    ctx.lineTo(-59, 22 + Math.sin(elapsed * 2.2) * 6);
    ctx.lineTo(-54, 31 + Math.sin(elapsed * 2.2) * 6);
    ctx.fill();

    ctx.fillStyle = scaleDark;
    ctx.beginPath();
    ctx.ellipse(0, 2 + bob, 20, 23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bellyFire;
    ctx.beginPath();
    ctx.ellipse(0, -1 + bob, 9.5 + (isSpecialWindup ? 3 : 0), 13.5 + (isSpecialWindup ? 3 : 0), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe066';
    for (let sc = -2; sc <= 2; sc++) {
      ctx.fillRect(-5, sc * 4.5 + bob, 10, 1.4);
    }

    // Dragon Head & Jaws (Snaps wide with glowing embers on Breath Special!)
    const headPitch = isSpecialWindup ? -4 : isStrike ? 5 : 0;
    ctx.fillStyle = scaleRim;
    ctx.beginPath();
    ctx.ellipse(0, -25 + bob + headPitch, 11.5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    if (isSpecialWindup || isSpecial) {
      ctx.fillStyle = '#ff5722';
      ctx.beginPath();
      ctx.arc(0, -14 + bob + headPitch, 5.2, 0, Math.PI * 2);
      ctx.fill();
    }
    drawLimb(ctx, -6, -33 + bob + headPitch, -20, -49 + bob + headPitch, 3.2, 0.9, '#f1f5f9');
    drawLimb(ctx, 6, -33 + bob + headPitch, 20, -49 + bob + headPitch, 3.2, 0.9, '#f1f5f9');
    ctx.fillStyle = isSpecial ? '#ff3b3b' : '#ffe066';
    ctx.fillRect(-5.5, -28 + bob + headPitch, 3.2, 2.8);
    ctx.fillRect(2.3, -28 + bob + headPitch, 3.2, 2.8);
  }

  ctx.restore();
}

export function drawAdventurerStencil(ctx, p, elapsed, isReflection = false) {
  drawHeroKnightStencil(ctx, {
    facing: p.dirX < -0.2 ? 'left' : 'right',
    headingYaw: Math.atan2(p.dirY || 0, p.dirX || 1),
    isMounted: p.mounted,
    isMoving: p.moving,
    gaitPhase: elapsed * 7 + p.phase,
    gallopBlend: 0.4,
    slashProgress: p.slashTimer > 0 ? 1 - p.slashTimer / 0.25 : 0,
    swordFx: p.swordFx,
    elapsed,
    isReflection,
    showMountBody: p.mounted,
    showRiderBody: true
  });
}

/**
 * Interactive 360° Rotatable ASCII Turntable for `CRAFT • Look` (Download(1).mp4!)
 */
export function renderCraftPreviewScene(renderer, width, height, yawAngle, zoomScale, build, elapsed) {
  renderer.resize(width, height);
  renderer.beginFrame();
  const mat = build.computed.armorMaterial || { hex: '#86909c', trim: '#f1f5f9', swordFx: 'steel', halo: false };
  const cx = width * 0.5;
  const cy = height * 0.58;
  const gScale = zoomScale;
  const scalePx = zoomScale * (width / 190);

  // Render genuine 360° 3D Knight model rotating smoothly on yawAngle!
  emitPureAscii3DSprite({
    renderer,
    toScreenX: (wx) => cx + wx * scalePx,
    toScreenY: (wy) => cy + wy * scalePx,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    cols: 68,
    rows: 68,
    worldSpan: 56,
    cellScreenSize: 4.4 * (width / 420) * (zoomScale / 1.4),
    alphaMult: 0.99,
    rimColor: mat.halo ? [1.0, 0.72, 0.28] : [0.75, 0.88, 1.0],
    lanternPos: { x: 45, y: 35, z: 32 },
    elapsed,
    buildModel: (buf) =>
      buildHeroKnight3D(buf, {
        facing: 'right',
        isMounted: false,
        isMoving: false,
        gaitPhase: 0,
        gallopBlend: 0,
        slashProgress: 0,
        swordFx: mat.swordFx,
        armorMaterial: mat,
        yawTurn: yawAngle,
        elapsed,
        showMountBody: false,
        showRiderBody: true
      })
  });

  // Glowing Crown Halo & Emberstone / Moonsteel Sparks orbiting head & sword (Download(1).mp4!)
  if (mat.halo) {
    const isEmber = mat.id === 'emberstone' || mat.id === 'blooderon';
    const col = isEmber ? [1.0, 0.56, 0.14] : mat.id === 'dragonscale' ? [0.35, 0.95, 0.52] : [0.45, 0.88, 1.0];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + elapsed * 1.4;
      const rx = Math.cos(a) * 44 * gScale * 0.75;
      const ry = Math.sin(a) * 32 * gScale * 0.75;
      renderer.drawGlyph(
        cx + rx,
        cy - 92 * gScale * 0.75 + ry,
        (9 + (i % 3) * 3) * gScale * 0.65,
        i % 2 === 0 ? '✦' : 'o',
        col[0],
        col[1],
        col[2],
        0.78 + Math.sin(elapsed * 5 + i) * 0.2,
        true
      );
    }
  }
}
