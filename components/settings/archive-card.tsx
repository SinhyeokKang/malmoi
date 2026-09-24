"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { archiveProject, unarchiveProject, type ArchiveResult } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { landFocus, useLandAfter } from "@/components/ui/focus";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";

/**
 * ⚠️ **성공한 전환의 착지를 새 인스턴스에 넘긴다** (malmoi#82). Settings는 같은 카드를 **두 자리**(보관이면 General 위,
 * 아니면 CI 아래)에 그려서 전환이 이 컴포넌트를 **재마운트**한다 — 기다리던 `useLandAfter`가 옛 인스턴스와 함께 사라졌다.
 * 자리를 하나로 묶고 CSS `order`로 옮기는 길은 버렸다: 보이는 순서와 DOM(Tab·낭독) 순서가 갈린다(WCAG 1.3.2).
 * ⚠️ **몇 초 안에만 유효하다** — Home 배너처럼 성공 뒤 카드가 아예 안 서는 자리에서는 넘긴 값이 남는데, 나중에 다른 화면이 이
 * 카드를 세울 때 포커스를 훔치면 안 된다. `landFocus`도 포커스가 빠졌을 때만 옮긴다.
 */
let handoff: { slug: string; at: number } | null = null;
const HANDOFF_MS = 5_000;

/**
 * 보관 카드 — settings-block **여섯째, 맨 아래** (7단계 — PRODUCT §7.9 · DESIGN §6.6).
 *
 * ⚠️ **성공 Alert가 없다.** 성공하면 Action이 `revalidatePath("/", "layout")`을 부르고 이
 * 화면이 다시 그려지는데, 결과 문구를 여기 두면 **방금 받은 그것이 언마운트되면서 사라진다** —
 * POSTMORTEM 2026-09-07(`FirstIngestRetry`)이 정확히 그 함정이다. 여기서는 **카드 상태 전환 자체가
 * 피드백**이라(버튼이 [Restore project]로 바뀐다) 문구를 둘 이유도 없다 (`reconnect-button` 선례).
 * ⚠️ **거부는 다르다** (audit #7) — 버튼이 제자리로 돌아올 뿐이라 사유를 말하지 않으면 누른 사람은 무엇이 안 됐는지
 * 모른다. 거부는 revalidate가 없어 블록 안 Alert가 살아남는다.
 *
 * ⚠️ **확인이 보관 쪽에만 있다.** 전 멤버의 편집·야간 sync·CI push가 한꺼번에 멈추는 일이라 클릭
 * 하나로 끝나면 안 되고, 되돌리기는 잃는 것이 없어 묻지 않는다.
 *
 * @param openPrUrl 열린 PR. **보관은 그것을 닫지 않으므로**(PRODUCT §7.9) 사람이 알고 판단해야 한다.
 *   `null`은 "없다", `undefined`는 **"확인하지 못했다"** — 조회 실패를 부재로 접으면 그 정보가 조용히
 *   사라진다 (POSTMORTEM 2026-09-03).
 * @param onFailure 거부 문구를 **바깥이 든다** (r1) — 실패는 문자열, 다시 누르면 `null`. Home 배너의 `actions` 안에서
 *   자기 아래에 Alert를 세우면 warning 배너 속 danger Alert로 중첩된다. 안 주면 블록 안에 그린다(Settings 행).
 *   `ReconnectButton`·`DisconnectGithubButton`의 `onFailure`와 같은 계약이다.
 */
export function ArchiveCard({
  slug,
  name,
  archived,
  openPrUrl,
  onFailure,
}: {
  slug: string;
  name: string;
  archived: boolean;
  openPrUrl: string | null | undefined;
  onFailure?: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  /**
   * ⚠️ **성공하면 버튼이 바뀐다** (audit #32) — 보관 ↔ 복원이 서로 다른 갈래라 누른 버튼이 언마운트되고 포커스가 `body`로
   * 빠진다. 두 갈래가 같은 ref를 쥐고, revalidate가 실린 커밋 뒤에 새 버튼으로 착지한다. [Archive]는 Dialog 트리거라 진행 중에도
   * `busy`로 포커스를 지키고, [Restore]는 트리거가 아니라 `loading` 그대로다(끝난 뒤의 착지가 받는다).
   */
  const button = useRef<HTMLButtonElement>(null);
  useLandAfter(pending, () => button.current);
  useEffect(() => {
    const passed = handoff;
    if (passed === null || passed.slug !== slug) return;
    handoff = null;
    if (Date.now() - passed.at < HANDOFF_MS) landFocus(button.current);
  }, [slug]);

  /** ⚠️ **던져도 제자리로 돌아온다** — 통신이 끊기면 서버가 바꿨는지 모르므로 사유 대신 확인 불가를 말한다. */
  const report = (message: string | null) => { if (onFailure) onFailure(message); else setError(message); };
  function run(action: (slug: string) => Promise<ArchiveResult>) {
    report(null);
    startTransition(async () => {
      let result: ArchiveResult | null;
      try { result = await action(slug); } catch { result = null; }
      if (result?.ok) handoff = { slug, at: Date.now() };
      if (result === null) report(m.archive.failedUnknown);
      else if (!result.ok) report(isAccessError(result.error) ? accessErrorMessage(result.error) : m.archive.failed(result.error));
    });
  }
  /*
    ⚠️ **루트가 버튼이 아니라 래퍼다** — Settings 행의 좁은 폭 규칙이 `[&>[data-archive-card]]`로 이 자리를 옮긴다.
    Alert를 형제로 밖에 두면 호출부 둘(Settings 행 · Home 배너 actions)이 각자 자리를 만들어야 한다.
  */
  const alert = error !== null && <Alert variant="danger" className="max-w-80">{error}</Alert>;

  if (archived) {
    return (
      <div data-archive-card className="shrink-0 space-y-2">
        <Button
          ref={button}
          variant="default"
          loading={pending} aria-busy={pending} className="[&_.animate-spin]:size-3.5"
          onClick={() => run(unarchiveProject)}
        >
          {m.archive.restore}
        </Button>
        {alert}
      </div>
    );
  }

  return (
    <div data-archive-card className="shrink-0 space-y-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button ref={button} variant="danger" busy={pending} className="[&_.animate-spin]:size-3.5">
            {m.archive.action}
          </Button>
        </DialogTrigger>
        <DialogContent
          onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}
          title={m.archive.confirm.title(name)}
          description={m.archive.confirm.body}
          footer={
            <>
              <DialogClose asChild>
                <Button ref={cancel} variant="default">{m.archive.confirm.cancel}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="danger"
                  onClick={() => run(archiveProject)}
                >
                  {m.archive.action}
                </Button>
              </DialogClose>
            </>
          }
        >
          {openPrUrl === undefined ? (
            <p className="text-muted-foreground text-xs">{m.archive.confirm.prUnknown}</p>
          ) : openPrUrl !== null ? (
            <p className="text-xs">
              {m.archive.confirm.openPr}{" "}
              <a
                href={openPrUrl}
                target="_blank"
                rel="noreferrer"
                className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
              >
                {m.archive.confirm.openPrLink}
              </a>
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      {alert}
    </div>
  );
}
