"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { saveTranslation } from "@/app/(edit)/actions";
import { useAnnounce } from "@/components/translations/announcer";
import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { shouldRefocus } from "@/lib/keys/refocus";
import type { SaveInputType } from "@/lib/keys/save";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { routes } from "@/lib/routes";

/** "Saved"가 남아 있는 시간. 903행에서 영구 텍스트가 쌓이면 표가 시끄러워진다 (design §3.8). */
const SAVED_MS = 1500;

/**
 * 번역 셀 — blur 시 저장 (MVP §3.2).
 *
 * **낙관적 갱신을 쓰지 않는다**: 저장 실패를 되돌리는 처리가 붙고, MVP §5가 그 복잡도를 명시적으로
 * 뺐다. 대신 저장 중 상태와 실패 사유를 셀 안에 보인다.
 *
 * ⚠️ **셀 안 상태줄은 시각 전용이다** — 알림은 표 하나의 live region이 든다 (`Announcer`). 셀마다
 * `role="status"`를 두면 903행 × 3로케일에 2,700개다 (design §3.8).
 *
 * ⚠️ **실패해도 포커스를 뺏지 않는다** — 판정은 `shouldRefocus`다. blur 저장은 비동기라 응답이 올 때
 * 사용자는 이미 다음 셀을 치고 있을 수 있다.
 */
export function TranslationInput({
  slug,
  keyId,
  keyName,
  localeCode,
  initialValue,
  disabled,
}: {
  /** 어느 프로젝트인가. **서버는 이 값을 믿지 않는다** — 인가가 멤버십 행에서 다시 꺼낸다. */
  slug: string;
  keyId: string;
  /** 알림 문구가 "무엇을 저장했는지" 말하려면 키 이름이 필요하다 — id는 사람이 읽을 값이 아니다. */
  keyName: string;
  localeCode: string;
  initialValue: string;
  /** orphaned 축(키·로케일 어느 쪽이든)이면 편집하지 않는다 — pull이 그 값을 내보낼 길이 없다. */
  disabled?: boolean;
}) {
  const announce = useAnnounce();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "saved" | { error: string }>("idle");
  const [pending, startTransition] = useTransition();

  // "Saved"를 지우는 타이머. 언마운트·재저장에 정리하지 않으면 사라진 셀에 setState가 간다.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  function commit(next: string) {
    // 값이 안 바뀌면 서버를 부르지 않는다 — planSave도 noop을 내지만 왕복 자체를 아낀다.
    if (next === saved) return;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus("idle");
    startTransition(async () => {
      // 생산자에 스키마 타입을 붙인다 — `SaveInput`에 필수 필드가 늘면 여기서 컴파일 에러가 난다.
      // Action 시그니처는 `unknown`(직렬화 경계라 zod 재검증)이라 이 줄이 없으면 런타임 `invalid input`이
      // 유일한 신호다 (POSTMORTEM 2026-08-31).
      const input: SaveInputType = { slug, keyId, localeCode, value: next };
      const result = await saveTranslation(input);
      if (result.ok) {
        // 서버가 정규화한 값(공백만 → 빈 문자열)을 받아 화면을 맞춘다.
        setValue(result.value);
        setSaved(result.value);
        setStatus("saved");
        announce(m.translations.announce.saved(keyName, localeCode));
        timer.current = setTimeout(() => setStatus("idle"), SAVED_MS);
        return;
      }
      setStatus({ error: result.error });
      announce(m.translations.announce.failed(keyName, localeCode, saveMessage(result.error)));
      // ⚠️ **여기서만 커서를 되돌린다.** 사용자가 이미 다른 셀에 있으면 재시도 지점은 [Retry]다.
      if (shouldRefocus(document.activeElement, ref.current)) ref.current?.focus();
    });
  }

  const failed = typeof status === "object";

  return (
    <div className="space-y-1">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit(value)}
        onKeyDown={(e) => {
          // Enter가 개행이면 저장 트리거가 blur뿐이고 개행이 값에 조용히 들어간다.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") setValue(saved);
        }}
        disabled={disabled === true || pending}
        placeholder={disabled === true ? m.translations.notEditable : m.translations.placeholder}
        aria-label={m.translations.cellLabel(keyName, localeCode)}
        // `fieldClass`가 `aria-[invalid=true]:border-destructive`를 든다 — 색을 여기서 또 주지 않는다.
        aria-invalid={failed}
        /**
         * ⚠️ **테두리 없는 표면이다** (8-4 — 시안은 값 칸에 평문만 그린다). hover·포커스에서만
         * 드러난다: 2,709개의 입력이 각자 테두리를 들면 표가 격자로 읽혀 값이 안 보인다.
         *
         * ⚠️ **`placeholder`를 지우지 않는다** — `Untranslated` 배지·상태 필터·이 테두리가 **같은
         * 배송에서** 사라지므로, 값이 빈 셀의 유일한 시각 신호가 그것뿐이다 (spec Q3).
         *
         * ⚠️ **disabled 배경은 그대로 둔다** — orphaned 축의 셀이 왜 안 눌리는지 말하는 표면이다.
         */
        className="w-full border-transparent bg-transparent hover:border-input"
      />

      {/* 상태는 한 줄만 차지한다 — 행이 흔들리면 903행 표가 읽기 어려워진다 */}
      {(pending || failed || status === "saved" || value !== saved) && (
        <div className="flex items-baseline gap-2 text-xs">
          {failed ? (
            <>
              <span className="text-destructive">{saveMessage(status.error)}</span>
              {status.error === "unauthorized" ? (
                <ButtonLink variant="link" size="sm" href={routes.signIn()}>
                  {m.translations.save.signIn}
                </ButtonLink>
              ) : (
                <Button variant="link" size="sm" onClick={() => commit(value)}>
                  {m.translations.save.retry}
                </Button>
              )}
            </>
          ) : pending ? (
            <span className="text-muted-foreground">{m.translations.save.saving}</span>
          ) : status === "saved" ? (
            <span className="text-muted-foreground">{m.translations.save.saved}</span>
          ) : (
            <span className="text-muted-foreground">{m.translations.save.unsaved}</span>
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
 * ⚠️ **완전한 문장을 돌려준다 — 앞에 "Couldn't save:"를 붙이지 않는다.** 세션 만료·장애·인가 거부는
 * 각자 다음 행동을 담은 문장이고, 접두를 붙이면 두 문장이 겹쳐 읽힌다. 접두는 그 밖의 사유
 * (입력 검증·orphaned — 개발자가 보는 신호)에만 붙는다.
 *
 * ⚠️ **DB 세션에서 "권한 회수가 즉시 반영된다"는 성질이 사용자에게는 이 한 줄로만 드러난다.**
 * 그래서 입력값을 지우지 않는다 — 다시 로그인하면 그대로 저장할 수 있어야 한다.
 */
function saveMessage(error: string): string {
  // 이 화면 고유의 문장이다 — "입력값이 남아 있다"를 말해야 사용자가 화면을 안 떠난다.
  if (error === "unauthorized") return m.translations.save.sessionEnded;
  if (error === "unavailable") return m.translations.save.unavailable;
  if (isAccessError(error)) return accessErrorMessage(error);
  // ⚠️ **온보딩 갈래도 읽는다** — 첫 적재 전 프로젝트의 `not-ready`가 여기로 온다 (2026-09-07, T6).
  if (isOnboardError(error)) return onboardErrorMessage(error);
  return m.translations.save.failed(error);
}
