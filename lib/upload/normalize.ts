import "server-only";
import sharp from "sharp";
import { planImageUpload, type UploadReject } from "./image";

/**
 * ⚠️ **파일 크기 상한이 디코더 메모리를 묶지 못한다** — 압축률이 높은 PNG 하나가 3MB 안에서도
 * 수천만 픽셀이 된다. `IMAGE_MAX_BYTES`와 별개의 축이라 값을 하나로 합치지 않는다.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * 인가·저장소·DB에 닿지 않는 bytes → bytes 변환이라 아바타 밖(프로젝트 이미지 등)에서도 그대로
 * 쓰인다. 누가 올렸는가는 호출자가 판정한다.
 */
export async function normalizeImage(bytes: Uint8Array): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; reason: UploadReject }
> {
  const plan = planImageUpload(bytes);
  if (!plan.ok) return plan;
  try {
    /*
     * ⚠️ **치수를 헤더에서 먼저 잰다.** 파이프라인의 `limitInputPixels`가 던지게 두면 그 실패가
     * 디코드 실패와 같은 catch로 들어와 사유를 가를 수 없고, 가르려고 sharp의 오류 메시지
     * ("Input image exceeds pixel limit")를 읽으면 버전이 올라갈 때 조용히 깨진다.
     * `metadata()`는 헤더만 읽으므로 상한을 꺼도 픽셀을 디코드하지 않는다.
     */
    const { width = 0, height = 0 } = await sharp(bytes, { limitInputPixels: false }).metadata();
    if (width * height > MAX_INPUT_PIXELS) return { ok: false, reason: "too-many-pixels" };
    // 상한은 그대로 건다 — 위 판정이 헤더를 믿는 만큼, 헤더가 거짓인 파일의 방어선이 남아야 한다.
    const output = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .autoOrient()
      .resize({ width: 192, height: 192, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    // sharp가 메타데이터를 기본으로 버린다 — 방향은 위에서 이미 픽셀에 반영했다.
    return { ok: true, bytes: output };
  } catch {
    /*
     * ⚠️ **거부를 값으로 돌려주므로 호출자의 `stage` 로그가 안 탄다** — 여기서 안 남기면 sharp
     * 계열 실패가 로그에 한 줄도 안 남고, 모든 사용자가 "형식이 잘못됐다"만 보게 된다
     * (POSTMORTEM 2026-09-13: "Action과 스모크의 catch는 실패 단계도 남기지 않았다").
     * 오류 원문은 남기지 않는다 — 남의 라이브러리 메시지를 로그에 싣지 않는 규칙이 같다.
     */
    console.error("Image normalization failed.", { stage: "decode" });
    return { ok: false, reason: "unsupported-type" };
  }
}
