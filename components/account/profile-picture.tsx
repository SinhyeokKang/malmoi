"use client";

import { useState, useTransition } from "react";

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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <FileInput
          accept="image/png,image/jpeg"
          loading={pending}
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
            startTransition(async () => {
              const result = await uploadProfileImage(form);
              setFailure(result.ok ? null : uploadRejectMessage(result.reason));
            });
          }}
        >
          {m.account.picture.upload}
        </FileInput>
        <Button
          variant="ghost"
          disabled={!hasPicture}
          loading={pending && hasPicture}
          onClick={() => {
            setFailure(null);
            startTransition(async () => {
              const result = await deleteProfileImage();
              setFailure(result.ok ? null : uploadRejectMessage(result.reason));
            });
          }}
        >
          {m.account.picture.delete}
        </Button>
        {/* ⚠️ **사유 없는 `disabled`를 만들지 않는다** — 왜 못 누르는지가 옆에 선다. */}
        {!hasPicture && <span className="text-muted-foreground text-xs">{m.account.picture.noPicture}</span>}
      </div>
      <p className="text-muted-foreground text-xs">{m.account.picture.caption}</p>
      {failure !== null && <Alert variant="danger">{failure}</Alert>}
    </div>
  );
}
