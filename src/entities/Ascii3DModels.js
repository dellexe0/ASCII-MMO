import { Ascii3DBuffer, rotZ, clamp, lerp } from '../engine/Ascii3DRasterizer.js';

const sharedBuf = new Ascii3DBuffer(64, 64, 110, 110, false);

export function hexToRgb(hex) {
  const h = (hex || '#9aa6b4').replace('#', '');
  if (h.length !== 6) return [0.62, 0.66, 0.72];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ];
}

export function matHex(hex, typeId = 2, emissive = 0, sizeBias = 1.0) {
  const [r, g, b] = hexToRgb(hex);
  return { r, g, b, typeId, emissive, sizeBias };
}

export function matRgb(r, g, b, typeId = 2, emissive = 0, sizeBias = 1.0) {
  return { r, g, b, typeId, emissive, sizeBias };
}

export function getSwordFxMaterial(swordFx) {
  switch (swordFx) {
    case 'ember':
      return {
        blade: matRgb(1.0, 0.56, 0.16, 2, 0.65),
        edge: matRgb(1.0, 0.94, 0.7, 2, 0.85),
        hilt: matRgb(0.55, 0.35, 0.14, 2, 0.15)
      };
    case 'frost':
      return {
        blade: matRgb(0.42, 0.78, 1.0, 2, 0.58),
        edge: matRgb(0.92, 0.98, 1.0, 2, 0.78),
        hilt: matRgb(0.45, 0.58, 0.74, 2, 0.1)
      };
    case 'crimson':
      return {
        blade: matRgb(0.88, 0.22, 0.3, 2, 0.55),
        edge: matRgb(1.0, 0.84, 0.86, 2, 0.72),
        hilt: matRgb(0.42, 0.14, 0.18, 2, 0.1)
      };
    default:
      return {
        blade: matRgb(0.64, 0.72, 0.82, 2, 0.12),
        edge: matRgb(0.95, 0.97, 1.0, 2, 0.25),
        hilt: matRgb(0.68, 0.54, 0.24, 2, 0.08)
      };
  }
}

export function addEllipRot(buf, lx, ly, lz, rx, ry, rz, mat, yaw = 0, ox = 0, oy = 0, oz = 0, furAmt = 0) {
  const [wx, wy, wz] = rotZ(lx, ly, lz, yaw);
  buf.addEllipsoid(ox + wx, oy + wy, oz + wz, rx, ry, rz, mat, yaw, furAmt);
}

export function addBoneRot(buf, ax, ay, az, bx, by, bz, rA, rB, mat, yaw = 0, ox = 0, oy = 0, oz = 0, furAmt = 0) {
  const [waX, waY, waZ] = rotZ(ax, ay, az, yaw);
  const [wbX, wbY, wbZ] = rotZ(bx, by, bz, yaw);
  buf.addCapsule(ox + waX, oy + waY, oz + waZ, ox + wbX, oy + wbY, oz + wbZ, rA, rB, mat, furAmt);
}

export function addBoxRot(buf, lx, ly, lz, hx, hy, hz, mat, yaw = 0, ox = 0, oy = 0, oz = 0, extraYaw = 0) {
  const [wx, wy, wz] = rotZ(lx, ly, lz, yaw);
  buf.addBox(ox + wx, oy + wy, oz + wz, hx, hy, hz, mat, yaw + extraYaw);
}

export function addTriRot(buf, ax, ay, az, bx, by, bz, cx, cy, cz, mat, yaw = 0, ox = 0, oy = 0, oz = 0) {
  const [waX, waY, waZ] = rotZ(ax, ay, az, yaw);
  const [wbX, wbY, wbZ] = rotZ(bx, by, bz, yaw);
  const [wcX, wcY, wcZ] = rotZ(cx, cy, cz, yaw);
  buf.addTri(ox + waX, oy + waY, oz + waZ, ox + wbX, oy + wbY, oz + wbZ, ox + wcX, oy + wcY, oz + wcZ, mat);
}

/**
 * Emit any 3D Entity/Model via the pure-ASCII Z-buffered 3D Rasterizer.
 */
export function emitPureAscii3DSprite({
  renderer,
  toScreenX,
  toScreenY,
  worldX = 0,
  worldY = 0,
  worldZ = 0,
  worldTiltY = 1.0,
  cols = 58,
  rows = 58,
  worldSpan = 104,
  cellScreenSize = 3.2,
  alphaMult = 0.98,
  isReflection = false,
  mirrorClipCheck = null,
  rimColor = null,
  lanternPos = null,
  elapsed = 0,
  glowMask = false,
  enableMultiSize = false,
  buildModel
}) {
  sharedBuf.resize(cols, rows, worldSpan, worldSpan, isReflection);
  buildModel(sharedBuf);
  sharedBuf.flushToAscii({
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
    glowMask,
    enableMultiSize
  });
}

/**
 * True Semi-3D Articulated Warhorse + Plate Armor Knight Model!
 * Local frame: +X = forward direction, +Y = right side, +Z = upward vertical height above ground.
 */
