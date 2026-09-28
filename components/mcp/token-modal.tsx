"use client";

import { Box, Languages, ListChecks, Plus, Settings, Users, type LucideIcon } from "lucide-react";
import { useRef, useState, useTransition, type RefObject } from "react";

import { issueApiToken, type ApiTokenIssueResult } from "@/app/(edit)/mcp/actions";
import { CopyButton } from "@/components/onboarding/copy-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLandAfter } from "@/components/ui/focus";
import { IconTile } from "@/components/ui/icon-tile";
import { OnboardingModal } from "@/components/ui/modal";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { m } from "@/lib/i18n";
import type { TokenGrant } from "@/lib/mcp/grant";
import { cn } from "@/lib/utils";

/**
 * 토큰 생성·회전 모달 (핸드오프 `2a`–`2e` · `4a`). **`OnboardingModal` 2단계** — ① 폼 ② 값을 한 번 보여주기. ②에는 Back이 없다:
 * 토큰은 ①의 확정에서 이미 만들어졌다. 생성과 회전이 같은 Action(`issueApiToken`)이고 회전은 경고 한 장과 현재 값 채움만 다르다.
 *
 * ⚠️ **결과를 셋으로 가른다** (design §8): 명시적 거부는 입력을 유지한 채 폼 위 danger Alert(`4a` — 같은 버튼이 재시도), 호출 자체가
 * 끊긴 것은 **결과 미확인**이라 모달을 닫고 카드가 말한다(`4b` — 서버가 발급했는지 모른다). 자동 재시도는 없다.
 * ⚠️ **복사 성공만으로 닫지 않는다** — Done이 유일한 출구다(원문을 두 번 볼 길이 없다).
 */

export type ScopeProject = { id: string; name: string; repo: string };
export type TokenFormInitial = { grants: readonly TokenGrant[]; scope: "all" | "projects"; projectIds: readonly string[] };

/**
 * ⚠️ **어휘를 다시 적는다 — `TOKEN_GRANTS`를 값으로 import하지 않는다.** 그 모듈은 `lib/auth/access`를 물어 클라이언트 그래프가 넓어진다
 * (`client-graph.test.ts`). 두 벌의 대가는 `mcp-token-modal.test.tsx`가 순서까지 같다고 고정해 진다.
 */
export const GRANT_ORDER = ["translation:write", "project:settings", "member:manage", "project:create"] as const satisfies readonly TokenGrant[];

/** 만료 선택지 — `API_TOKEN_EXPIRY_DAYS`(서버 판정)와 같은 셋이다. 같은 이유로 다시 적고 DOM 테스트가 대조한다. */
export const EXPIRY = [30, 90, 365] as const;
type Expiry = (typeof EXPIRY)[number];

/** 글리프는 사이드바의 것이다(핸드오프 §7) — 같은 동작이 두 모양이 되지 않게. */
const GRANT_ICON: Record<TokenGrant, LucideIcon> = {
  "translation:write": Languages,
  "project:settings": Settings,
  "member:manage": Users,
  "project:create": Plus,
};

