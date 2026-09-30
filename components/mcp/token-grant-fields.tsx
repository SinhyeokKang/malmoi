"use client";

import { Box, Languages, ListChecks, Plus, Settings, Users, type LucideIcon } from "lucide-react";
import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { IconTile } from "@/components/ui/icon-tile";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { m } from "@/lib/i18n";
import type { TokenGrant } from "@/lib/mcp/grant";
import { cn } from "@/lib/utils";

/**
 * 권한·범위 **필드** — 토큰 발급 모달과 `/oauth/authorize` 동의 화면이 공유한다(mcp-oauth 핸드오프 §7.6 · spec 조건 4: 어휘가 같다).
 *
 * ⚠️ **필드만 든다** — 상태 슬롯(`Step 1 of 2`·`chooseOne`·`returnTo`)·버튼·Alert·제출은 호스트 소유다. 여기에 넣으면 모달의 단계 문구가
 * 동의 화면에 새거나, 동의 전용 문장 때문에 모달이 바뀐다. 선택 0 판정은 `chosenProjectIds`가 값으로 내고 문장은 호스트가 그린다.
 * ⚠️ `columns` — 모달은 2×2, 동의 화면은 한 열(480 컬럼에서 설명이 세 줄로 꺾이지 않게 — 핸드오프 3차).
 */

export type ScopeProject = { id: string; name: string; repo: string };

/**
 * ⚠️ **어휘를 다시 적는다 — `TOKEN_GRANTS`를 값으로 import하지 않는다.** 그 모듈은 `lib/auth/access`를 물어 클라이언트 그래프가 넓어진다
 * (`client-graph.test.ts`). 두 벌의 대가는 `components/__tests__/mcp-token.test.tsx`가 순서까지 같다고 고정해 진다.
 */
export const GRANT_ORDER = ["translation:write", "project:settings", "member:manage", "project:create"] as const satisfies readonly TokenGrant[];

/** 만료 선택지 — `API_TOKEN_EXPIRY_DAYS`(서버 판정)와 같은 셋이다. 같은 이유로 다시 적고 DOM 테스트가 대조한다. */
export const EXPIRY = [30, 90, 365] as const;
export type Expiry = (typeof EXPIRY)[number];

export type GrantFieldsValue = {
  expires: Expiry;
  grants: ReadonlySet<TokenGrant>;
  scope: "all" | "projects";
  /** ⚠️ `All my projects`로 돌아가도 체크를 기억한다(mcp-connector 핸드오프 §13 열린 결정 3 — 다시 열었을 때 고른 것이 사라지면 되묻게 된다). */
  chosen: ReadonlySet<string>;
};

/** 기존 값(회전·재동의)으로 채운 초기값. 멤버십이 0이면 범위는 `all`뿐이다. 만료는 기본 90 — 서버가 처음 고른 기간을 저장하지 않는다. */
export function initialGrantFields(
  initial: { grants: readonly TokenGrant[]; scope: "all" | "projects"; projectIds: readonly string[] },
  projects: readonly ScopeProject[],
): GrantFieldsValue {
  return {
    expires: 90,
    grants: new Set(initial.grants),
    scope: projects.length === 0 ? "all" : initial.scope,
    chosen: new Set(initial.projectIds),
  };
}

/** 보낼 프로젝트 id — 목록 순서 · 현재 멤버십 안의 것만. `projects` 범위에서 이것이 비면 호스트가 확정을 막고 `chooseOne`을 말한다. */
export function chosenProjectIds(value: GrantFieldsValue, projects: readonly ScopeProject[]): string[] {
  return projects.filter((p) => value.chosen.has(p.id)).map((p) => p.id);
}

/** 글리프는 사이드바의 것이다(mcp-connector 핸드오프 §7) — 같은 동작이 두 모양이 되지 않게. */
const GRANT_ICON: Record<TokenGrant, LucideIcon> = {
  "translation:write": Languages,
  "project:settings": Settings,
  "member:manage": Users,
  "project:create": Plus,
};

function toggle<T>(set: ReadonlySet<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) next.add(value);
  else next.delete(value);
  return next;
}