export function buildHeroKnight3D(
  buf,
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
    cloakTone = null,
    mountCoat = null,
    yawTurn = null,
    elapsed = 0,
    showMountBody = true,
    showRiderBody = true
  }
) {
  let yaw = headingYaw;
  if (yaw === null || yaw === undefined) {
    yaw = facing === 'left' ? Math.PI : facing === 'up' ? -Math.PI * 0.5 : facing === 'down' ? Math.PI * 0.5 : 0;
  }
  if (yawTurn !== null) yaw = yawTurn;

  const bob = isMoving
    ? Math.sin(gaitPhase * 2) * (isMounted ? 1.8 + gallopBlend * 1.4 : 1.3)
    : Math.sin(elapsed * 2.4) * 0.45;

  const horseBody = mountCoat?.body || matRgb(0.88, 0.92, 0.98, 4);
  const horseChest = mountCoat?.chest || matRgb(0.97, 0.98, 1.0, 4);
  const horseShadow = mountCoat?.shadow || matRgb(0.58, 0.65, 0.75, 4);
  const hoofMat = matRgb(0.28, 0.3, 0.36, 2);
  const maneMat = mountCoat?.mane || matRgb(0.98, 0.99, 1.0, 4, 0.08);
  const leatherMat = matRgb(0.46, 0.28, 0.16, 1);
  const capeDark = cloakTone?.dark || matRgb(0.52, 0.08, 0.14, 1);
  const capeBright = cloakTone?.bright || matRgb(0.95, 0.2, 0.28, 1, 0.12);
  const caparison = cloakTone?.barding || matRgb(0.76, 0.14, 0.22, 1);
  const goldTrim = matRgb(1.0, 0.84, 0.3, 2, 0.28);

  const armorMat = matHex(armorMaterial?.hex || '#a6b6c8', 2, isDashing ? 0.38 : 0.08);
  const darkSteel = matRgb(0.38, 0.45, 0.56, 2);
  const trimMat = matHex(armorMaterial?.trim || '#f8fafc', 2, armorMaterial?.halo ? 0.34 : 0.16);
  const visorGlow = armorMaterial?.halo
    ? (armorMaterial.id === 'emberstone' || armorMaterial.id === 'blooderon'
      ? matRgb(1.0, 0.52, 0.16, 2, 0.92)
      : matRgb(0.48, 0.9, 1.0, 2, 0.92))
    : matRgb(0.9, 0.96, 1.0, 2, 0.72);
  const bladeMats = getSwordFxMaterial(swordFx);

  // 1. SCULPTED WARHORSE (Thick, Continuous Muscle & Barding so limbs never fragment into sticks!)
  if (showMountBody) {
    const hz = 16.5 + bob;

    const legs = [
      { lx: -11.4, ly: -5.0, phase: 0, isBack: true },
      { lx: -11.4, ly: 5.0, phase: Math.PI, isBack: true },
      { lx: 11.2, ly: -4.6, phase: Math.PI, isBack: false },
      { lx: 11.2, ly: 4.6, phase: 0, isBack: false }
    ];
    for (const lg of legs) {
      const p = gaitPhase + lg.phase * (1 - gallopBlend * 0.68);
      const stride = isMoving ? Math.sin(p) * (6.4 + gallopBlend * 5.2) : 0;
      const lift = isMoving ? Math.max(0, Math.cos(p)) * (4.2 + gallopBlend * 3.8) : 0;
      const hipX = lg.lx;
      const hipY = lg.ly;
      const hipZ = hz - 0.8;
      const upperX = hipX + stride * 0.38 + (lg.isBack ? -2.0 : 1.8);
      const upperZ = 10.6 + lift * 0.55;
      const kneeX = hipX + stride * 0.72 + (lg.isBack ? 0.6 : 1.0);
      const kneeZ = 5.5 + lift * 0.8;
      const hoofX = hipX + stride;
      const hoofZ = lift;

      addBoneRot(buf, hipX, hipY, hipZ, upperX, hipY, upperZ, 3.6, 2.7, horseBody, yaw);
      addBoneRot(buf, upperX, hipY, upperZ, kneeX, hipY, kneeZ, 2.6, 2.1, horseChest, yaw);
      addBoneRot(buf, kneeX, hipY, kneeZ, hoofX, hipY, hoofZ + 1.1, 2.1, 1.75, horseChest, yaw);
      addEllipRot(buf, hoofX + 0.5, hipY, hoofZ + 0.85, 2.3, 2.0, 1.3, hoofMat, yaw);
    }

    // Lush Billowing Flowing Horse Tail
    const tailWag = Math.sin(elapsed * (isMoving ? 10.5 : 3.2)) * (isMoving ? 3.8 : 1.6);
    addBoneRot(buf, -17.2, 0, hz + 1.8, -23.8, tailWag * 0.45, hz - 2.6, 3.3, 2.5, horseShadow, yaw, 0, 0, 0, 0.35);
    addBoneRot(buf, -23.8, tailWag * 0.45, hz - 2.6, -30.5 - gallopBlend * 5, tailWag, 5.2, 2.7, 1.25, maneMat, yaw, 0, 0, 0, 0.42);
    addBoneRot(buf, -23.2, tailWag * 0.35, hz - 3.8, -28.5 - gallopBlend * 4, tailWag * 1.25, 3.8, 2.2, 1.0, horseBody, yaw, 0, 0, 0, 0.42);

    // Sculpted Hindquarters, Barrel Ribcage & Muscular Chest
    addEllipRot(buf, -10.2, 0, hz + 0.3, 9.2, 7.2, 7.2, horseBody, yaw);
    addEllipRot(buf, 1.2, 0, hz - 0.1, 11.0, 7.4, 7.2, horseBody, yaw);
    addEllipRot(buf, 11.4, 0, hz + 1.0, 7.8, 6.6, 6.6, horseChest, yaw);
    addEllipRot(buf, 12.8, -2.8, hz - 0.3, 4.4, 3.8, 4.6, horseChest, yaw);
    addEllipRot(buf, 12.8, 2.8, hz - 0.3, 4.4, 3.8, 4.6, horseChest, yaw);
    addBoxRot(buf, 14.2, 0, hz + 0.4, 1.8, 6.6, 1.6, goldTrim, yaw);
    addBoxRot(buf, 3.4, 0, hz - 0.3, 1.6, 7.5, 6.2, leatherMat, yaw);

    // Rich Crimson/Gold Barding Caparison Skirt, Studded Breast Straps & High Saddle
    addBoxRot(buf, -2.8, 0, hz + 2.4, 12.2, 7.5, 4.4, caparison, yaw);
    addBoxRot(buf, -2.8, 0, hz - 0.9, 12.4, 7.7, 1.35, goldTrim, yaw);
    addBoxRot(buf,  9.2, 0, hz + 1.8, 1.5, 7.2, 1.4, goldTrim, yaw);
    addBoxRot(buf, -12.8, 0, hz + 1.5, 1.4, 7.0, 1.3, goldTrim, yaw);
    addBoxRot(buf, -4.8, 0, hz + 6.8, 2.3, 5.2, 2.1, leatherMat, yaw);
    addBoxRot(buf, 2.8, 0, hz + 6.7, 2.0, 4.9, 1.9, armorMat, yaw);

    // Thick Arched Muscular Neck, Armored Chanfron & Jaw
    const headBob = Math.sin(gaitPhase * 2 - 0.5) * (isMoving ? 1.5 : 0.4);
    addBoneRot(buf, 11.2, 0, hz + 2.0, 17.8, 0, hz + 12.2 + headBob, 5.6, 4.1, horseChest, yaw);
    addEllipRot(buf, 17.2, 0, hz + 12.6 + headBob, 4.8, 3.4, 3.9, horseChest, yaw);
    addBoneRot(buf, 17.6, 0, hz + 12.4 + headBob, 25.4, 0, hz + 7.6 + headBob, 3.9, 2.3, horseChest, yaw);
    addBoxRot(buf, 20.8, 0, hz + 11.2 + headBob, 4.2, 2.0, 1.4, trimMat, yaw, 0, 0, 0, 0);
    addBoxRot(buf, 19.0, -2.6, hz + 12.6 + headBob, 1.1, 0.9, 0.9, matRgb(0.25, 0.35, 0.55, 2, 0.35), yaw);
    addBoxRot(buf, 19.0, 2.6, hz + 12.6 + headBob, 1.1, 0.9, 0.9, matRgb(0.25, 0.35, 0.55, 2, 0.35), yaw);

    // Pointed Ears + Golden Bridle & Continuous Flowing Mane Ridge
    addBoneRot(buf, 15.8, -2.3, hz + 15.2 + headBob, 15.2, -3.0, hz + 19.4 + headBob, 1.4, 0.65, maneMat, yaw);
    addBoneRot(buf, 15.8, 2.3, hz + 15.2 + headBob, 15.2, 3.0, hz + 19.4 + headBob, 1.4, 0.65, maneMat, yaw);
    addEllipRot(buf, 23.2, 0, hz + 8.2 + headBob, 1.6, 2.4, 1.5, goldTrim, yaw);
    addBoneRot(buf, 22.8, -2.2, hz + 8.2 + headBob, 4.2, -6.5, hz + 14.8, 0.85, 0.85, leatherMat, yaw);
    addBoneRot(buf, 22.8, 2.2, hz + 8.2 + headBob, 4.2, 5.2, hz + 14.8, 0.85, 0.85, leatherMat, yaw);

    for (let m = 0; m < 8; m++) {
      const mt = m / 7;
      const mx = lerp(11.4, 17.8, mt);
      const mz = hz + lerp(4.2, 14.2, mt) + headBob * mt;
      addEllipRot(buf, mx - 2.1, Math.sin(elapsed * 8.5 + m * 0.9) * (0.9 + gallopBlend * 0.8), mz + 1.5, 2.7, 2.1, 2.9, maneMat, yaw, 0, 0, 0, 0.38);
    }
  }

  // 2. HEROIC GOTHIC KNIGHT (Thick Articulated Armor, Rich Cape, Crisp Shield & Gleaming Greatsword)
  if (showRiderBody) {
    const baseZ = isMounted && showMountBody ? 19.8 + bob : bob;
    const footStride = !isMounted && isMoving ? Math.sin(gaitPhase) * 6.0 : 0;
    const footLiftL = !isMounted && isMoving ? Math.max(0, Math.cos(gaitPhase)) * 3.2 : 0;
    const footLiftR = !isMounted && isMoving ? Math.max(0, -Math.cos(gaitPhase)) * 3.2 : 0;

    if (isMounted && showMountBody) {
      addBoneRot(buf, 0.4, -6.0, baseZ + 2.8, 2.5, -7.6, baseZ - 2.0, 2.9, 2.3, armorMat, yaw);
      addEllipRot(buf, 2.7, -7.8, baseZ - 2.0, 2.2, 2.1, 2.1, trimMat, yaw);
      addBoneRot(buf, 2.5, -7.6, baseZ - 2.0, 2.1, -7.8, baseZ - 7.0, 2.3, 1.9, darkSteel, yaw);
      addEllipRot(buf, 3.4, -7.8, baseZ - 7.3, 2.4, 1.8, 1.3, goldTrim, yaw);

      addBoneRot(buf, 0.4, 6.0, baseZ + 2.8, 2.5, 7.6, baseZ - 2.0, 2.9, 2.3, armorMat, yaw);
      addEllipRot(buf, 2.7, 7.8, baseZ - 2.0, 2.2, 2.1, 2.1, trimMat, yaw);
      addBoneRot(buf, 2.5, 7.6, baseZ - 2.0, 2.1, 7.8, baseZ - 7.0, 2.3, 1.9, darkSteel, yaw);
      addEllipRot(buf, 3.4, 7.8, baseZ - 7.3, 2.4, 1.8, 1.3, goldTrim, yaw);
    } else {
      const kxL = footStride * 0.55;
      const kxR = -footStride * 0.55;
      addBoneRot(buf, -0.4, -3.5, baseZ + 11.0, kxL, -3.7, baseZ + 5.8 + footLiftL * 0.6, 3.0, 2.4, armorMat, yaw);
      addEllipRot(buf, kxL + 0.6, -3.7, baseZ + 5.8 + footLiftL * 0.6, 2.2, 2.1, 2.1, trimMat, yaw);
      addBoneRot(buf, kxL, -3.7, baseZ + 5.8 + footLiftL * 0.6, footStride, -3.7, footLiftL + 1.0, 2.4, 1.95, darkSteel, yaw);
      addEllipRot(buf, footStride + 1.2, -3.7, footLiftL + 0.85, 2.5, 1.8, 1.2, armorMat, yaw);

      addBoneRot(buf, -0.4, 3.5, baseZ + 11.0, kxR, 3.7, baseZ + 5.8 + footLiftR * 0.6, 3.0, 2.4, armorMat, yaw);
      addEllipRot(buf, kxR + 0.6, 3.7, baseZ + 5.8 + footLiftR * 0.6, 2.2, 2.1, 2.1, trimMat, yaw);
      addBoneRot(buf, kxR, 3.7, baseZ + 5.8 + footLiftR * 0.6, -footStride, 3.7, footLiftR + 1.0, 2.4, 1.95, darkSteel, yaw);
      addEllipRot(buf, -footStride + 1.2, 3.7, footLiftR + 0.85, 2.5, 1.8, 1.2, armorMat, yaw);
    }

    // Thick Volumetric Layered Royal Cloak behind shoulders (no razor-thin tri dropouts!)
    const flutter = Math.sin(elapsed * (isMoving ? 9.5 : 3.2)) * (isMoving ? 3.2 : 1.5);
    addTriRot(buf, -2.5, -5.8, baseZ + 18.8, -2.5, 0.4, baseZ + 18.8, -17.5, -4.6 + flutter * 0.6, baseZ + (isMounted ? -1.8 : 2.5), capeDark, yaw);
    addTriRot(buf, -2.5, -0.4, baseZ + 18.8, -2.5, 5.8, baseZ + 18.8, -17.5, 4.6 + flutter * 0.7, baseZ + (isMounted ? -1.6 : 2.8), capeDark, yaw);
    addBoneRot(buf, -3.0, 0, baseZ + 18.2, -13.5, flutter * 0.45, baseZ + (isMounted ? 3.0 : 5.5), 5.6, 4.6, capeBright, yaw);
    addBoneRot(buf, -4.2, -2.6, baseZ + 17.5, -14.8, -3.4 + flutter * 0.55, baseZ + (isMounted ? 1.5 : 4.2), 3.4, 2.8, capeDark, yaw);
    addBoneRot(buf, -4.2, 2.6, baseZ + 17.5, -14.8, 3.4 + flutter * 0.55, baseZ + (isMounted ? 1.5 : 4.2), 3.4, 2.8, capeDark, yaw);

    // Sculpted Gothic Cuirass, Heraldic Crest, Gorget Collar, Ornate Waist Belt & Spiked Pauldrons
    addEllipRot(buf, 0, 0, baseZ + 14.2, 5.4, 6.6, 7.2, armorMat, yaw);
    addBoxRot(buf, 2.8, 0, baseZ + 15.0, 2.9, 4.4, 4.0, trimMat, yaw);
    addBoxRot(buf, 4.4, 0, baseZ + 15.2, 1.1, 1.15, 3.8, goldTrim, yaw);
    addBoxRot(buf, 4.4, 0, baseZ + 15.6, 1.1, 3.2, 1.0, goldTrim, yaw);
    addEllipRot(buf, 4.6, 0, baseZ + 15.6, 1.2, 1.2, 1.2, visorGlow, yaw);
    addBoxRot(buf, 0.2, 0, baseZ + 9.4, 5.2, 6.4, 1.6, leatherMat, yaw);
    addBoxRot(buf, 4.9, 0, baseZ + 9.4, 1.0, 1.8, 1.8, goldTrim, yaw);
    addBoxRot(buf, 0.2, -5.2, baseZ + 7.2, 3.4, 1.9, 3.0, darkSteel, yaw, 0, 0, 0, 0.15);
    addBoxRot(buf, 0.2, 5.2, baseZ + 7.2, 3.4, 1.9, 3.0, darkSteel, yaw, 0, 0, 0, -0.15);
    addEllipRot(buf, 0.4, 0, baseZ + 19.6, 3.8, 4.1, 2.2, darkSteel, yaw);
    addBoneRot(buf, -14.2, -4.6 + flutter * 0.55, baseZ + (isMounted ? 1.5 : 4.2), -14.2, 4.6 + flutter * 0.55, baseZ + (isMounted ? 1.5 : 4.2), 1.45, 1.45, goldTrim, yaw);

    addEllipRot(buf, 0.4, -7.4, baseZ + 18.2, 4.2, 4.2, 3.9, trimMat, yaw);
    addEllipRot(buf, 0.4, -8.2, baseZ + 16.0, 3.4, 3.4, 2.7, goldTrim, yaw);
    addBoneRot(buf, 0.4, -8.6, baseZ + 19.6, -1.2, -10.8, baseZ + 22.8, 1.3, 0.4, goldTrim, yaw);
    addEllipRot(buf, 0.4, 7.4, baseZ + 18.2, 4.2, 4.2, 3.9, trimMat, yaw);
    addEllipRot(buf, 0.4, 8.2, baseZ + 16.0, 3.4, 3.4, 2.7, goldTrim, yaw);
    addBoneRot(buf, 0.4, 8.6, baseZ + 19.6, -1.2, 10.8, baseZ + 22.8, 1.3, 0.4, goldTrim, yaw);

    // Sallet Great-Helm + Crown Spikes + Visor Grille + Flowing Plume
    addEllipRot(buf, 0.6, 0, baseZ + 23.8, 5.0, 4.5, 5.2, armorMat, yaw);
    addBoxRot(buf, 3.2, 0, baseZ + 21.8, 2.4, 3.4, 1.7, darkSteel, yaw);
    addBoxRot(buf, 3.6, 0, baseZ + 25.0, 2.6, 3.8, 1.1, trimMat, yaw);
    addBoxRot(buf, 5.0, 0, baseZ + 23.6, 1.2, 3.0, 1.05, visorGlow, yaw);
    addBoxRot(buf, 0.1, 0, baseZ + 28.2, 4.4, 1.3, 1.8, goldTrim, yaw);
    addBoneRot(buf, 1.6, -2.0, baseZ + 27.6, 2.0, -2.6, baseZ + 30.8, 0.9, 0.35, goldTrim, yaw);
    addBoneRot(buf, 1.6, 2.0, baseZ + 27.6, 2.0, 2.6, baseZ + 30.8, 0.9, 0.35, goldTrim, yaw);
    const plumeWag = Math.sin(elapsed * (isMoving ? 11 : 4)) * 1.6;
    addBoneRot(buf, -1.8, 0, baseZ + 28.4, -10.6, plumeWag, baseZ + 25.0, 2.4, 1.1, capeBright, yaw);

    // Shield Arm & Bold Heraldic Kite Shield with Center Boss
    const armSw = !isMounted && isMoving ? Math.cos(gaitPhase) * 3.5 : 0;
    addBoneRot(buf, 0.6, -7.0, baseZ + 16.8, 2.6 + armSw * 0.25, -8.4, baseZ + 14.0, 2.5, 2.1, darkSteel, yaw);
    addBoneRot(buf, 2.6 + armSw * 0.25, -8.4, baseZ + 14.0, 4.2 + armSw * 0.45, -8.8, baseZ + 11.4, 2.3, 2.0, armorMat, yaw);
    addBoxRot(buf, 5.4 + armSw * 0.45, -9.4, baseZ + 12.2, 1.6, 6.2, 7.2, darkSteel, yaw, 0, 0, 0, 0.24);
    addBoxRot(buf, 5.8 + armSw * 0.45, -9.6, baseZ + 12.2, 1.3, 5.4, 6.2, trimMat, yaw, 0, 0, 0, 0.24);
    addBoxRot(buf, 6.2 + armSw * 0.45, -9.8, baseZ + 12.2, 1.1, 1.2, 5.4, goldTrim, yaw, 0, 0, 0, 0.24);
    addBoxRot(buf, 6.2 + armSw * 0.45, -9.8, baseZ + 12.2, 1.1, 4.4, 1.2, goldTrim, yaw, 0, 0, 0, 0.24);
    addEllipRot(buf, 6.6 + armSw * 0.45, -9.9, baseZ + 12.2, 1.1, 1.3, 1.3, visorGlow, yaw);

    // Sword Arm & Gleaming Broad Greatsword
    const swing = slashProgress > 0 ? Math.sin(slashProgress * Math.PI) : 0;
    const swAng = -0.35 + swing * 2.15;
    const swElev = 6.0 + (slashProgress > 0 ? Math.sin(slashProgress * Math.PI * 2) * 5.2 : 0);
    const elbX = 2.4 + Math.cos(swAng) * 1.8;
    const elbY = 7.4 + Math.sin(swAng) * 1.6;
    const elbZ = baseZ + 14.8 - swing * 1.2;
    const handX = 3.8 + Math.cos(swAng) * 3.8;
    const handY = 7.8 + Math.sin(swAng) * 3.5;
    const handZ = baseZ + 13.4 - swing * 2.5;
    addBoneRot(buf, 0.6, 7.0, baseZ + 16.8, elbX, elbY, elbZ, 2.4, 2.0, darkSteel, yaw);
    addBoneRot(buf, elbX, elbY, elbZ, handX, handY, handZ, 2.2, 1.9, armorMat, yaw);

    const dirX = Math.cos(swAng + 0.45);
    const dirY = Math.sin(swAng + 0.45);
    const tipX = handX + dirX * 20.5;
    const tipY = handY + dirY * 17.0;
    const tipZ = handZ + swElev;
    addBoneRot(buf, handX, handY, handZ, handX - dirX * 2.8, handY - dirY * 2.2, handZ - 2.2, 1.4, 1.2, bladeMats.hilt, yaw);
    addEllipRot(buf, handX - dirX * 3.0, handY - dirY * 2.4, handZ - 2.3, 1.7, 1.7, 1.7, goldTrim, yaw);
    addBoneRot(buf, handX - dirY * 4.0, handY + dirX * 4.0, handZ + 0.4, handX + dirY * 4.0, handY - dirX * 4.0, handZ + 0.4, 1.25, 1.25, goldTrim, yaw);
    addBoneRot(buf, handX, handY, handZ, tipX, tipY, tipZ, 2.1, 0.8, bladeMats.blade, yaw);
    addBoneRot(buf, lerp(handX, tipX, 0.1), lerp(handY, tipY, 0.1), lerp(handZ, tipZ, 0.1) + 0.6, tipX, tipY, tipZ + 0.6, 1.2, 0.55, bladeMats.edge, yaw);
  }
}

