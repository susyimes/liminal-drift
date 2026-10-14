import { flavorText } from "./copy.ts";
import * as THREE from "three";

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2d missing");
  return { c, ctx };
}

function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 5; i += 1) {
    v += noise(x * freq, y * freq, seed + i * 19) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

function toTexture(c: HTMLCanvasElement, repeat = 2, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function wallpaper(base: [number, number, number], stripe: [number, number, number], seed: number): THREE.CanvasTexture {
  const { c, ctx } = canvas(512);
  const img = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const stripeOn = Math.sin((x / 512) * Math.PI * 16) > 0.15;
      const n = fbm(x / 90, y / 90, seed);
      const stain = Math.max(0, fbm(x / 140, y / 70, seed + 7) - 0.58) * 0.55;
      const grit = (hash(x, y, seed) - 0.5) * 18;
      const t = stripeOn ? stripe : base;
      const damp = n * 22 - stain * 70;
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, t[0] + damp + grit));
      img.data[i + 1] = Math.max(0, Math.min(255, t[1] + damp * 0.85 + grit * 0.8));
      img.data[i + 2] = Math.max(0, Math.min(255, t[2] + damp * 0.35 + grit * 0.4));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgba(70, 50, 16, 0.12)";
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.ellipse(40 + (i * 73) % 512, 80 + (i * 97) % 512, 40 + i * 6, 18 + i * 3, i, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, 2);
}

function wallpaperNormal(seed: number): THREE.CanvasTexture {
  const { c, ctx } = canvas(256);
  const img = ctx.createImageData(256, 256);
  const h = (x: number, y: number) => fbm(x / 18, y / 18, seed) + Math.sin((x / 256) * Math.PI * 16) * 0.08;
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const i = (y * 256 + x) * 4;
      img.data[i] = Math.floor((0.5 - dx * 2.2) * 255);
      img.data[i + 1] = Math.floor((0.5 - dy * 2.2) * 255);
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, 2, false);
}

function carpet(wet: boolean): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const { c, ctx } = canvas(512);
  const img = ctx.createImageData(512, 512);
  const seed = wet ? 44 : 21;
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const n = fbm(x / 60, y / 60, seed);
      const fiber = ((x * 13 + y * 7) % 5) * 3;
      const wetPatch = wet ? Math.max(0, fbm(x / 80, y / 80, 90) - 0.42) : 0;
      const r = 148 + n * 36 - wetPatch * 28 + fiber;
      const g = 112 + n * 22 - wetPatch * 10 + fiber * 0.35;
      const b = 48 + n * 10 - wetPatch * 4;
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r));
      img.data[i + 1] = Math.max(0, Math.min(255, g));
      img.data[i + 2] = Math.max(0, Math.min(255, b));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(c, 3);

  const roughCanvas = canvas(256);
  const rimg = roughCanvas.ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const wetPatch = wet ? Math.max(0, fbm(x / 40, y / 40, 90) - 0.4) : 0;
      const v = wet ? 70 + wetPatch * 140 : 150 + fbm(x / 20, y / 20, 3) * 70;
      const i = (y * 256 + x) * 4;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(0, Math.min(255, v));
      rimg.data[i + 3] = 255;
    }
  }
  roughCanvas.ctx.putImageData(rimg, 0, 0);
  return { map, rough: toTexture(roughCanvas.c, 3, false) };
}

function ceilingTiles(): THREE.CanvasTexture {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#c4bda0";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(90, 82, 58, 0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, 512, 512);
  const pix = img.data;
  for (let i = 0; i < pix.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    pix[i] = (pix[i] ?? 0) + n;
    pix[i + 1] = (pix[i + 1] ?? 0) + n;
    pix[i + 2] = (pix[i + 2] ?? 0) + n * 0.7;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgba(90, 70, 30, 0.18)";
  ctx.beginPath();
  ctx.ellipse(200, 140, 90, 40, 0.4, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, 2);
}

function tileWall(): THREE.CanvasTexture {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#c8d4d2";
  ctx.fillRect(0, 0, 512, 512);
  const grout = 7;
  ctx.fillStyle = "#3a4448";
  for (let i = 0; i <= 512; i += 128) {
    ctx.fillRect(i - grout / 2, 0, grout, 512);
    ctx.fillRect(0, i - grout / 2, 512, grout);
  }
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const i = (y * 512 + x) * 4;
      const stain = Math.max(0, fbm(x / 90, y / 70, 61) - 0.58) * 42;
      const grit = (hash(x, y, 61) - 0.5) * 9;
      const mold = Math.max(0, fbm(x / 40, y / 38, 19) - 0.68) * 50;
      img.data[i] = Math.max(0, Math.min(255, (img.data[i] ?? 200) - stain * 0.2 - mold * 0.35 + grit));
      img.data[i + 1] = Math.max(0, Math.min(255, (img.data[i + 1] ?? 212) - stain * 0.08 - mold * 0.1 + grit));
      img.data[i + 2] = Math.max(0, Math.min(255, (img.data[i + 2] ?? 214) + stain * 0.08 - mold * 0.22 + grit));
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgba(90, 108, 104, 0.34)";
  ctx.beginPath();
  ctx.ellipse(28, 486, 22, 16, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(50, 72, 68, 0.28)";
  ctx.beginPath();
  ctx.ellipse(390, 140, 18, 12, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(40, 70, 66, 0.16)";
  ctx.beginPath();
  ctx.ellipse(180, 220, 90, 36, 0.3, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, 2);
}

function tileFloor(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#c4d2d0";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#2e3a3e";
  for (let i = 0; i <= 512; i += 128) {
    ctx.fillRect(i - 3, 0, 6, 512);
    ctx.fillRect(0, i - 3, 512, 6);
  }
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const wet = Math.max(0, fbm(x / 50, y / 50, 77) - 0.4);
      const chip = hash(x, y, 41) > 0.993 ? 28 : 0;
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, (img.data[i] ?? 180) - wet * 16 - chip));
      img.data[i + 1] = Math.max(0, Math.min(255, (img.data[i + 1] ?? 210) + wet * 6 - chip * 0.5));
      img.data[i + 2] = Math.max(0, Math.min(255, (img.data[i + 2] ?? 210) + wet * 10 - chip * 0.3));
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(c, 4);

  const roughCanvas = canvas(256);
  const rimg = roughCanvas.ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const wet = Math.max(0, fbm(x / 28, y / 28, 77) - 0.38);
      const v = 40 + wet * 90;
      const i = (y * 256 + x) * 4;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(0, Math.min(255, v));
      rimg.data[i + 3] = 255;
    }
  }
  roughCanvas.ctx.putImageData(rimg, 0, 0);
  return { map, rough: toTexture(roughCanvas.c, 4, false) };
}

