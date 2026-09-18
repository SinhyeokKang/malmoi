import { expect, it } from "vitest";

import { installationSettingsUrl } from "../installation-url";

/**
 * [Installation settings] 버튼의 목적지 (DESIGN §6.67).
 *
 * ⚠️ **설치 ID로 가는 주소(`/settings/installations/<id>`)를 쓰지 않는다.** `Account` 모델에 설치 ID
 * 컬럼이 **없고**, 사용자에게 설치가 여럿일 수 있어 "어느 설치인가"에 답이 없다.
 * `apps/<slug>/installations/new`는 **이미 설치한 계정에서는 GitHub이 설정 화면으로 보낸다** —
 * 이 리포의 기존 세 자리(`new-project-modal` · 프로젝트 설정 · 온보딩 ②)가 전부 그 주소다.
 */

it("slug가 있으면 설치 설정으로 가는 주소를 낸다", () => {
  expect(installationSettingsUrl("malmoi")).toBe("https://github.com/apps/malmoi/installations/new");
});

it("GITHUB_APP_SLUG가 없으면 null이고 버튼이 조용히 사라진다", () => {
  // `optionalEnv` 계약 그대로다 (CLAUDE.md) — 링크만 사라지고 나머지 행은 그대로 선다.
  expect(installationSettingsUrl(undefined)).toBeNull();
});

it("빈 문자열도 null이다 — `apps//installations/new`로 나가는 문을 만들지 않는다", () => {
  // `optionalEnv`가 이미 빈 문자열을 `undefined`로 접지만, 타입이 `string`을 허용하는 한
  // 다른 호출부가 `process.env`에서 바로 넘길 수 있다.
  expect(installationSettingsUrl("")).toBeNull();
});
