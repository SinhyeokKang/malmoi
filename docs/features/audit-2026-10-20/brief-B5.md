# B5 — ⚪ 정리 (12, 13, 14)

먼저 `brief-common.md`와 `orch.md`(결정 D4)를 읽는다.

## 할 일

- **12** — `lib/locales/change.ts:177`이 `planLocaleChange`에 늘 `canManage: true`를 넘겨 `lib/locales/change-plan.ts:60`의 `forbidden` 분기에 닿을 길이 없다. 결정 D4대로 `canManage` 입력과 그 분기를 지운다. `LocaleChangeRefusal`의 `"forbidden"`이 다른 경로(진입 판정·MCP·Action의 코드 매핑)에서 쓰이면 union은 둔다. 관련 테스트를 갱신한다.
- **13** — `lib/onboarding/ingest.ts:111`이 `assemblePushInput`이 돌려준 `format`을 구조 분해에서 버린다(하류가 보정해서 지금은 무해). 돌려준 값을 쓰는 것이 맞는지, 버리는 이유가 있는지 코드로 판단한다. 쓰는 쪽으로 고치면 동작이 같음을 테스트로 고정하고, 버리는 게 맞으면 "왜"를 주석 한 줄로 남긴다.
- **14** — 파일 안에서만 쓰이는 export의 `export` 키워드를 뗀다(테스트가 import하면 그대로 둔다 — grep으로 확인):
  - `lib/adapters/arb-catalog.ts` `parseArb`
  - `lib/adapters/code-dict.ts` `createCodeDictFile`
  - `lib/adapters/yaml-catalog.ts` `createYamlCatalogFile`
  - `lib/adapters/shared.ts` `templateShapeRank`
  - `lib/events/payload.ts` `IMPORT_SOURCES`·`LOCALE_CHANGE_VIAS`·`SURFACE_SCOPES`
  - `lib/projects/list.ts` `PROJECT_STATUSES`
  - `components/translations/workspace/locale-panel.tsx:183` `DetailHeadSkeleton` — 주석이 "Workspace 안에 선다"고 하지만 소비자가 없다. 실제 쓰임을 확인해 주석을 사실에 맞추고 export를 정리한다.
- 동작 변경은 없어야 한다. `pnpm gate --base dev`가 근거다.

## 소유 파일

위에 적은 파일과 그 테스트.

**건드리지 않는다**: `lib/adapters/android-strings.ts`·`types.ts`(B1), `lib/onboarding/base-input.ts`(B4), `lib/onboarding/gitlab-ci.ts`(B2), `lib/pull/**`·`lib/survey/**`(B3).

## 모델

Claude Sonnet · effort low.
