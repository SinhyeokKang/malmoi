"use client";

import { useState, useTransition } from "react";

import { updateRepositorySettings } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "@/lib/settings/message";

/**
 * 기준 브랜치 (6b-3 — DESIGN §6.6. **6b-5가 기준 언어 필드를 `/projects/:slug/locales`로 옮겼다** —
 * PRODUCT §7.7 결정 4).
 *
 * ⚠️ **여기서 선언 컬럼을 건드리지 않는다.** 두 필드가 한 폼이던 동안, 대기 중에 화면을 새로 열면
 * 필드가 옛 언어를 보이고 **브랜치만 고친 저장이 그 선언을 지웠다**(malmoi#20). 자리를 가른 것이
 * 그 구조를 없앤다 — 이 폼이 보내는 값에 언어가 아예 없다.
 *
 * ⚠️ **실패는 in-block `Alert danger`다** (DESIGN §6.6) — 블록이 각자 실패하고, 페이지 수준
 * 거부(`?e=`)만 global Alert다.
 *
 * ⚠️ **브랜치 형식은 보내기 전에 여기서도 본다** — 왕복 없이 답하는 편이 낫고, 무엇보다 판정이
 * **한 벌**이어야 한다(`isValidBranchName`이 잎인 이유다 — 그 모듈에 import을 더하면
 * `lib/pull`의 그래프가 클라이언트 번들로 따라온다). **방어는 여전히 Action**이다.
 */
export function RepositoryForm({ slug, baseBranch }: { slug: string; baseBranch: string }) {
  const [pending, startTransition] = useTransition();
  const [branch, setBranch] = useState(baseBranch);
  const [result, setResult] = useState<"idle" | "saved" | { error: string }>("idle");

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
          const next = await updateRepositorySettings({ slug, baseBranch: branch });
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

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {m.settings.repository.fields.save}
        </Button>
        {result === "saved" && (
          <span className="text-muted-foreground text-xs">{m.settings.repository.fields.saved}</span>
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
