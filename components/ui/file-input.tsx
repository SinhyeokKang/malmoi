"use client";

import { useRef, type ChangeEvent, type ReactNode } from "react";

import { Button } from "./button";

/**
 * 파일 고르기 — **프리미티브 19번째** (account-settings 태스크 4b).
 *
 * ⚠️ **raw `<input type="file">`을 화면 파일에 두지 않는다.** `focus-ring.test.ts`의
 * `RAW_TAG_ALLOWED = []`가 전면 방어선이고 그 주석이 *"다시 채우지 않는다"*로 못 박았다 —
 * 여는 태그가 프리미티브 안에 있어야 링이 한 자리에서 보장된다.
 *
 * ⚠️ **`sr-only` + 라벨 관용구를 쓰지 않는다.** 그 관용구는 포커스를 **숨은 input**이 받아
 * 보이는 것에 아무 표시가 없고, 링을 `peer-focus-visible`로 옮겨 붙이면 포커스 링 검사가 보는
 * 자리(여는 태그)와 실제로 링이 사는 자리가 갈린다. 대신 **input을 포커스 대상에서 완전히 빼고**
 * (`tabIndex={-1}` + `aria-hidden`) 보이는 컨트롤을 `Button`으로 둔다 — 링은 그 프리미티브가 든다.
 *
 * ⚠️ **`accept`가 방어선이 아니다** — 파일 대화상자의 필터일 뿐이고 사용자는 "모든 파일"을 고를 수
 * 있다. 판정은 `planImagePick`(클라이언트)과 `planImageUpload`(서버)가 든다.
 */
export function FileInput({
  accept,
  onPick,
  disabled = false,
  loading = false,
  children,
  className,
}: {
  accept: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onPick(event.target.files?.[0] ?? null);
          /**
           * ⚠️ **같은 파일을 다시 고르면 `change`가 안 난다** — 거부된 뒤 사용자가 고쳐서 같은
           * 이름으로 다시 고르는 것이 이 화면의 흔한 경로다. 값을 비워 다음 선택을 받는다.
           */
          event.target.value = "";
        }}
      />
      <Button type="button" disabled={disabled} loading={loading} onClick={() => input.current?.click()} className={className}>
        {children}
      </Button>
    </>
  );
}