export function TokenGrantFields({
  value,
  onChange,
  projects,
  disabled,
  columns = 2,
}: {
  value: GrantFieldsValue;
  onChange: (next: GrantFieldsValue) => void;
  /** 현재 멤버십(보관 제외). 0이면 `Chosen projects`가 사유와 함께 꺼진다(`2b`). */
  projects: readonly ScopeProject[];
  disabled: boolean;
  columns?: 1 | 2;
}) {
  // 두 화면이 같은 필드를 그린다 — id를 고정 문자열로 두면 한 문서에 둘이 설 때 `aria-labelledby`가 엉뚱한 라벨을 가리킨다.
  const id = useId();
  const grantsLabel = `${id}-grants-label`;
  const grantsHelp = `${id}-grants-help`;
  const scopeLabel = `${id}-scope-label`;
  const scopeReason = `${id}-scope-reason`;
  const noMembership = projects.length === 0;
  const set = (patch: Partial<GrantFieldsValue>) => onChange({ ...value, ...patch });

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{m.mcpConnector.form.expiresIn}</span>
        <SegmentedControl
          label={m.mcpConnector.form.expiresIn}
          value={String(value.expires)}
          options={EXPIRY.map((days) => ({ value: String(days), label: m.mcpConnector.form.days(days) }))}
          onChange={(next) => set({ expires: Number(next) as Expiry })}
          // 모달·동의 화면 모두 폭을 채운다(2026-09-30 사용자 — 모달의 360 고정을 걷었다).
          className="w-full"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span id={grantsLabel} className="text-sm font-medium">{m.mcpConnector.form.grants}</span>
        {/* 2×2 격자 — 칸 사이 세로·가로 선은 `#f0f0f0`(mcp-connector 핸드오프 §4). 한 열이면 가로 선만 남는다. */}
        <ul
          role="group"
          aria-labelledby={grantsLabel}
          aria-describedby={grantsHelp}
          className={cn("border-border grid overflow-hidden rounded-md border", columns === 2 ? "grid-cols-2" : "grid-cols-1")}
        >
          {GRANT_ORDER.map((grant, index) => {
            const Icon = GRANT_ICON[grant];
            const copy = m.mcpConnector.grants[grant];
            const line = columns === 2 ? cn(index % 2 === 1 && "border-divider border-l", index >= 2 && "border-divider border-t") : index > 0 && "border-divider border-t";
            return (
              <li key={grant} className={cn(line)}>
                <label className="hover:bg-foreground/[0.03] flex cursor-pointer items-center gap-3 p-3">
                  <Checkbox
                    data-grant={grant}
                    checked={value.grants.has(grant)}
                    disabled={disabled}
                    onCheckedChange={(on) => set({ grants: toggle(value.grants, grant, on === true) })}
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
        <p id={grantsHelp} className="text-muted-foreground text-xs leading-[1.7]">{m.mcpConnector.form.grantsHelp}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span id={scopeLabel} className="text-sm font-medium">{m.mcpConnector.form.scope}</span>
        <RadioGroup
          aria-labelledby={scopeLabel}
          value={value.scope}
          onValueChange={(next) => set({ scope: next === "projects" ? "projects" : "all" })}
          disabled={disabled}
          className="border-border flex flex-col overflow-hidden rounded-md border"
        >
          <ScopeRow value="all" icon={Box} label={m.mcpConnector.form.allMine} selected={value.scope === "all"} />
          {noMembership ? (
            /*
              ⚠️ **`aria-disabled` + 사유다 — 사유 없는 `disabled` 0건 원칙**(§6.65). 포커스를 받고 둘째 줄을 읽힌다.
              Radix Item이 아니다 — `disabled`로 세우면 Tab 순서에서 빠져 사유가 안 읽힌다.
            */
            <span
              role="radio"
              aria-checked={false}
              aria-disabled
              aria-describedby={scopeReason}
              tabIndex={0}
              className="border-border focus-visible:ring-ring flex cursor-not-allowed items-center gap-3 border-t p-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            >
              <span aria-hidden className="size-4 shrink-0 rounded-full border border-neutral-300 opacity-50" />
              <IconTile size="lg" className="bg-muted">
                <ListChecks aria-hidden />
              </IconTile>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-medium text-neutral-400">{m.mcpConnector.form.chosen}</span>
                <span id={scopeReason} className="text-muted-foreground text-sm">{m.mcpConnector.form.noMembership}</span>
              </span>
            </span>
          ) : (
            /* 선택된 `Chosen projects` 행과 하위 체크 행이 한 `#f5f5f5` 면이다(`2e`). 닫혀 있는 동안 Scope가 두 행으로 끝난다. */
            <div className={cn("border-border border-t", value.scope === "projects" && "bg-muted")}>
              <ScopeRow value="projects" icon={ListChecks} label={m.mcpConnector.form.chosen} selected={value.scope === "projects"} />
              {value.scope === "projects" && (
                <ul data-scope-projects>
                  {projects.map((project) => (
                    <li key={project.id} className="border-border border-t">
                      {/* 들여쓰기 80 = 라디오 16 + gap 12 + 칩 40 + gap 12 — 선택 행의 이름과 같은 x에서 시작한다. */}
                      <label className="flex cursor-pointer items-center gap-3 py-3 pr-3 pl-20">
                        <Checkbox
                          data-scope-project={project.id}
                          checked={value.chosen.has(project.id)}
                          disabled={disabled}
                          onCheckedChange={(on) => set({ chosen: toggle(value.chosen, project.id, on === true) })}
                        />
                        <span className="min-w-0 truncate text-sm font-medium" title={project.name}>{project.name}</span>
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
    </>
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
