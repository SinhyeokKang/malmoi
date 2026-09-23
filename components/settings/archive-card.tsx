"use client";

import { useRef, useTransition } from "react";

import { archiveProject, unarchiveProject } from "@/app/(edit)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";

/**
 * 보관 카드 — settings-block **여섯째, 맨 아래** (7단계 — PRODUCT §7.9 · DESIGN §6.6).
 *
 * ⚠️ **인라인 결과 Alert가 없다.** 성공하면 Action이 `revalidatePath("/", "layout")`을 부르고 이
 * 화면이 다시 그려지는데, 결과 문구를 여기 두면 **방금 받은 그것이 언마운트되면서 사라진다** —
 * POSTMORTEM 2026-09-07(`FirstIngestRetry`)이 정확히 그 함정이다. 여기서는 **카드 상태 전환 자체가
 * 피드백**이라(버튼이 [Restore project]로 바뀐다) 문구를 둘 이유도 없다 (`reconnect-button` 선례).
 *
 * ⚠️ **확인이 보관 쪽에만 있다.** 전 멤버의 편집·야간 sync·CI push가 한꺼번에 멈추는 일이라 클릭
 * 하나로 끝나면 안 되고, 되돌리기는 잃는 것이 없어 묻지 않는다.
 *
 * @param openPrUrl 열린 PR. **보관은 그것을 닫지 않으므로**(PRODUCT §7.9) 사람이 알고 판단해야 한다.
 *   `null`은 "없다", `undefined`는 **"확인하지 못했다"** — 조회 실패를 부재로 접으면 그 정보가 조용히
 *   사라진다 (POSTMORTEM 2026-09-03).
 */
export function ArchiveCard({
  slug,
  name,
  archived,
  openPrUrl,
}: {
  slug: string;
  name: string;
  archived: boolean;
  openPrUrl: string | null | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const cancel = useRef<HTMLButtonElement>(null);

  if (archived) {
    return (
      <Button
        variant="default"
        loading={pending} aria-busy={pending} className="[&_.animate-spin]:size-3.5"
        onClick={() => startTransition(async () => void (await unarchiveProject(slug)))}
      >
        {m.archive.restore}
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="danger" loading={pending} aria-busy={pending} className="[&_.animate-spin]:size-3.5">
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
                onClick={() => startTransition(async () => void (await archiveProject(slug)))}
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
  );
}
