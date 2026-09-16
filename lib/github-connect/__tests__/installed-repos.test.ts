import { expect, it } from "vitest";

import { countInstalledRepos } from "../installed-repos";

/**
 * 설치된 리포 수 집계의 순수 판정 (design §1.1). `/account`의 GitHub App 행 보조 줄이 쓴다.
 *
 * ⚠️ **`null`과 `0`은 다른 사실이다.** `0`은 "선택된 리포가 없다"로 읽혀 사용자가 멀쩡한 설치를
 * 다시 만들러 간다 — 실패한 조회를 "없음"으로 읽으면 없는 것과 구별되지 않는다
 * (POSTMORTEM 2026-09-03 · `listConnectableRepos`의 같은 판단).
 */

it("설치 둘에 같은 리포가 걸리면 유니크 수를 낸다", () => {
  // ⚠️ 같은 `fullName`이지만 **다른 객체**다 — `[...new Set(objects)]`는 참조로 비교해 이걸 못 접는다
  // (`projects/actions.ts`가 같은 함정에 주석을 달아 두었다).
  expect(
    countInstalledRepos([
      { repos: [{ fullName: "acme/one" }, { fullName: "acme/two" }] },
      { repos: [{ fullName: "acme/two" }, { fullName: "acme/three" }] },
    ]),
  ).toBe(3);
});

it("전부 실패하면 null이다 — 0은 '선택된 리포가 없다'는 다른 사실이다", () => {
  expect(countInstalledRepos([{ error: new Error("403") }, { error: new Error("500") }])).toBeNull();
});

it("일부만 실패하면 읽은 것의 합을 낸다", () => {
  // 일시중지된 설치 하나가 403을 주는 것은 영구 상태다. 그것 때문에 나머지를 못 세면
  // 화면이 "잠시 뒤 다시"를 말한다 (code-review 2026-09-07 🟡2).
  expect(countInstalledRepos([{ repos: [{ fullName: "acme/one" }] }, { error: new Error("403") }])).toBe(1);
});

it("설치가 하나도 없으면 0이다 — 실패가 없으므로 사실이다", () => {
  expect(countInstalledRepos([])).toBe(0);
});

it("설치는 읽혔는데 리포가 0개면 0이다 — 실패가 아니라 선택이 비어 있는 것이다", () => {
  expect(countInstalledRepos([{ repos: [] }])).toBe(0);
});

it("성공한 조회가 하나라도 있으면 리포가 0개여도 합을 낸다 — null은 '하나도 못 읽었다'만이다", () => {
  // 경계가 "리포 수"가 아니라 **"읽었는가"**다. 빈 배열을 돌려준 설치는 읽힌 것이고,
  // 그 사실과 "못 읽었다"를 같은 값으로 접으면 화면이 두 상태를 구별하지 못한다.
  expect(countInstalledRepos([{ repos: [] }, { error: new Error("403") }])).toBe(0);
});
