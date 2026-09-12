---
name: "source-command-feature-review"
description: "feature 산출물을 CPO·CDO·CTO·QA Lead 4명의 전문가 에이전트가 병렬 검수. 피드백 수렴 후 문서 수정 제안."
---

# source-command-feature-review

Use this skill when the user asks to run the migrated source command `feature-review`.

## Command Template

`/feature`로 산출한 설계 문서(`spec.md`, `design.md`, `tasks.md`)를 4명의 C-Level / Lead 전문가 에이전트가 각자 관점에서 크로스체크한다. 피드백을 사용자에게 전달하고, 답변을 반영해 문서 수정을 적용한다.

**이 스킬은 문서만 본다.** 코드를 고치지 않고, 빌드·테스트도 돌리지 않는다.

## 사용

- `/feature-review <slug>` — 4명 전부 병렬 검수.
- `/feature-review <slug> <role> [role...]` — 지정 전문가만 실행.
- `/feature-review` — slug 자동 선택 (`docs/features/` 중 최근 수정), 4명 전부.

역할 키워드가 아닌 인자는 slug로 취급. 키워드: `cpo`, `cdo`, `cto`, `qa`.

```
/feature-review                     → slug 자동, 4명 전부
/feature-review pull-to-pr          → slug=pull-to-pr, 4명 전부
/feature-review cto qa              → slug 자동, CTO + QA만
/feature-review pull-to-pr cto qa   → slug=pull-to-pr, CTO + QA만
```

## 검수 역할

| 키워드 | 역할 | 검수 대상 | 관점 |
|---|---|---|---|
| `cpo` | **CPO** (Chief Product Officer) | `spec.md` | 스코프 적절성(PRODUCT §4.2 비범위 대조), 두 사용자(개발자/번역 편집자)의 상충 해소, 완료 조건의 검증 가능성, 비목표 명확성 |
| `cdo` | **CDO** (Chief Design Officer) | `spec.md` + `design.md` | 편집 UI 플로우, `docs/DESIGN.md` 시각 규칙 준수, 기존 컴포넌트 패턴 일관성, 빈/로딩/에러 상태, 접근성 |
| `cto` | **CTO** (Chief Technology Officer) | `design.md` | 코어 원칙(병합 없음) 정합성, 불변식(export 결정성·blob SHA·인증 경계) 보존, 오버엔지니어링, 데이터 변경 경로 경계, 성능·보안 |
| `qa` | **QA Lead** | `tasks.md` | 태스크별 "검증:" 줄이 실제로 판정 가능한가, 순수 함수 분리 여부, 엣지 케이스 누락, 태스크 의존 관계, 회귀 리스크, 마이그레이션 배포 순서 |

## 절차

### 1. 문서 로드

- `docs/features/<slug>/`에서 `spec.md`, `design.md`, `tasks.md` 3개를 읽는다.
- 하나라도 없으면 즉시 종료: "문서가 불완전합니다. `/feature`를 먼저 실행해주세요."
- 컨텍스트용으로 `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`도 읽는다 (에이전트에게 전달). CDO가 활성이면 `docs/DESIGN.md`도.
- `docs/POSTMORTEM.md`를 이 기능이 건드릴 영역으로 grep해 결과를 에이전트에게 넘긴다 — 과거 함정을 재지적하지 못하면 그 로그는 죽은 로그다.

### 2. 병렬 검수

활성화된 전문가 에이전트를 **동시에** 실행한다 (`subagent_type: general-purpose`). 각 에이전트에게 전달:
- 담당 문서 전문 + 다른 문서 참고용
- `CLAUDE.md` + `docs/PRODUCT.md` + `docs/ARCHITECTURE.md` (+ CDO는 `docs/DESIGN.md`)
- POSTMORTEM grep 결과
- 역할별 검수 관점 (아래 프롬프트 가이드)
- 하위 검증 에이전트 분배 지침

#### 2단계 구조

