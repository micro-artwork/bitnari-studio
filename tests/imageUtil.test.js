import { describe, it, expect } from 'vitest';
import {
  GammaRgb,
  applyGammaCorrection,
  applyPowerManagement,
  enhanceSaturation,
  lerpColors
} from '../src/lib/utils/imageUtil.js';

describe('imageUtil - Color Science & Power Management', () => {
  describe('GammaRgb', () => {
    it('creates identity lookup table for gamma = 1.0', () => {
      const table = GammaRgb.createTable(1.0, 1.0, 1.0);
      expect(table.r.length).toBe(256);
      expect(table.r[0]).toBe(0);
      expect(table.r[128]).toBe(128);
      expect(table.r[255]).toBe(255);
    });

    it('creates non-linear monotonic curve for gamma = 2.2', () => {
      const table = GammaRgb.createTable(2.2, 2.2, 2.2);
      expect(table.r[0]).toBe(0);
      expect(table.r[255]).toBe(255);
      // For gamma 2.2, mid-tones (128) should be brighter after gamma expansion (pow(128/255, 1/2.2) * 255 ≈ 186)
      expect(table.r[128]).toBeGreaterThan(128);
      // Monotonic check
      for (let i = 1; i < 256; i++) {
        expect(table.r[i]).toBeGreaterThanOrEqual(table.r[i - 1]);
      }
    });

    it('applies per-channel gamma correction correctly', () => {
      const table = GammaRgb.createTable(1.0, 2.0, 1.0);
      const input = [{ r: 100, g: 100, b: 100 }];
      const output = applyGammaCorrection(input, table);
      expect(output[0].r).toBe(100);
      expect(output[0].g).toBeGreaterThan(100);
      expect(output[0].b).toBe(100);
    });
  });

  describe('enhanceSaturation', () => {
    it('returns unmodified RGB for boostFactor = 1.0', () => {
      const result = enhanceSaturation(200, 100, 50, 1.0);
      expect(result.r).toBeCloseTo(200, -1);
      expect(result.g).toBeCloseTo(100, -1);
      expect(result.b).toBeCloseTo(50, -1);
    });

    it('boosts saturation without exceeding 0-255 bounds', () => {
      const result = enhanceSaturation(200, 150, 100, 2.5);
      expect(result.r).toBeGreaterThanOrEqual(0);
      expect(result.r).toBeLessThanOrEqual(255);
      expect(result.g).toBeGreaterThanOrEqual(0);
      expect(result.g).toBeLessThanOrEqual(255);
      expect(result.b).toBeGreaterThanOrEqual(0);
      expect(result.b).toBeLessThanOrEqual(255);
    });

    it('handles object input format { r, g, b }', () => {
      const result = enhanceSaturation({ r: 255, g: 0, b: 0 }, 1.5);
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });
  });

  describe('applyPowerManagement', () => {
    it('scales brightness proportionally in Static mode', () => {
      const colors = [
        { r: 200, g: 100, b: 50 },
        { r: 100, g: 50, b: 0 }
      ];
      const result = applyPowerManagement(colors, { powerMode: 'Static', brightnessPercent: 50 });
      expect(result[0]).toEqual({ r: 100, g: 50, b: 25 });
      expect(result[1]).toEqual({ r: 50, g: 25, b: 0 });
    });

    it('caps maximum power in Adaptive mode when wattage exceeds limit', () => {
      // 100 full-white LEDs: at 0.08W/channel = 0.24W per LED -> 24W total
      const colors = Array.from({ length: 100 }, () => ({ r: 255, g: 255, b: 255 }));
      const result = applyPowerManagement(colors, {
        powerMode: 'Adaptive',
        adaptiveMaxPowerW: 12, // Cap at 12W (half of 24W)
        redMaxPowerW: 0.08,
        greenMaxPowerW: 0.08,
        blueMaxPowerW: 0.08
      });

      // Scaling factor should be 12 / 24 = 0.5 -> 255 * 0.5 ≈ 127
      expect(result[0].r).toBeCloseTo(127, -1);
      expect(result[0].g).toBeCloseTo(127, -1);
      expect(result[0].b).toBeCloseTo(127, -1);
    });

    it('does not reduce brightness if power is within Adaptive limit', () => {
      const colors = Array.from({ length: 10 }, () => ({ r: 100, g: 100, b: 100 }));
      const result = applyPowerManagement(colors, {
        powerMode: 'Adaptive',
        adaptiveMaxPowerW: 50, // Far above draw
        redMaxPowerW: 0.08,
        greenMaxPowerW: 0.08,
        blueMaxPowerW: 0.08
      });
      expect(result[0]).toEqual({ r: 100, g: 100, b: 100 });
    });
  });

  describe('lerpColors (EMA Frame Interpolation)', () => {
    it('smooths color transition between frames with given factor', () => {
      const prev = [{ r: 0, g: 0, b: 0 }];
      const curr = [{ r: 100, g: 200, b: 50 }];
      const lerped = lerpColors(prev, curr, 0.5);
      expect(lerped[0]).toEqual({ r: 50, g: 100, b: 25 });
    });

    it('returns current colors if previous array length mismatches', () => {
      const prev = [];
      const curr = [{ r: 100, g: 100, b: 100 }];
      const lerped = lerpColors(prev, curr, 0.5);
      expect(lerped).toEqual([{ r: 100, g: 100, b: 100 }]);
    });
  });
});
