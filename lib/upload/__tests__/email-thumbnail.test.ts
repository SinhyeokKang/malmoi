import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { emailThumbnailPng } from "../email-thumbnail";

/**
 * **초대 메일의 썸네일은 PNG다** (2026-09-28, #140 — 프로덕션 실측). 저장본은 WebP인데 Gmail이 WebP의 알파를 버려 투명 배경이
 * **검게** 채워지고, Gmail iOS에서는 계단처럼 깨졌다. 같은 메일의 로고·Box 글리프(PNG)는 두 클라이언트에서 멀쩡했다.
 * 96 = 타일 32 × 3(iPhone DPR) — 줄여 그리는 쪽만 남아 흐려지지 않는다.
 */
async function webp(width: number, height: number): Promise<Uint8Array> {
  // 가운데만 불투명한 원본 — 투명 영역이 살아 있는지 잰다.
  const base = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const dot = await sharp({ create: { width: Math.floor(width / 2), height: Math.floor(height / 2), channels: 4, background: { r: 59, g: 130, b: 246, alpha: 1 } } }).png().toBuffer();
  return new Uint8Array(await base.composite([{ input: dot, gravity: "center" }]).webp({ lossless: true }).toBuffer());
}

describe("emailThumbnailPng", () => {
  it("정사각 WebP → 96×96 PNG이고 알파가 남는다", async () => {
    const out = await emailThumbnailPng(await webp(128, 128));
    expect(out).not.toBeNull();
    const meta = await sharp(out as Uint8Array).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(["png", 96, 96, true]);
    // 모서리는 투명 그대로다 — 검게 채워지면 이 테스트가 존재할 이유가 사라진다.
    const { data } = await sharp(out as Uint8Array).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    // 가운데는 원본 색이다.
    const center = (48 * 96 + 48) * 4;
    expect(Array.from(data.subarray(center, center + 4))).toEqual([59, 130, 246, 255]);
  });

  it("세로로 긴 원본은 자르지 않고 투명 여백으로 96×96에 들어간다", async () => {
    const out = await emailThumbnailPng(await webp(64, 128));
    const meta = await sharp(out as Uint8Array).metadata();
    expect([meta.width, meta.height]).toEqual([96, 96]);
    const { data } = await sharp(out as Uint8Array).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // 왼쪽 가운데 — 원본(폭 48로 줄어든다) 바깥의 여백이다.
    expect(data[(48 * 96 + 2) * 4 + 3]).toBe(0);
  });

  it("같은 입력은 같은 바이트를 낸다 — CDN 캐시 키 하나에 응답 하나", async () => {
    const input = await webp(128, 128);
    expect(await emailThumbnailPng(input)).toEqual(await emailThumbnailPng(input));
  });

  it("디코드할 수 없는 바이트는 null이다 — 던지지 않는다", async () => {
    await expect(emailThumbnailPng(Uint8Array.of(1, 2, 3, 4))).resolves.toBeNull();
  });
});
