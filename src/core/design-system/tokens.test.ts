/**
 * The WCAG AA floor from ARCHITECTURE.md §2.4, as arithmetic rather than as a comment.
 *
 * This is the test that matters most in the token module, because open decision 5 is still
 * unanswered: the clamp is implemented on the strength of §2.4 alone. If design later
 * waives AA, this test is what makes the waiver a deliberate, visible edit instead of a
 * value quietly drifting back under the floor.
 */

import { color } from './tokens';

const CHANNEL = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const luminance = ([r, g, b]: readonly [number, number, number]): number =>
  0.2126 * CHANNEL(r) + 0.7152 * CHANNEL(g) + 0.0722 * CHANNEL(b);

const parseHex = (hex: string): readonly [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const parseRgba = (value: string): { rgb: readonly [number, number, number]; alpha: number } => {
  const parts = value
    .replace(/rgba?[(]|[)]/g, '')
    .split(',')
    .map((part) => Number(part.trim()));
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return { rgb: [r, g, b], alpha: a };
};

const composite = (
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
  alpha: number,
): readonly [number, number, number] => [
  fg[0] * alpha + bg[0] * (1 - alpha),
  fg[1] * alpha + bg[1] * (1 - alpha),
  fg[2] * alpha + bg[2] * (1 - alpha),
];

const contrast = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
};

const ratioOn = (foreground: string, background: string): number => {
  const bg = parseHex(background);
  const { rgb, alpha } = foreground.startsWith('#')
    ? { rgb: parseHex(foreground), alpha: 1 }
    : parseRgba(foreground);
  return contrast(composite(rgb, bg, alpha), bg);
};

const SURFACES = {
  backdrop: color.backdrop,
  surface: color.surface,
  raised: color.raised,
};

describe('text tokens clear WCAG AA on every surface', () => {
  for (const [toneName, tone] of Object.entries(color.text)) {
    for (const [surfaceName, surface] of Object.entries(SURFACES)) {
      it(`text.${toneName} on ${surfaceName}`, () => {
        expect(ratioOn(tone, surface)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('the accents are readable too', () => {
  it('accent on surface', () => {
    expect(ratioOn(color.accent, color.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('negative on surface — the delta colour', () => {
    expect(ratioOn(color.negative, color.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('onAccent against the accent it sits on', () => {
    expect(ratioOn(color.onAccent, color.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('decorative tokens are exempt, and stay out of the text group', () => {
  it('holds the sub-floor values the design uses for hairlines and tracks', () => {
    // If one of these ever clears 4.5:1 it is probably being used as text, and belongs in
    // `color.text` where the floor applies.
    const decorative = Object.values(color.decorative);
    expect(decorative.length).toBeGreaterThan(0);
    for (const value of decorative) {
      expect(ratioOn(value, color.surface)).toBeLessThan(4.5);
    }
  });
});