```
메인 스레드
├── CPO (general-purpose)
│   ├── Explore: 기존 feature 문서 스코프 비교
│   └── Explore: 완료 조건이 현재 세 흐름에서 도달 가능한지
├── CDO (general-purpose)
│   ├── Explore: 기존 동일 역할 UI 컴포넌트 패턴
│   ├── Explore: 기존 편집 UI 상태 전환 흐름
│   └── Explore: DESIGN.md 토큰·표면 규칙 실제 사용례
├── CTO (general-purpose)
│   ├── Explore: 어댑터·push·keys 아키텍처 패턴
│   ├── Explore: 문서가 참조하는 파일·함수·인터페이스 실재 검증
│   └── Explore: 불변식 관련 코드 (결정성·blob SHA·middleware·projectId)
└── QA Lead (general-purpose)
    ├── Explore: 기존 테스트 구조 + 순수 함수 경계
    ├── Explore: 태스크 의존 대상의 실제 상태
    └── Explore: 회귀 리스크 대상 기존 기능
```

각 전문가 에이전트는:
1. 담당 문서를 분석하고 **코드베이스에서 검증해야 할 항목**을 식별
2. 검증 항목별로 Explore 하위 에이전트를 **병렬** 생성 (`subagent_type: Explore`)
3. 각 하위 에이전트에게 **검증 목적 + 탐색할 파일 경로/패턴** 전달
4. 결과를 수집
5. 문서 분석 + 코드 검증 결과를 종합해 피드백 생성

하위 Explore 에이전트는 코드를 읽어 문서의 주장을 검증한다 (예: "이 파일이 실제로 존재하는가", "이 패턴이 실제로 쓰이는가", "이 인터페이스 시그니처가 맞는가"). **문서가 인용한 파일 경로·함수명·라인 번호는 전부 실물 대조 대상이다** — 설계 문서가 존재하지 않는 헬퍼를 전제하면 구현이 그 자리에서 막힌다.

---

#### CPO 하위 에이전트

| 하위 에이전트 | 검증 목적 | 탐색 대상 |
|---|---|---|
| feature-precedent | 기존 feature 문서와 스코프 비교, 스코프 크리프 위험 | `docs/features/*/spec.md` |
| goal-feasibility | 완료 조건이 push·편집 UI·pull 세 흐름의 현재 상태에서 도달 가능한지 | `app/api/push/`, `app/(edit)/`, `app/api/pull/` |

---

#### CDO 하위 에이전트

| 하위 에이전트 | 검증 목적 | 탐색 대상 |
|---|---|---|
| ui-pattern | 기존 동일 역할 UI와 패턴 일치 여부 | 문서가 언급한 컴포넌트의 기존 구현, `components/`, `components/ui/` |
| ux-flow | 기존 편집 흐름(인라인 편집·blur 저장·토스트)과 일관성 | `app/(edit)/keys/page.tsx`, `components/translation-input.tsx`, `app/(edit)/actions.ts` |
| design-token | `docs/DESIGN.md` 규칙(라이트 단일·mono 표면·토큰) 준수 여부, 새 raw 색 도입 여부 | `app/globals.css`, `docs/DESIGN.md`, 기존 컴포넌트의 클래스 사용례 |

---

#### CTO 하위 에이전트

| 하위 에이전트 | 검증 목적 | 탐색 대상 |
|---|---|---|
| arch-pattern | 어댑터·push 계약·순수함수/껍데기 분리 준수 여부 | `lib/adapters/`, `lib/push/`, `lib/keys/`, `lib/scan/` |
| code-claim | 문서가 참조하는 파일·함수·인터페이스의 실재·정확성 | 문서에 등장하는 모든 소스 경로 |
| invariant-risk | 불변식 훼손 위험 식별 | `lib/adapters/shared.ts`(결정성), `lib/githash.ts`, `middleware.ts`(인증 경계), `prisma/schema.prisma`(projectId 인덱스), `lib/env.ts` |

---

#### QA Lead 하위 에이전트

| 하위 에이전트 | 검증 목적 | 탐색 대상 |
|---|---|---|
| test-coverage | 기존 테스트 패턴과 새 테스트 계획의 실현 가능성 | `lib/**/__tests__/*` |
| dependency-chain | 태스크 의존 대상의 실제 상태 + 인터페이스 안정성 | 태스크가 참조하는 소스 파일, `prisma/migrations/` |
| regression-target | 회귀 리스크 대상 기존 기능 | 변경 영향을 받을 기존 코드, `docs/POSTMORTEM.md` |

---

#### 에이전트 출력 형식

각 전문가 에이전트는 아래 형식으로 구조화된 피드백을 반환:

