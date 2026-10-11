/**
 * **Release 본문에 셀프 호스팅 이미지 줄을 기입한다** (image-publish-workflow design §2.4) — `/merge` 9-b가 부른다.
 *
 * ⚠️ **import가 없고 지울 수 있는 타입만 쓴다** — 9-b가 `pnpm`·tsx 없이 `node scripts/release-image-note.ts`로 바로 돌린다(Node 24의 타입 제거).
 * `enum`·`namespace`·매개변수 속성은 못 쓴다. tsconfig에 `erasableSyntaxOnly`가 없어 typecheck가 못 잡으니 CLI를 실제로 spawn하는 테스트가 게이트다.
 */

const REF_RE = /^ghcr\.io\/sinhyeokkang\/malmoi:v\d+\.\d+\.\d+$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const LABEL = "**Self-hosting image:**";
const TAIL_LABEL = "**Full changelog:**";

/** 줄 끝은 `\n`, 끝 개행은 하나(빈 본문은 빈 문자열) — "바뀌었나" 비교의 기준이기도 하다. */
function normalize(body: string): string {
  const text = body.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return text === "" ? "" : `${text}\n`;
}

export function withImageLine(body: string, image: { ref: string; digest: string }): string {
  if (!REF_RE.test(image.ref)) throw new Error("invalid image ref");
  if (!DIGEST_RE.test(image.digest)) throw new Error("invalid image digest");
  const line = `${LABEL} \`${image.ref}@${image.digest}\``;
  const text = normalize(body).replace(/\n$/, "");

  // 같은 라벨의 문단이 이미 있으면(손으로 썼거나 재실행) 제자리에서 교체한다 — 문단 = 빈 줄까지.
  const existing = /(^|\n\n)\*\*Self-hosting image:\*\*[^\n]*(\n[^\n]+)*/.exec(text);
  if (existing !== null) {
    const start = existing.index + existing[1]!.length;
    return `${text.slice(0, start)}${line}${text.slice(existing.index + existing[0].length)}\n`;
  }

  if (text === "") return `${line}\n`;
  const split = text.lastIndexOf("\n\n");
  const last = split === -1 ? text : text.slice(split + 2);
  if (last.startsWith(TAIL_LABEL)) {
    const head = split === -1 ? "" : text.slice(0, split + 2);
    return `${head}${line}\n\n${last}\n`;
  }
  return `${text}\n\n${line}\n`;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** exit 0 = stdout이 새 본문 · 3 = 바뀔 것 없음 · 2 = 입력·인자 오류. exit 0인데 stdout이 빈 경우는 없다(빈 본문으로 Release를 덮는 길을 막는다). */
async function main(): Promise<number> {
  const [ref, digest, ...rest] = process.argv.slice(2);
  if (ref === undefined || digest === undefined || rest.length > 0) {
    console.error("usage: release-image-note.ts <ref> <digest> < release.json");
    return 2;
  }
  let body: string;
  try {
    // `gh release view --json body`의 JSON을 받는다 — `-q .body`는 gh가 끝 개행을 하나 더 붙여 비교가 매번 "다름"이 된다.
    const parsed: unknown = JSON.parse(await readStdin());
    const value = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)["body"] : undefined;
    if (value === null) body = "";
    else if (typeof value === "string") body = value;
    else throw new Error("body must be a string or null");
  } catch (e) {
    console.error(`release-image-note: ${e instanceof Error ? e.message : "bad input"}`);
    return 2;
  }
  let next: string;
  try {
    next = withImageLine(body, { ref, digest });
  } catch (e) {
    console.error(`release-image-note: ${e instanceof Error ? e.message : "bad args"}`);
    return 2;
  }
  if (next === normalize(body)) return 3;
  process.stdout.write(next);
  return 0;
}

if (import.meta.main) process.exitCode = await main();
