import { useMemo } from 'react';
import { useSettingsStore } from '../store/settings';
import { mixColor } from './utils';

export type MaterialLevel = 'thin' | 'regular' | 'thick';

export interface MaterialSpec {
  blurIntensity: number;
  overlay: string;
  border: string;
  bottomBorder: string;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
}

const darkMaterial: Record<MaterialLevel, MaterialSpec> = {
  thin: { blurIntensity: 35, overlay: 'rgba(16,18,26,0.14)', border: 'rgba(255,255,255,0.10)', bottomBorder: 'rgba(255,255,255,0.07)', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 8 },
  regular: { blurIntensity: 55, overlay: 'rgba(16,18,26,0.22)', border: 'rgba(255,255,255,0.12)', bottomBorder: 'rgba(255,255,255,0.08)', shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 12 },
  thick: { blurIntensity: 78, overlay: 'rgba(16,18,26,0.44)', border: 'rgba(255,255,255,0.20)', bottomBorder: 'rgba(255,255,255,0.16)', shadowColor: '#000000', shadowOpacity: 0.32, shadowRadius: 18 },
};

const lightMaterial: Record<MaterialLevel, MaterialSpec> = {
  thin: { blurIntensity: 35, overlay: 'rgba(255,255,255,0.18)', border: 'rgba(0,0,0,0.06)', bottomBorder: 'rgba(0,0,0,0.05)', shadowColor: '#8A7CFA', shadowOpacity: 0.10, shadowRadius: 8 },
  regular: { blurIntensity: 55, overlay: 'rgba(255,255,255,0.28)', border: 'rgba(0,0,0,0.08)', bottomBorder: 'rgba(0,0,0,0.06)', shadowColor: '#8A7CFA', shadowOpacity: 0.14, shadowRadius: 12 },
  thick: { blurIntensity: 78, overlay: 'rgba(255,255,255,0.55)', border: 'rgba(0,0,0,0.16)', bottomBorder: 'rgba(0,0,0,0.12)', shadowColor: '#8A7CFA', shadowOpacity: 0.18, shadowRadius: 18 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function useMaterial(level: MaterialLevel = 'regular'): MaterialSpec {
  const themeValue = useSettingsStore((s) => s.themeValue);
  return useMemo(() => {
    const d = darkMaterial[level];
    const l = lightMaterial[level];
    return {
      blurIntensity: lerp(d.blurIntensity, l.blurIntensity, themeValue),
      overlay: mixColor(d.overlay, l.overlay, themeValue),
      border: mixColor(d.border, l.border, themeValue),
      bottomBorder: mixColor(d.bottomBorder, l.bottomBorder, themeValue),
      shadowColor: mixColor(d.shadowColor, l.shadowColor, themeValue),
      shadowOpacity: lerp(d.shadowOpacity, l.shadowOpacity, themeValue),
      shadowRadius: lerp(d.shadowRadius, l.shadowRadius, themeValue),
    };
  }, [level, themeValue]);
}

// Modal/overlay scrim — same across themes, tinted toward bg hue instead of flat black.
export const scrim = 'rgba(8, 8, 14, 0.55)';
