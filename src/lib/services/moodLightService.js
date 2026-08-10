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

  // Calculate Breathing intensity multiplier (0.35 to 1.0)
  const breathFactor =
    moodEffect === 'Breathing'
      ? 0.35 + 0.65 * ((Math.sin(cycleAngle) + 1) / 2)
      : 1.0;

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
    if (moodEffect === 'RainbowCycle' || moodPreset === 'Rainbow') {
      const hue = ((i / totalPixels) * 360 + cycleAngle * 50) % 360;
      const rgb = hslToRgb(hue / 360, 0.95, 0.5 * breathFactor);
      colors.push(rgb);
    } else if (moodPreset === 'Cyberpunk') {
      // Gradient between Cyan (06b6d4) and Pink (ec4899)
      const ratio = i / totalPixels;
      const r = Math.round((236 * ratio + 6 * (1 - ratio)) * breathFactor);
      const g = Math.round((72 * ratio + 182 * (1 - ratio)) * breathFactor);
      const b = Math.round((153 * ratio + 212 * (1 - ratio)) * breathFactor);
      colors.push({ r, g, b });
    } else {
      colors.push({
        r: Math.round(baseRgb.r * breathFactor),
        g: Math.round(baseRgb.g * breathFactor),
        b: Math.round(baseRgb.b * breathFactor),
      });
    }
  }

  return colors;
}

/**
 * Generates reactive Audio Spectrum Visualizer LED colors
 */
export function sampleAudioRhythmColors(
  totalPixels = 182,
  config = {},
  audioData = {},
) {
  const { bass = 0, mid = 0, treble = 0, volume = 0 } = audioData;
  const { audioPalette = 'Party' } = config; // 'Party' | 'Neon' | 'Fire' | 'Ocean'

  const colors = [];
  cycleAngle = (cycleAngle + 0.05 * (1 + bass * 2)) % (Math.PI * 2);

  for (let i = 0; i < totalPixels; i++) {
    const normPos = i / totalPixels;

    let r = 0,
      g = 0,
      b = 0;

    if (audioPalette === 'Fire') {
      // Bass drives intense Red/Orange flame pulses
      const intensity = Math.min(
        1.0,
        bass * 1.5 + Math.sin(normPos * Math.PI * 4 + cycleAngle) * 0.3,
      );
      r = Math.round(255 * intensity);
      g = Math.round(100 * intensity * mid);
      b = Math.round(30 * treble);
    } else if (audioPalette === 'Ocean') {
      // Deep Blue & Cyan waves driven by Mid and Bass
      const wave = Math.sin(normPos * Math.PI * 6 + cycleAngle) * 0.5 + 0.5;
      r = Math.round(20 * treble);
      g = Math.round((100 + 155 * wave) * mid);
      b = Math.round((180 + 75 * bass) * (0.4 + wave * 0.6));
    } else if (audioPalette === 'Neon') {
      // Cyberpunk Cyan & Magenta reactive pulses
      const isBassCenter = Math.abs(normPos - 0.5) < bass * 0.4;
      if (isBassCenter) {
        r = Math.round(255 * bass);
        g = 0;
        b = Math.round(255 * bass);
      } else {
        r = 0;
        g = Math.round(230 * mid);
        b = Math.round(255 * (0.3 + treble * 0.7));
      }
    } else {
      // Default 'Party' Rainbow Audio Equalizer
      const hue = (normPos * 360 + cycleAngle * 40) % 360;
      const brightness = 0.2 + volume * 0.8;
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