```
## [역할] 검수 결과

### 질문 (답변 필요)
번호를 매겨 질문. 사용자 확인이 필요한 사항.

### 이슈 (수정 권장)
번호를 매겨 문제점과 수정 방향. 각 항목에 심각도 표시:
- 🔴 심각: 기능이 잘못 정의됐거나 구현 불가능, 또는 불변식·코어 원칙 위반
- 🟡 권장: 개선하면 좋은 사항
- ⚪ 사소: 문서 품질/표현 수준

### 긍정 (잘된 점)
특별히 잘 설계된 부분 1-2개.
```

### 3. 피드백 통합 + 사용자 대화

**3-1. 전체 피드백 목록 제시**: 활성 에이전트 결과를 역할별로 정리해 한 번에 보여준다 (질문/이슈/긍정 전체). 사용자가 전체 그림을 먼저 파악하게 한다.

**3-2. 하나씩 질문 라운드**: 심각도 순(🔴 → 🟡 → ⚪)으로 각 이슈/질문을 **AskUserQuestion으로 하나씩** 던진다. 항목별로 선택지 2-4개를 제시하고, 응답에 따라 수정 사항 포함/제외를 결정한다.

- 여러 에이전트가 같은 문제를 지적하면 하나로 합쳐 질문한다.
- 문서 정확성 오류(존재하지 않는 경로, 틀린 라인 번호, 빠진 "검증:" 줄)는 명백한 수정 건이므로 **묶어서 일괄 수정 허락**을 구한다.
- **비범위 승격이 필요한 항목이 나오면 여기서 분리해 묻는다** — 사용자가 승인하면 `docs/PRODUCT.md` 갱신을 태스크로 남긴다 (이 스킬이 그 문서를 직접 고치지 않는다).

### 4. 문서 수정 적용

합의된 수정 사항을 `docs/features/<slug>/` 3개 파일에 반영한다. 파일별 변경 내역을 명시하고, 수정 전/후를 간결하게 요약한다.

### 5. 커밋

수정된 문서만 커밋한다. 메시지: `docs(feature): <slug> apply review feedback`.

### 6. 종료

수정 요약을 보고하고 끝. 후속 액션 제안 금지.

## 에이전트 프롬프트 가이드

### CPO 프롬프트 핵심

- 문제가 **관측된 사실**로 쓰여 있는가? 추측이나 일반론이 아닌가?
- 사용자가 개발자(나)인지 번역 편집자(비개발자 동료)인지 명시됐는가? 둘의 요구가 상충하면 어느 쪽을 우선하는지 밝혔는가?
- 완료 조건이 **검증 가능한 문장**인가? "적절히", "더 나은" 같은 모호한 표현이 없는가?
- `docs/PRODUCT.md` §4.2 비범위에 걸리는 항목이 조용히 들어와 있지 않은가? 걸리면 PRODUCT.md 갱신이 산출물에 포함됐는가?
- 비목표가 충분한가? PoC 범위를 넘기는 스코프 크리프 후보가 빠져 있진 않은가?
- **확장성을 위한 선반영이 있는가** — 이 프로젝트에선 그 자체가 결함이다.

### CDO 프롬프트 핵심

- 편집 흐름이 자연스러운가? 불필요한 클릭/전환이 있는가?
- `docs/DESIGN.md`의 시각 규칙과 충돌하지 않는가? 특히 **라이트 단일**(`dark:` 금지)과 mono 표면 불변식.
- 새 raw 색·새 토큰을 늘리는가? 늘리면 DESIGN.md §6.2 등재가 태스크에 있는가?
- 기존 컴포넌트(`translation-input.tsx`, `components/ui/`)의 인터랙션 패턴과 일관적인가? 같은 역할에 새 패턴을 만들지 않았는가?
- 빈 상태·로딩 상태·에러 상태(저장 실패, 권한 만료)가 고려됐는가?
- 키가 수백 행인 화면에서 성립하는가? **가상화는 도입하지 않는 결정**이므로 렌더 비용을 늘리는 설계인지 본다.
- 접근성(키보드 내비게이션, 포커스 유실)에 문제가 없는가?
- 기존 UI 코드를 직접 읽어 패턴 일치를 검증할 것.

### CTO 프롬프트 핵심

