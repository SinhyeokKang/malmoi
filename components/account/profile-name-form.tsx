"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState, useRef, useState } from "react";

import { updateProfileName } from "@/app/(edit)/account/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLandAfter } from "@/components/ui/focus";
import { Input } from "@/components/ui/input";
import { NAME_MAX_CHARS } from "@/lib/account/plan";
import { m } from "@/lib/i18n";

type Reason = "empty" | "too-long" | "unavailable";

/** 거부가 셋뿐이고 전부 우리 Action이 낸 값이라 사전 조회가 아니라 분기다 — 주소창 값이 아니다. */
function reasonMessage(reason: Reason): string {
  const errors = m.account.profile.errors;
  if (reason === "empty") return errors.empty;
  if (reason === "too-long") return errors.tooLong(NAME_MAX_CHARS);
  return errors.unavailable;
}

/**
 * 표시 이름 편집 (account-settings 태스크 2).
 *
 * ⚠️ **blur 저장이 아니다.** 이 리포에 blur 저장은 없다 — 마지막이던 번역 셀도 translation-rework에서
 * 명시 저장(Save · Ctrl/Cmd+Enter)으로 옮겨 갔다. 필드 하나에 그것을 쓰면 이탈이다.
 *
 * ⚠️ **성공 피드백이 토스트가 아니라 `[Save]` 오른쪽 인라인이다** (DESIGN §6.6 —
 * `repository-form.tsx`·`base-locale-form.tsx`와 같은 형). 저장 결과를 토스트로 내는 자리가
 * 이 리포에 0이고, 여기서 시작하면 같은 일에 형이 둘이 된다.
 */
export function ProfileNameForm({ name, inputId }: { name: string; inputId: string }) {
  /**
   * ⚠️ **제출값을 지우지 않는다** — 실패 뒤에 필드가 저장된 값으로 되돌아가면 방금 친 이름이
   * 사라지고 사용자는 무엇을 고쳤는지 다시 떠올려야 한다.
   */
  const [value, setValue] = useState(name);
  /**
   * ⚠️ **성공 상태가 "마지막으로 저장된 값"이다.** `"저장했다"`는 불리언으로 두고 필드 값과
   * `name` prop을 견주면, 서버가 트림한 경우(`"Jane "` → `"Jane"`) 둘이 영영 안 같아 **성공도
   * 실패도 안 보이는 무음**이 된다. 저장된 값을 들고 그것과 견준다.
   *
   * ⚠️ **성공해도 `value`를 안 건드린다.** 필드는 pending 중에도 편집되므로, 돌아온 값으로 덮으면
   * **그 사이에 이어 친 글자가 사라진다** — 위 "제출값을 지우지 않는다"가 금지하는 것과 같은 피해다.
   * 트림 차이는 표시 조건이 `value.trim()`을 보는 것으로 흡수한다.
   *
   * ⚠️ **그래서 저장 뒤 필드가 트림 **전** 문자열을 유지한다 — 의도다.** `"  Jane  "`을 저장하면
   * 저장된 값·셸 아바타·사용자 메뉴는 `"Jane"`인데 필드에는 앞공백이 들여쓰기로 보인다. 이것을
   * 버그로 읽고 `setValue(result.name)`을 되돌리면 **전송 중 편집을 덮는 쪽**으로 돌아간다.
   */
  const [state, submit, pending] = useActionState<Reason | { saved: string } | null, FormData>(async (_previous, form) => {
    // ⚠️ 던지면 `useActionState`가 error boundary로 올린다 (audit-ux #14) — 통신 실패는 `unavailable`과 같은 자리다. redirect만 되던진다.
    let result: Awaited<ReturnType<typeof updateProfileName>>;
    try { result = await updateProfileName(String(form.get("name") ?? "")); }
    catch (thrown) { unstable_rethrow(thrown); return "unavailable"; }
    return result.ok ? { saved: result.name } : result.reason;
  }, null);
  const failure = state === null || typeof state === "object" ? null : reasonMessage(state);
  const saveRef = useRef<HTMLButtonElement>(null);
  // ⚠️ 저장 중 `loading`이 [Save]를 꺼 포커스가 `body`로 빠진다 — 끝나면 다시 켜진 그 버튼으로 돌려준다 (audit #32 계열).
  useLandAfter(pending, () => saveRef.current);
  const saved = typeof state === "object" && state !== null && value.trim() === state.saved;

  return (
    <form action={submit} className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          name="name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-80"
        />
        <Button ref={saveRef} type="submit" variant="default" loading={pending}>
          {m.account.profile.save}
        </Button>
        {/* 저장된 값과 같을 때만 선다 — 다시 고치기 시작하면 이 조건이 지운다. */}
        {/* ⚠️ **live 영역이 전부터 있다** (audit #39) — 텍스트와 함께 새로 붙는 `role="status"`는 스크린리더가 놓친다. */}
        <span role="status" className="text-muted-foreground text-xs">{saved ? m.account.profile.saved : ""}</span>
      </div>
      {failure !== null && <Alert variant="danger">{failure}</Alert>}
    </form>
  );
}
