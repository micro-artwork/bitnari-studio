/**
 * Bitnari Image & Color Science Utility (1:1 Ported from C# ImageUtil.cs)
 */

export class GammaRgb {
  static createTable(gammaR = 1.0, gammaG = 1.0, gammaB = 1.0) {
    const tableR = new Uint8Array(256);
    const tableG = new Uint8Array(256);
    const tableB = new Uint8Array(256);

    const expR = 1.0 / Math.max(0.1, gammaR);
    const expG = 1.0 / Math.max(0.1, gammaG);
    const expB = 1.0 / Math.max(0.1, gammaB);

    for (let i = 0; i < 256; i++) {
      tableR[i] = Math.min(
        255,
        Math.max(0, Math.round(255 * Math.pow(i / 255.0, expR))),
      );
      tableG[i] = Math.min(
        255,
        Math.max(0, Math.round(255 * Math.pow(i / 255.0, expG))),
      );
      tableB[i] = Math.min(
        255,
        Math.max(0, Math.round(255 * Math.pow(i / 255.0, expB))),
      );
    }

    return { r: tableR, g: tableG, b: tableB };
  }
}

/**
 * Applies per-channel RGB Gamma Table correction
 */
export function applyGammaCorrection(colors = [], gammaTable = null) {
  if (!colors || colors.length === 0 || !gammaTable) return colors;
  const { r: tR, g: tG, b: tB } = gammaTable;
  return colors.map((c) => ({
    r: tR[Math.max(0, Math.min(255, c.r || 0))],
    g: tG[Math.max(0, Math.min(255, c.g || 0))],
    b: tB[Math.max(0, Math.min(255, c.b || 0))],
  }));
}

/**
 * 1:1 Port of C# ImageUtil.cs AdjustBrightness() and AdjustPixelsForPowerLimit()
 * Mode 1: Static Brightness Scaling (% multiplier)
 * Mode 2: Adaptive Wattage Power Limit (Watts cap across all LEDs)
 */
export function applyPowerManagement(colors = [], config = {}) {
  if (!colors || colors.length === 0) return [];

  const {
    powerMode = 'Static', // 'Static' | 'Adaptive'
    brightnessPercent = 85,
    adaptiveMaxPowerW = 30,
    redMaxPowerW = 0.08,
    greenMaxPowerW = 0.08,
    blueMaxPowerW = 0.08,
  } = config;

  // Mode 1: Static Brightness (%)
  if (powerMode === 'Static') {
    const factor = Math.max(0, Math.min(1.0, brightnessPercent / 100.0));
    return colors.map((c) => ({
      r: Math.round(c.r * factor),
      g: Math.round(c.g * factor),
      b: Math.round(c.b * factor),
    }));
  }

  // Mode 2: Adaptive Power Limiting (Watts)
  // 1. Calculate estimated total current power draw
  let currentTotalPowerW = 0;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const powerR = redMaxPowerW * (c.r / 255.0);
    const powerG = greenMaxPowerW * (c.g / 255.0);
    const powerB = blueMaxPowerW * (c.b / 255.0);
    currentTotalPowerW += powerR + powerG + powerB;
  }

  // 2. If power exceeds max power limit, apply scaling factor
  if (currentTotalPowerW > adaptiveMaxPowerW && currentTotalPowerW > 0) {
    const scalingFactor = adaptiveMaxPowerW / currentTotalPowerW;
    return colors.map((c) => ({
      r: Math.max(0, Math.min(255, Math.floor(c.r * scalingFactor))),
      g: Math.max(0, Math.min(255, Math.floor(c.g * scalingFactor))),
      b: Math.max(0, Math.min(255, Math.floor(c.b * scalingFactor))),
    }));
  }

  return colors;
}

/**
 * Saturation Boost (RGB <-> HSV 1.35x Multiplier)
 */
