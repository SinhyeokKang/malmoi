import type { ReactNode } from "react";

import { m } from "@/lib/i18n";

import { CopyButton } from "./copy-button";

/**
 * 복사용 워크플로 YAML (DESIGN §6.6). **여러 줄이라 값 칩이 아니다** — `<pre>`가 DESIGN §6.4의
 * "코드 블록"이다.
 *
 * ⚠️ **`overflow-x-auto`가 `<pre>` 자신에 붙는다.** 없으면 긴 줄(`${{ secrets.PUSH_TOKEN }}`이 들어간
 * 줄)이 페이지 본문을 좌우로 흔든다 — 넓은 표를 자기 컨테이너에서만 스크롤하게 하는 것과 같은 규칙이다.
 *
 * ⚠️ **훅 안내(`wrapper` input)를 이 컴포넌트가 들지 않는다** (2026-09-13 사용자 — 핸드오프 1d의
 * `<pre>` 아래는 **한 줄뿐**이다). 훅 기반 리포(`useTranslations()` 류)가 코드 참조 0을 받는 것은
 * 실재하는 빚이지만, **그 사실이 드러나는 시점은 첫 CI push 뒤**다 — 아직 아무것도 안 돌린 ④에서
 * 미리 말하면 그 화면이 읽어야 할 것(토큰·YAML) 옆에 지금 할 수 없는 일이 나란히 선다.
 * **설정 화면이 든다** — 거기는 참조가 0인 것을 이미 볼 수 있는 자리다.
 */
export function WorkflowBlock({
  yaml,
  /*
    ⚠️ **기본값이 옛 표현 그대로다** — `text-foreground`를 더하면 **설정 화면의 파일명이 진해진다**.
    그 화면은 이번 작업에서 실물로 안 봤고, 안 본 화면의 표현을 기본값으로 바꾸지 않는다
    (`Th`의 `bg-muted/50`을 그대로 둔 것과 같은 기준).
  */
  saveAs = m.settings.workflow.saveAs(".github/workflows/malmoi-i18n.yml"),
  copyLabel = m.settings.workflow.copy,
}: {
  yaml: string;
  /**
   * ⚠️ **문구가 화면마다 다르다.** 설정은 "Save this in your repository as …"(이미 있는 프로젝트에
   * 덧붙이는 맥락)이고 온보딩 ④는 "Save as …"(막 만든 것을 저장하는 맥락)다. 기본값이 설정 쪽이라
   * 그 화면은 움직이지 않는다.
   */
  saveAs?: ReactNode;
  copyLabel?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <p className="text-muted-foreground min-w-0 text-xs leading-[1.6]">{saveAs}</p>
        {/* ⚠️ **28(sm)이다** — 코드 블록 상단의 보조 행동이라 토큰 칩 옆의 36과 급이 다르다 (시안 1d). */}
        <CopyButton value={yaml} label={copyLabel} size="sm" />
      </div>
      {/*
        ⚠️ **블록 자신이 스크롤한다** (핸드오프 1d: `min-height:0; flex:1; overflow:auto`). 본문이
        스크롤하면 ④의 토큰 칩이 화면 밖으로 밀려, 토큰을 옮기려는 사용자가 위로 되돌아가야 한다.
      */}
      <pre className="text-mono bg-muted min-h-0 flex-1 overflow-auto rounded-md p-3">{yaml}</pre>
    </div>
  );
}
