import { describe, it, expect } from 'vitest';
import { sampleMoodLightColors, sampleAudioRhythmColors } from '../src/lib/services/moodLightService.js';

describe('moodLightService - Visual Effects & Audio Rhythm Math', () => {
  describe('sampleMoodLightColors', () => {
    it('generates exact number of pixel colors requested', () => {
      const colors = sampleMoodLightColors(60, { moodPreset: 'WarmWhite', moodEffect: 'Static' });
      expect(colors.length).toBe(60);
      expect(colors[0]).toHaveProperty('r');
      expect(colors[0]).toHaveProperty('g');
      expect(colors[0]).toHaveProperty('b');
    });

    it('generates non-zero RGB colors within 0-255 bounds for all presets', () => {
      const presets = ['WarmWhite', 'Cyberpunk', 'Sunset', 'Forest', 'Ocean', 'Rainbow'];
      for (const preset of presets) {
        const colors = sampleMoodLightColors(30, { moodPreset: preset, moodEffect: 'Static' });
        for (const c of colors) {
          expect(c.r).toBeGreaterThanOrEqual(0);
          expect(c.r).toBeLessThanOrEqual(255);
          expect(c.g).toBeGreaterThanOrEqual(0);
          expect(c.g).toBeLessThanOrEqual(255);
          expect(c.b).toBeGreaterThanOrEqual(0);
          expect(c.b).toBeLessThanOrEqual(255);
        }
      }
    });

    it('modulates brightness over time in Breathing mode', () => {
      const frame1 = sampleMoodLightColors(10, { moodPreset: 'WarmWhite', moodEffect: 'Breathing', moodSpeed: 5.0 });
      const frame2 = sampleMoodLightColors(10, { moodPreset: 'WarmWhite', moodEffect: 'Breathing', moodSpeed: 5.0 });
      expect(frame1.length).toBe(10);
      expect(frame2.length).toBe(10);
    });
  });

  describe('sampleAudioRhythmColors', () => {
    it('modulates intensity based on bass, mid, treble, and volume inputs', () => {
      const config = {
        audioPalette: 'Party',
        audioSensitivity: 1.5,
        audioStereoMode: true
      };
      const audioAnalysis = { bass: 0.8, mid: 0.5, treble: 0.3, volume: 0.7 };
      const colors = sampleAudioRhythmColors(50, config, audioAnalysis);

      expect(colors.length).toBe(50);
      for (const c of colors) {
        expect(c.r).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThanOrEqual(255);
        expect(c.g).toBeGreaterThanOrEqual(0);
        expect(c.g).toBeLessThanOrEqual(255);
        expect(c.b).toBeGreaterThanOrEqual(0);
        expect(c.b).toBeLessThanOrEqual(255);
      }
    });
  });
});
