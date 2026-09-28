import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **이미지 프록시가 요청의 어떤 것도 상류로 넘기지 않는다** (2026-09-28).
 *
 * ⚠️ **이 경계가 rewrite를 버린 이유 그 자체다.** Next의 외부 rewrite는 요청 헤더를 상류로 그대로
 * 넘긴다 — 실측에서 `cookie: __Secure-authjs.session-token=…`과 `authorization: Bearer …`가 Blob
 * 호스트에 도착했다. `<img src="/api/images/…">`는 동일 출처라 브라우저가 세션 쿠키를 붙이고, 이 앱은
 * **DB 세션**이라 그 토큰이 곧 계정 접근이다. 그래서 `readImage`는 `fetch`에 **`headers`를 안 넘긴다.**
 *
 * ⚠️ **주석은 썩고 이 검사는 안 썩는다** — `credential-separation.test.ts`와 같은 계보의 상시 방어선이다.
 * "넘기지 않는다"는 사실을 주석으로만 적어 두면 다음 커밋이 `headers: request.headers` 한 줄로 되돌린다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const ROUTE = readFileSync(join(ROOT, "app/api/images/[...key]/route.ts"), "utf8");
const STORE = readFileSync(join(ROOT, "lib/upload/store.ts"), "utf8");

/** 주석은 벗긴다 — 경계를 설명하는 문장이 `headers`·`cookie`를 인용한다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
}

/** `readImage`의 본문만 — 같은 파일의 `putImage`·`listImages`는 쓰기 토큰을 정당하게 문다. */
function readImageBody(source: string): string {
  const start = source.indexOf("export async function readImage");
  expect(start, "lib/upload/store.ts에 readImage가 없다").toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return codeOnly(end === -1 ? rest : rest.slice(0, end));
}

/** `fetch(…)` 호출의 옵션 객체에 든 `headers`. 값이 무엇이든 red다 — 넘기는 행위 자체가 경계 위반이다. */
const FETCH_HEADERS = /fetch\s*\([\s\S]{0,400}?\bheaders\s*:/;
/** 상류 호스트의 출처. `BLOB_PUBLIC_HOST` 밖의 env·요청 값에서 오면 프록시가 임의 호스트를 향한다. */
const ENV_READ = /(?:optionalEnv|requireEnv)\(\s*["']([A-Z_0-9]+)["']|process\.env\.([A-Z_0-9]+)/g;
/** 요청에서 값을 끌어와 상류 URL·헤더를 만드는 형태. */
const REQUEST_DERIVED = /request\.(headers|cookies)|headers\(\)|cookies\(\)/;

describe("검사식이 실제로 잡는다", () => {
  it("헤더를 넘기는 형태를 잡는다", () => {
    expect(FETCH_HEADERS.test('await fetch(url, { headers: request.headers });')).toBe(true);
    expect(FETCH_HEADERS.test('await fetch(url, {\n  cache: "no-store",\n  headers: { cookie },\n});')).toBe(true);
    // 정상 형태는 안 걸린다 — 과잉 매칭이면 이 방어선이 항상 red라 버려진다.
    expect(FETCH_HEADERS.test('await fetch(url, { redirect: "error", cache: "no-store" });')).toBe(false);
  });
  it("요청에서 값을 끌어오는 형태를 잡는다", () => {
    expect(REQUEST_DERIVED.test("const c = request.headers.get(\"cookie\");")).toBe(true);
    expect(REQUEST_DERIVED.test("const store = await cookies();")).toBe(true);
    expect(REQUEST_DERIVED.test("const key = (await params).key.join(\"/\");")).toBe(false);
  });
});

describe("프록시는 요청을 상류로 흘리지 않는다", () => {
  const body = readImageBody(STORE);

  it("readImage가 실제로 fetch를 부른다 — 검사가 공허하게 통과하지 않는다", () => {
    expect(body).toContain("fetch(");
  });

  it("readImage가 `fetch`에 headers를 넘기지 않는다", () => {
    expect(FETCH_HEADERS.test(body)).toBe(false);
  });

  it("라우트가 스스로 상류를 부르지 않는다 — fetch는 readImage 하나다", () => {
    expect(codeOnly(ROUTE)).not.toContain("fetch(");
  });

  it("라우트도 readImage도 요청 헤더·쿠키를 읽지 않는다", () => {
    expect(REQUEST_DERIVED.test(codeOnly(ROUTE))).toBe(false);
    expect(REQUEST_DERIVED.test(body)).toBe(false);
  });

  it("상류 호스트는 `BLOB_PUBLIC_HOST` 하나에서만 온다", () => {
    const names = [...body.matchAll(ENV_READ)].map((m) => m[1] ?? m[2]);
    expect(names).toEqual(["BLOB_PUBLIC_HOST"]);
    expect([...codeOnly(ROUTE).matchAll(ENV_READ)].map((m) => m[1] ?? m[2])).toEqual([]);
  });

  /** 호스트 문자열은 `isBlobPublicHost`를 지나야 한다 — CSP와 같은 하나의 모양 판정이다. */
  it("호스트를 검증 없이 쓰지 않는다", () => {
    expect(body).toContain("isBlobPublicHost");
  });
});
