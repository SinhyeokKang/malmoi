/**
 * **Release 본문에 셀프 호스팅 이미지 줄을 기입한다** (image-publish-workflow design §2.4) — `/merge` 9-b가 부른다.
 *
 * ⚠️ **import가 없고 지울 수 있는 타입만 쓴다** — 9-b가 `pnpm`·tsx 없이 `node scripts/release-image-note.ts`로 바로 돌린다(Node 24의 타입 제거).
 * `enum`·`namespace`·매개변수 속성은 못 쓴다. tsconfig에 `erasableSyntaxOnly`가 없어 typecheck가 못 잡으니 CLI를 실제로 spawn하는 테스트가 게이트다.
 */

const REF_RE = /^ghcr\.io\/sinhyeokkang\/malmoi:v\d+\.\d+\.\d+$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const LABEL = "**Self-hosting image:**";
// 안쪽 공백이 낀 `**Full changelog: **`는 CommonMark에서 strong이 아니라 mdast도 걷지 않는다 — 정확히 이 꼴만 꼬리다.
const TAIL_RE = /^\*\*Full changelog:\*\*/;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;

/** 줄 끝은 `\n`, 끝 개행은 하나(빈 본문은 빈 문자열) — "바뀌었나" 비교의 기준이기도 하다. 끝의 공백 줄도 벗긴다(mdast가 그 줄을 문단으로 보지 않는다). */
function normalize(body: string): string {
  const text = body.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  return text === "" ? "" : `${text}\n`;
}

/** 줄마다 "코드 펜스 안(여닫는 줄 포함)인가" — 펜스 안의 빈 줄·라벨·꼬리는 마크다운 구조가 아니다. */
function fenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let open: string | null = null;
  for (const l of lines) {
    if (open === null) {
      const m = FENCE_OPEN_RE.exec(l);
      if (m === null) {
        mask.push(false);
      } else {
        open = m[1]!;
        mask.push(true);
      }
    } else {
      mask.push(true);
      const t = l.trim();
      if (t.length >= open.length && t.split("").every((c) => c === open![0])) open = null;
    }
  }
  return mask;
}

const isBlank = (l: string): boolean => /^[ \t]*$/.test(l);

export function withImageLine(body: string, image: { ref: string; digest: string }): string {
  if (!REF_RE.test(image.ref)) throw new Error("invalid image ref");
  if (!DIGEST_RE.test(image.digest)) throw new Error("invalid image digest");
  const line = `${LABEL} \`${image.ref}@${image.digest}\``;
  const text = normalize(body).replace(/\n$/, "");
  if (text === "") return `${line}\n`;
  const lines = text.split("\n");
  const fenced = fenceMask(lines);
  const boundary = (i: number): boolean => !fenced[i] && isBlank(lines[i]!);

  // 같은 라벨의 문단이 이미 있으면(손으로 썼거나 재실행) 제자리에서 교체한다 — 문단은 빈 줄까지이되 `**`로 시작하는 줄·펜스에서 멈춘다.
  // 둘 이상이면 어느 쪽이 맞는지 모르니 던진다(사람에게 돌린다).
  const found: Array<[number, number]> = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i] || !lines[i]!.startsWith(LABEL) || (i > 0 && !boundary(i - 1))) continue;
    let end = i + 1;
    while (end < lines.length && !fenced[end] && !isBlank(lines[end]!) && !lines[end]!.startsWith("**")) end++;
    found.push([i, end]);
  }
  if (found.length > 1) throw new Error("multiple image lines in body");
  if (found.length === 1) {
    const [start, end] = found[0]!;
    return `${[...lines.slice(0, start), line, ...lines.slice(end)].join("\n")}\n`;
  }

  // 마지막 문단이 Full changelog 꼬리면 그 앞에 — `dropFullChangelog`가 걷는 문단과 같은 경계여야 /changelog에 꼬리가 안 남는다.
  let s = lines.length - 1;
  while (s > 0 && !boundary(s - 1)) s--;
  if (!fenced[s] && TAIL_RE.test(lines[s]!)) return `${[...lines.slice(0, s), line, "", ...lines.slice(s)].join("\n")}\n`;
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

// `import.meta.main`은 Node 24.2+에만 있다 — 없는 24.0·24.1에서 조용히 exit 0(빈 stdout)이 되지 않게 argv로 대신 판정한다.
if (import.meta.main ?? process.argv[1] === import.meta.filename) process.exitCode = await main();
