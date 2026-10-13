import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Messages } from "@/lib/i18n";
import { forHost, withRepoHost } from "@/lib/i18n/host";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * **리포 호스트별 문장** (gitlab-repositories tasks §5 · DESIGN §10.1). 호스트가 문장을 고르는 사전 노드는 `onGitLab` 자식에 **같은 이름의
 * 키를 문장 통째로** 둔다 — 화면은 `forHost(node, repoHost)`로 그 노드를 읽는다.
 *
 * ⚠️ **호스트 인자 함수로 접지 않는다**(R-E0 🟡) — 사전 스캐너(`terminology`·`banned-terms`·정합성)가 함수를 같은 인자로 한 번만 불러
 * GitLab 갈래 문장을 못 본다. `onGitLab` 자식은 평범한 잎이라 스캐너가 다 걷는다.
 */

type Leaf = { path: string; text: string };

function shown(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(shown).join(" ");
  if (isValidElement(value)) return renderToStaticMarkup(value).replace(/<[^>]+>/g, "");
  return "";
}

/** 함수는 자리표시 인자로 부른다 — 숫자 자리에 문자열이 가도 템플릿 문장은 나온다. */
function leaves(value: unknown, path: string, out: Leaf[] = []): Leaf[] {
  if (typeof value === "function") {
    const args = Array.from({ length: value.length }, () => 2);
    out.push({ path, text: shown((value as (...a: unknown[]) => unknown)(...args)) });
  } else if (typeof value === "string" || isValidElement(value) || Array.isArray(value)) out.push({ path, text: shown(value) });
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) leaves(child, `${path}.${key}`, out);
  return out;
}

/** 사전에서 `onGitLab` 자식을 가진 노드 전부 — 경로와 노드. */
function overlays(value: unknown, path = "", out: { path: string; node: Record<string, unknown> }[] = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || isValidElement(value)) return out;
  const node = value as Record<string, unknown>;
  if (Object.hasOwn(node, "onGitLab") && typeof node.onGitLab === "object") out.push({ path, node });
  for (const [key, child] of Object.entries(node)) if (key !== "onGitLab") overlays(child, path === "" ? key : `${path}.${key}`, out);
  return out;
}

const DICTIONARIES: [string, Messages][] = [["en", en], ["ko", ko], ["es", es]];

/** 호스트마다 그 자리에 있으면 안 되는 낱말 — 다른 호스트의 이름·리뷰 요청 호칭·주소. ko는 축약 `PR`·`MR`이다(D14). */
const FOREIGN = {
  gitlab: [/github/i, /pull request/i, /\bPRs?\b/, /github\.com/i],
  github: [/gitlab/i, /merge request/i, /\bMRs?\b/],
} as const;

describe("forHost", () => {
  const node = { a: "A github", b: (n: number) => `#${n}`, keep: "same", onGitLab: { a: "A gitlab", b: (n: number) => `!${n}` } };

  it("GitHub은 노드 그대로다", () => {
    expect(forHost(node, "github")).toBe(node);
  });

  it("GitLab은 onGitLab 자식이 같은 이름의 키를 덮고 나머지는 그대로다", () => {
    const t = forHost(node, "gitlab");
    expect([t.a, t.b(128), t.keep]).toEqual(["A gitlab", "!128", "same"]);
  });

  it("모르는 호스트 값은 GitHub이다 — 열 기본값과 같은 쪽", () => {
    expect(forHost(node, "bitbucket")).toBe(node);
  });
});

describe.each(DICTIONARIES)("%s 사전의 호스트 문장", (_lang, m) => {
  const found = overlays(m);

  it("호스트 문장 노드가 있다", () => {
    expect(found.length).toBeGreaterThan(0);
  });

  it.each(found.map(({ path, node }) => [path, node] as const))("%s — onGitLab의 모든 경로가 형제에 있다(덮을 대상 — 깊게)", (_path, node) => {
    const missing: string[] = [];
    const walk = (top: unknown, base: unknown, at: string) => {
      if (top === null || typeof top !== "object" || Array.isArray(top) || "$$typeof" in top) return;
      for (const [key, value] of Object.entries(top)) {
        if (base === null || typeof base !== "object" || !Object.hasOwn(base, key)) { missing.push(`${at}${key}`); continue; }
        walk(value, (base as Record<string, unknown>)[key], `${at}${key}.`);
      }
    };
    walk(node.onGitLab, node, "");
    expect(missing).toEqual([]);
  });

  it.each(found.map(({ path, node }) => [path, node] as const))("%s — GitLab 문장에 GitHub 낱말이, GitHub 문장에 GitLab 낱말이 없다", (path, node) => {
    const gitlab = node.onGitLab as Record<string, unknown>;
    const gitlabLeaves = leaves(gitlab, `${path}.onGitLab`);
    // GitHub 쪽은 **덮이는 잎만** 본다 — 깊은 덮기는 코드 키 표의 일부만 덮으므로 형제 전체를 훑으면 덮지 않는 키까지 센다.
    const githubLeaves = gitlabLeaves.map(({ path: at }) => ({ path: at, text: leaves(at.slice(`${path}.onGitLab.`.length).split(".").reduce<unknown>((cur, key) => (cur as Record<string, unknown>)?.[key], node), at)[0]?.text ?? "" }));
    const hits = [
      ...gitlabLeaves.filter(({ text }) => FOREIGN.gitlab.some((re) => re.test(text))),
      ...githubLeaves.filter(({ text }) => FOREIGN.github.some((re) => re.test(text))),
    ];
    expect(hits).toEqual([]);
  });

  it.each(found.map(({ path, node }) => [path, node] as const))("%s — GitLab 문장은 GitHub 문장과 다르다(덮어도 같으면 분기가 아니다)", (path, node) => {
    const prefix = `${path}.onGitLab.`;
    for (const { path: at, text } of leaves(node.onGitLab, `${path}.onGitLab`)) {
      const base = leaves(at.slice(prefix.length).split(".").reduce<unknown>((cur, key) => (cur as Record<string, unknown>)?.[key], node), at)[0]?.text;
      expect(text, at).not.toBe(base);
    }
  });
});

