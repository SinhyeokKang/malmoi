// @vitest-environment jsdom
import { expect, it } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";

import { AccountCard, AccountFacts, AccountRow, AccountRows } from "../account-section";

/**
 * `/account`의 카드 프리미티브 **자체**를 잰다 (2026-09-16 재검토 🟡B).
 *
 * ⚠️ **화면 레벨에서는 못 재는 축이 있다.** `structure.test.tsx`가 "구분자는 상태가 있을 때만 선다"를
 * 세려 했지만 그 화면의 행 다섯이 **전부 `status`를 넘기므로** 대시 없는 쪽이 존재하지 않는다 —
 * `status !== undefined &&` 가드를 지우는 뮤테이션이 **DOM을 한 글자도 안 바꾸고** 검사는 green으로
 * 남는다. 주석은 "비대칭을 센다"고 선언하는데 코드는 긍정 방향만 센 것이고, 그 부류를 바로 앞
 * 라운드에 🟡4로 잡아 놓고 그 수정 안에서 재생산했다.
 *
 * ⚠️ **DESIGN §6.67이 "중복이 셋이 되면 뽑는다"고 예고한다** — 이 프리미티브가 이 화면 밖으로
 * 나가는 날 `status` 없는 호출부가 처음 생기고, 그때 꼬리 대시가 화면에 선다.
 *
 * ⚠️ **이 파일은 시각 규격을 안 잰다 — 의도적이다.** `font-medium`(이름만 굵다) · 글리프 28/radius 4 ·
 * 사실 블록의 `96px 1fr`·`gap 14 12` 같은 값은 **어느 단언도 안 물고**, 그것을 클래스 문자열로 메우면
 * **스타일을 바꾸는 순간 green인 채 결함만 돌아온다**(`structure.test.tsx` 머리가 금지하는 상태다).
 * 이 리포는 그 축을 **`/design-sync` 4단계의 computed style 실측**에 배정했다 — 2026-09-16 라운드가
 * `이름 500` · `28px/4px` · `grid 96px 1fr · gap 14px 12px`를 실제로 쟀다. **구멍을 발견해도 여기서
 * 메우지 않는다.**
 */

it("구분자는 상태가 있을 때만 선다 — 없으면 이름만 남는다", async () => {
  const withStatus = await render(
    <AccountRows>
      <AccountRow glyph={<i />} name="GitHub" status="Connected" />
    </AccountRows>,
  );
  expect(withStatus.container.textContent).toBe("GitHub — Connected");

  const withoutStatus = await render(
    <AccountRows>
      <AccountRow glyph={<i />} name="GitHub" />
    </AccountRows>,
  );
  // 꼬리 대시가 남으면 `GitHub — `가 된다.
  expect(withoutStatus.container.textContent).toBe("GitHub");
});

it("보조 줄은 없으면 그리지 않는다 — 빈 줄이 서면 행 높이가 갈린다", async () => {
  const { container } = await render(
    <AccountRows>
      <AccountRow glyph={<i />} name="GitHub" status="Connected" />
      <AccountRow glyph={<i />} name="Google" status="Connected" detail="Next step." />
    </AccountRows>,
  );
  const rows = [...container.querySelectorAll("li")];
  /**
   * 본문 div만 센다 — 우측 클러스터를 안 섞는 목적은 `structure.test.tsx`의 `bodyLines`와 같다.
   * ⚠️ **형은 엄밀히 다르다**: 그쪽은 `querySelector` + `:scope > span`(첫 본문 div의 **직계**)이고
   * 여기는 전체 매칭이라 중첩 div가 생기면 과잉 집계한다. 이 파일은 픽스처를 자기가 통제하므로
   * 무해하지만, **이 줄을 화면 테스트로 복사하지 않는다.**
   */
  expect(rows.map((row) => row.querySelectorAll("div:first-of-type > span").length)).toEqual([1, 2]);
});

/**
 * ⚠️ **접근 이름이 없으면 Chrome이 `<section>`을 `generic`으로 접어 카드가 접근성 트리에서
 * 사라진다** (POSTMORTEM 2026-09-15 #2). 프리미티브가 `useId`로 그것을 보장하므로 소비자가
 * 잊을 수 없다 — 그 보장 자체를 여기서 센다.
 */
it("카드가 자기 제목을 가리키는 접근 이름을 든다", async () => {
  const { container } = await render(
    <AccountCard title="Sessions" subtitle="Close what's open right now.">
      <AccountRows>
        <AccountRow glyph={<i />} name="Sign out" status="this device" />
      </AccountRows>
    </AccountCard>,
  );
  const section = container.querySelector("section");
  expect(section).not.toBeNull();
  const labelledBy = section!.getAttribute("aria-labelledby");
  expect(labelledBy).not.toBeNull();
  const heading = container.ownerDocument.getElementById(labelledBy!);
  expect(heading).not.toBeNull();
  expect(heading!.tagName).toBe("H2");
  expect(heading!.textContent).toBe("Sessions");
});

/**
 * ⚠️ **카드가 `<ul>`을 만들지 않는다.** Profile 카드의 몸통은 목록이 아니라 사실 블록이고, 카드가
 * 감싸면 `<ul>` 안에 `<div>`가 들어가 스크린리더가 **편집 가능한 폼을 "목록, 항목 n개"로 예고**한다.
 */
it("사실 블록을 든 카드에는 목록이 없다", async () => {
  const { container } = await render(
    <AccountCard title="Profile">
      <AccountFacts>
        <span>Avatar</span>
        <div>[avatar]</div>
      </AccountFacts>
    </AccountCard>,
  );
  expect(container.querySelectorAll("ul")).toHaveLength(0);
  expect(container.querySelectorAll("li")).toHaveLength(0);
  // 헤더는 그대로 있다 — 목록이 없는 것이지 머리가 없는 것이 아니다.
  expect(container.querySelector("h2")?.textContent).toBe("Profile");
});
