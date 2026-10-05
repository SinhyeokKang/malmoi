"use client";

import { FileCode2, FileJson2 } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormGroup } from "@/components/ui/form-group";
import { IconTile } from "@/components/ui/icon-tile";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { RadioGroup } from "@/components/ui/radio";
import { SelectRow } from "@/components/ui/select-row";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { keyGap } from "@/lib/onboarding/key-gap";
import { languageName } from "@/lib/onboarding/language-name";
import { LOCALE_RADIO_MAX, collapseLocalePicker } from "@/lib/onboarding/locale-picker";
import { cn } from "@/lib/utils";

/** 소스 하나의 기준 언어 블록이 읽는 값 — 신규 프로젝트 ③과 Add sources ②가 같은 형을 넘긴다. */
export type BaseLocaleState = { pathTemplate: string; baseLocale: string; locales: string[]; keyCounts: Record<string, number> };

/**
 * 소스마다 경로 줄 + 기준 언어 블록 (DESIGN §6.7). **신규 프로젝트 ③과 Add sources ②가 이 하나를 쓴다** (sources-add-remove A4) —
 * 두 화면에서 같은 소스가 다른 형으로 보이면 되돌릴 수 없는 결정의 근거가 화면마다 갈린다.
 *
 * ⚠️ **구분선은 블록 사이에만 선다** — 첫 블록 앞의 선은 위에 다른 필드가 있는 ③의 몫이라 ③이 직접 든다.
 * ⚠️ **`disabled`를 Select·RadioGroup에 직접 넘긴다** — 부모 fieldset의 비활성은 Radix Portal 옵션에 닿지 않는다 (POSTMORTEM 2026-09-14).
 */
export function SurfaceBaseLocales({ surfaces, onBaseLocale, disabled }: {
  surfaces: readonly BaseLocaleState[]; onBaseLocale: (index: number, value: string) => void; disabled: boolean;
}) {
  const m = useMessages();
  return <>{surfaces.map((surface, index) => (
    <Fragment key={surface.pathTemplate}>
      {index > 0 && <div className="bg-divider my-2 h-px shrink-0" />}
      <BaseLocaleFields disabled={disabled} state={surface}
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
        onChange={value => onBaseLocale(index, value)} />
    </Fragment>
  ))}</>;
}

export function BaseLocaleFields({ state, onChange, id = "base-locale", label: labelProp, disabled }: {
  state: BaseLocaleState; onChange: (baseLocale: string) => void; id?: string; label?: ReactNode; disabled: boolean;
}) {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const label = labelProp ?? m.newProject.baseLocale.title;
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
          {(describe) => (
            <Select disabled={disabled} value={state.baseLocale} onValueChange={onChange}>
              <div className="max-w-sm">
                <SelectTrigger
                  id={`${selectId}`}
                  aria-labelledby={`${id}-select-label ${selectId}`}
                  aria-describedby={describe()}
                  width="full"
                >
                  <SelectValue />
                </SelectTrigger>
              </div>
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
                      languageName(code, uiLocale),
                      countOf(code) === undefined ? undefined : m.newProject.files.keys(countOf(code) ?? 0),
                      code === leader && known.length > 1,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormGroup>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p id={`${id}-label`} className="text-sm font-medium">
              {label}
            </p>
            <p className="text-muted-foreground text-xs leading-body">{m.newProject.baseLocale.hint}</p>
          </div>
          {/* ⚠️ **①②와 같은 행 형이다** — 글리프 칩 자리에 국기가 들어간다 (핸드오프 1c). */}
          <RadioGroup
            disabled={disabled}
            aria-labelledby={`${id}-label`}
            value={state.baseLocale}
            onValueChange={onChange}
          >
            <ul className="border-border overflow-hidden rounded-md border">
              {locales.map((code, index) => {
                const active = state.baseLocale === code;
                const prevActive = index > 0 && state.baseLocale === locales[index - 1];
                const count = countOf(code);
                return (
                  <li key={code}>
                    <SelectRow
                      input="radio"
                      checked={active}
                      first={index === 0}
                      previousChecked={prevActive}
                      disabled={disabled}
                      value={code}
                      label={
                        <>
                          <IconTile size="lg" className={active ? "bg-background" : "bg-muted"}>
                            {/* ⚠️ 매핑이 없으면 `LocaleFlag`가 `null`을 낸다 — 칩은 그대로 서고 안만 빈다. */}
                            <LocaleFlag code={code} size="md" />
                          </IconTile>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="block truncate text-base font-medium">{languageName(code, uiLocale)}</span>
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
                            <Badge variant="soft-neutral" className="shrink-0">
                              {m.newProject.naming.mostKeys}
                            </Badge>
                          )}
                        </>
                      }
                    />
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
