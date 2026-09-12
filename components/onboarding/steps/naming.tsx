"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { m } from "@/lib/i18n";
import { keyGap } from "@/lib/onboarding/key-gap";
import { LOCALE_RADIO_MAX, collapseLocalePicker } from "@/lib/onboarding/locale-picker";
import { planSlug, PROJECT_SLUG_MAX } from "@/lib/onboarding/slug";

import { failureText } from "../failure";

/**
 * ③ 이름·주소·기준 언어 (new-project-modal design §4).
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
}: {
  state: NamingStepState;
  onChange: (next: Partial<NamingStepState>) => void;
}) {
  const { slug, locales, keyCounts } = state;
  const verdict = planSlug(slug);
  /** 키 수를 **아는** 언어 중 가장 많은 것. 모르면 배지가 아예 안 선다. */
  const known = locales.filter((code) => keyCounts[code] !== undefined);
  const leader = known.reduce<string | undefined>(
    (best, code) => (best === undefined || (keyCounts[code] ?? 0) > (keyCounts[best] ?? 0) ? code : best),
    undefined,
  );
  const gap =
    leader === undefined ? undefined : keyGap(keyCounts[leader], keyCounts[state.baseLocale]);

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
        help={m.newProject.naming.hint(
          <span className="text-mono">mal-moi.com/projects/{slug || "…"}</span>,
          // 브랜치 이름의 정본은 `syncBranchFor`다 — 여기 있는 것은 그 규칙의 설명이다
          <span className="text-mono">l10n/sync-{slug || "…"}</span>,
        )}
      >
        <Input
          id="project-slug"
          value={slug}
          aria-invalid={state.slugTaken || verdict !== "ok" ? true : undefined}
          onChange={(e) => onChange({ slug: e.target.value, slugTaken: false })}
          className="text-mono w-full"
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
      <div className="border-border-subtle border-t pt-4">
        {collapseLocalePicker(locales.length, LOCALE_RADIO_MAX) ? (
          <FormGroup
            label={m.newProject.baseLocale.title}
            htmlFor="project-base-locale"
            help={m.newProject.baseLocale.hint}
          >
            <Select
              id="project-base-locale"
              value={state.baseLocale}
              onChange={(e) => onChange({ baseLocale: e.target.value })}
              className="w-full max-w-sm"
            >
              {locales.map((code) => (
                <option key={code} value={code}>
                  {/* 배지 자리가 라벨로 간다 — 키 수와 `Most keys`는 **아는 언어에만** 붙는다. */}
                  {m.newProject.naming.baseOption(
                    code,
                    keyCounts[code] === undefined ? undefined : m.newProject.files.keys(keyCounts[code]),
                    code === leader && known.length > 1,
                  )}
                </option>
              ))}
            </Select>
          </FormGroup>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{m.newProject.baseLocale.title}</legend>
            <p className="text-muted-foreground text-xs">{m.newProject.baseLocale.hint}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {locales.map((code) => (
                <span key={code} className="inline-flex items-center gap-1.5">
                  <Radio
                    name="baseLocale"
                    checked={state.baseLocale === code}
                    onChange={() => onChange({ baseLocale: code })}
                    label={<span className="text-sm">{code}</span>}
                  />
                  {code === leader && known.length > 1 && (
                    <Badge variant="neutral">{m.newProject.naming.mostKeys}</Badge>
                  )}
                </span>
              ))}
            </div>
          </fieldset>
        )}
        {gap !== undefined && leader !== undefined && (
          <Alert variant="info" className="mt-2">
            {m.newProject.naming.keyGap(state.baseLocale, gap, leader)}
          </Alert>
        )}
      </div>
    </div>
  );
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
