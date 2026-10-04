/** 대비 검사의 색 표현 — 채널은 0–255(소수 허용), 알파는 0–1. */
export type Rgb = { r: number; g: number; b: number };
export type Rgba = Rgb & { a: number };

const clamp = (v: number) => Math.min(255, Math.max(0, v));

/** sRGB 전달 함수(선형 → 감마). */
function encode(linear: number): number {
  const abs = Math.abs(linear);
  const v = abs <= 0.0031308 ? 12.92 * abs : 1.055 * abs ** (1 / 2.4) - 0.055;
  return Math.sign(linear) * v;
}

/**
 * CSS Color 4의 OKLCh → sRGB. ⚠️ **색역 밖은 채널을 0–255로 자른다** — 브라우저의 gamut mapping과 다를 수 있으나
 * 대비 판정에서 그 차이는 무시할 만하다. 결과는 반올림한 정수 채널이다(브라우저가 칠하는 값과 같은 단위).
 */
export function oklchToSrgb(l: number, c: number, hDegrees: number): Rgb {
  const h = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  const to255 = (v: number) => Math.round(clamp(encode(v) * 255));
  return { r: to255(lr), g: to255(lg), b: to255(lb) };
}

function hslToSrgb(h: number, s: number, l: number): Rgb {
  // CSS Color 4 §7.1 hslToRgb — s·l은 0–1.
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

const num = (raw: string) => (raw === "none" ? 0 : raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw));

/** `a b c` 또는 `a, b, c` 와 선택적 `/ alpha` — 함수 괄호 안. */
function channels(body: string): { parts: string[]; alpha: number } {
  const [main = "", alpha] = body.split("/");
  return { parts: main.trim().split(/[\s,]+/).filter(Boolean), alpha: alpha === undefined ? 1 : num(alpha.trim()) };
}

/**
 * 리터럴 색 하나를 푼다 — `hsl()` · `rgb()` · `#hex` · `oklch()`. 색이 아니거나 이 함수가 모르는 형(`var(`·`color-mix(` 등)이면 `null`이다
 * (그 형은 `readThemeTokens`가 먼저 풀어 넘긴다).
 */
export function parseColor(raw: string): Rgba | null {
  const value = raw.trim();
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hexMatch) {
    const digits = hexMatch[1]!;
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
    return { r: Number.parseInt(full.slice(0, 2), 16), g: Number.parseInt(full.slice(2, 4), 16), b: Number.parseInt(full.slice(4, 6), 16), a: 1 };
  }
  const fn = /^(rgba?|hsla?|oklch)\(([^()]*)\)$/i.exec(value);
  if (!fn) return null;
  const name = fn[1]!.toLowerCase();
  const { parts, alpha } = channels(fn[2]!);
  if (parts.length !== 3) return null;
  const [p0, p1, p2] = parts as [string, string, string];
  if (name.startsWith("rgb")) {
    const ch = (p: string) => (p.endsWith("%") ? num(p) * 255 : Number.parseFloat(p));
    return { r: ch(p0), g: ch(p1), b: ch(p2), a: alpha };
  }
  if (name.startsWith("hsl")) return { ...hslToSrgb(Number.parseFloat(p0), num(p1), num(p2)), a: alpha };
  return { ...oklchToSrgb(num(p0), num(p1), p2 === "none" ? 0 : Number.parseFloat(p2)), a: alpha };
}
