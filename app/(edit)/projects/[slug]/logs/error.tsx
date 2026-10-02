"use client";

import { ErrorState } from "@/components/ui/error-state";


import { PanelBody } from "@/components/shell/content-panel";


import { m } from "@/lib/i18n";

/**
 * Logs의 **조회 실패 화면** (logs-rework 결정 16).
 *
 * ⚠️ **all-or-nothing이다.** 최초 목록·새로고침·다음 페이지·상세 중 **어느 조회가 실패해도** 페이지
 * 전체가 여기로 온다 — 부분 오류도, 마지막 성공 목록 보존도 만들지 않는다. 시안 `1i`는 "이미 읽은
 * 목록은 남긴다"로 그렸고 **리뷰가 그것을 뒤집었다**: 두 목록을 한 화면에 세우면 어느 쪽이 지금
 * 사실인지 말할 수 없다.
 *
 * ⚠️ **빈 상태로 접지 않는다** — "이력이 없다"와 "이력을 못 읽었다"는 반대 사실이다
 * (POSTMORTEM 2026-09-03). 그래서 문구가 그것을 **첫 문장에서** 뒤집는다.
 *
 * ⚠️ **`reset`이 아니라 `retry`다** (audit-ux #11 — Next 16.3). `reset`은 다시 그리기만 하고 서버에서 다시 가져오지
 * 않아 같은 조회 실패가 그대로 났다(이 주석이 반대를 말하고 있었다). `retry`가 **현재 URL을 다시 조회한다** —
 * 필터·검색·커서·`event`가 그대로 남아 있으므로 재시도가 보고 있던 것을 되찾는다.
 *
 * 글리프는 §2.4 글리프 열의 실패 `CircleX`다(2026-10-01 — `CircleAlert`는 필드 오류 전용). 셸 공용 경계(`(edit)/error.tsx`)가 같은 형이다.
 */
export default function LogsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    // 세로 중앙은 `flex-1`이 든다 — 셸 오류 경계·not-found 둘과 같은 형(malmoi#162).
    <PanelBody className="flex flex-col">
      <div className="flex flex-1 items-center justify-center">
        <ErrorState title={m.logs.queryError.title} description={m.logs.queryError.description} retry={retry} retryLabel={m.logs.queryError.retry} />
      </div>
    </PanelBody>
  );
}
