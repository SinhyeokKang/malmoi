import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 화면 배선을 **소스에서** 센다 (translation-ui T8).
 *
 * ⚠️ 이 리포에는 렌더 테스트가 없다 (design §4) — jsdom이 못 보는 결함 부류가 셋이다. 그래서
 * `translations-screen`·`focus-ring`·`client-graph`와 같은 계열으로, **판정이 green인 것과 화면이
 * 그것을 실제로 쓰는 것은 다른 사실**임을 스캔이 든다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 주석을 벗긴다 — 이 화면들의 docstring이 자기가 **피하는 것**을 이름으로 적는다. */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const LAYOUT = "app/layout.tsx";
const SETTINGS = "app/(edit)/projects/[slug]/settings/page.tsx";
const INVITE = "app/invite/[token]/page.tsx";

describe("문서 언어 (T8)", () => {
  /**
   * ⚠️ **T4가 미뤄 둔 한 줄이다.** 화면 문구가 전부 영어가 되는 커밋이 이것이므로 여기서 바꾼다 —
   * `lang`이 틀리면 스크린리더가 영어 문장을 한국어 음성 엔진으로 읽고, 하이픈네이션·따옴표도 갈린다.
   */
  it("`<html lang=\"en\">`이다 — 문구가 전부 영어가 됐다", () => {
    expect(read(LAYOUT)).toMatch(/lang="en"/);
    expect(read(LAYOUT)).not.toMatch(/lang="ko"/);
  });
});

describe("설정 화면 — revalidate가 결과를 씻지 않는다 (POSTMORTEM 2026-09-07)", () => {
  const src = read(SETTINGS);

  /**
   * ⚠️ 실물 검증이 잡은 결함의 상시 방어선이다. `runFirstIngest`가 `revalidatePath`를 부르고 readiness가
   * `awaiting_first_sync` → `ready`로 바뀐다 — 그 조건부 분기 **안**에 결과 컴포넌트가 있으면 성공이
   * 자기 표시기를 언마운트하고, `failed > 0`의 "M건을 읽지 못했다"가 아무에게도 닿지 않는다(불변식 9).
   */
  it("`FirstIngestRetry`가 readiness 분기 밖이다 — 버튼만 `canRun`으로 감춘다", () => {
    expect(src).toMatch(/<FirstIngestRetry/);
    expect(src).toMatch(/canRun=\{/);
    // 분기 안에 있으면 `&&` 뒤에 붙는다 — 그 형태를 금지한다.
    expect(src).not.toMatch(/&&\s*<FirstIngestRetry/);
  });

  /**
   * ⚠️ **블록 둘이 독립적으로 실패한다** (DESIGN §6.6). 건강성은 App 설치 토큰, 계정은 사용자 토큰이라
   * 하나로 묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다 — 그래서 둘을 병렬로 읽고 각자 자기 오류를 낸다.
   */
  it("건강성과 계정을 병렬로 읽는다 — 한쪽 장애가 다른 쪽을 막지 않는다", () => {
    expect(src).toMatch(/Promise\.all\(/);
    expect(src).toMatch(/loadHealth\(/);
    expect(src).toMatch(/loadAccount\(/);
  });
});

describe("초대 수락 — 갇히는 길을 남기지 않는다", () => {
  const src = read(INVITE);

  /**
   * ⚠️ "초대받은 주소의 계정으로 로그인해 주세요"라고 말해 놓고 로그아웃할 곳이 없으면 갇힌다 —
   * 이 페이지는 `(edit)` 레이아웃 밖이라 셸의 sign out이 없다 (code-review 2026-09-06 🟡11).
   */
  it("`email-mismatch`에 다른 계정으로 로그인하는 길이 있다", () => {
    expect(src).toMatch(/email-mismatch/);
    expect(src).toMatch(/signOut\(/);
  });

  /** `?e=`를 읽는 쪽이 없으면 거부가 통째로 무음이다 (POSTMORTEM 2026-09-06 · issue #2). */
  it("`?e=`를 실제로 읽는다", () => {
    expect(src).toMatch(/searchParams/);
    expect(src).toMatch(/inviteErrorMessage\(/);
  });
});