/**
 * Ultra-Detailed Skeleton, Skeleton Archer & Nightfang Wolf 3D Models!
 */
export function buildBaseMob3D(buf, e, elapsed) {
  const flash = e.hitFlash > 0;
  const isStunned = e.stunTimer > 0 || e.animState === 'stagger';
  const yaw = Math.atan2(e.dirY || 0, e.dirX || 1) + (isStunned ? Math.sin(elapsed * 18) * 0.25 : 0);
  const bob = e.alive ? Math.sin(elapsed * (e.moving ? 8.5 : 3.0) + e.phase) * 1.4 : 0;
  const stride = e.moving ? Math.sin(elapsed * 8.5 + e.phase) * 5.2 : 0;
  const sc = e.isElite ? 1.18 : 1.0;

  if (e.kind === 'skeleton' || e.kind === 'skeleton_archer') {
    const boneBright = flash ? matRgb(1, 1, 1, 6, 0.85) : isStunned ? matRgb(1, 0.92, 0.4, 6) : matRgb(0.96, 0.98, 1.0, 6);
    const boneDark = flash ? matRgb(1, 1, 1, 6, 0.85) : matRgb(0.62, 0.7, 0.82, 6);
    const ironRust = e.isElite ? matRgb(0.88, 0.7, 0.28, 2, 0.22) : matRgb(0.54, 0.6, 0.7, 2);
    const eyeGlow = matRgb(1.0, 0.28, 0.2, 2, 0.95);
    const cloakMat = e.isElite ? matRgb(0.55, 0.14, 0.22, 1) : matRgb(0.28, 0.34, 0.48, 1);

    const flap = Math.sin(elapsed * 4.2 + e.phase) * 2.2;
    addBoneRot(buf, -1.5, 0, 21.5 + bob, -8.5, flap * 0.5, 5.5, 4.2, 3.2, cloakMat, yaw);

    const kxL = stride * 0.55;
    const kxR = -stride * 0.55;
    const fzL = Math.max(0, -stride * 0.35);
    const fzR = Math.max(0, stride * 0.35);
    addBoneRot(buf, 0, -3.1, 12.2 + bob, kxL, -3.3, 6.2 + bob * 0.5 + fzL * 0.6, 1.75, 1.45, boneDark, yaw);
    addBoneRot(buf, kxL, -3.3, 6.2 + bob * 0.5 + fzL * 0.6, stride, -3.3, fzL + 0.9, 1.45, 1.25, boneDark, yaw);
    addBoxRot(buf, stride + 1.0, -3.3, fzL + 0.65, 1.7, 1.2, 0.85, boneBright, yaw);

    addBoneRot(buf, 0, 3.1, 12.2 + bob, kxR, 3.3, 6.2 + bob * 0.5 + fzR * 0.6, 1.75, 1.45, boneBright, yaw);
    addBoneRot(buf, kxR, 3.3, 6.2 + bob * 0.5 + fzR * 0.6, -stride, 3.3, fzR + 0.9, 1.45, 1.25, boneBright, yaw);
    addBoxRot(buf, -stride + 1.0, 3.3, fzR + 0.65, 1.7, 1.2, 0.85, boneBright, yaw);

    addEllipRot(buf, 0, 0, 12.6 + bob, 3.4, 4.4, 2.2, boneDark, yaw);
    addBoneRot(buf, -0.5, 0, 12.8 + bob, 0, 0, 23.0 + bob, 2.3, 2.0, boneDark, yaw);
    // Individual carved ribcage arches + collar armor
    for (let rib = 0; rib < 3; rib++) {
      const rz = 16.0 + rib * 2.2 + bob;
      addBoxRot(buf, 0.8, 0, rz, 3.2, 4.6 - rib * 0.2, 0.7, boneBright, yaw);
    }
    addBoxRot(buf, 0.2, 0, 22.0 + bob, 2.8, 5.4, 1.6, ironRust, yaw);
    addEllipRot(buf, 0.4, -5.4, 21.9 + bob, 2.8, 2.6, 2.4, ironRust, yaw);
    addEllipRot(buf, 0.4, 5.4, 21.9 + bob, 2.8, 2.6, 2.4, ironRust, yaw);

    addEllipRot(buf, 0.6, 0, 27.4 + bob, 4.6, 4.3, 4.5, boneBright, yaw);
    addBoxRot(buf, 2.8, 0, 24.4 + bob, 2.5, 2.8, 1.5, boneDark, yaw);
    addBoxRot(buf, 4.6, -1.6, 27.4 + bob, 1.25, 1.25, 1.25, eyeGlow, yaw);
    addBoxRot(buf, 4.6, 1.6, 27.4 + bob, 1.25, 1.25, 1.25, eyeGlow, yaw);
    if (e.isElite) {
      addBoxRot(buf, 0.6, 0, 32.0 + bob, 3.6, 3.6, 1.3, matRgb(1.0, 0.82, 0.26, 2, 0.65), yaw);
      addBoneRot(buf, 0.6, -2.4, 32.5 + bob, 0.6, -3.4, 36.2 + bob, 0.9, 0.35, matRgb(1.0, 0.82, 0.26, 2, 0.65), yaw);
      addBoneRot(buf, 0.6, 2.4, 32.5 + bob, 0.6, 3.4, 36.2 + bob, 0.9, 0.35, matRgb(1.0, 0.82, 0.26, 2, 0.65), yaw);
    }

    const windLift = e.windup > 0 ? 7.5 : 0;
    if (e.kind === 'skeleton_archer') {
      const wood = matRgb(0.72, 0.48, 0.24, 1);
      addBoneRot(buf, 0.4, -4.8, 21.4 + bob, 5.8, -1.8, 20.4 + bob, 1.45, 1.2, boneBright, yaw);
      addBoneRot(buf, 0.4, 4.8, 21.4 + bob, 3.8, 1.4, 20.2 + bob, 1.45, 1.2, boneBright, yaw);
      addBoneRot(buf, 6.2, -1.4, 12.5 + bob, 8.4, -1.4, 20.2 + bob, 1.2, 1.0, wood, yaw);
      addBoneRot(buf, 8.4, -1.4, 20.2 + bob, 6.2, -1.4, 28.0 + bob, 1.2, 1.0, wood, yaw);
      addBoneRot(buf, 5.8, -1.4, 12.8 + bob, 5.8, -1.4, 27.6 + bob, 0.65, 0.65, boneBright, yaw);
      addBoneRot(buf, 3.5, -1.2, 20.2 + bob, 12.2, -1.4, 20.4 + bob, 0.85, 0.55, matRgb(0.55, 0.95, 1.0, 2, 0.6), yaw);
    } else {
      addBoneRot(buf, 0.4, -4.8, 21.4 + bob, 3.6, -6.0, 17.6 + bob, 1.45, 1.2, boneBright, yaw);
      addEllipRot(buf, 4.6, -6.6, 17.6 + bob, 1.4, 3.8, 4.0, ironRust, yaw);
      addBoneRot(buf, 0.4, 4.8, 21.4 + bob, 5.0, 5.2, 18.4 + bob + windLift * 0.4, 1.5, 1.25, boneBright, yaw);
      addBoneRot(buf, 5.0, 3.6, 18.4 + bob + windLift * 0.4, 5.0, 6.8, 18.4 + bob + windLift * 0.4, 0.95, 0.95, ironRust, yaw);
      addBoneRot(buf, 5.0, 5.2, 18.4 + bob + windLift * 0.4, 15.6, 3.6, 22.8 + bob + windLift, 1.45, 0.65, matRgb(0.88, 0.92, 1.0, 2, 0.25), yaw);
    }
  } else if (e.kind === 'wolf') {
    const furDark = flash ? matRgb(1, 1, 1, 4, 0.8) : matRgb(0.38, 0.44, 0.58, 4);
    const furRim = flash ? matRgb(1, 1, 1, 4, 0.8) : e.isElite ? matRgb(0.9, 0.86, 0.98, 4) : matRgb(0.76, 0.84, 0.96, 4);
    const fangMat = matRgb(0.98, 0.99, 1.0, 6);
    const zBody = 10.2 + bob * 0.8;

    for (const side of [-1, 1]) {
      const pF = e.moving ? Math.sin(elapsed * 11 + e.phase + side * 1.4) * 4.8 : 0;
      const pB = e.moving ? -Math.sin(elapsed * 11 + e.phase + side * 1.4) * 4.8 : 0;
      addBoneRot(buf, 6.8, side * 3.4, zBody - 1, 6.4 + pF * 0.5, side * 3.6, 4.8 + Math.max(0, pF * 0.35), 2.2, 1.6, furDark, yaw);
      addBoneRot(buf, 6.4 + pF * 0.5, side * 3.6, 4.8, 7.0 + pF, side * 3.6, Math.max(0, pF * 0.3) + 0.8, 1.6, 1.25, furRim, yaw);
      addBoneRot(buf, -6.8, side * 3.4, zBody - 1, -8.0 + pB * 0.5, side * 3.6, 5.0 + Math.max(0, pB * 0.35), 2.3, 1.6, furDark, yaw);
      addBoneRot(buf, -8.0 + pB * 0.5, side * 3.6, 5.0, -6.6 + pB, side * 3.6, Math.max(0, pB * 0.3) + 0.8, 1.6, 1.25, furRim, yaw);
    }
    addEllipRot(buf, -5.0, 0, zBody, 7.2 * sc, 4.8 * sc, 5.0 * sc, furDark, yaw, 0, 0, 0, 0.38);
    addEllipRot(buf, 5.0, 0, zBody + 1.4, 6.6 * sc, 5.2 * sc, 5.4 * sc, furRim, yaw, 0, 0, 0, 0.45);
    addEllipRot(buf, 9.0, 0, zBody + 3.4, 4.2 * sc, 3.6 * sc, 3.5 * sc, furRim, yaw, 0, 0, 0, 0.35);
    addBoneRot(buf, 9.4, 0, zBody + 3.2, 16.5, 0, zBody + 2.4, 3.1, 1.55, furRim, yaw);
    addBoneRot(buf, 9.8, 0, zBody + 1.8, 15.6, 0, zBody + 1.4, 2.2, 1.2, furDark, yaw);
    addBoxRot(buf, 14.8, -1.0, zBody + 2.1, 0.7, 0.55, 0.95, fangMat, yaw);
    addBoxRot(buf, 14.8, 1.0, zBody + 2.1, 0.7, 0.55, 0.95, fangMat, yaw);
    addBoneRot(buf, 9.0, -2.5, zBody + 5.0, 8.4, -3.2, zBody + 9.4, 1.45, 0.5, furRim, yaw);
    addBoneRot(buf, 9.0, 2.5, zBody + 5.0, 8.4, 3.2, zBody + 9.4, 1.45, 0.5, furRim, yaw);
    addBoxRot(buf, 12.0, -1.8, zBody + 3.8, 1.0, 0.9, 0.9, matRgb(1.0, 0.25, 0.22, 2, 0.95), yaw);
    addBoxRot(buf, 12.0, 1.8, zBody + 3.8, 1.0, 0.9, 0.9, matRgb(1.0, 0.25, 0.22, 2, 0.95), yaw);
    addBoneRot(buf, -10.8, 0, zBody + 1.2, -15.4, Math.sin(elapsed * 6 + e.phase) * 1.4, zBody + 0.6, 2.7, 1.9, furDark, yaw);
    addBoneRot(buf, -15.4, Math.sin(elapsed * 6 + e.phase) * 1.4, zBody + 0.6, -19.6, Math.sin(elapsed * 6 + e.phase) * 2.6, zBody - 1.8, 2.1, 1.1, furRim, yaw);
  } else if (e.kind === 'bog_stalker') {
    const hideDark = flash ? matRgb(1, 1, 1, 3, 0.85) : matRgb(0.24, 0.4, 0.28, 3);
    const mossCap = flash ? matRgb(1, 1, 1, 5, 0.85) : matRgb(0.32, 0.82, 0.36, 5);
    const eyeAmber = matRgb(1.0, 0.74, 0.18, 2, 0.95);
    addBoneRot(buf, 0, -4.4, 12 + bob, stride * 0.5, -4.6, 1.2, 3.2, 2.6, hideDark, yaw);
    addBoneRot(buf, 0, 4.4, 12 + bob, -stride * 0.5, 4.6, 1.2, 3.2, 2.6, hideDark, yaw);
    addEllipRot(buf, 0, 0, 19 + bob, 6.8 * sc, 8.2 * sc, 7.6 * sc, hideDark, yaw);
    addEllipRot(buf, 0.6, 0, 24.5 + bob, 6.0 * sc, 7.4 * sc, 3.8 * sc, mossCap, yaw);
    addEllipRot(buf, 0, -9.2, 23 + bob, 4.4 * sc, 4.2 * sc, 4.2 * sc, mossCap, yaw);
    addEllipRot(buf, 0, 9.2, 23 + bob, 4.4 * sc, 4.2 * sc, 4.2 * sc, mossCap, yaw);
    addEllipRot(buf, 3.2, 0, 27 + bob, 4.4, 4.0, 4.2, hideDark, yaw);
    addBoxRot(buf, 7.2, -1.6, 27.2 + bob, 1.0, 1.0, 1.0, eyeAmber, yaw);
    addBoxRot(buf, 7.2, 1.6, 27.2 + bob, 1.0, 1.0, 1.0, eyeAmber, yaw);
    const smash = e.windup > 0 ? 9 : 0;
    addBoneRot(buf, 1, -9.5, 22 + bob, 6, -10.5, 11 + bob, 2.8, 3.2, hideDark, yaw);
    addBoneRot(buf, 1, 9.5, 22 + bob, 8, 10.5, 13 + bob + smash, 3.0, 3.8, mossCap, yaw);
  } else if (e.kind === 'ash_wraith') {
    const hz = 7 + Math.sin(elapsed * 3.4 + e.phase) * 2.5;
    const shroud = flash ? matRgb(1, 1, 1, 1, 0.85) : matRgb(0.32, 0.24, 0.68, 1);
    const soul = matRgb(0.45, 0.94, 1.0, 2, 0.95);
    const skull = matRgb(0.92, 0.96, 1.0, 6);
    addBoneRot(buf, 0, 0, hz + 16, -2, 0, hz + 2, 4.5, 7.6, shroud, yaw);
    addEllipRot(buf, 2.2, 0, hz + 17, 3.0, 3.2, 3.6, soul, yaw);
    addEllipRot(buf, 0.5, 0, hz + 25, 4.4, 4.0, 4.6, shroud, yaw);
    addEllipRot(buf, 2.6, 0, hz + 25, 3.2, 3.0, 3.4, skull, yaw);
    addBoxRot(buf, 5.4, -1.3, hz + 25.2, 0.9, 0.9, 0.9, soul, yaw);
    addBoxRot(buf, 5.4, 1.3, hz + 25.2, 0.9, 0.9, 0.9, soul, yaw);
    addBoneRot(buf, 1, -7, hz + 20, 9, -8, hz + 16 + (e.windup > 0 ? 6 : 0), 1.8, 0.8, soul, yaw);
    addBoneRot(buf, 1, 7, hz + 20, 9, 8, hz + 16 + (e.windup > 0 ? 6 : 0), 1.8, 0.8, soul, yaw);
  } else if (e.kind === 'crimson_gargoyle') {
    const rock = flash ? matRgb(1, 1, 1, 3, 0.85) : matRgb(0.48, 0.44, 0.56, 3);
    const ruby = matRgb(1.0, 0.24, 0.3, 2, 0.92);
    const wingZ = Math.sin(elapsed * 5 + e.phase) * 4;
    addBoneRot(buf, 0, -4, 12 + bob, stride * 0.5, -4.4, 1, 2.6, 1.8, rock, yaw);
    addBoneRot(buf, 0, 4, 12 + bob, -stride * 0.5, 4.4, 1, 2.6, 1.8, rock, yaw);
    addEllipRot(buf, 0, 0, 19 + bob, 5.2, 6.0, 6.8, rock, yaw);
    addEllipRot(buf, 1.5, 0, 27.5 + bob, 4.2, 3.8, 4.0, rock, yaw);
    addBoneRot(buf, 1, -2.6, 30 + bob, -3.5, -5.8, 36 + bob, 1.4, 0.45, rock, yaw);
    addBoneRot(buf, 1, 2.6, 30 + bob, -3.5, 5.8, 36 + bob, 1.4, 0.45, rock, yaw);
    addBoxRot(buf, 5.2, -1.5, 27.5 + bob, 1.0, 1.0, 1.0, ruby, yaw);
    addBoxRot(buf, 5.2, 1.5, 27.5 + bob, 1.0, 1.0, 1.0, ruby, yaw);
    for (const side of [-1, 1]) {
      addTriRot(buf, -1, side * 5, 22 + bob, -4, side * 20, 31 + wingZ, -9, side * 14, 16 + wingZ * 0.5, rock, yaw);
      addBoneRot(buf, -1, side * 5, 22 + bob, -4, side * 20, 31 + wingZ, 1.8, 0.8, ruby, yaw);
    }
  } else if (e.kind === 'iron_sentinel') {
    const steel = flash ? matRgb(1, 1, 1, 2, 0.85) : matRgb(0.72, 0.8, 0.9, 2);
    const brass = matRgb(0.96, 0.76, 0.28, 2, 0.25);
    const core = matRgb(0.36, 0.92, 1.0, 2, 0.95);
    addBoneRot(buf, 0, -4.5, 13 + bob, stride * 0.5, -4.8, 1.2, 2.8, 2.4, steel, yaw);
    addBoneRot(buf, 0, 4.5, 13 + bob, -stride * 0.5, 4.8, 1.2, 2.8, 2.4, steel, yaw);
    addBoxRot(buf, 0, 0, 20 + bob, 5.4, 7.2, 7.6, steel, yaw);
    addEllipRot(buf, 5.2, 0, 21 + bob, 2.4, 2.6, 2.8, core, yaw);
    addEllipRot(buf, 0.4, -9, 25 + bob, 3.8, 3.6, 3.4, brass, yaw);
    addEllipRot(buf, 0.4, 9, 25 + bob, 3.8, 3.6, 3.4, brass, yaw);
    addEllipRot(buf, 0.8, 0, 29.5 + bob, 3.8, 3.6, 4.2, steel, yaw);
    addBoxRot(buf, 4.4, 0, 29.5 + bob, 1.0, 2.8, 0.9, core, yaw);
    addBoneRot(buf, 1, 9, 23 + bob, 8, 9.5, 16 + bob + (e.windup > 0 ? 8 : 0), 2.2, 1.8, steel, yaw);
    addBoxRot(buf, 11, 9.5, 22 + bob + (e.windup > 0 ? 8 : 0), 2.8, 1.4, 5.6, brass, yaw);
  } else {
    const bark = flash ? matRgb(1, 1, 1, 1, 0.85) : matRgb(0.46, 0.3, 0.18, 1);
    const leaf = matRgb(0.28, 0.78, 0.36, 5);
    const heart = matRgb(0.45, 1.0, 0.56, 2, 0.92);
    addBoneRot(buf, 0, -4.4, 12 + bob, stride * 0.5, -5.0, 1.0, 2.8, 2.2, bark, yaw);
    addBoneRot(buf, 0, 4.4, 12 + bob, -stride * 0.5, 5.0, 1.0, 2.8, 2.2, bark, yaw);
    addBoneRot(buf, 0, 0, 12 + bob, 0, 0, 27 + bob, 5.6, 4.2, bark, yaw);
    addEllipRot(buf, 3.8, 0, 20 + bob, 2.4, 2.4, 2.6, heart, yaw);
    addEllipRot(buf, 0, 0, 30 + bob, 7.6, 7.6, 5.4, leaf, yaw);
    addEllipRot(buf, -2, -5, 28 + bob, 4.5, 4.5, 4.0, leaf, yaw);
    addEllipRot(buf, 2, 5, 28 + bob, 4.5, 4.5, 4.0, leaf, yaw);
    addBoneRot(buf, 1, -6.5, 22 + bob, 8, -8, 13 + bob + (e.windup > 0 ? 7 : 0), 2.4, 1.4, bark, yaw);
    addBoneRot(buf, 1, 6.5, 22 + bob, 8, 8, 13 + bob + (e.windup > 0 ? 7 : 0), 2.4, 1.4, bark, yaw);
  }
}

