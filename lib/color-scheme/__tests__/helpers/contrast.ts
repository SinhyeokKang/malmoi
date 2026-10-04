import type { Rgb, Rgba } from "./oklch";

/** 알파가 있는 색을 불투명한 바닥 면 위에 합성한다(sRGB 감마 공간 — 브라우저 합성과 같다). */
export function composite(top: Rgba, bottom: Rgb): Rgb {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) };
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG 2.x 대비. 전경에 알파가 있으면 면 위에 합성한 뒤 잰다 — 면 자체가 알파면 호출부가 먼저 그 아래 면에 `composite`한다.
 */
export function contrastRatio(fg: Rgba, bg: Rgb): number {
  const a = luminance(composite(fg, bg));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