export function enhanceSaturation(r, g, b, boostFactor = 1.35) {
  if (typeof r === 'object' && r !== null) {
    boostFactor = typeof g === 'number' ? g : 1.35;
    b = r.b || 0;
    g = r.g || 0;
    r = r.r || 0;
  }
  let rNorm = r / 255.0;
  let gNorm = g / 255.0;
  let bNorm = b / 255.0;

  let max = Math.max(rNorm, gNorm, bNorm);
  let min = Math.min(rNorm, gNorm, bNorm);
  let delta = max - min;

  let h = 0;
  let s = max === 0 ? 0 : delta / max;
  let v = max;

  if (delta !== 0) {
    if (max === rNorm) {
      h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h /= 6.0;
  }

  s = Math.min(1.0, Math.max(0.0, s * boostFactor));

  let outR, outG, outB;
  if (s === 0) {
    outR = outG = outB = v;
  } else {
    let varH = h * 6.0;
    let i = Math.floor(varH);
    let var1 = v * (1.0 - s);
    let var2 = v * (1.0 - s * (varH - i));
    let var3 = v * (1.0 - s * (1.0 - (varH - i)));

    if (i === 0) {
      outR = v;
      outG = var3;
      outB = var1;
    } else if (i === 1) {
      outR = var2;
      outG = v;
      outB = var1;
    } else if (i === 2) {
      outR = var1;
      outG = v;
      outB = var3;
    } else if (i === 3) {
      outR = var1;
      outG = var2;
      outB = v;
    } else if (i === 4) {
      outR = var3;
      outG = var1;
      outB = v;
    } else {
      outR = v;
      outG = var1;
      outB = var2;
    }
  }

  return {
    r: Math.round(outR * 255),
    g: Math.round(outG * 255),
    b: Math.round(outB * 255),
  };
}

/**
 * Luminance ACES Filmic Tone Mapping + sRGB Gamma 2.2 Correction
 */
export function toneMapHdrToSdr(rFloat, gFloat, bFloat) {
  let luminance = 0.2126 * rFloat + 0.7152 * gFloat + 0.0722 * bFloat;
  if (luminance <= 0.0001) return { r: 0, g: 0, b: 0 };

  // ACES Filmic Curve
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;

  let mappedLuminance =
    (luminance * (a * luminance + b)) / (luminance * (c * luminance + d) + e);
  let scale = mappedLuminance / luminance;

  let mappedR = rFloat * scale;
  let mappedG = gFloat * scale;
  let mappedB = bFloat * scale;

  // sRGB Gamma 2.2
  mappedR = Math.pow(Math.min(1.0, Math.max(0.0, mappedR)), 1.0 / 2.2);
  mappedG = Math.pow(Math.min(1.0, Math.max(0.0, mappedG)), 1.0 / 2.2);
  mappedB = Math.pow(Math.min(1.0, Math.max(0.0, mappedB)), 1.0 / 2.2);

  return {
    r: Math.round(mappedR * 255),
    g: Math.round(mappedG * 255),
    b: Math.round(mappedB * 255),
  };
}

/**
 * Scanline Auto Letterbox & Pillarbox Inset Detection
 */
export function detectLetterboxBounds(pixels, width, height) {
  if (!pixels || pixels.length === 0 || width <= 0 || height <= 0) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const stride = width * 4;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const maxScanY = Math.floor(height * 0.35);
  const maxScanX = Math.floor(width * 0.35);

  const isBlack = (pos) =>
    pixels[pos] < 15 && pixels[pos + 1] < 15 && pixels[pos + 2] < 15;

  // 1. Top
  let topCount = 0;
  for (let y = 0; y < maxScanY; y++) {
    let pos = y * stride + centerX * 4;
    if (isBlack(pos)) topCount++;
    else break;
  }

  // 2. Bottom
  let bottomCount = 0;
  for (let y = height - 1; y >= height - maxScanY; y--) {
    let pos = y * stride + centerX * 4;
    if (isBlack(pos)) bottomCount++;
    else break;
  }

  // 3. Left
  let leftCount = 0;
  for (let x = 0; x < maxScanX; x++) {
    let pos = centerY * stride + x * 4;
    if (isBlack(pos)) leftCount++;
    else break;
  }

  // 4. Right
  let rightCount = 0;
  for (let x = width - 1; x >= width - maxScanX; x--) {
    let pos = centerY * stride + x * 4;
    if (isBlack(pos)) rightCount++;
    else break;
  }

  return {
    top: topCount / height,
    bottom: bottomCount / height,
    left: leftCount / width,
    right: rightCount / width,
  };
}

/**
 * Exponential Moving Average (Lerp Frame Interpolation)
 */
export function lerpColors(prevColors, currColors, factor = 0.25) {
  if (!prevColors || prevColors.length !== currColors.length) {
    return [...currColors];
  }

  return currColors.map((curr, i) => {
    let prev = prevColors[i];
    let r = Math.round(prev.r + (curr.r - prev.r) * factor);
    let g = Math.round(prev.g + (curr.g - prev.g) * factor);
    let b = Math.round(prev.b + (curr.b - prev.b) * factor);
    return { r, g, b };
  });
}