export function TokenModal({
  mode,
  open,
  initial,
  projects,
  onClose,
  onIssued,
  onUnconfirmed,
  returnFocusRef,
  fallbackFocusRef,
}: {
  mode: "create" | "rotate";
  open: boolean;
  initial: TokenFormInitial;
  /** 현재 멤버십(보관 제외). 0이면 `Chosen projects`가 사유와 함께 꺼진다(`2b`). */
  projects: readonly ScopeProject[];
  onClose: () => void;
  /** 서버가 발급을 확정했다 — 카드가 완료를 알린다. 뒤 페이지는 Action의 재검증으로 이미 `1b`다. */
  onIssued: () => void;
  /** 응답을 잃었다 — 모달을 닫고 카드가 복구를 안내한다(`4b`). */
  onUnconfirmed: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [expires, setExpires] = useState<Expiry>(90);
  const [grants, setGrants] = useState<ReadonlySet<TokenGrant>>(() => new Set(initial.grants));
  const noMembership = projects.length === 0;
  const [scope, setScope] = useState<"all" | "projects">(noMembership ? "all" : initial.scope);
  // ⚠️ `All my projects`로 돌아가도 체크를 기억한다(핸드오프 §13 열린 결정 3 — 다시 열었을 때 고른 것이 사라지면 되묻게 된다).
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(initial.projectIds));
  const [failed, setFailed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const doneRef = useRef<HTMLButtonElement | null>(null);

  // ⚠️ 거부 뒤 포커스는 확정 버튼에 남는다(`4a` — 단계 전이가 아니다). 진행 중 `disabled`가 포커스를 `body`로 떨어뜨리므로 커밋 뒤 되돌린다.
  useLandAfter(pending, () => (step === 1 ? submitRef.current : doneRef.current));

  const chosenIds = projects.filter((p) => chosen.has(p.id)).map((p) => p.id);
  const emptyChoice = scope === "projects" && chosenIds.length === 0;

  function toggle<T>(set: ReadonlySet<T>, value: T, on: boolean): Set<T> {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  }

  function submit() {
    if (pending || emptyChoice) return;
    setFailed(false);
    startTransition(async () => {
      let result: ApiTokenIssueResult | null;
      try {
        result = await issueApiToken({
          expiresInDays: expires,
          grants: GRANT_ORDER.filter((g) => grants.has(g)),
          scope: scope === "all" ? { kind: "all" } : { kind: "projects", projectIds: chosenIds },
        });
      } catch {
        // 호출이 끊기면 서버가 발급했는지 모른다 — 성공으로도 실패로도 단정하지 않는다(재시도하면 두 번째 토큰이 첫째를 덮는다).
        result = null;
      }
      if (result === null) {
        onUnconfirmed();
        return;
      }
      if (result.ok) {
        setToken(result.token);
        setStep(2);
        onIssued();
        return;
      }
      setFailed(true);
    });
  }

  const title = step === 2 ? m.mcpConnector.result.title : mode === "rotate" ? m.mcpConnector.form.rotateTitle : m.mcpConnector.form.createTitle;
  const status = step === 2 ? m.mcpConnector.form.step(2) : emptyChoice ? m.mcpConnector.form.chooseOne : m.mcpConnector.form.step(1);

  return (
    <OnboardingModal
      open={open}
      onClose={onClose}
      title={title}
      transitionKey={String(step)}
      closeLabel={m.common.close}
      closeDisabled={pending}
      returnFocusRef={returnFocusRef}
      fallbackFocusRef={fallbackFocusRef}
      footer={<span data-token-status>{status}</span>}
      actions={
        step === 1 ? (
          <>
            <Button type="button" size="lg" disabled={pending} onClick={onClose}>
              {m.common.cancel}
            </Button>
            <Button ref={submitRef} type="button" variant="primary" size="lg" loading={pending} disabled={emptyChoice} onClick={submit}>
              {mode === "rotate" ? m.mcpConnector.form.rotateConfirm : m.mcpConnector.form.create}
            </Button>
          </>
        ) : (
          <Button ref={doneRef} type="button" variant="primary" size="lg" onClick={onClose}>
            {m.mcpConnector.result.done}
          </Button>
        )
      }
    >
      {step === 2 && token !== null ? (
        <div data-token-result className="flex flex-col gap-3">
          <p className="text-sm">
            <strong className="font-normal">{m.mcpConnector.result.copyNow}</strong>
          </p>
          <div className="flex items-center gap-2">
            {/* ④ 토큰 칩과 같은 형(36 · radius 10 · muted) — 크기만 14다(핸드오프 §4). 전체 선택으로 손 복사가 된다. */}
            <code data-token-value className="border-input bg-muted flex h-9 min-w-0 flex-1 items-center truncate rounded-md border px-2.5 font-sans text-sm select-all">
              {token}
            </code>
            <CopyButton value={token} />
          </div>
          <p className="text-muted-foreground text-xs leading-[1.7]">{m.mcpConnector.result.setEnv}</p>
        </div>
      ) : (
        <div data-token-form className="flex flex-col gap-6">
          {mode === "rotate" && <Alert variant="warning">{m.mcpConnector.form.rotateWarning}</Alert>}
          {failed && <Alert variant="danger">{m.mcpConnector.form.failed}</Alert>}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{m.mcpConnector.form.expiresIn}</span>
            <SegmentedControl
              label={m.mcpConnector.form.expiresIn}
              value={String(expires)}
              options={EXPIRY.map((days) => ({ value: String(days), label: m.mcpConnector.form.days(days) }))}
              onChange={(value) => setExpires(Number(value) as Expiry)}
              className="w-[360px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span id="token-grants-label" className="text-sm font-medium">{m.mcpConnector.form.grants}</span>
            {/* 2×2 격자 — 칸 사이 세로·가로 선은 `#f0f0f0`(핸드오프 §4). 항목이 넷으로 고정이라 높이가 절반이 된다. */}
            <ul role="group" aria-labelledby="token-grants-label" aria-describedby="token-grants-help" className="border-border grid grid-cols-2 overflow-hidden rounded-md border">
              {GRANT_ORDER.map((grant, index) => {
                const Icon = GRANT_ICON[grant];
                const copy = m.mcpConnector.grants[grant];
                return (
                  <li key={grant} className={cn(index % 2 === 1 && "border-divider border-l", index >= 2 && "border-divider border-t")}>
                    <label className="hover:bg-foreground/3 flex cursor-pointer items-center gap-3 p-3">
                      <Checkbox
                        data-grant={grant}
                        checked={grants.has(grant)}
                        disabled={pending}
                        onCheckedChange={(on) => setGrants((set) => toggle(set, grant, on === true))}
                      />
                      <IconTile size="lg" className="bg-muted">
                        <Icon aria-hidden />
                      </IconTile>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-base font-medium">{copy.label}</span>
                        <span className="text-muted-foreground text-sm">{copy.hint}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p id="token-grants-help" className="text-muted-foreground text-xs leading-[1.7]">{m.mcpConnector.form.grantsHelp}</p>
          </div>

          <div className="flex flex-col gap-2">
            <span id="token-scope-label" className="text-sm font-medium">{m.mcpConnector.form.scope}</span>
            <RadioGroup
              aria-labelledby="token-scope-label"
              value={scope}
              onValueChange={(value) => setScope(value === "projects" ? "projects" : "all")}
              disabled={pending}
              className="border-border flex flex-col overflow-hidden rounded-md border"
            >
              <ScopeRow value="all" icon={Box} label={m.mcpConnector.form.allMine} selected={scope === "all"} />
              {noMembership ? (
                /*
                  ⚠️ **`aria-disabled` + 사유다 — 사유 없는 `disabled` 0건 원칙**(§6.65). 포커스를 받고 둘째 줄을 읽힌다.
                  Radix Item이 아니다 — `disabled`로 세우면 Tab 순서에서 빠져 사유가 안 읽힌다.
                */
                <span
                  role="radio"
                  aria-checked={false}
                  aria-disabled
                  aria-describedby="token-scope-reason"
                  tabIndex={0}
                  className="border-border focus-visible:ring-ring flex cursor-not-allowed items-center gap-3 border-t p-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <span aria-hidden className="size-4 shrink-0 rounded-full border border-neutral-300 opacity-50" />
                  <IconTile size="lg" className="bg-muted text-neutral-400">
                    <ListChecks aria-hidden />
                  </IconTile>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-medium text-neutral-400">{m.mcpConnector.form.chosen}</span>
                    <span id="token-scope-reason" className="text-muted-foreground text-sm">{m.mcpConnector.form.noMembership}</span>
                  </span>
                </span>
              ) : (
                /* 선택된 `Chosen projects` 행과 하위 체크 행이 한 `#f5f5f5` 면이다(`2e`). 닫혀 있는 동안 Scope가 두 행으로 끝난다. */
                <div className={cn("border-border border-t", scope === "projects" && "bg-muted")}>
                  <ScopeRow value="projects" icon={ListChecks} label={m.mcpConnector.form.chosen} selected={scope === "projects"} />
                  {scope === "projects" && (
                    <ul data-scope-projects>
                      {projects.map((project) => (
                        <li key={project.id} className="border-border border-t">
                          {/* 들여쓰기 80 = 라디오 16 + gap 12 + 칩 40 + gap 12 — 선택 행의 이름과 같은 x에서 시작한다. */}
                          <label className="flex cursor-pointer items-center gap-3 py-3 pr-3 pl-20">
                            <Checkbox
                              data-scope-project={project.id}
                              checked={chosen.has(project.id)}
                              disabled={pending}
                              onCheckedChange={(on) => setChosen((set) => toggle(set, project.id, on === true))}
                            />
                            <span className="min-w-0 truncate text-sm font-medium">{project.name}</span>
                            <span className="text-foreground/60 ml-auto shrink-0 text-xs">{project.repo}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </RadioGroup>
          </div>
        </div>
      )}
    </OnboardingModal>
  );
}

function ScopeRow({ value, icon: Icon, label, selected }: { value: "all" | "projects"; icon: LucideIcon; label: string; selected: boolean }) {
  return (
    <Radio
      value={value}
      data-scope={value}
      labelClassName={cn("gap-3 p-3", value === "all" && selected && "bg-muted")}
      label={
        <>
          <IconTile size="lg" className={selected ? "bg-background" : "bg-muted"}>
            <Icon aria-hidden />
          </IconTile>
          <span className="min-w-0 flex-1 text-base font-medium">{label}</span>
        </>
      }
    />
  );
}
