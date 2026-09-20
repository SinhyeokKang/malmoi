"use client";

import { FileCode2, FileJson2 } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { m } from "@/lib/i18n";
import { keyGap } from "@/lib/onboarding/key-gap";
import { languageName } from "@/lib/onboarding/language-name";
import { cn } from "@/lib/utils";
import { LOCALE_RADIO_MAX, collapseLocalePicker } from "@/lib/onboarding/locale-picker";
import { planSlug, PROJECT_SLUG_MAX } from "@/lib/onboarding/slug";
import { SYNC_BRANCH_PREFIX } from "@/lib/pull/ref-slug";

import { failureText } from "../failure";

/**
 * ③ 이름·주소·기준 언어 (DESIGN §6.7).
 *
 * ⚠️ **주소 중복을 입력 중에 조회하지 않는다** (결정 ②). 형식은 `planSlug`를 **클라이언트가 직접**
 * 부르고(잎이라 번들 비용이 0이고 왕복도 0이다), 중복은 [Create project]가 `slug-taken`으로 판정한다.
 * 실시간 조회는 `requireUser`만 지나는 무제한 읽기라 **전역 slug 공간의 열거 속도**를 연다.
 *
 * ⚠️ **배지·비교 문장은 키 수를 아는 언어에만 선다** (결정 ⑦). 모르는 언어까지 비교하면 되돌릴 수
 * 없는 결정의 근거가 "②에서 무엇을 눌렀는지"라는 우연한 이력이 된다.
 */
export type NamingStepState = {
  name: string;
  slug: string;
  baseLocale: string;
  locales: string[];
  /** 로케일 → 키 수. **아는 것만** 들어 있다 (detect의 blob 예산 ≤21). */
  keyCounts: Record<string, number>;
  /** 제출이 `slug-taken`으로 돌아왔을 때의 대안. **존재 확인이 없다.** */
  slugTakenAlt: string | undefined;
  slugTaken: boolean;
  pathTemplate: string;
  branch: string;
  banner: string | null;
};

export function NamingStep({
  state,
  onChange,
  surfaces,
  onBaseLocale,
  disabled = false,
}: {
  state: NamingStepState;
  disabled?: boolean;
  surfaces?: Pick<NamingStepState, "pathTemplate" | "baseLocale" | "locales" | "keyCounts">[];
  onBaseLocale?: (index: number, value: string) => void;
  onChange: (next: Partial<NamingStepState>) => void;
}) {
  const verdict = planSlug(state.slug);
  // slug 거부 술어는 하나다 — `aria-invalid`·`aria-describedby`·`FormGroup error`가 같은 것을 본다.
  const slugRejected = state.slugTaken || verdict !== "ok";
  const { slug } = state;

  return (
    <div className="flex flex-col gap-4">
      {state.banner !== null && <Alert variant="danger">{failureText(state.banner)}</Alert>}

      {/* ⚠️ **읽기 전용임을 말한다** — 리포에 아무것도 쓰지 않는다(불변식). */}
      <Alert variant="info">{m.newProject.naming.info(state.pathTemplate, state.branch)}</Alert>

      <FormGroup label={m.newProject.naming.name} htmlFor="project-name">
        <Input
          id="project-name"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full"
        />
      </FormGroup>

      <FormGroup
        label={m.newProject.naming.slug}
        htmlFor="project-slug"
        /** ⚠️ **`error`가 `help`를 대신한다** — 둘을 같이 보이면 무엇을 고쳐야 하는지가 두 줄로 갈린다. */
        error={state.slugTaken ? m.newProject.naming.slugTaken(state.slugTakenAlt) : slugFormatHelp(verdict)}
        /*
          ⚠️ **mono가 아니다** (핸드오프 1c). 이 둘은 **읽는 값**이지 사람이 옮겨 적는 값이 아니다 —
          mono는 푸시 토큰·워크플로 YAML처럼 그대로 베껴야 하는 것에만 남는다. 시안은 색만 올린다.
        */
        help={m.newProject.naming.hint(
          // ⚠️ **호스트를 말하지 않는다** (launch-readiness L7.5) — 박아 두면 dev·로컬에서도 프로덕션 주소가 보인다.
          // 힌트가 전하려는 것은 slug가 경로와 브랜치에 박힌다는 것이라 경로만으로 참이다.
          <span className="text-foreground">/projects/{slug || "…"}</span>,
          // 접두는 `syncBranchFor`와 같은 상수다 — 설명이 규칙과 갈리면 사용자가 PR을 못 찾는다.
          <span className="text-foreground">{SYNC_BRANCH_PREFIX}{slug || "…"}</span>,
        )}
      >
        <Input
          id="project-slug"
          value={slug}
          /**
           * ⚠️ **두 속성이 같은 술어를 쓴다** — `FormGroup`은 `error`가 있을 때만 그 `<p>`를 그리므로,
           * 갈리면 오류가 없는 동안 **없는 id**를 가리킨다. 안정된 id는 프리미티브가 주고 잇는 것은
           * 호출부다(DESIGN §6.4) — 안 이으면 포커스가 입력에 있는 사람에게 사유가 안 닿는다.
           */
          aria-invalid={slugRejected ? true : undefined}
          aria-describedby={slugRejected ? "project-slug-error" : undefined}
          onChange={(e) => onChange({ slug: e.target.value, slugTaken: false })}
          className="w-full"
        />
      </FormGroup>

      {/*
        ⚠️ **갈래마다 껍데기가 다르다.** 접히면 컨트롤이 **하나**라 `fieldset`이 아니라 라벨 하나다 —
        `legend`와 `Select`의 접근 이름이 둘 다 "Base language"면 스크린리더가 그룹 이름을 두 번
        말한다(2026-09-13에 고친 sr-only legend 중복과 같은 부류). 라디오 갈래는 컨트롤이 여럿이라
        `fieldset`/`legend`가 맞는 형이다.

        ⚠️ **경계가 ②(넷)와 다르게 열이다** (2026-09-13 사용자 — `locale-picker.ts`가 근거를 든다).
        라디오는 `flex-wrap`으로 감싸 줄만 늘 뿐 각 항목이 그대로라 열까지는 한눈에 읽히고, 이
        자리는 **되돌릴 수 없는 결정**이라 보이는 편이 낫다. 그 위는 접는다 — 57로케일 리포에서
        라디오 57개의 스크롤에서 고르게 됐다 (실물 관측).
      */}
      {/*
        ⚠️ **`border-t`가 아니라 1px 블록이다** — 위아래 여백이 대칭(8/8)이어야 구분선이 둘을 가른다
        (핸드오프 1c). `border-t + pt-4`는 위 0 / 아래 16이라 선이 위 블록에 붙어 보인다.
      */}
      <div className="bg-divider my-2 h-px shrink-0" />

      {surfaces ? surfaces.map((surface, index) => (
        <Fragment key={surface.pathTemplate}>
          {index > 0 && <div className="bg-divider my-2 h-px shrink-0" />}
          <BaseLocaleFields disabled={disabled} state={{ ...state, ...surface }}
            label={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{m.newProject.baseLocale.title}</span>
                <span className="inline-flex items-center gap-1.5">
                  {surface.pathTemplate.endsWith(".json")
                    ? <FileJson2 aria-hidden="true" className="size-4 shrink-0" />
                    : <FileCode2 aria-hidden="true" className="size-4 shrink-0" />}
                  <span className="break-all">{surface.pathTemplate}</span>
                </span>
              </span>
            } id={`surface-base-${index}`}
            onChange={next => { if (next.baseLocale !== undefined) onBaseLocale?.(index, next.baseLocale); }} />
        </Fragment>
      )) : <BaseLocaleFields disabled={disabled} state={state} onChange={onChange} />}

    </div>
  );
}

