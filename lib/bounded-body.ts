/**
 * **외부 진입점의 본문을 상한 안에서만 읽는다** (audit #76).
 *
 * ⚠️ **`request.json()`·`text()`를 먼저 부르지 않는다** — 둘 다 끝까지 버퍼링한 뒤에야 크기를 알 수 있어,
 * 상한 검사가 그 뒤에 서면 메모리는 이미 다 쓴 뒤다. 선언된 `content-length`는 읽기 전에 보고,
 * 선언이 없거나(chunked) 거짓인 스트림은 누적 바이트로 도중에 끊는다 — 선언은 호출자가 쓰는 값이라 믿지 않는다.
 *
 * `null`이 "상한 초과"다. 인증 뒤에 부르는 것이 전제다 — 무효 토큰 하나로 본문을 읽히지 않는다.
 */
export async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) return null;
  if (request.body === null) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // 나머지를 받지 않는다 — 스트림을 닫아야 업스트림도 보내기를 멈춘다.
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
