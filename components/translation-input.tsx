"use client";

import { useState, useTransition } from "react";

import { saveTranslation } from "@/app/(edit)/actions";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import type { SaveInputType } from "@/lib/keys/save";
import { cn } from "@/lib/utils";

/**
 * 번역 입력 — blur 시 저장 (MVP §3.2).
 *
 * **클라이언트 컴포넌트다.** 이 파일이 서버 컴포넌트 그래프에 잘못 들어가면 `tsc`는 통과하고
 * `next build`만 잡는다 — 그래서 `/push` 1단계에 빌드 게이트가 있다.
 *
 * 낙관적 갱신을 쓰지 않는다: 저장 실패를 되돌리는 처리가 붙고, MVP §5가 그 복잡도를
 * 명시적으로 뺐다. 대신 저장 중 상태와 실패 메시지를 보여준다.
 */
export function TranslationInput({
  slug,
  keyId,
  localeCode,
  initialValue,
  disabled,
}: {
  /** 어느 프로젝트인가. **서버는 이 값을 믿지 않는다** — 인가가 멤버십 행에서 다시 꺼낸다. */
  slug: string;
  keyId: string;
  localeCode: string;
  initialValue: string;
  /** orphaned 키는 편집하지 않는다 — 코드에서 사라진 키다. */
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    // 값이 안 바뀌면 서버를 부르지 않는다 — planSave도 noop을 내지만 왕복 자체를 아낀다.
    if (value === saved) return;
    setError(null);
    startTransition(async () => {
      // 생산자에 스키마 타입을 붙인다 — `SaveInput`에 필수 필드가 늘면 여기서 컴파일 에러가 난다.
      // Action 시그니처는 `unknown`(직렬화 경계라 zod 재검증)이라 이 줄이 없으면 런타임 `invalid input`이
      // 유일한 신호다 (POSTMORTEM 2026-08-31).
      const input: SaveInputType = { slug, keyId, localeCode, value };
      const result = await saveTranslation(input);
      if (result.ok) {
        // 서버가 정규화한 값(공백만 → 빈 문자열)을 받아 화면을 맞춘다.
        setValue(result.value);
        setSaved(result.value);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setValue(saved);
        }}
        disabled={disabled || pending}
        placeholder={disabled ? "orphaned — 편집하지 않는다" : "번역 입력"}
        className={cn(
          "border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-1.5 text-sm",
          "focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:text-muted-foreground disabled:cursor-not-allowed",
          error && "border-destructive",
        )}
      />
      {/* 상태는 한 줄만 차지한다 — 행이 흔들리면 리스트가 읽기 어려워진다 */}
      {(pending || error || value !== saved) && (
        <div className="text-xs">
          {error ? (
            <span className="text-destructive">{failureText(error)}</span>
          ) : pending ? (
            <span className="text-muted-foreground">저장 중…</span>
          ) : (
            <span className="text-muted-foreground">저장되지 않음 (포커스를 벗어나면 저장)</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 서버가 준 거부 사유를 사람 말로. **읽는 사람은 비개발자 동료다** (SAAS §3) — 그 자리에
 * `unauthorized` 같은 영어 토큰이 뜨면 무슨 일이 일어났는지 알 수 없다.
 *
 * ⚠️ **DB 세션에서 "권한 회수가 즉시 반영된다"는 성질이 사용자에게는 이 한 줄로만 드러난다.**
 * 그래서 입력값을 지우지 않는다 — 다시 로그인하면 그대로 저장할 수 있어야 한다.
 */
function failureText(error: string): string {
  if (isAccessError(error)) return accessErrorMessage(error);
  // 인가 밖의 사유(입력 검증·orphaned)는 원문을 남긴다 — 개발자가 보는 신호다.
  return `저장 실패: ${error}`;
}
