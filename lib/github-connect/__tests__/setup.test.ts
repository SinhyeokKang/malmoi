import { expect, it } from "vitest";

import { INSTALL_REQUESTED, setupLanding } from "../setup";

/**
 * GitHub App 설치 뒤 GitHub이 브라우저를 되돌리는 Setup URL의 목적지 (ARCHITECTURE §6.4, launch-readiness L2.4).
 *
 * ⚠️ **`installation_id`는 입력이 아니다** — `/projects/new`가 사용자 토큰으로 설치 목록을 다시
 * 조회하므로 그 값을 믿을 이유가 없고, 안 읽으면 위조 판정이 필요 없다.
 */

it("설치를 마쳤으면 새 프로젝트 ①로 돌아가 목록을 다시 조회한다", () => {
  expect(setupLanding("install")).toBe("/projects/new");
});

/**
 * ⚠️ **`update`도 ①이다** — 예외 B(설치에 리포 없음)의 [Choose repositories]가 기존 설치의 리포
 * 선택을 바꾸는 길이고, "Redirect on update"가 켜져 있으면 GitHub이 그 뒤 `update`로 되돌린다.
 */
it("설치의 리포 선택을 바꿨으면 역시 ①로 간다", () => {
  expect(setupLanding("update")).toBe("/projects/new");
});

it("관리자 승인이 필요한 설치 요청이면 ①에 요청 대기를 싣는다", () => {
  expect(setupLanding("request")).toBe(`/projects/new?e=${INSTALL_REQUESTED}`);
});

it("값이 없거나 모르는 값이면 목록으로 간다 — 주소창 값이라 갈래를 늘리지 않는다", () => {
  expect(setupLanding(null)).toBe("/projects");
  expect(setupLanding("")).toBe("/projects");
  expect(setupLanding("INSTALL")).toBe("/projects");
  expect(setupLanding("request&e=forbidden")).toBe("/projects");
});
