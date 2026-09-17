import sharp from "sharp";
import { expect, it } from "vitest";
import { normalizeImage } from "../normalize";

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
  expect(await normalizeImage(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
  expect(await normalizeImage(new Uint8Array(3_000_001))).toEqual({ ok: false, reason: "too-large" });
  expect(await normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).toEqual({ ok: false, reason: "unsupported-type" });
  expect(await normalizeImage(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10))).toEqual({ ok: false, reason: "unsupported-type" });
});

it("압축 크기가 작아도 과도한 입력 픽셀은 거부한다", async () => {
  const input = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "red" } }).png().toBuffer();
  expect(input.length).toBeLessThan(3_000_000);
  // A valid oversized image must decode when the pixel guard is explicitly disabled.
  await expect(sharp(input, { limitInputPixels: false }).resize(1, 1).toBuffer()).resolves.toBeInstanceOf(Buffer);
  expect(await normalizeImage(input)).toEqual({ ok: false, reason: "unsupported-type" });
});
