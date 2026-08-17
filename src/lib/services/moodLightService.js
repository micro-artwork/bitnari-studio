/**
 * Mood Light & Audio Rhythm Visualizer Pattern Generator for Bitnari
 */

let cycleAngle = 0;

/**
 * Generates Mood Light colors based on preset and effect mode
 */
export function sampleMoodLightColors(totalPixels = 182, config = {}) {
  const {
    moodPreset = 'WarmWhite', // 'WarmWhite' | 'Cyberpunk' | 'Sunset' | 'Forest' | 'Ocean' | 'Rainbow' | 'Custom'
    moodEffect = 'Breathing', // 'Static' | 'Breathing' | 'RainbowCycle'
    moodColor = '#ffb74d', // Custom HEX color
    moodSpeed = 1.0,
  } = config;

  const colors = [];
  cycleAngle = (cycleAngle + 0.02 * moodSpeed) % (Math.PI * 2);

  // Calculate dynamic effect intensity factor (0.05 to 1.0)
  let effectFactor = 1.0;
  if (moodEffect === 'Breathing') {
    // Deep, soothing breathing sine curve (5% to 100%)
    const sinVal = Math.sin(cycleAngle);
    effectFactor = 0.05 + 0.95 * Math.pow((sinVal + 1) / 2, 1.6);
  } else if (moodEffect === 'Pulse') {
    // Crisp double-beat heartbeat pulse (Thump-Thump)
    const t = ((cycleAngle * 2) % (Math.PI * 2)) / (Math.PI * 2); // 0 to 1
    if (t < 0.15) {
      effectFactor = 0.05 + 0.95 * Math.sin((t / 0.15) * Math.PI);
    } else if (t >= 0.20 && t < 0.35) {
      effectFactor = 0.05 + 0.55 * Math.sin(((t - 0.20) / 0.15) * Math.PI);
    } else {
      effectFactor = 0.05;
    }
  } else if (moodEffect === 'Static') {
    effectFactor = 1.0;
  }

  let baseRgb = { r: 255, g: 183, b: 77 }; // Warm White default

  if (moodPreset === 'Custom') {
    baseRgb = hexToRgb(moodColor);
  } else if (moodPreset === 'Cyberpunk') {
    baseRgb = { r: 236, g: 72, b: 153 }; // Neon Pink
  } else if (moodPreset === 'Sunset') {
    baseRgb = { r: 249, g: 115, b: 22 }; // Sunset Orange
  } else if (moodPreset === 'Forest') {
    baseRgb = { r: 16, g: 185, b: 129 }; // Emerald Green
  } else if (moodPreset === 'Ocean') {
    baseRgb = { r: 2, g: 132, b: 199 }; // Deep Blue
  }

  for (let i = 0; i < totalPixels; i++) {
    const normPos = i / totalPixels;

    if (moodPreset === 'Rainbow') {
      const hue = ((normPos * 360) + (cycleAngle * 50)) % 360;
      const lightness = moodEffect === 'Wave'
        ? 0.15 + 0.70 * (Math.sin(normPos * Math.PI * 2 - cycleAngle * 2) * 0.5 + 0.5)
        : 0.5 * effectFactor;
      const rgb = hslToRgb(hue / 360, 0.95, lightness);
      colors.push(rgb);
    } else if (moodPreset === 'Cyberpunk') {
      // Gradient between Cyan (06b6d4) and Pink (ec4899)
      const ratio = moodEffect === 'Wave'
        ? (Math.sin(normPos * Math.PI * 2 - cycleAngle * 2) * 0.5 + 0.5)
        : normPos;
      const factor = moodEffect === 'Wave' ? 1.0 : effectFactor;
      const r = Math.round((236 * ratio + 6 * (1 - ratio)) * factor);
      const g = Math.round((72 * ratio + 182 * (1 - ratio)) * factor);
      const b = Math.round((153 * ratio + 212 * (1 - ratio)) * factor);
      colors.push({ r, g, b });
    } else {
      // Single color presets & Custom color
      const factor = moodEffect === 'Wave'
        ? 0.10 + 0.90 * Math.pow(Math.sin(normPos * Math.PI * 2 - cycleAngle * 2) * 0.5 + 0.5, 2.0)
        : effectFactor;
      colors.push({
        r: Math.round(baseRgb.r * factor),
        g: Math.round(baseRgb.g * factor),
        b: Math.round(baseRgb.b * factor),
      });
    }
  }

  return colors;
}

