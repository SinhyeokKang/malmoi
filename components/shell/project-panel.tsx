"use client";

import { useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { m } from "@/lib/i18n";

/** 시안의 `SegmentedControls`가 든 갈래 둘. 내용은 8-P가 채운다. */
const TABS = [
  { value: "general", label: m.common.panel.general },
  { value: "changes", label: m.common.panel.changes },
] as const;

/**
 * 프로젝트 화면 오른쪽의 320px 패널 — **골격만이다** (8-2, 시안 `212:995`).
 *
 * ⚠️ **내용을 지금 만들지 않는다.** 시안에 있는 것은 빈 320 프레임과 세그먼트 컨트롤 하나뿐이고,
 * `Changes`가 보여줄 diff는 **UI가 아니라 새 서버 능력**이다 — 커밋 없이 렌더만 하는 경로와
 * "접힌 상태에서 GitHub 0회"가 함께 와야 한다(SAAS §8). 그것을 8-P로 뗐다: UI만 먼저 만들면
 * 빈 껍데기를 두 번 그린다.
 *
 * ⚠️ **`[slug]` 레이아웃이 마운트한다** — 셸은 `/projects` 목록도 감싸 slug를 모른다. 8-P가
 * 서버 데이터를 실을 자리가 그 레이아웃이다.
 */
export function ProjectPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("general");

  return (
    <aside
      aria-label={m.common.panel.label}
      className="border-border-subtle bg-background shadow-low flex w-80 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border p-2"
    >
      <SegmentedControl label={m.common.panel.view} value={tab} options={TABS} onChange={setTab} />
      {/* 비어 있다는 것이 지금 참인 전부다 — 예고를 쓰지 않는다 (DESIGN §10). */}
      <p className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        {m.common.panel.empty}
      </p>
    </aside>
  );
}