const ADVENTURER_STYLES = [
  { hex: '#9cb4cc', trim: '#f8fafc', dark: [0.5, 0.08, 0.16], bright: [0.95, 0.22, 0.3], coat: [0.9, 0.94, 1.0] },
  { hex: '#6da876', trim: '#e6f5d0', dark: [0.1, 0.38, 0.2], bright: [0.28, 0.84, 0.42], coat: [0.64, 0.46, 0.3] },
  { hex: '#c89b3c', trim: '#fff1b8', dark: [0.46, 0.22, 0.08], bright: [0.98, 0.56, 0.18], coat: [0.95, 0.9, 0.82] },
  { hex: '#7b78c9', trim: '#d8e4ff', dark: [0.24, 0.16, 0.54], bright: [0.54, 0.44, 0.98], coat: [0.36, 0.38, 0.48] },
  { hex: '#64a8be', trim: '#dff9ff', dark: [0.08, 0.32, 0.48], bright: [0.3, 0.82, 0.96], coat: [0.82, 0.88, 0.95] }
];

export function buildAdventurer3D(buf, p, elapsed) {
  const st = ADVENTURER_STYLES[(p.styleIdx || 0) % ADVENTURER_STYLES.length];
  buildHeroKnight3D(buf, {
    facing: p.dirX < -0.2 ? 'left' : 'right',
    headingYaw: Math.atan2(p.dirY || 0, p.dirX || 1),
    isMounted: p.mounted,
    isMoving: p.moving,
    gaitPhase: elapsed * 7 + p.phase,
    gallopBlend: 0.4,
    slashProgress: p.slashTimer > 0 ? 1 - p.slashTimer / 0.25 : 0,
    swordFx: p.swordFx,
    armorMaterial: { id: p.styleIdx === 2 ? 'emberstone' : 'steel', hex: st.hex, trim: st.trim, halo: true },
    cloakTone: {
      dark: matRgb(st.dark[0], st.dark[1], st.dark[2], 1),
      bright: matRgb(st.bright[0], st.bright[1], st.bright[2], 1, 0.14),
      barding: matRgb(st.bright[0] * 0.72, st.bright[1] * 0.72, st.bright[2] * 0.72, 1)
    },
    mountCoat: {
      body: matRgb(st.coat[0] * 0.92, st.coat[1] * 0.92, st.coat[2] * 0.92, 4),
      chest: matRgb(st.coat[0], st.coat[1], st.coat[2], 4),
      shadow: matRgb(st.coat[0] * 0.65, st.coat[1] * 0.65, st.coat[2] * 0.65, 4)
    },
    elapsed,
    showMountBody: p.mounted,
    showRiderBody: true
  });
}


/**
 * True Semi-3D Volumetric & Articulated Models for ALL 5 World Bosses!
 * Features real 3D height (Z), fur/stone/plate surface normals, Z-buffered self-occlusion,
 * and animated multi-pose state machines (idle / walk / windup / special_windup / strike / special / stagger).
 */
