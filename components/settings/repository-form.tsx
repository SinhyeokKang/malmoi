"use client";

import { useState, useTransition } from "react";

import { updateRepositorySettings } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Check, CircleAlert, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "@/lib/settings/message";

export function RepositoryForm({ slug, baseBranch, disabled = false }: { slug: string; baseBranch: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [branch, setBranch] = useState(baseBranch);
  const [result, setResult] = useState<"idle" | "saved" | { error: string }>("idle");
  // 저장된 값 — 같은 값의 [Save]는 눌러도 아무 일이 없는 버튼이라 끈다.
  const [current, setCurrent] = useState(baseBranch);

  return (
    <form
      className="border-border bg-muted border-t pl-10"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || pending) return;
        setResult("idle");
        // 같은 갈래 이름을 쓴다 — 문구가 두 벌이면 서버가 거부할 때와 다른 말을 한다.
        if (!isValidBranchName(branch)) {
          setResult({ error: "invalid-branch" });
          return;
        }
        startTransition(async () => {
          try { const next = await updateRepositorySettings({ slug, baseBranch: branch }); if (next.ok) { setCurrent(branch); setResult("saved"); } else setResult({ error: next.error }); }
          catch { setResult({ error: "unavailable" }); }
        });
      }}
    >
      {/* ⚠️ 이 행은 `bg-muted` 면이다 — 그 위의 `text-muted-foreground`는 4.35:1로 AA 하한을 깨서 캡션이 `text-foreground/60`이다 (온보딩 ①과 같은 판정). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-[6px] px-4 py-3.5">
        <label htmlFor="base-branch" className="text-foreground flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap @max-[640px]:basis-full"><GitBranch className="size-3.5 shrink-0" aria-hidden />{m.settings.repository.fields.branch}</label>
        <div className="[&_.animate-spin]:size-3.5 flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Input id="base-branch" name="baseBranch" className="w-60 max-w-full @max-[640px]:min-w-0 @max-[640px]:flex-1" value={branch} disabled={disabled || pending}
            aria-invalid={typeof result === "object"} aria-describedby="base-branch-caption"
            onChange={event => { setBranch(event.target.value); setResult("idle"); }} />
          <Button type="submit" loading={pending} aria-busy={pending} disabled={disabled || branch === current}>{m.settings.repository.fields.save}</Button>
          <p id="base-branch-caption" role={typeof result === "object" ? "alert" : undefined} className={typeof result === "object" ? "text-destructive min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs" : "text-foreground/60 min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs"}>
            {typeof result === "object" ? <><CircleAlert className="mr-1 inline size-3.5" aria-hidden />{messageFor(result.error)}</> : disabled ? m.settings.archivedReason : result === "saved" ? <><Check className="mr-1 inline size-3.5" aria-hidden />{m.settings.repository.fields.saved}</> : m.settings.repository.fields.branchHelp}
          </p>
        </div>
      </div>
    </form>
  );
}

/** 갈래 이름을 문구로. 모르는 값은 재시도 가능한 실패로 접는다 (`PushTokenPanel`과 같은 형). */
function messageFor(error: string): string {
  if (isRepositorySettingsError(error)) return repositorySettingsErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return m.settings.repository.fields.failed;
}
