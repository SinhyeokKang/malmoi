import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { normalizeImage } from "../normalize";

afterEach(() => vi.restoreAllMocks());

it.each([[768, 384, 192, 96], [384, 768, 96, 192], [40, 20, 40, 20]])(
  "%i×%i 이미지를 자르거나 확대하지 않고 %i×%i WebP로 저장한다",
  async (width, height, expectedWidth, expectedHeight) => {
    const input = await sharp({ create: { width, height, channels: 4, background: "#ff000080" } }).png().toBuffer();
    const result = await normalizeImage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(await sharp(result.bytes).metadata()).toMatchObject({ format: "webp", width: expectedWidth, height: expectedHeight, hasAlpha: true });
    const { data, info } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(128);
  },
);

it("JPEG의 EXIF 방향을 반영하고 메타데이터는 제거한다", async () => {
  const input = await sharp({ create: { width: 384, height: 192, channels: 3, background: "red" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await normalizeImage(input);
  if (!result.ok) throw new Error(result.reason);
  const meta = await sharp(result.bytes).metadata();
  expect(meta).toMatchObject({ format: "webp", width: 96, height: 192 });
  expect(meta.exif).toBeUndefined();
  expect(meta.icc).toBeUndefined();
  expect(meta.orientation).toBeUndefined();
});

it("빈 파일·3MB 초과·위장 SVG·손상 PNG를 사유로 거부한다", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await normalizeImage(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
  expect(await normalizeImage(new Uint8Array(3_000_001))).toEqual({ ok: false, reason: "too-large" });
  expect(await normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).toEqual({ ok: false, reason: "unsupported-type" });
  expect(await normalizeImage(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10))).toEqual({ ok: false, reason: "unsupported-type" });
  // 시그니처 판정에서 걸린 둘은 sharp에 닿지도 않으므로 장애 로그가 아니다.
  expect(logged).toHaveBeenCalledTimes(1);
});

/**
 * ⚠️ **픽셀 초과는 형식 문제가 아니다.** 한 사유로 뭉개면 정상 PNG를 올린 사람이 "PNG나 JPEG가
 * 아니다"를 받고 다른 사진을 고르는 헛수고를 한다 — 파일은 멀쩡하고 치수만 크다.
 */
it("압축 크기가 작아도 과도한 입력 픽셀은 치수 사유로 거부한다", async () => {
  const input = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "red" } }).png().toBuffer();
  expect(input.length).toBeLessThan(3_000_000);
  // 상한을 끄면 실제로 디코드되는 유효한 이미지여야 이 테스트가 치수만 재는 것이 된다.
  await expect(sharp(input, { limitInputPixels: false }).resize(1, 1).toBuffer()).resolves.toBeInstanceOf(Buffer);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await normalizeImage(input)).toEqual({ ok: false, reason: "too-many-pixels" });
  // 사용자 입력에 대한 정당한 거부지 장애가 아니다 — 로그를 남기면 진짜 장애가 묻힌다.
  expect(logged).not.toHaveBeenCalled();
});

/**
 * ⚠️ **거부가 값으로 돌아오므로 action의 `stage` 로그가 안 탄다** — 여기서 안 남기면 sharp 계열
 * 실패가 Vercel 로그에 한 줄도 안 남는다 (POSTMORTEM 2026-09-13: "catch는 실패 단계도 남기지 않았다").
 */
it("디코드 실패는 사유를 값으로 주면서 로그를 남긴다", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const truncated = (await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).png().toBuffer()).subarray(0, 64);
  expect(await normalizeImage(truncated)).toEqual({ ok: false, reason: "unsupported-type" });
  expect(logged).toHaveBeenCalledExactlyOnceWith("Image normalization failed.", { stage: "decode" });
});