export function buildBoss3D(buf, e, elapsed) {
  const animState = e.animState || (e.stunTimer > 0 ? 'stagger' : e.windup > 0 ? 'windup' : e.moving ? 'walk' : 'idle');
  const isStunned = e.stunTimer > 0 || animState === 'stagger';
  const isWindup = animState === 'windup' || animState === 'special_windup' || e.windup > 0;
  const isSpecialWindup = animState === 'special_windup';
  const isStrike = animState === 'strike';
  const isSpecial = animState === 'special';
  const strikeP = isStrike || isSpecial ? clamp(1 - (e.strikeTimer || 0) / 0.44, 0, 1) : 0;
  const flash = e.hitFlash > 0;
  const yaw = Math.atan2(e.dirY || 0, e.dirX || 1) + (isStunned ? Math.sin(elapsed * 18) * 0.22 : 0);
  const bob = e.alive ? Math.sin(elapsed * (e.moving ? 8.5 : 3.0) + e.phase) * (isStunned ? 0.6 : 1.5) : 0;
  const stride = e.moving ? Math.sin(elapsed * 8.5 + e.phase) * 5.2 : 0;

  if (e.kind === 'spider_boss') {
    // DUSK WIDOW (Lv 15) — Giant 3D Furred Tarantula (Segmented Shell Plates, Silk Strands, Fangs & Knee Spurs!)
    const furBody = flash
      ? matRgb(1, 1, 1, 4, 0.7, 1.08)
      : isSpecialWindup
        ? matRgb(0.68, 0.34, 0.2, 4, 0.1, 1.08)
        : isWindup
          ? matRgb(0.46, 0.26, 0.18, 4, 0, 1.05)
          : matRgb(0.28, 0.23, 0.19, 4, 0, 1.06);
    const furCrest = flash ? matRgb(1, 1, 1, 4, 0.7) : matRgb(0.66, 0.56, 0.46, 4, 0, 1.12);
    const legDark = flash ? matRgb(1, 1, 1, 4, 0.7) : matRgb(0.24, 0.2, 0.17, 4, 0, 0.88);
    const chitinRim = matRgb(0.44, 0.36, 0.3, 2, 0.08, 0.94);
    const crimsonMark = matRgb(0.94, 0.14, 0.22, 2, 0.62, 1.38);
    const venomGlow = matRgb(0.44, 1.0, 0.36, 2, 0.9, 1.28);
    const silkMat = matRgb(0.84, 0.92, 1.0, 1, 0.35, 0.72);
    const lungOff = isStrike ? Math.sin(strikeP * Math.PI) * 8 : isWindup ? -4 : 0;

    // 1. Giant Bulbous Raised Egg-Abdomen + Segmented Dorsal Plates + Crimson Hourglass + Spinneret Silk
    addEllipRot(buf, -15 + lungOff, 0, 16.5 + bob * 0.5, 19.8, 16.5, 16.0, furBody, yaw, 0, 0, 0, 0.85);
    addEllipRot(buf, -14 + lungOff, 0, 21.8 + bob * 0.5, 13.4, 11.8, 9.8, furCrest, yaw, 0, 0, 0, 0.72);
    for (let seg = -2; seg <= 1; seg++) {
      addBoxRot(buf, -15 + seg * 5.2 + lungOff, 0, 29.5 + bob * 0.5 - Math.abs(seg) * 1.4, 1.6, 8.8 - Math.abs(seg) * 1.5, 1.4, chitinRim, yaw);
    }
    addBoxRot(buf, -11.5 + lungOff, 0, 31.2 + bob * 0.5, 4.4, 2.4, 1.3, crimsonMark, yaw);
    addBoxRot(buf, -18.0 + lungOff, 0, 30.6 + bob * 0.5, 3.4, 3.0, 1.3, crimsonMark, yaw);
    addBoneRot(buf, -33 + lungOff, -2.4, 13.5, -38.5 + lungOff, -3.8, 10.5, 1.6, 0.6, legDark, yaw);
    addBoneRot(buf, -33 + lungOff, 2.4, 13.5, -38.5 + lungOff, 3.8, 10.5, 1.6, 0.6, legDark, yaw);
    addBoneRot(buf, -38 + lungOff, 0, 11.0, -45 + lungOff, Math.sin(elapsed * 5) * 3.5, 7.5, 0.8, 0.35, silkMat, yaw);

    // Armored Cephalothorax Carapace + Pedicel Waist
    addEllipRot(buf, 7.5 + lungOff, 0, 12.8 + bob * 0.5, 11.2, 10.0, 9.2, furCrest, yaw, 0, 0, 0, 0.68);
    addEllipRot(buf, 8.5 + lungOff, 0, 19.0 + bob * 0.5, 6.4, 5.6, 3.4, chitinRim, yaw);
    addBoneRot(buf, -3 + lungOff, 0, 13.5, 4 + lungOff, 0, 12.5, 4.8, 4.4, legDark, yaw);

    // Paired Pedipalps + Chelicerae Fangs + Serrated Teeth + Venom Drip + 8 Gleaming Eyes!
    const fangSpread = isWindup ? 2.6 : isStrike ? -1.4 : 0;
    const fangEyeGlow = isWindup || isStrike ? matRgb(1.0, 0.24, 0.24, 2, 0.95, 1.38) : matRgb(1.0, 0.85, 0.65, 2, 0.78, 1.32);
    addBoneRot(buf, 14 + lungOff, -6.4, 12.0, 20.5 + lungOff, -8.8 - fangSpread * 0.6, 10.2, 2.0, 1.3, furCrest, yaw, 0, 0, 0, 0.5);
    addBoneRot(buf, 14 + lungOff, 6.4, 12.0, 20.5 + lungOff, 8.8 + fangSpread * 0.6, 10.2, 2.0, 1.3, furCrest, yaw, 0, 0, 0, 0.5);
    addBoneRot(buf, 16 + lungOff, -3.4 - fangSpread * 0.4, 11.5, 23.0 + lungOff, -4.8 - fangSpread, 3.8, 2.5, 0.7, legDark, yaw);
    addBoneRot(buf, 16 + lungOff, 3.4 + fangSpread * 0.4, 11.5, 23.0 + lungOff, 4.8 + fangSpread, 3.8, 2.5, 0.7, legDark, yaw);
    addBoxRot(buf, 23.0 + lungOff, -4.8 - fangSpread, 3.4, 1.1, 1.1, 1.7, venomGlow, yaw);
    addBoxRot(buf, 23.0 + lungOff, 4.8 + fangSpread, 3.4, 1.1, 1.1, 1.7, venomGlow, yaw);
    for (const ey of [-4.2, -2.0, 2.0, 4.2]) {
      addEllipRot(buf, 17.8 + lungOff, ey, 14.8 + bob * 0.5, 1.25, 1.25, 1.25, fangEyeGlow, yaw);
      addEllipRot(buf, 16.6 + lungOff, ey * 0.8, 17.0 + bob * 0.5, 0.95, 0.95, 0.95, fangEyeGlow, yaw);
    }

    // 2. Eight Articulated 3-Segment 3D Tarantula Legs with Chitinous Knee Spurs!
    const stepPhase = elapsed * (e.moving ? 9.8 : 3.2) + e.phase;
    const baseAngles = [0.68, 0.24, -0.22, -0.68];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const ang = side * (Math.PI * 0.5 - baseAngles[i]);
        const alt = (i + (side > 0 ? 1 : 0)) % 2 === 0 ? Math.PI : 0;
        const swing = Math.sin(stepPhase + i * 0.85 + alt) * (e.moving ? 6.5 : 1.2);
        const lift = isMovingOrStepping(e) ? Math.max(0, Math.cos(stepPhase + i * 0.85 + alt)) * 4.5 : 0;
        const threatLift = i === 0 ? (isWindup ? 19 : isStrike ? 12 * (1 - strikeP) : isSpecial ? 15 : 0) : i === 1 && isSpecialWindup ? 13 : 0;

        const rootX = 9.5 - i * 4.2 + lungOff;
        const rootY = side * (7.2 - i * 0.4);
        const rootZ = 12.2 + bob * 0.4;

        const cA = Math.cos(ang);
        const sA = Math.sin(ang);
        const kneeX = rootX + cA * 17.5 + swing * 0.35;
        const kneeY = rootY + sA * 17.5;
        const kneeZ = 27.5 + threatLift * 0.72 + lift * 0.45;
        const midX = kneeX + cA * 11.5 + swing * 0.72;
        const midY = kneeY + sA * 11.5;
        const midZ = 14.5 + threatLift * 0.85 + lift * 0.8;
        const tarsX = kneeX + cA * 18.0 + swing;
        const tarsY = kneeY + sA * 18.0;
        const tarsZ = Math.max(0.8, threatLift + lift);

        addBoneRot(buf, rootX, rootY, rootZ, kneeX, kneeY, kneeZ, 3.2, 2.6, furCrest, yaw, 0, 0, 0, 0.68);
        addBoneRot(buf, kneeX, kneeY, kneeZ, kneeX + cA * 2.5, kneeY + sA * 2.5, kneeZ + 4.0, 1.3, 0.4, chitinRim, yaw);
        addBoneRot(buf, kneeX, kneeY, kneeZ, midX, midY, midZ, 2.5, 1.8, furBody, yaw, 0, 0, 0, 0.62);
        addBoneRot(buf, midX, midY, midZ, tarsX, tarsY, tarsZ, 1.75, 1.0, legDark, yaw, 0, 0, 0, 0.52);
      }
    }
  } else if (e.kind === 'warden_boss') {
    // BOSS 1: HIGH WARDEN MALAKOR — Towering Fluted Plate Warden + Engraved Chest Rune + Spiked Pauldrons & Studded Shield!
    const steel = flash ? matRgb(1, 1, 1, 2, 0.85) : isSpecialWindup ? matRgb(1.0, 0.48, 0.22, 2, 0.15, 1.1) : isWindup ? matRgb(0.95, 0.62, 0.3, 2, 0.1, 1.08) : matRgb(0.8, 0.86, 0.94, 2, 0, 1.08);
    const darkPlate = matRgb(0.22, 0.28, 0.38, 2, 0, 0.94);
    const hornBone = matRgb(0.96, 0.98, 1.0, 6, 0, 0.84);
    const runeGlow = matRgb(1.0, 0.34, 0.18, 2, 0.92, 1.4);
    const goldRivet = matRgb(1.0, 0.82, 0.28, 2, 0.35, 1.25);
    const cloak = matRgb(0.52, 0.08, 0.14, 1, 0, 0.92);

    // Dual-Fold Layered War Cloak Swirling Behind (-X)
    const cloakWag = Math.sin(elapsed * 4.5) * 3.8 + (isSpecial ? 7.5 : 0);
    addTriRot(buf, -4, -8.5, 32 + bob, -4, 0.5, 32 + bob, -22, -4 + cloakWag, 3.5, cloak, yaw);
    addTriRot(buf, -4, -0.5, 32 + bob, -4, 8.5, 32 + bob, -22, 4 + cloakWag, 3.5, cloak, yaw);

    // Articulated Heavy Greaves + Spiked Knee Poleyns + Tassets
    addBoneRot(buf, 0, -5.2, 16 + bob, stride * 0.5, -5.4, 8.5, 3.4, 2.8, darkPlate, yaw);
    addEllipRot(buf, stride * 0.5 + 1.6, -5.4, 8.5, 2.6, 2.5, 2.5, goldRivet, yaw);
    addBoneRot(buf, stride * 0.5, -5.4, 8.5, stride, -5.5, 1.2, 2.8, 2.4, darkPlate, yaw);

    addBoneRot(buf, 0, 5.2, 16 + bob, -stride * 0.5, 5.4, 8.5, 3.4, 2.8, steel, yaw);
    addEllipRot(buf, -stride * 0.5 + 1.6, 5.4, 8.5, 2.6, 2.5, 2.5, goldRivet, yaw);
    addBoneRot(buf, -stride * 0.5, 5.4, 8.5, -stride, 5.5, 1.2, 2.8, 2.4, steel, yaw);

    // Fluted Cuirass + Glowing Chest Rune + Fauld Skirt + Spiked Crown Pauldrons
    addBoxRot(buf, 0, 0, 25 + bob, 6.6, 9.4, 9.6, darkPlate, yaw);
    addBoxRot(buf, 5.4, 0, 26.2 + bob, 1.8, 2.8, 4.8, runeGlow, yaw);
    addBoxRot(buf, 0.2, 0, 18.2 + bob, 6.8, 9.6, 1.6, steel, yaw);
    addBoxRot(buf, 0.2, -5.8, 14.5 + bob, 4.6, 2.6, 3.4, darkPlate, yaw, 0, 0, 0, 0.2);
    addBoxRot(buf, 0.2, 5.8, 14.5 + bob, 4.6, 2.6, 3.4, darkPlate, yaw, 0, 0, 0, -0.2);
    addEllipRot(buf, 0.5, -11.2, 31.8 + bob, 5.8, 5.4, 4.8, steel, yaw);
    addEllipRot(buf, 0.5, -12.2, 28.8 + bob, 4.5, 4.0, 2.8, darkPlate, yaw);
    addBoneRot(buf, 0.5, -12, 34.5 + bob, -1.8, -17, 40.5 + bob, 1.6, 0.4, hornBone, yaw);
    addEllipRot(buf, 0.5, 11.2, 31.8 + bob, 5.8, 5.4, 4.8, steel, yaw);
    addEllipRot(buf, 0.5, 12.2, 28.8 + bob, 4.5, 4.0, 2.8, darkPlate, yaw);
    addBoneRot(buf, 0.5, 12, 34.5 + bob, -1.8, 17, 40.5 + bob, 1.6, 0.4, hornBone, yaw);

    // Dread Horned Great-Helm + Crown Spikes + Glowing Visor Grate
    addEllipRot(buf, 0.8, 0, 39.5 + bob, 5.6, 5.2, 6.0, steel, yaw);
    addBoxRot(buf, 0.4, 0, 45.4 + bob, 4.4, 1.3, 2.0, goldRivet, yaw);
    addBoneRot(buf, 0.8, -4.5, 42.5 + bob, -2.0, -14.0, 53 + bob, 2.4, 0.5, hornBone, yaw);
    addBoneRot(buf, 0.8, 4.5, 42.5 + bob, -2.0, 14.0, 53 + bob, 2.4, 0.5, hornBone, yaw);
    addBoxRot(buf, 6.0, 0, 39.6 + bob, 1.1, 3.6, 1.25, runeGlow, yaw);

    // Left Arm + Studded Tower Shield with Central Skull Boss & Corner Gems
    const shF = isWindup ? 3.5 : isStrike ? -2.0 : 0;
    addBoneRot(buf, 1, -10.5, 29 + bob, 7.2 + shF, -11.8, 22 + bob, 2.6, 2.1, steel, yaw);
    addBoxRot(buf, 8.6 + shF, -13.4, 22 + bob, 1.9, 7.8, 11.6, darkPlate, yaw, 0, 0, 0, 0.35);
    addBoxRot(buf, 9.2 + shF, -13.7, 22 + bob, 1.5, 6.6, 10.2, steel, yaw, 0, 0, 0, 0.35);
    addEllipRot(buf, 10.4 + shF, -14.2, 22.5 + bob, 1.8, 2.6, 2.8, runeGlow, yaw);
    addBoxRot(buf, 9.8 + shF, -17.5, 29.0 + bob, 1.0, 1.0, 1.2, goldRivet, yaw);
    addBoxRot(buf, 9.8 + shF, -10.0, 29.0 + bob, 1.0, 1.0, 1.2, goldRivet, yaw);

    // Right Arm + Executioner Double-Crescent Great-Halberd!
    const axeYaw = isSpecial ? -1.8 + strikeP * Math.PI * 2.4 : isWindup ? -2.1 : isStrike ? lerp(-2.1, 1.1, strikeP) : -0.6;
    const axeZ = isWindup ? 15 : isStrike ? lerp(14, -10, strikeP) : 4;
    const hX = 6 + Math.cos(axeYaw) * 6;
    const hY = 10 + Math.sin(axeYaw) * 6;
    const hZ = 25 + bob + axeZ * 0.4;
    const tipX = hX + Math.cos(axeYaw) * 28;
    const tipY = hY + Math.sin(axeYaw) * 28;
    const tipZ = hZ + axeZ + 9.0;

    addBoneRot(buf, 1, 10.5, 29 + bob, hX, hY, hZ, 2.6, 2.1, steel, yaw);
    addBoneRot(buf, hX - Math.cos(axeYaw) * 8, hY - Math.sin(axeYaw) * 8, hZ - 5.5, tipX, tipY, tipZ, 1.35, 1.15, matRgb(0.58, 0.42, 0.25, 1, 0, 0.85), yaw);
    const bladeMat = isWindup || isSpecial ? matRgb(1.0, 0.42, 0.22, 2, 0.8, 1.18) : matRgb(0.96, 0.98, 1.0, 2, 0.2, 1.14);
    addBoxRot(buf, lerp(hX, tipX, 0.85), lerp(hY, tipY, 0.85), lerp(hZ, tipZ, 0.85), 6.6, 2.4, 8.2, bladeMat, yaw, 0, 0, 0, axeYaw);
    addBoneRot(buf, tipX, tipY, tipZ, tipX + Math.cos(axeYaw) * 5.5, tipY + Math.sin(axeYaw) * 5.5, tipZ + 2.8, 1.5, 0.4, matRgb(1, 0.85, 0.4, 2, 0.5, 0.75), yaw);
  } else if (e.kind === 'lich_boss') {
    // BOSS 4: LORD SEPULCHRAL, CINDERBONE LICH — Floating Shroud + Spiked Crown + Orb-Caged Lantern Staff + Phylacteries!
    const hoverZ = 8 + Math.sin(elapsed * 2.8 + e.phase) * 3.8;
    const shroud = flash ? matRgb(1, 1, 1, 1, 0.75) : isSpecialWindup ? matRgb(0.68, 0.48, 0.98, 1, 0.1, 0.96) : matRgb(0.24, 0.2, 0.56, 1, 0, 0.94);
    const bone = flash ? matRgb(1, 1, 1, 6, 0.85) : matRgb(0.94, 0.96, 1.0, 6, 0, 0.88);
    const flame = isSpecialWindup || isSpecial ? matRgb(0.42, 0.94, 1.0, 2, 0.96, 1.42) : matRgb(0.78, 0.54, 1.0, 2, 0.92, 1.36);
    const goldBone = matRgb(0.95, 0.78, 0.34, 2, 0.28, 1.24);
    const chainMat = matRgb(0.72, 0.82, 0.95, 2, 0.25, 0.72);

    // Floating Robe Cone, Deep Hood & 5 Undulating Shroud Tatters
    addBoneRot(buf, 0, 0, hoverZ + 18, 0, 0, hoverZ + 3.5, 6.2, 12.2, shroud, yaw);
    addEllipRot(buf, -1.6, 0, hoverZ + 37.5, 6.8, 6.4, 7.0, shroud, yaw);
    const tw = Math.sin(elapsed * 3.5) * 2.2;
    addTriRot(buf, 0, -8, hoverZ + 22, 0, 8, hoverZ + 22, -15 - (isSpecial ? 5 : 0), tw, hoverZ - 1, shroud, yaw);
    addTriRot(buf, -3, -7, hoverZ + 24, 4, -8, hoverZ + 22, -2, -16 - (isSpecial ? 4 : 0), hoverZ - 2, shroud, yaw);
    addTriRot(buf, -3, 7, hoverZ + 24, 4, 8, hoverZ + 22, -2, 16 + (isSpecial ? 4 : 0), hoverZ - 2, shroud, yaw);

    // Open Vertebral Spine + 4 Pairs of Curved Ivory Ribs + Blazing Soul-Heart Phylactery
    addBoneRot(buf, -1.5, 0, hoverZ + 12, -1.0, 0, hoverZ + 31, 1.9, 1.6, bone, yaw);
    for (let r = 0; r < 4; r++) {
      const rz = hoverZ + 14 + r * 3.4;
      const rw = 6.2 - r * 0.4;
      addBoneRot(buf, -1.0, -1.2, rz, 3.6, -rw, rz - 0.5, 1.15, 0.8, bone, yaw);
      addBoneRot(buf, -1.0, 1.2, rz, 3.6, rw, rz - 0.5, 1.15, 0.8, bone, yaw);
    }
    addEllipRot(buf, 2.8, 0, hoverZ + 20, 3.8, 3.8, 4.0, flame, yaw);

    // Spiked Bone Shoulder Mantle + 5-Spire Golden Lich Crown + Floating Runic Halo
    addEllipRot(buf, 0, -10.0, hoverZ + 29, 5.1, 4.4, 4.0, bone, yaw);
    addEllipRot(buf, 0, 10.0, hoverZ + 29, 5.1, 4.4, 4.0, bone, yaw);
    addBoneRot(buf, 0, -10.8, hoverZ + 30, -2, -17.5, hoverZ + 42, 2.1, 0.5, bone, yaw);
    addBoneRot(buf, 0, 10.8, hoverZ + 30, -2, 17.5, hoverZ + 42, 2.1, 0.5, bone, yaw);

    addEllipRot(buf, 0.6, 0, hoverZ + 37.5, 5.0, 4.6, 5.4, bone, yaw);
    addBoxRot(buf, 3.2, 0, hoverZ + 33.4, 2.2, 2.6, 1.3, bone, yaw);
    addBoxRot(buf, 0.8, 0, hoverZ + 41.8, 5.0, 5.0, 1.2, goldBone, yaw);
    for (const cAng of [-1.2, -0.6, 0, 0.6, 1.2]) {
      addBoneRot(buf, 0.5, Math.sin(cAng) * 3.6, hoverZ + 42, -1.5, Math.sin(cAng) * 7.8, hoverZ + 52 + (cAng === 0 ? 3 : 0), 1.4, 0.35, goldBone, yaw);
    }
    addBoxRot(buf, 5.2, -1.8, hoverZ + 37.5, 1.1, 1.2, 1.2, flame, yaw);
    addBoxRot(buf, 5.2, 1.8, hoverZ + 37.5, 1.1, 1.2, 1.2, flame, yaw);

    for (let hi = 0; hi < 7; hi++) {
      const ha = -1.5 + hi * 0.5 + Math.sin(elapsed * 2) * 0.1;
      addEllipRot(buf, -4.8, Math.sin(ha) * 11.2, hoverZ + 38 + Math.cos(ha) * 11.2, 1.2, 1.2, 1.2, flame, yaw);
    }

    // Skeletal Arms + Hanging Soul Chain + Caged Skull-Lantern Staff
    const sLift = isWindup ? 12 : isSpecial ? 8 : 0;
    addBoneRot(buf, 1, -9, hoverZ + 27, 8, -11 - (isSpecial ? 6 : 0), hoverZ + 23 + sLift * 0.6, 1.9, 1.3, bone, yaw);
    addEllipRot(buf, 9, -11.5 - (isSpecial ? 6 : 0), hoverZ + 23 + sLift * 0.6, 3.6, 3.6, 3.6, flame, yaw);

    const rHandX = 7 + (isStrike ? strikeP * 7 : 0);
    const rHandY = 10 + (isSpecial ? 6 : 0);
    const rHandZ = hoverZ + 24 + sLift * 0.5;
    addBoneRot(buf, 1, 9, hoverZ + 27, rHandX, rHandY, rHandZ, 1.9, 1.3, bone, yaw);
    addBoneRot(buf, rHandX - 1, rHandY, rHandZ - 14, rHandX + 3, rHandY + 1, rHandZ + 17, 1.35, 1.0, chainMat, yaw);
    addBoneRot(buf, rHandX + 3, rHandY + 1, rHandZ + 17, rHandX + 5, rHandY + 3, rHandZ + 8, 0.7, 0.5, chainMat, yaw);
    addEllipRot(buf, rHandX + 3.2, rHandY + 1.1, rHandZ + 18.5, 2.8, 2.8, 2.8, bone, yaw);
    addEllipRot(buf, rHandX + 3.6, rHandY + 1.3, rHandZ + 22.0, 3.8, 3.8, 3.8, flame, yaw);

    // 3 Orbiting 3D Ghostly Skull Phylacteries with glowing eyes & ember trail
    const orbRad = isSpecial ? 32 : 24;
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const oa = elapsed * 2.5 + (sIdx * Math.PI * 2) / 3;
      const sx = Math.cos(oa) * orbRad;
      const sy = Math.sin(oa) * orbRad;
      const sz = hoverZ + 26 + Math.sin(oa * 2 + elapsed * 3) * 5.5;
      buf.addEllipsoid(sx, sy, sz, 3.7, 3.5, 3.7, bone);
      buf.addEllipsoid(sx + 2.3, sy - 1.1, sz + 0.4, 1.0, 1.0, 1.0, flame);
      buf.addEllipsoid(sx + 2.3, sy + 1.1, sz + 0.4, 1.0, 1.0, 1.0, flame);
      buf.addEllipsoid(sx - Math.sin(oa) * 4.5, sy + Math.cos(oa) * 4.5, sz - 1.2, 2.0, 2.0, 2.0, flame);
    }
  } else if (e.kind === 'golem_boss') {
    // BOSS 5: IRONHIDE COLOSSUS GORRATH — Cragstone Titan + Magma Crystal Spires + Mossy Crags + Studded Boulder Gauntlets!
    const stoneDark = flash ? matRgb(1, 1, 1, 3, 0.8) : matRgb(0.24, 0.28, 0.34, 3, 0, 1.12);
    const stoneMid = flash ? matRgb(1, 1, 1, 3, 0.8) : isSpecialWindup ? matRgb(0.75, 0.38, 0.14, 3, 0.12, 1.14) : matRgb(0.54, 0.6, 0.68, 3, 0, 1.1);
    const moss = matRgb(0.3, 0.68, 0.24, 5, 0, 0.86);
    const ironBand = matRgb(0.72, 0.78, 0.86, 2, 0.12, 0.92);
    const magma = isSpecialWindup || isSpecial ? matRgb(1.0, 0.34, 0.08, 2, 0.96, 1.42) : isWindup ? matRgb(1.0, 0.62, 0.18, 2, 0.9, 1.38) : matRgb(0.36, 0.88, 1.0, 2, 0.84, 1.34);
    const slamDrop = isSpecial ? Math.sin(strikeP * Math.PI) * 5.5 : 0;

    // Massive Piston Stone Legs with Iron Brace Rings
    addBoneRot(buf, 0, -7.5, 16 + bob - slamDrop * 0.3, stride * 0.45, -8.2, 8.5, 5.0, 4.4, stoneDark, yaw);
    addEllipRot(buf, stride * 0.45 + 1, -8.2, 8.5, 4.6, 4.6, 2.4, ironBand, yaw);
    addBoneRot(buf, stride * 0.45, -8.2, 8.5, stride, -8.5, 1.5, 4.6, 4.0, stoneMid, yaw);

    addBoneRot(buf, 0, 7.5, 16 + bob - slamDrop * 0.3, -stride * 0.45, 8.2, 8.5, 5.0, 4.4, stoneMid, yaw);
    addEllipRot(buf, -stride * 0.45 + 1, 8.2, 8.5, 4.6, 4.6, 2.4, ironBand, yaw);
    addBoneRot(buf, -stride * 0.45, 8.2, 8.5, -stride, 8.5, 1.5, 4.6, 4.0, stoneDark, yaw);

    // Layered Cragstone Torso Slabs + Geothermal Crystal Spires + Glowing Magma Fissure Cross
    addBoxRot(buf, 0, 0, 27 + bob - slamDrop, 10.8, 14.0, 12.6, stoneDark, yaw);
    addBoxRot(buf, 0, 0, 32 + bob - slamDrop, 9.4, 12.4, 6.4, stoneMid, yaw, 0, 0, 0, 0.14);
    addBoxRot(buf, 8.6, 0, 27 + bob - slamDrop, 3.6, 3.2, 10.6, magma, yaw);
    addBoxRot(buf, 8.6, 0, 28 + bob - slamDrop, 3.6, 9.8, 2.6, magma, yaw);
    addBoxRot(buf, 7.5, -4.5, 31 + bob - slamDrop, 2.8, 1.8, 5.2, magma, yaw, 0, 0, 0, 0.45);
    addBoxRot(buf, 7.5, 4.5, 31 + bob - slamDrop, 2.8, 1.8, 5.2, magma, yaw, 0, 0, 0, -0.45);
    addEllipRot(buf, 0, -15.8, 35.5 + bob - slamDrop, 8.2, 7.8, 7.2, stoneMid, yaw);
    addEllipRot(buf, 0, 15.8, 35.5 + bob - slamDrop, 8.2, 7.8, 7.2, stoneMid, yaw);
    addEllipRot(buf, 0.5, -15.8, 41.5 + bob - slamDrop, 7.2, 6.8, 3.2, moss, yaw);
    addEllipRot(buf, 0.5, 15.8, 41.5 + bob - slamDrop, 7.2, 6.8, 3.2, moss, yaw);
    // Glowing Crag Crystal Formations Protruding from Shoulders & Back!
    addBoneRot(buf, -2, -14, 42 + bob - slamDrop, -6, -19, 54 + bob - slamDrop, 2.6, 0.7, magma, yaw);
    addBoneRot(buf, -2, 14, 42 + bob - slamDrop, -6, 19, 54 + bob - slamDrop, 2.6, 0.7, magma, yaw);
    addBoneRot(buf, -6, 0, 38 + bob - slamDrop, -11, 0, 52 + bob - slamDrop, 3.0, 0.9, magma, yaw);

    // Anvil Granite Head + Jutting Brow + Blazing Furnace Slit
    addBoxRot(buf, 2, 0, 42.5 + bob - slamDrop, 5.8, 6.0, 5.2, stoneMid, yaw);
    addBoxRot(buf, 3.8, 0, 46.2 + bob - slamDrop, 5.0, 6.4, 1.8, stoneDark, yaw);
    addBoxRot(buf, 7.5, 0, 42.4 + bob - slamDrop, 1.2, 4.4, 1.6, magma, yaw);

    // Colossal Iron-Banded & Magma-Knuckled Boulder Gauntlets
    let lx = 5, ly = -17, lz = 17 + bob + stride * 0.4;
    let rx = 5, ry = 17, rz = 17 + bob - stride * 0.4;
    if (isSpecialWindup) {
      lx = 4; ly = -11; lz = 54 + bob;
      rx = 4; ry = 11; rz = 54 + bob;
    } else if (isSpecial) {
      const smashZ = lerp(52, 4, Math.min(1, strikeP * 1.45));
      lx = 13; ly = -11; lz = smashZ;
      rx = 13; ry = 11; rz = smashZ;
    } else if (isWindup) {
      rx = 6; ry = 15; rz = 44 + bob;
    } else if (isStrike) {
      rx = 16; ry = 11; rz = lerp(42, 11, strikeP);
    }
    addBoneRot(buf, 0, -15, 34 + bob - slamDrop, lx, ly, lz, 4.8, 5.8, stoneMid, yaw);
    addBoneRot(buf, 0, 15, 34 + bob - slamDrop, rx, ry, rz, 4.8, 5.8, stoneMid, yaw);
    addEllipRot(buf, lx, ly, lz, 6.6, 6.4, 6.2, stoneDark, yaw);
    addEllipRot(buf, rx, ry, rz, 6.6, 6.4, 6.2, stoneDark, yaw);
    addBoxRot(buf, lx, ly, lz + 1.5, 7.0, 6.7, 1.5, ironBand, yaw);
    addBoxRot(buf, rx, ry, rz + 1.5, 7.0, 6.7, 1.5, ironBand, yaw);
    addEllipRot(buf, lx + 4.5, ly, lz - 1, 2.2, 2.8, 2.2, magma, yaw);
    addEllipRot(buf, rx + 4.5, ry, rz - 1, 2.2, 2.8, 2.2, magma, yaw);
  } else if (e.kind === 'dragon') {
    // BOSS 2: VAELGORATH, 1,000-YR ASHEN WYRM — Reptilian Scales, Dorsal Crest, Wing Hooks, Ribs & Molten Throat!
    const scaleDark = flash ? matRgb(1, 1, 1, 7, 0.8) : isSpecialWindup ? matRgb(0.75, 0.14, 0.12, 7, 0.1, 1.12) : isWindup ? matRgb(0.86, 0.44, 0.16, 7, 0.08, 1.1) : matRgb(0.28, 0.32, 0.42, 7, 0, 1.08);
    const scaleRim = flash ? matRgb(1, 1, 1, 7, 0.8) : matRgb(0.78, 0.84, 0.92, 7, 0, 1.06);
    const hornBone = matRgb(0.96, 0.98, 1.0, 6, 0, 0.78);
    const bellyFire = isWindup || isSpecial ? matRgb(1.0, 0.3, 0.08, 2, 0.94, 1.4) : matRgb(0.96, 0.58, 0.12, 2, 0.7, 1.32);
    const wingMem = matRgb(0.2, 0.22, 0.32, 1, 0, 0.86);

    const flapSpeed = isWindup || isSpecial ? 6.0 : 2.5;
    const flapZ = isSpecialWindup ? 16 : isSpecial ? Math.sin(strikeP * Math.PI) * 20 : Math.sin(elapsed * flapSpeed) * 9;
    const lungeX = isStrike ? Math.sin(strikeP * Math.PI) * 10 : isSpecialWindup ? -4 : 0;

    // 4-Segment Sinuous Serpentine Tail + 7 Dorsal Spine Ridge Spikes + Barbed Spade Tip
    const tWig = Math.sin(elapsed * 2.4 + e.phase) * 7;
    addBoneRot(buf, -12 + lungeX, 0, 16 + bob, -26 + lungeX, tWig * 0.4, 13 + bob, 8.8, 6.4, scaleDark, yaw);
    addBoneRot(buf, -26 + lungeX, tWig * 0.4, 13 + bob, -42 + lungeX, tWig * 0.9, 11 + bob, 6.2, 3.8, scaleDark, yaw);
    addBoneRot(buf, -42 + lungeX, tWig * 0.9, 11 + bob, -56 + lungeX, tWig * 0.5, 14 + bob, 3.8, 1.6, scaleRim, yaw);
    addTriRot(buf, -54 + lungeX, tWig * 0.5 - 4.0, 14 + bob, -54 + lungeX, tWig * 0.5 + 4.0, 14 + bob, -66 + lungeX, tWig * 0.4, 16.0 + bob, hornBone, yaw);
    for (let ds = 0; ds < 7; ds++) {
      const sx = lerp(12, -38, ds / 6) + lungeX;
      const sy = ds > 2 ? tWig * ((ds - 2) * 0.2) : 0;
      const sz = lerp(31, 16, ds / 6) + bob;
      addBoneRot(buf, sx, sy, sz, sx - 2.8, sy, sz + 6.2, 1.7, 0.35, hornBone, yaw);
    }

    // Scaled Torso + Glowing Magma Chest + 4 Muscular Clawed Limbs
    addEllipRot(buf, 0 + lungeX, 0, 18 + bob, 16.8, 12.6, 11.8, scaleDark, yaw);
    addEllipRot(buf, 3 + lungeX, 0, 13.5 + bob, 11.2, 8.6, 7.8, bellyFire, yaw);
    for (const side of [-1, 1]) {
      addBoneRot(buf, 7 + lungeX, side * 10, 14 + bob, 11 + lungeX + stride * side * 0.4, side * 13, 1.8, 4.0, 2.9, scaleDark, yaw);
      addBoneRot(buf, -9 + lungeX, side * 10, 14 + bob, -11 + lungeX - stride * side * 0.4, side * 13, 1.8, 4.4, 2.9, scaleDark, yaw);
    }

    // Twin Sweeping 3-Fingered Articulated Bat Wings + Elbow Hooks + Ribbed Spars!
    for (const side of [-1, 1]) {
      const wRootX = 4 + lungeX, wRootY = side * 9, wRootZ = 24 + bob;
      const wElbowX = 12 + lungeX, wElbowY = side * 30, wElbowZ = 38 + flapZ * 0.7;
      const wTipX = -6 + lungeX, wTipY = side * 56, wTipZ = 36 + flapZ;
      const wMidX = -15 + lungeX, wMidY = side * 46, wMidZ = 28 + flapZ * 0.65;
      const wBackX = -22 + lungeX, wBackY = side * 34, wBackZ = 21 + flapZ * 0.4;
      addBoneRot(buf, wRootX, wRootY, wRootZ, wElbowX, wElbowY, wElbowZ, 3.0, 2.2, scaleRim, yaw);
      addBoneRot(buf, wElbowX, wElbowY, wElbowZ, wElbowX + 4, wElbowY + side * 3, wElbowZ + 4, 1.6, 0.4, hornBone, yaw);
      addBoneRot(buf, wElbowX, wElbowY, wElbowZ, wTipX, wTipY, wTipZ, 2.4, 0.9, scaleRim, yaw);
      addBoneRot(buf, wElbowX, wElbowY, wElbowZ, wMidX, wMidY, wMidZ, 1.7, 0.7, hornBone, yaw);
      addBoneRot(buf, wElbowX, wElbowY, wElbowZ, wBackX, wBackY, wBackZ, 1.6, 0.7, hornBone, yaw);
      addTriRot(buf, wRootX, wRootY, wRootZ, wElbowX, wElbowY, wElbowZ, wTipX, wTipY, wTipZ, wingMem, yaw);
      addTriRot(buf, wRootX, wRootY, wRootZ, wTipX, wTipY, wTipZ, wMidX, wMidY, wMidZ, wingMem, yaw);
      addTriRot(buf, wRootX, wRootY, wRootZ, wMidX, wMidY, wMidZ, wBackX, wBackY, wBackZ, wingMem, yaw);
    }

    // Arched S-Curved Dragon Neck + Horned Wyrm Skull + Serrated Teeth + Twin Crown Antlers!
    const neckReach = isSpecialWindup ? -4 : isStrike ? 8 : 0;
    const jawDrop = isSpecialWindup || isSpecial ? 3.8 : 0;
    addBoneRot(buf, 11 + lungeX, 0, 21 + bob, 22 + lungeX + neckReach, 0, 32 + bob, 7.2, 5.6, scaleDark, yaw);
    addEllipRot(buf, 27 + lungeX + neckReach, 0, 35.5 + bob, 9.6, 6.6, 6.2, scaleRim, yaw);
    addBoneRot(buf, 29 + lungeX + neckReach, 0, 35.5 + bob, 40.5 + lungeX + neckReach, 0, 34.5 + bob, 4.6, 2.2, scaleDark, yaw);
    addBoneRot(buf, 28 + lungeX + neckReach, 0, 32.0 + bob - jawDrop * 0.3, 39.0 + lungeX + neckReach, 0, 31.0 + bob - jawDrop, 3.4, 1.6, scaleDark, yaw);
    // Nasal horn + Twin Swept Antlers + Serrated Teeth
    addBoneRot(buf, 38 + lungeX + neckReach, 0, 36.2 + bob, 41 + lungeX + neckReach, 0, 41.2 + bob, 1.3, 0.35, hornBone, yaw);
    for (let tf = 0; tf < 2; tf++) {
      addBoxRot(buf, (35.5 + tf * 2.5) + lungeX + neckReach, -1.6, 33.4 + bob, 0.55, 0.45, 1.2, hornBone, yaw);
      addBoxRot(buf, (35.5 + tf * 2.5) + lungeX + neckReach, 1.6, 33.4 + bob, 0.55, 0.45, 1.2, hornBone, yaw);
    }
    addBoneRot(buf, 23 + lungeX + neckReach, -4, 38.5 + bob, 10 + lungeX + neckReach, -12.5, 52.5 + bob, 2.6, 0.5, hornBone, yaw);
    addBoneRot(buf, 23 + lungeX + neckReach, 4, 38.5 + bob, 10 + lungeX + neckReach, 12.5, 52.5 + bob, 2.6, 0.5, hornBone, yaw);
    addBoxRot(buf, 31 + lungeX + neckReach, -4.6, 37.8 + bob, 1.5, 1.2, 1.2, matRgb(1.0, 0.85, 0.2, 2, 0.96, 1.38), yaw);
    addBoxRot(buf, 31 + lungeX + neckReach, 4.6, 37.8 + bob, 1.5, 1.2, 1.2, matRgb(1.0, 0.85, 0.2, 2, 0.96, 1.38), yaw);
    if (isSpecialWindup || isSpecial) {
      addEllipRot(buf, 37 + lungeX + neckReach, 0, 32.5 + bob, 4.8, 3.6, 3.6, bellyFire, yaw);
    }
  } else if (e.kind === 'hydra_boss') {
    // BOSS 6: SCYLLA, ABYSSAL MIRE HYDRA — Scaled 3-Headed Fjord Serpent Beast with Dorsal Neck Fins & Venom Crowns!
    const scaleDark = flash ? matRgb(1, 1, 1, 7, 0.85) : isSpecialWindup ? matRgb(0.18, 0.68, 0.72, 7, 0.1, 1.1) : matRgb(0.14, 0.36, 0.44, 7, 0, 1.08);
    const scaleBright = flash ? matRgb(1, 1, 1, 7, 0.85) : matRgb(0.38, 0.84, 0.8, 7, 0.08, 1.06);
    const finGlow = isWindup || isSpecial ? matRgb(0.45, 1.0, 0.85, 2, 0.94, 0.84) : matRgb(0.28, 0.88, 0.96, 2, 0.7, 0.84);
    const fangMat = matRgb(0.96, 0.98, 1.0, 6, 0, 0.74);
    const hydraEye = matRgb(0.55, 1.0, 0.35, 2, 0.96, 1.38);

    const tSw = Math.sin(elapsed * 2.8 + e.phase) * 7.5;
    addBoneRot(buf, -10, 0, 13 + bob, -25, tSw * 0.4, 10 + bob, 7.8, 5.4, scaleDark, yaw);
    addBoneRot(buf, -25, tSw * 0.4, 10 + bob, -41, tSw, 8 + bob, 5.2, 2.4, scaleBright, yaw);
    addTriRot(buf, -38, tSw - 4.5, 8 + bob, -38, tSw + 4.5, 8 + bob, -50, tSw * 0.8, 13 + bob, finGlow, yaw);

    addEllipRot(buf, -2, 0, 14 + bob, 15.0, 12.0, 10.2, scaleDark, yaw);
    addEllipRot(buf, 4, 0, 15.5 + bob, 10.6, 9.6, 8.6, scaleBright, yaw);
    for (const side of [-1, 1]) {
      addBoneRot(buf, 6, side * 9, 12 + bob, 10 + stride * side * 0.4, side * 13.5, 1.5, 3.8, 2.8, scaleDark, yaw);
      addBoneRot(buf, -8, side * 9, 12 + bob, -10 - stride * side * 0.4, side * 13, 1.5, 4.0, 2.8, scaleDark, yaw);
    }

    const heads = [
      { yOff: -11.5, len: 24, zTop: 35, phase: 0, reach: isStrike ? 9 : 0 },
      { yOff: 0, len: 30, zTop: 43, phase: 2.1, reach: isSpecial || isStrike ? 12 : isWindup ? -5 : 0 },
      { yOff: 11.5, len: 24, zTop: 35, phase: 4.2, reach: isStrike ? 9 : 0 }
    ];
    for (const hd of heads) {
      const swayY = Math.sin(elapsed * 3.4 + hd.phase) * 4.0 + hd.yOff;
      const swayZ = Math.cos(elapsed * 2.9 + hd.phase) * 2.5 + hd.zTop + bob;
      const midX = 14 + hd.reach * 0.45;
      const midY = swayY * 0.55;
      const midZ = swayZ - 7;
      const hx = 22 + hd.len * 0.4 + hd.reach;
      addBoneRot(buf, 9, hd.yOff * 0.35, 18 + bob, midX, midY, midZ, 4.6, 3.6, scaleDark, yaw);
      addBoneRot(buf, midX, midY, midZ, hx, swayY, swayZ, 3.8, 3.0, scaleBright, yaw);
      // Bioluminescent Neck Sail Fin along curve
      addTriRot(buf, 11, hd.yOff * 0.35, 22 + bob, midX - 2, midY, midZ + 6, hx - 2, swayY, swayZ + 5, finGlow, yaw);
      addEllipRot(buf, hx + 2.5, swayY, swayZ + 0.5, 6.4, 4.6, 4.4, scaleBright, yaw);
      addBoneRot(buf, hx + 3.5, swayY, swayZ - 0.5, hx + 11.5, swayY, swayZ - 1.2, 3.0, 1.5, scaleDark, yaw);
      addBoneRot(buf, hx - 1, swayY - 2, swayZ + 3.5, hx - 7.5, swayY - 4.8, swayZ + 9.2, 1.5, 0.35, finGlow, yaw);
      addBoneRot(buf, hx - 1, swayY + 2, swayZ + 3.5, hx - 7.5, swayY + 4.8, swayZ + 9.2, 1.5, 0.35, finGlow, yaw);
      addBoxRot(buf, hx + 9.5, swayY - 1.2, swayZ - 2.0, 0.55, 0.45, 1.3, fangMat, yaw);
      addBoxRot(buf, hx + 9.5, swayY + 1.2, swayZ - 2.0, 0.55, 0.45, 1.3, fangMat, yaw);
      addBoxRot(buf, hx + 4.8, swayY - 2.6, swayZ + 2.0, 1.1, 1.0, 1.0, hydraEye, yaw);
      addBoxRot(buf, hx + 4.8, swayY + 2.6, swayZ + 2.0, 1.1, 1.0, 1.0, hydraEye, yaw);
    }
  } else if (e.kind === 'reaper_boss') {
    // BOSS 7: MALPHAS, SERAPH OF ASH — Six-Winged Fallen Solar Archon with Plumage Spars & 7-Gem Corona!
    const hoverZ = 9 + Math.sin(elapsed * 2.6 + e.phase) * 3.5;
    const obsPlate = flash ? matRgb(1, 1, 1, 2, 0.85) : matRgb(0.2, 0.2, 0.28, 2, 0, 1.08);
    const goldPlate = flash ? matRgb(1, 1, 1, 2, 0.85) : matRgb(0.96, 0.74, 0.24, 2, 0.36, 1.18);
    const solarFire = isWindup || isSpecial ? matRgb(1.0, 0.42, 0.12, 2, 0.96, 1.42) : matRgb(1.0, 0.78, 0.28, 2, 0.9, 1.36);
    const wingFeather = matRgb(0.76, 0.18, 0.14, 1, 0.08, 0.78);

    addBoneRot(buf, 0, -4.5, hoverZ + 12, -2, -5.5, hoverZ - 5, 3.0, 2.2, obsPlate, yaw);
    addBoneRot(buf, 0, 4.5, hoverZ + 12, -2, 5.5, hoverZ - 5, 3.0, 2.2, obsPlate, yaw);
    addTriRot(buf, -3, -7, hoverZ + 18, -3, 7, hoverZ + 18, -16, Math.sin(elapsed * 4) * 3, hoverZ - 4, wingFeather, yaw);

    addBoxRot(buf, 0, 0, hoverZ + 22, 5.8, 8.6, 9.0, obsPlate, yaw);
    addEllipRot(buf, 4.8, 0, hoverZ + 23.5, 2.8, 3.2, 3.6, solarFire, yaw);
    addEllipRot(buf, 0.5, -10.5, hoverZ + 28, 4.8, 4.4, 4.0, goldPlate, yaw);
    addEllipRot(buf, 0.5, 10.5, hoverZ + 28, 4.8, 4.4, 4.0, goldPlate, yaw);
    addEllipRot(buf, 0.6, 0, hoverZ + 36, 5.0, 4.6, 5.4, goldPlate, yaw);
    addBoxRot(buf, 5.2, 0, hoverZ + 36, 1.1, 3.2, 1.1, solarFire, yaw);
    for (let hi = 0; hi < 7; hi++) {
      const ha = -1.5 + hi * 0.5 + elapsed * 0.8;
      addEllipRot(buf, -3.5, Math.sin(ha) * 11.5, hoverZ + 38 + Math.cos(ha) * 11.5, 1.35, 1.35, 1.35, solarFire, yaw);
    }

    // 6 Articulated Solar Wings + Primary Feather Spars!
    const flap = Math.sin(elapsed * 3.8) * 6 + (isSpecialWindup ? 10 : 0);
    for (const side of [-1, 1]) {
      for (let wTier = 0; wTier < 3; wTier++) {
        const zR = hoverZ + 28 - wTier * 4;
        const ySpan = (45 - wTier * 8) * side;
        const zTip = hoverZ + 47 - wTier * 13 + flap * (1 - wTier * 0.25);
        const xTip = -12 - wTier * 5;
        addBoneRot(buf, -3, side * 6, zR, xTip, ySpan, zTip, 2.4, 0.9, wTier === 0 ? solarFire : goldPlate, yaw);
        addTriRot(buf, -3, side * 6, zR, xTip, ySpan, zTip, xTip - 11, ySpan * 0.65, zTip - 11, wingFeather, yaw);
      }
    }

    const swAng = isSpecial ? -1.6 + strikeP * Math.PI * 2.2 : isWindup ? -1.8 : isStrike ? lerp(-1.8, 1.0, strikeP) : -0.4;
    const handX = 6 + Math.cos(swAng) * 5;
    const handY = 9 + Math.sin(swAng) * 5;
    const handZ = hoverZ + 23;
    const tipX = handX + Math.cos(swAng) * 29;
    const tipY = handY + Math.sin(swAng) * 25;
    const tipZ = handZ + (isWindup ? 16 : isStrike ? -8 : 10);
    addBoneRot(buf, 1, 9.5, hoverZ + 26, handX, handY, handZ, 2.4, 1.9, goldPlate, yaw);
    addBoneRot(buf, handX, handY, handZ, tipX, tipY, tipZ, 2.0, 0.65, solarFire, yaw);
  } else if (e.kind === 'behemoth_boss') {
    // BOSS 8: AURELIUS, PALE CITADEL SOVEREIGN — Supreme Astral Titan + 4 Rune Monoliths + Royal Crown!
    const moonSteel = flash ? matRgb(1, 1, 1, 2, 0.85) : isSpecialWindup ? matRgb(0.55, 0.88, 1.0, 2, 0.45, 1.14) : matRgb(0.78, 0.88, 0.98, 2, 0.14, 1.1);
    const darkAbyss = matRgb(0.18, 0.22, 0.36, 2, 0, 0.92);
    const astralGold = matRgb(0.98, 0.82, 0.34, 2, 0.34, 1.24);
    const starGlow = matRgb(0.5, 0.94, 1.0, 2, 0.95, 1.42);
    const cloakTrim = matRgb(0.42, 0.72, 0.96, 1, 0.3, 0.82);

    const cW = Math.sin(elapsed * 4.0) * 4.5;
    addTriRot(buf, -4, -12.5, 36 + bob, -4, 0, 36 + bob, -27, -10.5 + cW, 4, darkAbyss, yaw);
    addTriRot(buf, -4, 0, 36 + bob, -4, 12.5, 36 + bob, -27, 10.5 + cW, 4, darkAbyss, yaw);
    addTriRot(buf, -3.5, -8.5, 35 + bob, -3.5, 8.5, 35 + bob, -22, cW * 0.7, 7, cloakTrim, yaw);

    addBoneRot(buf, 0, -6.8, 17 + bob, stride * 0.6, -7.2, 1.5, 4.6, 3.6, darkAbyss, yaw);
    addBoneRot(buf, 0, 6.8, 17 + bob, -stride * 0.6, 7.2, 1.5, 4.6, 3.6, moonSteel, yaw);
    addBoxRot(buf, 0, 0, 28 + bob, 9.0, 12.8, 12.0, darkAbyss, yaw);
    addBoxRot(buf, 6.4, 0, 29 + bob, 3.5, 6.6, 8.8, astralGold, yaw);
    addEllipRot(buf, 9.0, 0, 29.5 + bob, 3.2, 3.6, 4.0, starGlow, yaw);
    addBoneRot(buf, 1, -12.8, 31 + bob, 7.8, -14.2, 24 + bob, 3.2, 2.5, moonSteel, yaw);
    addBoxRot(buf, 9.6, -15.6, 24 + bob, 2.3, 8.6, 13.2, darkAbyss, yaw, 0, 0, 0, 0.35);
    addBoxRot(buf, 10.3, -16.1, 24 + bob, 1.9, 7.3, 11.4, astralGold, yaw, 0, 0, 0, 0.35);
    addEllipRot(buf, 11.2, -16.5, 24.5 + bob, 2.0, 2.4, 2.6, starGlow, yaw);

    // Floating Rune Shoulder Monoliths & Crowned Astral Helm
    addEllipRot(buf, 0.5, -14.2, 35.5 + bob, 7.0, 6.6, 5.8, moonSteel, yaw);
    addEllipRot(buf, 0.5, 14.2, 35.5 + bob, 7.0, 6.6, 5.8, moonSteel, yaw);
    addBoxRot(buf, -1, -16.8, 45 + bob + Math.sin(elapsed * 3) * 2.5, 2.9, 2.9, 7.5, starGlow, elapsed);
    addBoxRot(buf, -1, 16.8, 45 + bob + Math.cos(elapsed * 3) * 2.5, 2.9, 2.9, 7.5, starGlow, -elapsed);

    addEllipRot(buf, 0.8, 0, 44.5 + bob, 6.6, 6.0, 7.0, moonSteel, yaw);
    addBoneRot(buf, 0.8, -4.8, 48 + bob, 0, -12.0, 59 + bob, 2.6, 0.55, astralGold, yaw);
    addBoneRot(buf, 0.8, 4.8, 48 + bob, 0, 12.0, 59 + bob, 2.6, 0.55, astralGold, yaw);
    addBoneRot(buf, 1.2, 0, 49 + bob, 0.5, 0, 62 + bob, 2.5, 0.5, starGlow, yaw);
    addBoxRot(buf, 7.0, 0, 44.5 + bob, 1.4, 4.2, 1.5, starGlow, yaw);

    // 4 Orbiting Astral Shield Orbs + Celestial Greatsword
    for (let o = 0; o < 4; o++) {
      const oa = elapsed * 2.1 + (o * Math.PI * 0.5);
      buf.addEllipsoid(Math.cos(oa) * 25, Math.sin(oa) * 25, 28 + bob + Math.sin(oa * 2) * 4, 3.6, 3.6, 3.6, starGlow);
    }
    const swAng = isSpecial ? -1.8 + strikeP * Math.PI * 2.5 : isWindup ? -2.0 : isStrike ? lerp(-2.0, 1.2, strikeP) : -0.45;
    const hX = 7 + Math.cos(swAng) * 6;
    const hY = 11 + Math.sin(swAng) * 6;
    const hZ = 27 + bob + (isWindup ? 10 : 0);
    const tX = hX + Math.cos(swAng) * 32;
    const tY = hY + Math.sin(swAng) * 27;
    const tZ = hZ + (isWindup ? 16 : isStrike ? -10 : 12);
    addBoneRot(buf, 1, 11.5, 31 + bob, hX, hY, hZ, 2.8, 2.2, moonSteel, yaw);
    addBoneRot(buf, hX, hY, hZ, tX, tY, tZ, 2.2, 0.65, starGlow, yaw);
  }
}

function isMovingOrStepping(e) {
  return Boolean(e.moving || e.windup > 0 || (e.strikeTimer || 0) > 0);
}
