import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const ROOT = process.cwd();

/**
 * ⚠️ **양방향 쿠키 정리가 배타성의 전부다** (account-linking design 불변식 8c) — 두 가로채기의
 * intent 판정에 암호적 결합이 없으므로, 시작하는 쪽이 상대의 흔적을 먼저 지워야 한다.
 * 한 방향만 지우면 "회수를 중단한 직후 병합"이 회수 화면으로 새고, 그 증상은 버튼이 엉뚱한
 * 화면을 낸 것으로만 보인다 (POSTMORTEM 2026-09-10).
 */
it("회수 시작이 병합 쿠키를 먼저 지운다", () => {
  const source = readFileSync(join(ROOT, "app/(edit)/account/actions.ts"), "utf8");
  expect(source).toContain("clearLinkCookies(");
  expect(source.indexOf("clearLinkCookies(")).toBeLessThan(source.indexOf("beginRevocation("));
});

it("병합 시작이 회수 쿠키를 먼저 지운다", () => {
  const source = readFileSync(join(ROOT, "app/signin/link/[challenge]/page.tsx"), "utf8");
  expect(source).toContain("clearRevocationCookies(");
  expect(source.indexOf("clearRevocationCookies(")).toBeLessThan(source.lastIndexOf("signIn("));
  // 시작 스코프 안에서 signIn을 불러야 state가 우리 쿠키 이름으로 저장된다.
  expect(source).toMatch(/withLinkStart\(/);
});

/**
 * ⚠️ **`safePrismaAdapter.linkAccount`의 거부를 한 줄도 약하게 하지 않는다** (design 불변식 2).
 * 병합은 `finishLink`가 직접 쓰므로 그 게이트를 열 이유가 없다 — **Auth.js 경유의 유일한 경로**로
 * 뜻만 좁아진다.
 */
it("어댑터 게이트가 그대로이고 직접 쓰는 자리가 하나뿐이다", () => {
  const adapter = readFileSync(join(ROOT, "lib/auth/safe-adapter.ts"), "utf8");
  expect(adapter).toContain("additional login accounts are disabled");
  expect(adapter).not.toContain("login-link");

  const creators = ["lib/login-link/store.ts"];
  const scan = (dir: string): string[] => {
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    return readdirSync(dir).flatMap((entry: string) => {
      if (entry === "node_modules" || entry === "generated" || entry.startsWith(".")) return [];
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return scan(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  };
  const writers = [...scan(join(ROOT, "lib")), ...scan(join(ROOT, "app"))]
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => /\baccount\.create\(|\baccount:\s*\{\s*create\b/.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(ROOT.length + 1));
  // 어댑터는 자기 파일에서 만든다 — 그 둘 밖에 새 생성자가 생기면 정책이 조용히 샌다.
  expect(writers.sort()).toEqual([...creators, "lib/auth/safe-adapter.ts"].sort());
});