describe("세 사전의 호스트 문장 노드가 같다", () => {
  const paths = (m: Messages) => overlays(m).map(({ path, node }) => `${path}: ${Object.keys(node.onGitLab as object).sort().join(",")}`);
  it.each([["ko", ko], ["es", es]] as const)("%s = en", (_lang, m) => {
    expect(paths(m)).toEqual(paths(en));
  });
});

describe("withRepoHost — 프로젝트 화면의 사전 전체", () => {
  it("GitHub·모르는 값은 같은 사전 객체다", () => {
    expect(withRepoHost(en, "github")).toBe(en);
    expect(withRepoHost(en, "")).toBe(en);
  });

  it("GitLab은 모든 onGitLab 노드를 덮고 나머지는 그대로다", () => {
    const m = withRepoHost(en, "gitlab");
    expect(m.home.meta.pullRequest).toBe(en.home.meta.onGitLab.pullRequest);
    expect(m.home.meta.pr(128)).toBe("!128");
    expect(m.home.meta.settings).toBe(en.home.meta.settings);
    expect(m.common).toEqual(en.common);
  });

  it("같은 사전이면 같은 결과 객체다 (memo — 클라이언트 context가 렌더마다 바뀌지 않는다)", () => {
    expect(withRepoHost(en, "gitlab")).toBe(withRepoHost(en, "gitlab"));
  });

  it.each(DICTIONARIES)("%s — 덮은 사전의 모든 onGitLab 자리가 GitLab 문장이다", (_lang, dict) => {
    const m = withRepoHost(dict, "gitlab");
    for (const { path, node } of overlays(dict)) {
      const at = path === "" ? m : path.split(".").reduce<unknown>((cur, key) => (cur as Record<string, unknown>)[key], m);
      const prefix = `${path}.onGitLab.`;
      for (const { path: leaf, text } of leaves(node.onGitLab, `${path}.onGitLab`)) {
        const got = leaves(leaf.slice(prefix.length).split(".").reduce<unknown>((cur, key) => (cur as Record<string, unknown>)?.[key], at), leaf)[0]?.text;
        expect(got, leaf).toBe(text);
      }
    }
  });
});

/**
 * **호스트를 말하지 않는 라벨** (2026-10-14). 키는 코드에서만 들어오므로 "어느 호스트에서 왔나"는 정보가 없다 — 새 키 라벨은
 * 두 호스트가 같은 낱말이고 `onGitLab` 덮기가 없다. Home 메타의 호스트 행 라벨은 새 프로젝트 탭(`newProject.host.label`)과 같은 낱말 `Host`다.
 */
describe("호스트 중립 라벨", () => {
  const NEW_KEYS = { en: "New keys", ko: "새 키", es: "Claves nuevas" } as const;
  const HOST = { en: "Host", ko: "호스트", es: "Proveedor" } as const;

  it.each(DICTIONARIES)("%s — 새 키 라벨은 호스트 이름이 없고 GitLab도 같은 문장이다", (lang, dict) => {
    const want = NEW_KEYS[lang as keyof typeof NEW_KEYS];
    const gitlab = withRepoHost(dict, "gitlab");
    expect(dict.projects.summary.newFromGithub).toBe(want);
    expect(dict.translations.workspace.filters.state.new).toBe(want);
    expect(gitlab.projects.summary.newFromGithub).toBe(want);
    expect(gitlab.translations.workspace.filters.state.new).toBe(want);
  });

  it.each(DICTIONARIES)("%s — Home 메타의 호스트 행 라벨은 Host다", (lang, dict) => {
    expect(dict.home.meta.platform).toBe(HOST[lang as keyof typeof HOST]);
  });
});