function BaseLocaleFields({ state, onChange, id = "base-locale", label = m.newProject.baseLocale.title, disabled }: {
  state: NamingStepState; onChange: (next: Partial<NamingStepState>) => void; id?: string; label?: ReactNode; disabled: boolean;
}) {
  const { locales, keyCounts } = state;
  const selectId = id === "base-locale" ? "project-base-locale" : `${id}-select`;
  /** 키 수를 **아는** 언어 중 가장 많은 것. 모르면 배지가 아예 안 선다. */
  /*
    ⚠️ **`Object.hasOwn`이다** — `keyCounts`는 평범한 `{}`이고 키가 **리포에서 온 로케일 코드**다.
    `keyCounts[code] !== undefined`로 보면 `constructor`·`toString` 같은 코드에서 `Object.prototype`의
    함수가 잡혀 "키 수를 안다"로 통과하고, 그 언어에 `Most keys` 배지가 선다 (CLAUDE.md).
  */
  const countOf = (code: string): number | undefined => (Object.hasOwn(keyCounts, code) ? keyCounts[code] : undefined);
  const known = locales.filter((code) => countOf(code) !== undefined);
  const leader = known.reduce<string | undefined>(
    (best, code) => (best === undefined || (countOf(code) ?? 0) > (countOf(best) ?? 0) ? code : best),
    undefined,
  );
  const gap = leader === undefined ? undefined : keyGap(countOf(leader), countOf(state.baseLocale));

  return <div className="flex flex-col gap-4">
      {/*
        ⚠️ **갈래마다 껍데기가 다르다.** 접히면 컨트롤이 **하나**라 `FormGroup`이 라벨과 help를 들고,
        펼치면 컨트롤이 여럿이라 `RadioGroup`이 그룹이 되고 라벨을 `aria-labelledby`로 잇는다 —
        `fieldset`/`legend`를 겹치면 그룹이 둘이 되어 이름이 두 번 읽힌다 (2026-09-13).

        ⚠️ **경계가 ②(넷)와 다르게 열이다** (`locale-picker.ts`가 근거를 든다). 라디오는 줄만 늘 뿐
        각 항목이 그대로라 열까지는 한눈에 읽히고, 이 자리는 **되돌릴 수 없는 결정**이라 보이는 편이
        낫다. 그 위는 접는다 — 57로케일 리포에서 라디오 57개의 스크롤에서 고르게 됐다 (실물 관측).
      */}
      {collapseLocalePicker(locales.length, LOCALE_RADIO_MAX) ? (
        <FormGroup
          label={label}
          labelId={`${id}-select-label`}
          htmlFor={selectId}
          help={m.newProject.baseLocale.hint}
        >
          <Select disabled={disabled} value={state.baseLocale} onValueChange={(baseLocale) => onChange({ baseLocale })}>
            <SelectTrigger
              id={`${selectId}`}
              aria-labelledby={`${id}-select-label ${selectId}`}
              className="w-full max-w-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((code) => (
                <SelectItem key={code} value={code}>
                  {/*
                    ⚠️ **접혀도 표기가 같아야 한다** — 국기와 자국어 이름이 라디오 갈래에만 있으면 같은
                    로케일이 로케일 수에 따라 두 가지로 보인다(DESIGN §6.1의 툴바 드롭다운이 같은 이유로
                    국기를 들였다). **59로케일 리포가 정확히 이 갈래를 밟는다.**
                  */}
                  <LocaleFlag code={code} />
                  {/* 배지 자리가 라벨로 간다 — 키 수와 `Most keys`는 **아는 언어에만** 붙는다. */}
                  {m.newProject.naming.baseOption(
                    languageName(code),
                    countOf(code) === undefined ? undefined : m.newProject.files.keys(countOf(code) ?? 0),
                    code === leader && known.length > 1,
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormGroup>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p id={`${id}-label`} className="text-sm font-medium">
              {label}
            </p>
            <p className="text-muted-foreground text-xs leading-[1.6]">{m.newProject.baseLocale.hint}</p>
          </div>
          {/* ⚠️ **①②와 같은 행 형이다** — 글리프 칩 자리에 국기가 들어간다 (핸드오프 1c). */}
          <RadioGroup
            disabled={disabled}
            aria-labelledby={`${id}-label`}
            value={state.baseLocale}
            onValueChange={(baseLocale) => onChange({ baseLocale })}
          >
            <ul className="border-border overflow-hidden rounded-md border">
              {locales.map((code, index) => {
                const active = state.baseLocale === code;
                const prevActive = index > 0 && state.baseLocale === locales[index - 1];
                const count = countOf(code);
                return (
                  <li
                    key={code}
                    className={cn(
                      index > 0 && "border-t",
                      index > 0 && (active || prevActive ? "border-border" : "border-divider"),
                      active ? "bg-muted" : "hover:bg-foreground/3",
                    )}
                  >
                    <div className="p-3">
                      <Radio
                        value={code}
                        labelClassName="gap-3"
                        label={
                          <>
                            <span
                              className={cn(
                                "flex size-10 shrink-0 items-center justify-center rounded-md",
                                active ? "bg-background" : "bg-muted",
                              )}
                            >
                              {/* ⚠️ 매핑이 없으면 `LocaleFlag`가 `null`을 낸다 — 칩은 그대로 서고 안만 빈다. */}
                              <LocaleFlag code={code} size="md" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="block truncate text-base font-medium">{languageName(code)}</span>
                              <span className={cn("block truncate text-sm", active ? "text-foreground/60" : "text-muted-foreground")}>
                                {m.newProject.baseLocale.row(
                                  /*
                                    ⚠️ **`replaceAll`이고 치환값이 함수다.** `{locale}`이 여러 번 나오는
                                    템플릿(`locales/{locale}/{locale}.json`)을 `confirm.ts`가 상정하므로
                                    첫 하나만 바꾸면 **실재하지 않는 경로**를 근거로 내밀게 된다. 함수로
                                    넘기는 것은 로케일 코드에 든 `$&`·`$1`이 특수 해석되는 것을 막는다.
                                  */
                                  state.pathTemplate.replaceAll("{locale}", () => code),
                                  count === undefined ? undefined : m.newProject.files.keys(count),
                                )}
                              </span>
                            </span>
                            {code === leader && known.length > 1 && (
                              <Badge variant="neutral" className="shrink-0">
                                {m.newProject.naming.mostKeys}
                              </Badge>
                            )}
                          </>
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </RadioGroup>
        </div>
      )}

      {gap !== undefined && leader !== undefined && (
        <Alert variant="info">{m.newProject.naming.keyGap(state.baseLocale, gap, leader)}</Alert>
      )}
  </div>;
}

/** `planSlug`의 갈래 넷 → 필드 아래 help. `ok`면 `undefined`라 기본 안내가 선다. */
function slugFormatHelp(verdict: ReturnType<typeof planSlug>): string | undefined {
  switch (verdict) {
    case "ok":
      return undefined;
    case "empty":
      return m.newProject.naming.slugEmpty;
    case "format":
      return m.newProject.naming.slugFormat;
    case "too-long":
      return m.newProject.naming.slugTooLong(PROJECT_SLUG_MAX);
    case "reserved":
      return m.newProject.naming.slugReserved;
  }
}
