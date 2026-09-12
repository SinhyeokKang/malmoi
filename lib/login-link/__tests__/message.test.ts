import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { linkErrorMessage, providerLabel } from "../message";

const ROOT = process.cwd();

it("모르는 `?e=`에 던지지 않고 폴백 문구를 낸다", () => {
  expect(linkErrorMessage("wrong-account")).toBe(m.errors.link["wrong-account"]);
  expect(linkErrorMessage("already-linked")).toBe(m.errors.link["already-linked"]);
  // 주소창 값이다 — 프로토타입 키에서 값이 찾아져 문자열 자리에 함수가 오면 화면이 죽는다.
  for (const code of ["nope", "constructor", "toString", "__proto__", "fallback"]) {
    expect(typeof linkErrorMessage(code)).toBe("string");
  }
  expect(linkErrorMessage("nope")).toBe(m.errors.link.fallback);
});

it("provider 이름은 사전이 든다 — 화면이 문자열을 조립하지 않는다", () => {
  expect(providerLabel("github")).toBe("GitHub");
  expect(providerLabel("google")).toBe("Google");
});

/**
 * ⚠️ **모듈 그래프를 센다** — `policy.ts`는 병합 화면(셸 밖, 비로그인)이 읽고 `plan.ts`는
 * `signIn` 콜백이 읽는다. 무거운 그래프가 붙으면 조용히 번들에 들어간다
 * (POSTMORTEM 2026-09-07). **"import 0"이 아니다**: `outcomeUrl` 때문에 `lib/routes.ts`를,
 * 문구 때문에 사전을 문다. ⚠️ **해시는 이 그래프에 없다** — `challengeTokenHash`를 `policy.ts`에
 * 두었더니 `node:crypto`가 `/account`의 클라이언트 번들로 따라 들어갔다(실측).
 */
it("순수 층의 import가 routes와 사전을 넘지 않는다", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  /** 이 닫힘 밖으로 한 줄만 새도 셸 밖 화면이 무거운 그래프를 지고 나간다. */
  const allowed = ["lib/routes.ts", "lib/i18n/index.ts", "messages/en.tsx"].map((rel) => resolve(ROOT, rel));

  const resolveImport = (from: string, raw: string): string | null => {
    if (raw.startsWith("node:") || !(raw.startsWith("@/") || raw.startsWith("."))) return null;
    const base = raw.startsWith("@/") ? resolve(ROOT, raw.slice(2)) : resolve(dirname(from), raw);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (existsSync(candidate)) return candidate;
    }
    throw new Error(`unresolved import ${raw} from ${from}`);
  };

  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^\s*(?:import|export)\s[^"\n]*from\s+"([^"]+)"/gm)) {
      const target = resolveImport(file, match[1]!);
      if (target === null) continue;
      if (!target.startsWith(join(ROOT, "lib/login-link"))) {
        expect(allowed, `${file} → ${match[1]!}`).toContain(target);
      }
      visit(target);
    }
  };
  for (const entry of ["policy.ts", "plan.ts", "message.ts"]) visit(join(here, "..", entry));
  // `server-only`가 붙은 파일은 이 그래프에 없어야 한다 — 클라이언트가 읽는 층이다.
  for (const file of seen) expect(readFileSync(file, "utf8")).not.toContain('import "server-only"');
});
