"use client";

import { Alert } from "@/components/ui/alert";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { useMessages } from "@/components/i18n/messages-provider";
import type { Messages } from "@/lib/i18n";
import { planSlug, PROJECT_SLUG_MAX } from "@/lib/onboarding/slug";
import { SYNC_BRANCH_PREFIX } from "@/lib/pull/ref-slug";

import { failureText } from "../failure";
import { BaseLocaleFields, SurfaceBaseLocales } from "./base-locales";

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
  const m = useMessages();
  const verdict = planSlug(state.slug);
  // 거부 상태는 aria-invalid에, 렌더된 설명의 선택은 FormGroup에 맡긴다.
  const slugRejected = state.slugTaken || verdict !== "ok";
  const { slug } = state;

  return (
    <div className="flex flex-col gap-4">
      {state.banner !== null && <Alert variant="danger">{failureText(m, state.banner)}</Alert>}

      {/* ⚠️ **읽기 전용임을 말한다** — 리포에 아무것도 쓰지 않는다(불변식). */}
      <Alert variant="info">{m.newProject.naming.info(state.pathTemplate, state.branch)}</Alert>

      <FormGroup label={m.newProject.naming.name} htmlFor="project-name">
        {(describe) => (
          <Input aria-describedby={describe()} width="full"
            id="project-name"
            value={state.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        )}
      </FormGroup>

      <FormGroup
        label={m.newProject.naming.slug}
        htmlFor="project-slug"
        /** ⚠️ **`error`가 `help`를 대신한다** — 둘을 같이 보이면 무엇을 고쳐야 하는지가 두 줄로 갈린다. */
        error={state.slugTaken ? m.newProject.naming.slugTaken(state.slugTakenAlt) : slugFormatHelp(m, verdict)}
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
        {(describe) => (
          <Input width="full"
            id="project-slug"
            value={slug}
            aria-invalid={slugRejected ? true : undefined}
            aria-describedby={describe()}
            onChange={(e) => onChange({ slug: e.target.value, slugTaken: false })}
          />
        )}
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

      {surfaces ? <SurfaceBaseLocales disabled={disabled} surfaces={surfaces} onBaseLocale={(index, value) => onBaseLocale?.(index, value)} />
        : <BaseLocaleFields disabled={disabled} state={state} onChange={baseLocale => onChange({ baseLocale })} />}

    </div>
  );
}

/** `planSlug`의 갈래 넷 → 필드 아래 help. `ok`면 `undefined`라 기본 안내가 선다. */
function slugFormatHelp(m: Messages, verdict: ReturnType<typeof planSlug>): string | undefined {
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