function getPixelXWeight(index, totalPixels, config) {
  const top = config.topPixels || 58;
  const right = config.rightPixels || 33;
  const bottom = config.bottomPixels || 58;
  const left = config.leftPixels || 33;

  if (index < top) {
    return index / Math.max(1, top - 1);
  } else if (index < top + right) {
    return 1.0;
  } else if (index < top + right + bottom) {
    return 1.0 - (index - (top + right)) / Math.max(1, bottom - 1);
  } else {
    return 0.0;
  }
}

/**
 * Generates reactive Audio Spectrum Visualizer LED colors with Stereo Spatial Mapping
 */
export function sampleAudioRhythmColors(
  totalPixels = 182,
  config = {},
  audioData = {},
) {
  const { bass = 0, mid = 0, treble = 0, volume = 0, left = null, right = null } = audioData;
  const { audioPalette = 'Party', audioStereoMode = true } = config; // 'Party' | 'Neon' | 'Fire' | 'Ocean'

  const colors = [];
  cycleAngle = (cycleAngle + 0.05 * (1 + bass * 2)) % (Math.PI * 2);

  const leftData = left || audioData;
  const rightData = right || audioData;

  for (let i = 0; i < totalPixels; i++) {
    const normPos = i / totalPixels;

    // Stereo Spatial Left/Right Interpolation
    let curBass = bass;
    let curMid = mid;
    let curTreble = treble;
    let curVolume = volume;

    if (audioStereoMode) {
      const xWeight = getPixelXWeight(i, totalPixels, config);
      curBass = leftData.bass * (1 - xWeight) + rightData.bass * xWeight;
      curMid = leftData.mid * (1 - xWeight) + rightData.mid * xWeight;
      curTreble = leftData.treble * (1 - xWeight) + rightData.treble * xWeight;
      curVolume = leftData.volume * (1 - xWeight) + rightData.volume * xWeight;
    }

    let r = 0,
      g = 0,
      b = 0;

    if (audioPalette === 'Fire') {
      // Bass drives intense Red/Orange flame pulses
      const intensity = Math.min(
        1.0,
        curBass * 1.5 + Math.sin(normPos * Math.PI * 4 + cycleAngle) * 0.3,
      );
      r = Math.round(255 * intensity);
      g = Math.round(100 * intensity * curMid);
      b = Math.round(30 * curTreble);
    } else if (audioPalette === 'Ocean') {
      // Deep Blue & Cyan waves driven by Mid and Bass
      const wave = Math.sin(normPos * Math.PI * 6 + cycleAngle) * 0.5 + 0.5;
      r = Math.round(20 * curTreble);
      g = Math.round((100 + 155 * wave) * curMid);
      b = Math.round((180 + 75 * curBass) * (0.4 + wave * 0.6));
    } else if (audioPalette === 'Neon') {
      // Cyberpunk Cyan & Magenta reactive pulses
      const isBassCenter = Math.abs(normPos - 0.5) < curBass * 0.4;
      if (isBassCenter) {
        r = Math.round(255 * curBass);
        g = 0;
        b = Math.round(255 * curBass);
      } else {
        r = 0;
        g = Math.round(230 * curMid);
        b = Math.round(255 * (0.3 + curTreble * 0.7));
      }
    } else {
      // Default 'Party' Rainbow Audio Equalizer
      const hue = (normPos * 360 + cycleAngle * 40) % 360;
      const brightness = 0.2 + curVolume * 0.8;
      const rgb = hslToRgb(hue / 360, 0.95, Math.min(1.0, brightness));
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
    }

    colors.push({ r, g, b });
  }

  return colors;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
