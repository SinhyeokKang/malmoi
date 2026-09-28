import "server-only";
import sharp from "sharp";

/**
 * **초대 메일에 싣는 썸네일** — 저장본(WebP, 192 이내 · `normalizeImage`)을 96×96 PNG로 바꾼다 (2026-09-28, #140).
 *
 * ⚠️ **메일 클라이언트가 WebP를 제대로 못 그린다** — Gmail은 WebP의 알파를 버려 투명 배경을 검게 채웠고, Gmail iOS는 계단처럼
 * 깨뜨렸다(프로덕션 실측). 같은 메일의 로고·Box 글리프는 PNG라 멀쩡했다. 앱 화면은 WebP 그대로다 — 이 변환은 메일 전용이다.
 * 96 = 타일 32 × 3(iPhone DPR). 자르지 않고(`contain`) 투명 여백으로 정사각을 채운다 — 타일이 radius만 건다.
 *
 * ⚠️ 입력은 이미 정규화된 작은 저장본이지만 상한은 건다 — 저장소의 바이트를 믿지 않는 쪽이 싸다.
 */
const SIZE = 96;
const MAX_INPUT_PIXELS = 1_000_000;

export async function emailThumbnailPng(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const output = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: SIZE, height: SIZE, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return new Uint8Array(output);
  } catch {
    // 오류 원문은 남기지 않는다 — `normalizeImage`와 같은 규칙.
    console.error("Email thumbnail conversion failed.", { stage: "decode" });
    return null;
  }
}
