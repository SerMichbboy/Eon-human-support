/** Appends an alpha channel to a `#rrggbb` hex color. `opacity` is 0-1. */
export function alpha(hex: string, opacity: number): string {
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

interface Rgba { r: number; g: number; b: number; a: number }

function parseColor(input: string): Rgba {
  const hex = input.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (hex) {
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
      a: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
    };
  }
  const rgba = input.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (rgba) {
    return {
      r: parseFloat(rgba[1]),
      g: parseFloat(rgba[2]),
      b: parseFloat(rgba[3]),
      a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Linearly interpolates between two colors (hex or rgba() strings). `t` is 0-1, clamped. */
export function mixColor(colorA: string, colorB: string, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const a = parseColor(colorA);
  const b = parseColor(colorB);
  const r = Math.round(lerp(a.r, b.r, c));
  const g = Math.round(lerp(a.g, b.g, c));
  const bl = Math.round(lerp(a.b, b.b, c));
  const al = lerp(a.a, b.a, c);
  return `rgba(${r}, ${g}, ${bl}, ${al})`;
}
