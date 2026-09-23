import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

/**
 * **화면 용어 표** (DESIGN §10.1 — audit #29). 사전 전체를 걸어 **보이는 문장**만 센다.
 *
 * ⚠️ **소스를 정규식으로 훑지 않는다** — 함수 값(`(n) => \`${n} surfaces\``)과 JSX 조각이 문장의 절반이라
 * 리터럴만 보면 그 절반이 방어선 밖이다. 함수는 자리표시 인자로 **호출해** 나온 문장을 본다.
 *
 * ⚠️ **키 이름·주석은 대상이 아니다** — 코드 식별자(`surface`·`locale`·`import`)는 그대로 두기로 했다.
 */
type Found = { path: string; text: string };

const ARG = "X";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) return renderToStaticMarkup(node).replace(/<[^>]+>/g, "");
  return "";
}

function walk(value: unknown, path: string, out: Found[]): void {
  if (typeof value === "string") out.push({ path, text: value });
  else if (typeof value === "function") {
    const args = Array.from({ length: value.length }, () => ARG);
    walk((value as (...a: unknown[]) => unknown)(...args), path, out);
  } else if (isValidElement(value)) out.push({ path, text: textOf(value) });
  else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`, out));
  else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walk(child, path === "" ? key : `${path}.${key}`, out);
  }
}

const strings = (): Found[] => {
  const out: Found[] = [];
  walk(m, "", out);
  return out;
};

/**
 * 표의 "쓰지 않는 말" + git 어휘. **대소문자를 가리지 않는다** — 문장 첫 자리에서 대문자가 된다.
 *
 * ⚠️ `pull request`는 고유명사라 뺀 뒤에 센다. `push token`·`PUSH_TOKEN`도 토큰의 이름이다.
 * ⚠️ `{locale}`이 든 토막은 경로 예시다 — 사용자가 칠 값이라 통째로 뺀다.
 */
const BANNED: readonly [string, RegExp][] = [
  ["surface", /\bsurfaces?\b/i],
  ["import", /\bimport(s|ed|ing)?\b/i],
  ["send changes", /\bsend changes\b/i],
  ["pull", /\bpull(s|ed|ing)?\b/i],
  ["push", /\bpush(es|ed|ing)?\b/i],
  ["locale", /\blocales?\b/i],
  ["source language", /\bsource language\b/i],
  ["the project owner", /\bthe project owner\b/i],
  ["an owner", /\ban owner\b/i],
  ["owner of this project", /\bowners? of this project\b/i],
  ["only owners", /\bonly owners\b/i],
  ["owners can", /(^|[^t] )owners can\b/i],
  ["retry", /\bretry(ing)?\b/i],
  ["check again", /\bcheck again\b/i],
];

const scrub = (text: string): string =>
  text
    .replace(/pull requests?/gi, "")
    .replace(/push tokens?/gi, "")
    .replace(/PUSH_TOKEN/g, "")
    .replace(/\S*\{locale\}\S*/g, "");

/**
 * **이유가 있는 예외만** — 경로마다 그 낱말이 표의 개념이 아닌 까닭이 있다.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  // 코드의 `import` 문을 말한다 — Sync가 아니다.
  "adapterErrors.shorthand-property": "import",
  // ①은 개발자가 고르는 화면이고 GitHub이 보여 주는 값이다 (DESIGN §10.1).
  "newProject.repo.pushedAt": "push",
  // 설정의 CI 카드 — 워크플로가 실제로 하는 일을 개발자에게 말한다 (DESIGN §10.1).
  "settings.ci.description": "push",
  // 개인정보 방침 — 문구를 고치면 개정 이력이 따라간다(policy-gate). 개발자가 하는 일을 말하는 문장이다.
  "publicDocs.privacy.intro": "push",
  // 역할 이름(Owner)이다 — "누가 할 수 있나"를 가리키는 호칭이 아니다. 핸드오프가 고정한 문장이다(members 결정 6).
  "errors.access.last-owner": "an owner",
};

function violations(found: readonly Found[]): string[] {
  return found.flatMap(({ path, text }) =>
    BANNED.filter(([name, pattern]) => ALLOWED[path] !== name && pattern.test(scrub(text))).map(([name]) => `${path} — "${name}" in: ${text}`),
  );
}

describe("화면 용어 — DESIGN §10.1의 표를 사전 전체가 따른다 (audit #29)", () => {
  it("사전을 실제로 걸었다 — 0건 스캐너는 방어선이 아니다", () => {
    const found = strings();
    expect(found.length).toBeGreaterThan(1000);
    // 함수 값·JSX도 문장으로 풀렸다
    expect(found.some(({ path }) => path === "repositorySync.body")).toBe(true);
    expect(found.find(({ path }) => path === "repositorySync.title")?.text).toBe("Sync X from the repository?");
  });

  it("쓰지 않는 말이 화면 문장에 없다", () => {
    expect(violations(strings())).toEqual([]);
  });

  it("같은 규칙이 금지된 문장을 잡고 예외는 통과시킨다", () => {
    const sample = (text: string, path = "x") => violations([{ path, text }]);
    const caught = (text: string) => expect(sample(text).length).toBeGreaterThan(0);
    caught("Add surface");
    caught("The first import failed.");
    caught("Send changes first");
    caught("Changing it takes effect on the next CI push.");
    caught("Where are your locale files?");
    caught("Source language");
    caught("Ask the project owner.");
    caught("Ask an owner of this project to restore it.");
    caught("Only owners can invite or change roles");
    caught("Owners can manage members");
    caught("Retry");
    caught("Check again");
    // 표가 고른 말과 고유명사는 통과한다
    expect(sample("Only project owners can sync. Project owners can restore it.")).toEqual([]);
    expect(sample("View pull request")).toEqual([]);
    expect(sample("Rotate the push token for PUSH_TOKEN")).toEqual([]);
    expect(sample("_locales/{locale}/messages.json · src/locales/{locale}.json")).toEqual([]);
    expect(sample("Ask the repository owner for access. An organization owner has to approve.")).toEqual([]);
  });
});

/**
 * DESIGN §10 — **Alert 제목은 구두점 없는 문장 조각**이다 (audit #30). 번역 화면 저장줄의 제목 자리를 센다.
 */
describe("Alert 제목에 마침표가 없다 (audit #30)", () => {
  const w = m.translations.workspace;
  it.each([
    ["footer.saveFailed.title", w.footer.saveFailed.title],
    ["footer.saveUnknown.title", w.footer.saveUnknown.title],
    ["footer.archived", w.footer.archived],
    ["footer.lostAccess", w.footer.lostAccess],
    ["revert.failed.title", w.revert.failed.title],
    ["revert.unknown.title", w.revert.unknown.title],
    ["revert.changed.title", w.revert.changed.title],
  ])("%s", (_, title) => {
    expect(title).not.toMatch(/[.!]$/);
  });
});

/**
 * audit #28 · #31 — **남을 가리키는 문구는 도착한 화면에 실제로 있는 컨트롤을 부른다** (POSTMORTEM 2026-09-14).
 * 번역 화면의 버튼은 `Publish`다 — 그리로 데려가는 링크 둘이 `Send changes`라고 말했다.
 */
describe("링크 라벨이 도착 화면의 버튼 이름을 든다 (audit #28)", () => {
  it.each([
    ["repositorySync.sendFirst", m.repositorySync.sendFirst],
    ["projects.banner.action.send", m.projects.banner.action.send],
  ])("%s", (_, label) => {
    expect(label).toContain(m.translations.publish.button);
  });
});

/** audit #31 — 프로젝트가 0개인 사람은 초대받은 번역자일 수도 있다. 리포 연결만 권하면 그 사람의 길이 없다. */
it("프로젝트 0건 문장이 초대받은 사람의 길도 말한다 (audit #31)", () => {
  expect(m.projects.empty.description).toMatch(/invit/i);
});
