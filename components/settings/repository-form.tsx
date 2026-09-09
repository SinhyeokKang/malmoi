"use client";

import { useState, useTransition } from "react";

import { updateRepositorySettings } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { baseLocaleFieldValue } from "@/lib/onboarding/base-pending";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "@/lib/settings/message";

/**
 * 기준 브랜치·기준 로케일 (6b-3 — design §3.13). **한 폼이라 저장 버튼도 하나다.**
 *
 * ⚠️ **두 필드가 쓰는 것의 성질이 다르고 help 문구가 그것을 말한다**: 브랜치는 즉시 반영되고,
 * 언어는 **선언**만 저장돼 다음 CI push에서 실제로 바뀐다. 안 말하면 저장 직후 표의 base 열이
 * 그대로인 것이 버그로 보인다.
 *
 * ⚠️ **orphaned 로케일을 목록에 넣지 않는다.** 그 파일은 리포에서 사라졌고 base로 세우면 다음
 * push가 키 0개를 낸다 — 감추는 것은 편의이고 **방어는 Action**(`planBaseLocaleChange`)이다.
 * 렌더 뒤에 orphaned가 된 경우가 그 갈래가 실제로 닿는 경로다.
 *
 * ⚠️ **실패는 in-block `Alert danger`다** (DESIGN §6.6) — 블록이 각자 실패하고, 페이지 수준
 * 거부(`?e=`)만 global Alert다.
 *
 * ⚠️ **브랜치 형식은 보내기 전에 여기서도 본다** — 왕복 없이 답하는 편이 낫고, 무엇보다 판정이
 * **한 벌**이어야 한다(`isValidBranchName`이 잎인 이유다 — 그 모듈에 import을 더하면
 * `lib/pull`의 그래프가 클라이언트 번들로 따라온다). **방어는 여전히 Action**이다.
 */
export function RepositoryForm({
  slug,
  baseBranch,
  baseLocale,
  declaredBaseLocale,
  locales,
}: {
  slug: string;
  baseBranch: string;
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
  const [branch, setBranch] = useState(baseBranch);
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
        // 같은 갈래 이름을 쓴다 — 문구가 두 벌이면 서버가 거부할 때와 다른 말을 한다.
        if (!isValidBranchName(branch)) {
          setResult({ error: "invalid-branch" });
          return;
        }
        startTransition(async () => {
          const next = await updateRepositorySettings({ slug, baseBranch: branch, baseLocale: locale });
          setResult(next.ok ? "saved" : { error: next.error });
        });
      }}
    >
      <FormGroup
        label={m.settings.repository.fields.branch}
        htmlFor="base-branch"
        help={m.settings.repository.fields.branchHelp}
      >
        <Input
          id="base-branch"
          name="baseBranch"
          value={branch}
          // ⚠️ 트림하지 않는다 — 저장값과 보이는 값이 갈리면 `checkFormat`에서 조용한 409가 된다
          // (`isValidBranchName`이 앞뒤 공백을 거부하는 것과 같은 근거).
          onChange={(event) => setBranch(event.target.value)}
        />
      </FormGroup>

      <FormGroup
        label={m.settings.repository.fields.locale}
        htmlFor="base-locale"
        help={m.settings.repository.fields.localeHelp}
      >
        <Select
          id="base-locale"
          name="baseLocale"
          value={locale}
          disabled={noLocales}
          onChange={(event) => setLocale(event.target.value)}
        >
          {locales.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </FormGroup>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending} loadingLabel={m.settings.repository.fields.saving} disabled={noLocales}>
          {m.settings.repository.fields.save}
        </Button>
        {result === "saved" && (
          <span className="text-muted-foreground text-xs">{m.settings.repository.fields.saved}</span>
        )}
        {/*
          ⚠️ **왜 저장할 수 없는지 말한다** (code-review 2026-09-09 🟡). Action이 `baseLocale`을
          필수로 받으므로 로케일 목록이 비면 폼 전체가 막히는데, 이유가 없으면 브랜치 필드가
          고장난 것으로 보인다. 첫 적재 전에는 `baseBranch`가 이미 리포의 default branch다.
        */}
        {noLocales && (
          <span className="text-muted-foreground text-xs">{m.settings.repository.fields.noLocales}</span>
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
  return m.settings.repository.fields.failed;
}