- **코어 원칙 위반이 없는가** — 머지 로직·충돌 해소·양방향 동기화·3-way merge를 요구하는 설계인가 (ARCHITECTURE §0).
- 불변식을 건드리는가: export 결정성 3규칙, blob SHA 비교 최적화, 커밋 parents·force update, `[skip-l10n]` 마커, 인증 차단은 `middleware.ts`뿐. 건드리면 보존 방법이 문서에 있는가.
- **데이터 변경 경로 경계**가 맞는가 — 내부 쓰기는 Server Action, 외부 진입점만 Route Handler. 역방향이면 지적한다.
- 모든 DB 쿼리가 `projectId`로 좁혀지는가? (테넌트 누출 + 풀스캔)
- 두 GitHub 자격증명(로그인 OAuth / 쓰기 App)을 섞지 않는가?
- 환경변수를 모듈 최상위에서 평가하지 않는가? 새 환경변수가 있으면 `.env.example` 갱신이 태스크에 있는가?
- 서버 전용 모듈에 `import "server-only"`가 붙는가? 단 **테스트가 직접 import하는 순수 모듈엔 붙이지 않는다**.
- **순수 함수로 분리 가능한 부분이 실제로 분리됐는가.** 여기가 비면 설계를 되돌린다 — I/O와 로직이 엉키면 테스트가 불가능하다.
- 오버엔지니어링이 없는가? 요청하지 않은 유연성·설정 가능성·추상화가 없는가? 더 단순한 접근이 가능하면 제시한다.
- 스키마 변경이 있으면 additive / destructive 판정과 배포 2단계 분리가 문서에 있는가 (ARCHITECTURE §7).
- 대안 검토가 타당한가? 기각 사유가 합리적인가?

### QA Lead 프롬프트 핵심

- 태스크마다 **검증 방법 한 줄**이 붙어 있는가? 그 줄이 실제로 판정 가능한가 (`pnpm test` green / UI에서 X가 보임 / `git hash-object`와 일치)?
- 순수 함수 → 껍데기 → UI **순서**인가? 역순이면 테스트 못 하는 코드를 먼저 쌓는 것이다.
- 엣지 케이스 누락: 빈 키 목록, 대량 키, `orphaned` 키, 로케일 누락, 중복 키, 어댑터 왕복 실패, blob SHA 전부 동일(API 무호출 경로), 세션 만료 중 저장.
- **왕복 검증**이 계획에 있는가 — 어댑터를 건드리면 read → write → read가 바이트 동일해야 한다.
- 태스크 간 의존 관계가 정확한가? 의존 대상이 실제로 존재하는 상태인가?
- 회귀 리스크가 충분히 식별됐는가? `docs/POSTMORTEM.md`에 같은 영역의 과거 회귀가 있으면 재발 방지 검증이 태스크에 있는가?
- 마이그레이션이 있으면 **`pnpm db:deploy`를 push 전에** 돌리는 순서가 문서에 명시됐는가? `migrate dev`의 리셋 제안은 절대 금지라는 것이 반영됐는가?
- **자동 검증(`pnpm test`·`pnpm typecheck`)과 수동 확인(`pnpm dev`로 눈으로 봄) 구분이 적절한가.** 이 프로젝트엔 e2e 프레임워크가 없으므로 UI 검증은 수동이다 — 자동화된 것처럼 쓰여 있으면 지적한다.
- **프로덕션 앞의 유일한 게이트가 `/push` 1단계 로컬 검증**이라는 전제에서, 이 태스크 목록이 그 게이트를 통과할 만큼 검증을 담고 있는가.

## 금지 사항

- **코드 수정 금지** — `lib/`, `app/`, `prisma/`, `scripts/`, `package.json` 등 프로덕션 코드를 변경하지 않는다.
- **빌드·테스트·마이그레이션 실행 금지** — 읽기 전용.
- **하위 에이전트가 직접 문서 수정 금지** — 에이전트는 피드백만 반환. 수정은 사용자 합의 후 메인 스레드에서만.
- **`docs/PRODUCT.md`·`docs/ARCHITECTURE.md`·`docs/DESIGN.md` 직접 수정 금지** — 필요를 태스크로 남긴다.
- **후속 액션 자동 실행 금지** — 문서 수정·커밋 후 종료.
