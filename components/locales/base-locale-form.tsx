"use client";

import { useState, useTransition } from "react";

import { updateBaseLocale } from "@/app/(edit)/projects/[slug]/locales/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormGroup } from "@/components/ui/form-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { baseLocaleFieldValue } from "@/lib/onboarding/base-pending";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "@/lib/settings/message";

/**
 * 기준 언어 지정 (6b-5 — 6b-3이 설정 화면의 `RepositoryForm`에 뒀던 것을 여기로 옮겼다).
 *
 * ⚠️ **선언만 저장된다.** 현실(`Project.baseLocale`)은 push가 소유하고 pull이 그것을 읽으므로,
 * 저장 직후 표의 base 열이 그대로인 것이 정상이다 — help 문구가 그것을 말한다. 안 말하면 버그로 보인다.
 *
 * ⚠️ **orphaned 로케일을 셀렉트에 넣지 않는다.** 그 파일은 리포에서 사라졌고 base로 세우면 다음
 * push가 키 0개를 낸다 — 감추는 것은 편의이고 **방어는 Action**(`planBaseLocaleChange`)이다.
 * 렌더 뒤에 orphaned가 된 경우가 그 갈래가 실제로 닿는 경로다.
 *
 * ⚠️ **실패는 in-block `Alert danger`다** (DESIGN §6.6) — 페이지 수준 거부(`?e=`)만 global이고,
 * 이 화면에는 그 슬롯이 없다(보내는 자리가 0이다 — 멤버 화면과 같다).
 */
export function BaseLocaleForm({
  slug,
  baseLocale,
  declaredBaseLocale,
  locales,
}: {
  slug: string;
  /** 현실 — 첫 push 전이면 null이다. */
  baseLocale: string | null;
  /**
   * 대기 중인 **선언**. ⚠️ 이것을 안 받으면 필드가 현실을 보이고, 그 상태의 저장 한 번이 대기 중인
   * 변경을 조용히 취소한다 (malmoi#20 — `baseLocaleFieldValue`의 경고).
   */
  declaredBaseLocale: string | null;
  /** 살아 있는 로케일만. 서버가 걸러 내려준다. */
  locales: readonly string[];
}) {
  const [pending, startTransition] = useTransition();
  /**
   * **필드는 저장이 보낼 값을 보인다** — 선언이 있으면 선언이다 (malmoi#20). 첫 push 전에는 고를
   * 것이 없어 빈 값이고, 그때는 아래에서 폼이 disabled다.
   */
  const [locale, setLocale] = useState(
    baseLocaleFieldValue({ baseLocale, declaredBaseLocale }) ?? locales[0] ?? "",
  );
  const [result, setResult] = useState<"idle" | "saved" | { error: string }>("idle");

  const noLocales = locales.length === 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setResult("idle");
        startTransition(async () => {
          const next = await updateBaseLocale({ slug, baseLocale: locale });
          setResult(next.ok ? "saved" : { error: next.error });
        });
      }}
    >
      <FormGroup label={m.locales.field.label} labelId="base-locale-label" htmlFor="base-locale" help={m.locales.field.help}>
        <Select name="baseLocale" value={locale} disabled={noLocales} onValueChange={setLocale}>
          <SelectTrigger id="base-locale" aria-labelledby="base-locale-label base-locale" className="w-full max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormGroup>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending} disabled={noLocales}>
          {m.locales.field.save}
        </Button>
        {result === "saved" && (
          <span className="text-muted-foreground text-xs">{m.locales.field.saved}</span>
        )}
        {/* ⚠️ **왜 저장할 수 없는지 말한다** — 이유가 없으면 셀렉트가 고장난 것으로 보인다. */}
        {noLocales && (
          <span className="text-muted-foreground text-xs">{m.locales.field.noLocales}</span>
        )}
      </div>

      {typeof result === "object" && <Alert variant="danger">{messageFor(result.error)}</Alert>}
    </form>
  );
}

/** 갈래 이름을 문구로. 모르는 값은 재시도 가능한 실패로 접는다 (`PushTokenPanel`과 같은 형). */
function messageFor(error: string): string {
  if (isRepositorySettingsError(error)) return repositorySettingsErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return m.locales.field.failed;
}
