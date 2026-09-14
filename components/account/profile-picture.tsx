"use client";

import { useId, useState, useTransition } from "react";

import { deleteProfileImage, uploadProfileImage } from "@/app/(edit)/account/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { m } from "@/lib/i18n";
import { planImagePick } from "@/lib/upload/image";
import { uploadRejectMessage } from "@/lib/upload/message";

/**
 * 프로필 사진 컨트롤 (account-settings 태스크 4b).
 *
 * **거부 셋이 각자 화면에 닿는다** — 하나라도 빠지면 사유가 값으로 돌아와도 무음이다
 * (POSTMORTEM 2026-09-06):
 * ① 800 KB 초과는 **제출 전에** 사유가 보인다(`planImagePick`)
 * ② 이름만 `.png`로 바꾼 SVG는 **서버 사유**로 거절된다(`planImageUpload`의 시그니처 판정)
 * ③ 사진이 없을 때 [Delete]의 `disabled` 옆에 사유가 선다
 *
 * ⚠️ **진행률 바를 만들지 않는다** — 이 리포에 전역 스피너도 진행률 숫자도 없다. pending은
 * `Button`의 `loading`이다.
 */
export function ProfilePicture({ hasPicture }: { hasPicture: boolean }) {
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /**
   * ⚠️ **`useTransition`의 `pending` 하나를 둘이 나눠 쓰면 스피너가 엉뚱한 버튼에 선다** —
   * [Delete]를 눌렀는데 [Image upload]가 도는 것처럼 보인다. 도는 것이 무엇인지는 **스피너 위치**가
   * 말하는 유일한 신호이므로(`Button`이 라벨을 안 바꾼다) 어느 쪽인지를 따로 기억한다.
   */
  const [running, setRunning] = useState<"upload" | "delete" | null>(null);
  /** ⚠️ 위와 같은 이유 — 사유를 `aria-describedby`로 묶지 않으면 "왜 못 누르나"가 안 읽힌다. */
  const reasonId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <FileInput
          accept="image/png,image/jpeg"
          loading={pending && running === "upload"}
          /**
           * ⚠️ **도는 쪽만 막으면 둘이 동시에 돈다** (2026-09-14 리뷰). `loading`은 스피너 자리를
           * 정할 뿐이라 다른 하나는 활성으로 남고, 먼저 끝난 쪽의 `finally`가 **남의 스피너까지**
           * 끈다 — 둘 다 쉬는 것처럼 보이는 채로 나머지 하나가 계속 돈다. 막는 것은 `pending`이다.
           */
          disabled={pending}
          onPick={(file) => {
            setFailure(null);
            if (file === null) return;
            // 바이트를 안 보내기 위한 1차 방어다 — 정본은 서버다.
            const picked = planImagePick(file);
            if (!picked.ok) {
              setFailure(uploadRejectMessage(picked.reason));
              return;
            }
            const form = new FormData();
            form.set("image", file);
            setRunning("upload");
            startTransition(async () => {
              // ⚠️ **`finally`다** — 던지면(`requireUser`의 redirect 등) 스피너가 영구히 돈다.
              try {
                const result = await uploadProfileImage(form);
                setFailure(result.ok ? null : uploadRejectMessage(result.reason));
              } finally {
                setRunning(null);
              }
            });
          }}
        >
          {m.account.picture.upload}
        </FileInput>
        <Button
          variant="ghost"
          // 위와 같은 이유 — 업로드가 도는 동안 [Delete]가 활성이면 스피너가 자리를 옮긴다.
          disabled={!hasPicture || pending}
          aria-describedby={hasPicture ? undefined : reasonId}
          loading={pending && running === "delete"}
          onClick={() => {
            setFailure(null);
            setRunning("delete");
            startTransition(async () => {
              try {
                const result = await deleteProfileImage();
                setFailure(result.ok ? null : uploadRejectMessage(result.reason));
              } finally {
                setRunning(null);
              }
            });
          }}
        >
          {m.account.picture.delete}
        </Button>
        {/* ⚠️ **사유 없는 `disabled`를 만들지 않는다** — 왜 못 누르는지가 옆에 선다. */}
        {!hasPicture && <span id={reasonId} className="text-muted-foreground text-xs">{m.account.picture.noPicture}</span>}
      </div>
      <p className="text-muted-foreground text-xs">{m.account.picture.caption}</p>
      {failure !== null && <Alert variant="danger">{failure}</Alert>}
    </div>
  );
}
