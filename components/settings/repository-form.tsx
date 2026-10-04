"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { updateRepositorySettings } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Check, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form-group";
import { useLandAfter } from "@/components/ui/focus";
import { listProjectBranches } from "@/app/(edit)/projects/actions";
import { planBranchChoice, type BranchChoice } from "@/lib/onboarding/branch";
import { failureText } from "@/components/onboarding/failure";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { isSyncBranchName } from "@/lib/pull/ref-slug";
import { isRepositorySettingsError, repositorySettingsErrorMessage, settingsAccessMessage } from "@/lib/settings/message";
import { cn } from "@/lib/utils";

/** 기준 브랜치 캡션의 배치 — 오류(`FieldError`)와 안내가 같은 자리에 선다. */
const CAPTION = "min-w-0 flex-1 basis-40 @max-form:basis-full";

/**
 * ⚠️ **`unpinned`는 DB 판정이다**(`storedConnection` — 설치는 있고 리포 id가 없다, ux-drift-unify D1). 그 프로젝트의 목록 조회는
 * 서버가 반드시 `repo-not-installed`로 거부하고 그 문장("App을 설치하라")이 같은 카드의 Disconnected·Reconnect와 어긋났다
 * (malmoi#159). 거부될 조회를 부르지 않고 저장된 값을 문단으로 세운 채 연결 행과 같은 해법을 말한다.
 */
export function RepositoryForm({ slug, owner, repo, baseBranch, disabled = false, unpinned = false }: { slug: string; owner: string; repo: string; baseBranch: string; disabled?: boolean; unpinned?: boolean }) {
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
    if (disabled || unpinned) return;
    // 연결된 프로젝트의 목록은 읽기다 — 온보딩 ①의 `listRepoBranches`(쓰기 권한 요구)가 아니다 (#123).
    void listProjectBranches({ slug }).then(response => {
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
  }, [slug, owner, repo, baseBranch, disabled, unpinned]);
  const saveRef = useRef<HTMLButtonElement>(null);
  // ⚠️ 저장이 끝나면 착지한다 (audit #32) — `GeneralCard`의 이름 행과 같은 형이다. 필드는 셀렉트·입력 둘 중 하나라 id로 찾는다.
  useLandAfter(pending, () => [saveRef.current, document.getElementById("base-branch")]);
  // 편집 컨트롤이 서지 않는 갈래 — 보관·미고정·고정 목록. 셋 다 값이 문단이다.
  const fixed = disabled || unpinned || choice?.mode === "fixed";
  const editable = !fixed && choice !== undefined;
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
        if (isSyncBranchName(branch)) {
          setResult({ error: "sync-branch" });
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
        {/* `for`는 편집 컨트롤이 설 때만 — 보관·고정 갈래의 값은 문단이고 조회 중엔 대상이 없다 (audit #89). */}
        <label htmlFor={fixed || choice === undefined ? undefined : "base-branch"} className="text-foreground flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap @max-form:basis-full" id="base-branch-label"><GitBranch className="size-3.5 shrink-0" aria-hidden />{m.settings.repository.fields.branch}</label>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {fixed ? <p id="base-branch" className="text-sm">{branch}</p>
            : choice === undefined ? <div aria-busy="true"><Skeleton className="h-9 w-60 rounded-md" /></div>
            : choice.mode === "select" ? (
              <Select name="baseBranch" value={branch} disabled={pending} onValueChange={value => { setBranch(value); setResult("idle"); }}>
                <div className="flex w-60 max-w-full @max-form:min-w-0 @max-form:flex-1">
                  <SelectTrigger width="full" id="base-branch" aria-labelledby="base-branch-label base-branch" aria-describedby="base-branch-caption" aria-invalid={typeof result === "object"}>
                    <SelectValue />
                  </SelectTrigger>
                </div>
                <SelectContent>{choice.names.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
              </Select>
            ) : <div className="flex w-60 max-w-full @max-form:min-w-0 @max-form:flex-1">
              <Input width="full" id="base-branch" name="baseBranch" value={branch} disabled={pending}
                aria-invalid={typeof result === "object"} aria-describedby="base-branch-caption"
                onChange={event => { setBranch(event.target.value); setResult("idle"); }} />
            </div>}
          <Button spinnerSize="sm" ref={saveRef} type="submit" loading={pending} aria-busy={pending} disabled={!editable || branch === current}>{m.settings.repository.fields.save}</Button>
          {lookupError || failure !== null ? <FieldError id="base-branch-caption" className={CAPTION}>{lookupError ? failureText(m, lookupError) : failure !== null ? messageFor(failure) : null}</FieldError> : (
            <p id="base-branch-caption" className={cn(CAPTION, "text-foreground/60 text-xs")}>
              {disabled ? m.settings.archivedReason : unpinned ? m.settings.repository.fields.branchDisconnected : result === "saved" ? <><Check className="mr-1 inline size-3.5" aria-hidden />{m.settings.repository.fields.saved}</> : choice?.mode === "input" ? m.newProject.repo.branchTooMany : m.settings.repository.fields.branchHelp}
            </p>
          )}
          {/* 성공은 전부터 있던 live 영역에 쓴다 (audit #39 — `GeneralCard`와 같은 형). */}
          <span role="status" data-save-status="base-branch" className="sr-only">{result === "saved" && !disabled ? m.settings.repository.fields.saved : ""}</span>
        </div>
      </div>
    </form>
  );
}

/** 갈래 이름을 문구로. 모르는 값은 재시도 가능한 실패로 접는다 (`PushTokenPanel`과 같은 형). */
function messageFor(error: string): string {
  if (isRepositorySettingsError(error)) return repositorySettingsErrorMessage(m, error);
  if (isAccessError(error)) return settingsAccessMessage(m, error);
  return m.settings.repository.fields.failed;
}