function poolWater(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const n = fbm(x / 22, y / 22, 33);
      const depth = y / 255;
      const lane = Math.abs(((x + 8) % 48) - 24) < 1.6 ? 36 : 0;
      const i = (y * 256 + x) * 4;
      img.data[i] = 18 + n * 16 + lane * 0.35;
      img.data[i + 1] = 118 + n * 40 - depth * 36 + lane * 0.55;
      img.data[i + 2] = 132 + n * 36 - depth * 18 + lane;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, 3);
}

function water(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const n = fbm(x / 28, y / 28, 12);
      const i = (y * 256 + x) * 4;
      img.data[i] = 40 + n * 30;
      img.data[i + 1] = 58 + n * 40;
      img.data[i + 2] = 48 + n * 28;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, 4);
}

function poolCeiling(): THREE.CanvasTexture {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#c6d4d2";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(90, 110, 108, 0.4)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 73) % 512;
    const y = (i * 97) % 512;
    ctx.fillStyle = `rgba(180, 210, 214, ${0.18 + (i % 5) * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + (i % 3), 7 + (i % 4), 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(80, 120, 120, 0.16)";
  ctx.beginPath();
  ctx.ellipse(80, 40, 90, 28, 0.1, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, 2);
}

function coneGradient(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "rgba(255,241,194,0)");
  g.addColorStop(0.25, "rgba(255,236,180,0.18)");
  g.addColorStop(0.7, "rgba(255,230,160,0.07)");
  g.addColorStop(1, "rgba(255,220,140,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Redraw the existing canvas on locale changes; preserve mesh/material identity. */
export function updateGraffitiTexture(texture: THREE.CanvasTexture, canonical: string): void {
  const c = texture.image as HTMLCanvasElement;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = "rgba(90, 40, 18, 0.82)";
  ctx.font = "700 34px 'Noto Serif SC', 'Courier New', monospace";
  ctx.save();
  ctx.translate(40, 190);
  ctx.rotate(-0.06);
  let line = "";
  let row = 0;
  for (const char of flavorText(canonical)) {
    if (ctx.measureText(line + char).width > 420) {
      ctx.fillText(line, 0, row * 46); row += 1; line = "";
    }
    line += char;
  }
  ctx.fillText(line, 0, row * 46);
  ctx.restore();
  ctx.fillStyle = "rgba(40, 20, 8, 0.25)";
  ctx.fillRect(30, 370, 400, 8);
  texture.needsUpdate = true;
}
export function makeGraffitiTexture(canonical: string): THREE.CanvasTexture {
  const { c } = canvas(512);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  updateGraffitiTexture(texture, canonical);
  return texture;
}

const wallMap = wallpaper([214, 194, 74], [196, 172, 52], 3);
const wallDampMap = wallpaper([186, 176, 96], [160, 150, 80], 11);
const wallExitMap = wallpaper([180, 196, 92], [150, 168, 70], 17);
const concreteMap = wallpaper([168, 162, 140], [150, 146, 128], 29);
const wallNorm = wallpaperNormal(3);
const carpetDry = carpet(false);
const carpetWet = carpet(true);
const ceilMap = ceilingTiles();
const waterMap = water();
const tileWallMap = tileWall();
const tileFloorMaps = tileFloor();
const poolWaterMap = poolWater();
const poolCeilingMap = poolCeiling();

export const tex = {
  wall: wallMap,
  wallDamp: wallDampMap,
  wallExit: wallExitMap,
  concrete: concreteMap,
  tileWall: tileWallMap,
  tileFloor: tileFloorMaps.map,
  tileFloorRough: tileFloorMaps.rough,
  poolCeiling: poolCeilingMap,
  wallNorm,
  carpet: carpetDry.map,
  carpetRough: carpetDry.rough,
  carpetWet: carpetWet.map,
  carpetWetRough: carpetWet.rough,
  ceiling: ceilMap,
  water: waterMap,
  poolWater: poolWaterMap,
  cone: coneGradient(),
};

export function tiled(source: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const map = source.clone();
  map.repeat.set(Math.max(0.6, rx), Math.max(0.6, ry));
  map.needsUpdate = true;
  return map;
}
