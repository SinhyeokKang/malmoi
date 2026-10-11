# disabled-reasons-revert — 설계

[스펙](spec.md) · [태스크](tasks.md).

## 1. 영향 흐름

편집 UI만. push·pull·DB·인가·서버 판정 무변경. 사유 **문장과 판정**(`planPublishButton`, 호스트의 `syncReason`/`connectionReason`/`waitPublish`/lease)은 그대로이고 **보이는 자리만** 바뀐다. ARCHITECTURE §0 불변식 영향 없음.

## 2. 되돌릴 곳 — F7 이전 형이 정본이다

F7(`69844b74`)·O19(`def752f0`)가 바꾼 것을 되돌리되, 그 뒤에 들어온 다른 변경(responsive-app의 머리 두 줄 `PANEL_HEAD_ROW`, 단일 판, 목업 컨테이너)은 보존한다 — **`git revert`가 아니라 손으로 옮긴다**(두 커밋 위에 여러 커밋이 쌓였다).

| 자리 | 지금 | 되돌린 형 (F7 이전 — `69844b74^`) |
|---|---|---|
| `components/publish-button.tsx` | `publishReason()` export · `reasonId` prop · 버튼에 sr-only 없음 | `pausedReason` prop · 내부 `planPublishButton` · `<span title={hint}>` + 버튼 `aria-describedby` → 자기 `useId()` sr-only. `publishReason()`은 소비자 0이 되면 삭제 |
| `components/home/sync-button.tsx` | `reasonId` prop | `pausedReason` prop · `title={pausedText}` + 자기 sr-only(`pausedReason ?? m.repositorySync.paused`) |
| `components/translations/workspace/workspace.tsx` | `useDisabledReasons` + `<DisabledReasons>` · 버튼에 `reasonId` | OWNER `SyncButton`·`PublishButton`에 사유 문장을 prop으로(`pausedReason`). **EDITOR용 인라인 [Sync]**(지금 줄을 가리킨다)는 F7 이전처럼 `title={w.sync.ownerOnly}` + 자기 sr-only. 줄 렌더 없음. ⚠️ 같은 파일의 **Revert·Save 푸터 사유 칸은 건드리지 않는다**(responsive 이전부터 있던 보이는 사유) |
| `components/home/actions.tsx` | `useDisabledReasons` · `<DisabledReasons>` · `reasonScope`(O19) · [Try again] → `disabledReasonId` | 버튼에 사유 prop · `reasonScope` 걷음 · [Try again]은 `title={retryBlock}` + 자기 sr-only(`useId`) |
| `components/translations/edit-loss-banner.tsx` | `publishBlocked?: boolean` · 사유 안 이음 | `blockedReason?: string \| null` · `paused(count)` 뒤에 ` {blockedReason}` · `blockedReason !== null`이면 [Send with Publish] 없음(malmoi#160) |
| `components/ui/disabled-reasons.tsx` | 프리미티브 | **삭제**(소비자 0 — CLAUDE.md "내 변경이 만든 고아만 제거") |
| `components/landing/mockup/translations.tsx` | 사유 줄 사본(`landing-mockup.test.tsx`가 실물 `DisabledReasons` 렌더와 대조) | 사본·대조 테스트 삭제. 목업은 서버 컴포넌트라 `title`·sr-only 사본도 두지 않는다(인터랙티브 0 · `aria-hidden` 프레임 — 사유를 읽을 주체가 없다) |
| `components/shell/content-panel.tsx` | 주석이 사유 줄을 근거로 `items-start`를 설명 | 주석만: "버튼 묶음이 두 줄로 감기는 폭과 골격에서도 제목이 첫 버튼 줄에 선다"로 근거를 바꾼다(동작 불변) |

⚠️ **두 번 읽히지 않게** — F7의 "`title`·sr-only로 겹치지 않는다"는 줄이 있을 때의 규칙이다. 되돌린 형에서는 sr-only가 유일한 describedby 대상이다.

## 2.5 목업 ↔ 실물 정합성 (이 기능의 책임 — 사용자 2026-10-11)

mockup-viewport-container(그릇을 뷰포트가 고른다 — `stage.ts`·`stage.tsx`)가 **먼저** dev에 들어간다. 이 기능은 그 위에서 `git rebase dev` 후 목업 마크업을 되돌린 실물에 맞춘다. 대상:
- `components/landing/mockup/translations.tsx` — 사유 줄 사본(`[data-landing-reasons]`, 실물 `DisabledReasons` 클래스 사본)과 그 `group-data-[badge=1]/frame:hidden` 변형 삭제. **머리 행 묶음**(`PANEL_HEAD_ROW` + 사유 줄을 감싸던 `flex flex-col gap-1.5`)은 되돌린 `workspace.tsx`의 머리 구조를 그대로 따른다 — 실물에서 묶음이 사라지면 목업도 걷고, 남으면 남긴다(손으로 정하지 않는다).
- 꺼진 [Publish] 사본 — 실물은 `<span title>` 래퍼 + sr-only가 되지만 목업은 서버 컴포넌트·`aria-hidden` 프레임이라 `title`·sr-only를 복제하지 않는다. 버튼 자체의 클래스(`buttonClass` primary + `aria-disabled` 모양)만 실물과 같다.
- `components/__tests__/landing-mockup.test.tsx` — `DisabledReasons` import·"꺼진 Publish 아래 실물 `DisabledReasons`와 같은 사유 줄"(:731) 삭제 → "사유 줄 0" 단언으로 교체. "제목 행이 실물과 같은 `PANEL_HEAD_ROW`이고 사유 줄과 함께 `flex flex-col gap-1.5`에 묶인다"(:722)는 되돌린 실물 구조 기준으로 다시 쓴다. 목업 DOM 뷰포트 토큰 0·인터랙티브 0 단언은 유지.
- mockup-viewport-container가 같은 테스트 파일의 다른 단언(그릇 폭)을 바꿀 수 있으니 rebase 뒤 충돌을 그 기준으로 푼다.

## 3. 순수 함수 / 테스트 진입점

새 순수 함수 없음(삭제·이동 변경). 판정 `planPublishButton`(`lib/publish/plan.ts`)은 무변경이고 기존 테스트가 든다. 테스트로 고정할 계약:
- **사유 줄 0**: 번역 화면·Home 머리 렌더에서 사유 줄 요소(옛 `data-disabled-reasons` 등 프리미티브 표지)가 없다 — 미전달 0·끊김·보관·EDITOR·진행 중·잠금 각 상태.
- ⚠️ **responsive 이전 사유의 기존 단언은 유지한다** — `a11y-reasons.test.tsx`의 Add sources `manualReason`이 보이는 글자라는 단언(sr-only 금지) 등은 그대로다. F7이 바꾼 단언(pausedText·plan.hint·retryBlock의 "title·sr-only 없음")만 되돌린다.
- **describedby 대상이 자기 sr-only**: 꺼진 [Sync]·[Publish]·[Try again]의 `aria-describedby`가 가리키는 요소가 존재하고 `sr-only`이며 문장이 판정과 같다. `title`이 같은 문장이다(`a11y-reasons.test.tsx` — F7 이전 단언을 되살린다).
- **EditLossBanner**: `blockedReason`이 있으면 문장 뒤에 이어 붙고 [Send with Publish]가 없다, 없으면 액션이 선다(malmoi#160 회귀).
- **목업**: 사유 줄 사본 0, 기존 "목업 DOM 뷰포트 토큰 0"·인터랙티브 0 유지.
- 삭제 확인: `components/ui/disabled-reasons.tsx` import 0(`client-graph`·프리미티브 개수 게이트가 있으면 그 기대값).

## 4. 함정 (POSTMORTEM·과거 결정)

- **malmoi#160** — 연결로 꺼진 Publish에 [Send with Publish]를 세우면 꺼진 버튼으로 포커스만 옮기는 막다른 길이다. 액션을 숨기는 쪽은 유지하고 원인 문장만 되살린다.
- **§6.65 `aria-disabled`** — 진짜 `disabled`로 바꾸면 사유가 hover `title`에만 남아 키보드·스크린리더로 닿지 않는다. 되돌린 형에서도 `aria-disabled` + describedby를 지킨다.
- **O19가 막던 중복** — 배너 [Try again]과 머리 [Sync]가 같은 잠금 문장일 때 이제 sr-only가 둘이 되지만, 보이는 문장은 0이고 각 버튼이 자기 대상을 가리키므로 같은 문장이 두 번 **보이는** 문제는 없다.
- 프리미티브 개수: CLAUDE.md "프리미티브 모듈 53개" · DESIGN §6.4 "프리미티브 모듈 53" 번호 — 개수를 세는 테스트가 있으면 그 기대값이 정본이다.

## 5. 정본·문서

- DESIGN §7 "꺼진 컨트롤의 사유" — **머리 줄 부분만** 뒤집는다: 번역 화면·Home 머리의 꺼진 [Sync]·[Publish]와 Home [Try again]은 `title` + sr-only(2026-10-11 사용자 번복, F7·O10·O19 폐기, 터치에서 이유가 안 보이는 대가를 받는다). 같은 항목의 나머지 — 행 안 사유 글자(Add sources·워크플로 행), OAuth 동의 상태 슬롯, "사유는 꺼진 동안만 서고 막은 갈래를 말한다"(malmoi#93) — 는 그대로 둔다.
- DESIGN §6.4 `DisabledReasons` 행 삭제 · §5.15 `PANEL_HEAD_ROW` 행의 "버튼 아래 사유 줄(§7)은 정렬에 끼지 않는다" · §6.5 번역 머리 · Home 행 "미전달 0이면 `Nothing to send`가 늘 선다(O10)"·O19 문장 · §6.615 목업 사유 줄 언급(있으면).
- DIRECTORY `ui/disabled-reasons.tsx` 줄 삭제. CLAUDE.md 프리미티브 개수(→ `pnpm sync:agents`).
- 가이드: 원고 문장은 영향 없을 것(확인), 컷은 `pnpm guide:check` stale 결과대로(`translation-editor`·`project-home`·`home-publish`·`home-paused` 후보).
- 스키마·환경변수·사전 키 변경 없음.
