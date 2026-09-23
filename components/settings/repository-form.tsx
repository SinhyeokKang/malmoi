"use client";

import { useEffect, useState, useTransition } from "react";

import { updateRepositorySettings } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Check, CircleAlert, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listRepoBranches } from "@/app/(edit)/projects/actions";
import { planBranchChoice, type BranchChoice } from "@/lib/onboarding/branch";
import { failureText } from "@/components/onboarding/failure";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { isRepositorySettingsError, repositorySettingsErrorMessage, settingsAccessMessage } from "@/lib/settings/message";

export function RepositoryForm({ slug, owner, repo, baseBranch, disabled = false }: { slug: string; owner: string; repo: string; baseBranch: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [branch, setBranch] = useState(baseBranch);
  const [result, setResult] = useState<"idle" | "saved" | { error: string }>("idle");
  // 저장된 값 — 같은 값의 [Save]는 눌러도 아무 일이 없는 버튼이라 끈다.
  const [current, setCurrent] = useState(baseBranch);

  const [choice, setChoice] = useState<BranchChoice>();
  const [lookupError, setLookupError] = useState<string>();
  useEffect(() => {
    let active = true;
    setChoice(undefined);
    setLookupError(undefined);
    setBranch(baseBranch);
    setCurrent(baseBranch);
    // 저장 후 새 props가 와도 성공 안내는 다음 사용자 선택까지 유지한다.
    if (disabled) return;
    void listRepoBranches({ owner, repo }).then(response => {
      if (!active) return;
      // 설정은 리포 기본값이 아니라 저장된 값을 보존한다. 삭제된 브랜치도 조용히 바꾸지 않는다.
      setChoice(planBranchChoice({
        names: response.ok ? response.names : undefined,
        defaultBranch: baseBranch,
        truncated: response.ok ? response.truncated : false,
      }));
      if (!response.ok) setLookupError(response.error);
    }, () => {
      if (!active) return;
      setChoice(planBranchChoice({ names: undefined, defaultBranch: baseBranch }));
      setLookupError("unavailable");
    });
    return () => { active = false; };
  }, [owner, repo, baseBranch, disabled]);
  const editable = !disabled && choice !== undefined && choice.mode !== "fixed";
  // 보관 상태가 오면(`disabled`) 옛 거부를 내린다 — 다른 행과 같은 `archivedReason` 한 문장만 선다 (QA D1).
  const failure = disabled || typeof result !== "object" ? null : result.error;

  return (
    <form
      className="border-border bg-muted border-t pl-10"
      onSubmit={(event) => {
        event.preventDefault();
        if (!editable || pending || branch === current) return;
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
        <label htmlFor="base-branch" className="text-foreground flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap @max-[640px]:basis-full" id="base-branch-label"><GitBranch className="size-3.5 shrink-0" aria-hidden />{m.settings.repository.fields.branch}</label>
        <div className="[&_.animate-spin]:size-3.5 flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {disabled || choice?.mode === "fixed" ? <p id="base-branch" className="text-sm">{branch}</p>
            : choice === undefined ? <div aria-busy="true"><Skeleton className="h-9 w-60 rounded-md" /></div>
            : choice.mode === "select" ? (
              <Select name="baseBranch" value={branch} disabled={pending} onValueChange={value => { setBranch(value); setResult("idle"); }}>
                <SelectTrigger id="base-branch" aria-labelledby="base-branch-label base-branch" aria-describedby="base-branch-caption" aria-invalid={typeof result === "object"} className="w-60 max-w-full @max-[640px]:min-w-0 @max-[640px]:flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{choice.names.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
              </Select>
            ) : <Input id="base-branch" name="baseBranch" className="w-60 max-w-full @max-[640px]:min-w-0 @max-[640px]:flex-1" value={branch} disabled={pending}
              aria-invalid={typeof result === "object"} aria-describedby="base-branch-caption"
              onChange={event => { setBranch(event.target.value); setResult("idle"); }} />}
          <Button type="submit" loading={pending} aria-busy={pending} disabled={!editable || branch === current}>{m.settings.repository.fields.save}</Button>
          <p id="base-branch-caption" role={lookupError || failure !== null ? "alert" : undefined} className={lookupError || failure !== null ? "text-destructive min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs" : "text-foreground/60 min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs"}>
            {lookupError ? <><CircleAlert className="mr-1 inline size-3.5" aria-hidden />{failureText(lookupError)}</> : failure !== null ? <><CircleAlert className="mr-1 inline size-3.5" aria-hidden />{messageFor(failure)}</> : disabled ? m.settings.archivedReason : result === "saved" ? <><Check className="mr-1 inline size-3.5" aria-hidden />{m.settings.repository.fields.saved}</> : choice?.mode === "input" ? m.newProject.repo.branchTooMany : m.settings.repository.fields.branchHelp}
          </p>
        </div>
      </div>
    </form>
  );
}

/** 갈래 이름을 문구로. 모르는 값은 재시도 가능한 실패로 접는다 (`PushTokenPanel`과 같은 형). */
function messageFor(error: string): string {
  if (isRepositorySettingsError(error)) return repositorySettingsErrorMessage(error);
  if (isAccessError(error)) return settingsAccessMessage(error);
  return m.settings.repository.fields.failed;
}
