import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { fileProbe, requestedFormat } from "../format";

/**
 * **`pnpm ingest`와 `pnpm push:local`의 포맷 결정은 한 함수다** (audit #73). 두 스크립트가 probe·`--adapter` 검증·탐지 갈래를
 * 각자 들고 있었다 — 한쪽만 고치면 "ingest로 미리 본 것과 push가 올리는 것"이 갈린다(POSTMORTEM 2026-09-02의 형태).
 */
const repo = mkdtempSync(join(tmpdir(), "malmoi-cli-format-"));
mkdirSync(join(repo, "locales"));
writeFileSync(join(repo, "locales/en.json"), '{\n  "hello": "Hello"\n}\n');
writeFileSync(join(repo, "locales/ko.json"), '{\n  "hello": "안녕"\n}\n');
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const PATHS = ["locales/en.json", "locales/ko.json"];

describe("fileProbe", () => {
  it("대상 아래 파일을 읽고, 없으면 undefined다", () => {
    const probe = fileProbe(repo);
    expect(probe("locales/en.json")).toContain("Hello");
    expect(probe("locales/fr.json")).toBeUndefined();
  });
});

describe("requestedFormat", () => {
  const probe = fileProbe(repo);

  it("플래그가 없으면 탐지 1순위다", () => {
    const got = requestedFormat(PATHS, probe, {});
    expect(got).toMatchObject({ ok: true, format: { adapter: "json-catalog", pathTemplate: "locales/{locale}.json" } });
  });

  it("--adapter를 주면 그 어댑터로만 찾는다", () => {
    expect(requestedFormat(PATHS, probe, { adapterName: "json-catalog" })).toMatchObject({ ok: true, format: { adapter: "json-catalog" } });
    expect(requestedFormat(PATHS, probe, { adapterName: "yaml-catalog" })).toEqual({
      ok: false, exitCode: 1, message: "--adapter yaml-catalog: 이 리포에서 해당 포맷을 찾지 못했다.",
    });
  });

  it("등록되지 않은 이름은 인자 오류(2)다 — 미탐지(1)와 가른다", () => {
    expect(requestedFormat(PATHS, probe, { adapterName: "json" })).toEqual({ ok: false, exitCode: 2, message: "--adapter json: 등록되지 않은 어댑터다." });
  });

  it("--path-template이면 그 템플릿의 후보를 고른다", () => {
    expect(requestedFormat(PATHS, probe, { pathTemplate: "locales/{locale}.json" })).toMatchObject({ ok: true, format: { pathTemplate: "locales/{locale}.json" } });
    expect(requestedFormat(PATHS, probe, { pathTemplate: "other/{locale}.json" })).toEqual({
      ok: false, exitCode: 1, message: "로케일 포맷을 찾지 못했다 (2파일 훑음) — 연동 불가.",
    });
  });

  it("아무것도 없으면 미탐지(1)다", () => {
    expect(requestedFormat(["README.md"], probe, {})).toEqual({ ok: false, exitCode: 1, message: "로케일 포맷을 찾지 못했다 (1파일 훑음) — 연동 불가." });
  });
});
