import { describe, it, expect } from 'vitest';
import { getPositionsAndDirections, applyBlankMask } from '../src/lib/services/screenCapture.js';

describe('screenCapture - Geometry & Blank Mask Mapping', () => {
  describe('getPositionsAndDirections', () => {
    it('handles TopLeft Clockwise (Standard default)', () => {
      const { positions, arrayDirections } = getPositionsAndDirections('TopLeft', 'Clockwise');
      expect(positions).toEqual(['Top', 'Right', 'Bottom', 'Left']);
      expect(arrayDirections).toEqual([true, true, false, false]);
    });

    it('handles TopLeft CounterClockwise', () => {
      const { positions, arrayDirections } = getPositionsAndDirections('TopLeft', 'CounterClockwise');
      expect(positions).toEqual(['Left', 'Bottom', 'Right', 'Top']);
      expect(arrayDirections).toEqual([true, true, false, false]);
    });

    it('handles BottomRight Clockwise', () => {
      const { positions, arrayDirections } = getPositionsAndDirections('BottomRight', 'Clockwise');
      expect(positions).toEqual(['Bottom', 'Left', 'Top', 'Right']);
      expect(arrayDirections).toEqual([false, false, true, true]);
    });

    it('handles BottomLeft Clockwise', () => {
      const { positions, arrayDirections } = getPositionsAndDirections('BottomLeft', 'Clockwise');
      expect(positions).toEqual(['Left', 'Top', 'Right', 'Bottom']);
      expect(arrayDirections).toEqual([false, true, true, false]);
    });

    it('handles TopRight Clockwise', () => {
      const { positions, arrayDirections } = getPositionsAndDirections('TopRight', 'Clockwise');
      expect(positions).toEqual(['Right', 'Bottom', 'Left', 'Top']);
      expect(arrayDirections).toEqual([true, false, false, true]);
    });
  });

  describe('applyBlankMask', () => {
    it('masks blanked edges to pure black (0, 0, 0)', () => {
      // 10 Top, 10 Right, 10 Bottom, 10 Left = 40 total LEDs
      const colors = Array.from({ length: 40 }, () => ({ r: 255, g: 255, b: 255 }));
      const config = {
        topPixels: 10,
        rightPixels: 10,
        bottomPixels: 10,
        leftPixels: 10,
        startPoint: 'TopLeft',
        rotationDirection: 'Clockwise',
        bottomBlank: true, // Blackout bottom
        leftBlank: false
      };

      const masked = applyBlankMask(colors, config);
      expect(masked.length).toBe(40);

      // Top (0..9): Unmasked (255, 255, 255)
      expect(masked[0]).toEqual({ r: 255, g: 255, b: 255 });
      // Right (10..19): Unmasked (255, 255, 255)
      expect(masked[15]).toEqual({ r: 255, g: 255, b: 255 });
      // Bottom (20..29): Masked to Black (0, 0, 0)
      expect(masked[20]).toEqual({ r: 0, g: 0, b: 0 });
      expect(masked[29]).toEqual({ r: 0, g: 0, b: 0 });
      // Left (30..39): Unmasked (255, 255, 255)
      expect(masked[35]).toEqual({ r: 255, g: 255, b: 255 });
    });
  });
});
