---
description: 저장소 문서(CLAUDE/PRODUCT/ARCHITECTURE/DIRECTORY/DESIGN/OPERATIONS/ACTIONS/README/env)를 문서별 전담 에이전트가 병렬로 코드베이스와 양방향 대조(사실오류 + 누락)해 stale 탐지 → 통합 리포트 → 항목별 확인 → 수정·문서별 커밋. POSTMORTEM은 제외(append-only). 빌드·푸시 안 함.
---

저장소의 문서를 **문서별 전담 에이전트**로 병렬 검사한다. 각 에이전트가 담당 문서 전문을 읽고 현재 코드베이스와 **양방향**으로 대조해 **어긋난 부분(stale)**을 찾는다. 메인 스레드가 결과를 통합 리포트로 제시하고, 사용자 확인을 거쳐 수정·커밋한다.

**대상은 "최근 diff에 걸리지 않아 `/push`가 지나간 것"이다.** 2026-09-06 tenant-auth 리뷰가 전환 전 상태를 서술하는 문서 여덟 곳을 잡았고 전부 그 부류였다.

## `/push`와의 차이 (왜 따로 있나)

`/push` 4단계의 신선도 검사는 **푸시될 diff에 걸린 문서만** 트라이아지한다 — 최근 커밋이 건드리지 않은 영역에 누적된 stale은 통과시킨다. `/doc-check`는 **diff와 무관하게 문서 전문 ↔ 현재 코드베이스 전체를 양방향 대조**한다. 오래 방치돼 천천히 어긋난 내용을 잡는 게 목적이다. `/push`의 검사는 푸시 직전 2차 안전망으로 그대로 둔다.

`/audit`의 Debt 차원도 "문서 드리프트"를 본다 — 그쪽은 **코드에서 출발**해 원칙 위반을 찾다가 문서 불일치를 부수적으로 올리고, 여기는 **문서에서 출발**해 문장 단위로 대조한다. 겹치면 이쪽이 정밀하다.

## 검사하지 않는 것

- **`docs/POSTMORTEM.md`** — append-only 회고다. 과거 시점의 사실을 담으므로 현재 코드와 어긋나는 것이 정상이고, `/postmortem`만 쓴다. 재발 방지 grep이 현재도 유효한지는 `/audit`이 본다.
- **`docs/features/*/{spec,design,tasks}.md`** — 진행 중인 기능의 작업 문서다. 끝나면 결론이 정본으로 올라가고 디렉터리째 지워지므로(CLAUDE.md 워크플로우 절) 대조 대상이 아니다.
- **코드 주석** — 문서가 아니다. `/code-review`·`/audit`의 몫이다.

## 사용

- `/doc-check` — 9개 문서 전부 병렬 검사.
- `/doc-check <doc> [doc...]` — 지정 문서만. 키워드: `claude`, `product`, `architecture`, `directory`, `design`, `operations`, `actions`, `readme`, `env`.

예시:

```
/doc-check                        → 9개 전부
/doc-check architecture           → docs/ARCHITECTURE.md만
/doc-check architecture claude    → docs/ARCHITECTURE.md + CLAUDE.md
/doc-check product directory      → 제품 판정 + 트리
```

## 검사 대상 (문서별 에이전트)

| 키워드 | 문서 | 대조 관점 |
|---|---|---|
| `claude` | **CLAUDE.md** | 스택 표(버전은 `package.json`·`pnpm-lock.yaml`), 명령어 표(`package.json` scripts), 스킬 라인업(`.claude/commands/` 목록·개수·미러 제외 집합이 `scripts/sync-agents.mjs`의 `EXCLUDE`와 같은가), 브랜치·배포·CI 서술(`.github/workflows/ci.yml`·`vercel.json`), 코드 컨벤션의 예시 파일이 실재하는가, 문서 지도가 `docs/` 실제 파일과 같은가 |
| `architecture` | **docs/ARCHITECTURE.md** | export 결정성 3규칙·`writeStrategy`/`layout` 매트릭스·변경 감지 두 층·커밋/PR 전략·스캐너 계약·스키마 서술·인증 경계(§6 — 미들웨어가 무엇을 막고 무엇을 지나는지, 세션 정책, 이메일 검증 자리, 거부와 장애의 구별)·Supabase/Vercel 함정이 `lib/`·`auth.ts`·`middleware.ts`·`prisma/schema.prisma`와 일치하는가. `(미구현)` 표시가 남았는데 구현된 것 |
| `product` | **docs/PRODUCT.md** | 완료 조건·포지셔닝·역할과 권한표(§3 — `lib/auth/permission.ts`의 `canPerform`과 칸이 같은가)·범위/비범위(§4)·설계 결정(§7 — 특히 §7.7 IA가 실제 라우트·`lib/routes.ts`와 같은가)·§10 "아직 안 정한 것"(결정됐는데 목록에 남은 것)이 코드와 일치하는가. ⚠️ **절 번호가 띄엄띄엄한 것은 정상이다**(코드 주석이 그 번호를 참조한다 — 재번호 금지) |
| `directory` | **docs/DIRECTORY.md** | 트리가 실제 파일과 맞는가(없는 파일·새 파일·옮긴 파일), ⚠️ 항목이 가리키는 테스트·상수가 실재하는가, 프리미티브 개수가 `components/ui/*.tsx`와 맞는가 |
| `design` | **docs/DESIGN.md** | 토큰 값(`app/globals.css` `@theme`)·라이트 단일 강제 장치(`@custom-variant dark`)·mono 표면 불변식·배지 3종·raw 색 등재(§6.2)·`components/ui/` 사용 상태·§9 레퍼런스 서술이 `app/globals.css`·`lib/utils.ts`·`components/`·`app/**/*.tsx`의 실제 클래스 사용과 일치하는가 |
| `operations` | **docs/OPERATIONS.md** | 키 이름·명령 이름·플래그가 `.env.example`·`package.json` scripts·`scripts/credentials.ts`와 맞는가. **절차의 순서를 코드로 검증할 수는 없으므로** 이름과 존재만 대조하고, 순서가 의심되면 리포트에만 올린다 |
| `actions` | **docs/ACTIONS.md** | 대상 리포 워크플로 예시·`inputs` 표·red 조건 표·경고 조건(열린 번역 PR — 브랜치 이름이 `lib/pull/trigger.ts`의 `syncBranchFor`와 같은가)이 `.github/actions/l10n-push/action.yml`과 일치하는가 |
| `readme` | **README.md** | 스택 한 줄·명령어 표·브랜치 정책·게이트 서술이 CLAUDE.md의 요약 미러로서 같은 사실을 말하는가 (CLAUDE.md가 정본이다 — 둘이 다르면 README가 틀렸다) |
| `env` | **.env.example** | 코드가 읽는 변수(`lib/env.ts`의 `requireEnv`/`optionalEnv` 호출 + `prisma.config.ts`)가 전부 있는가, 반대로 아무 코드도 읽지 않는 변수가 남았는가(미구현 기능용 선등록은 잉여가 아니다 — 주석으로 그 사실이 적혀 있어야 한다), 주석의 배선 설명(포트·스코프·OAuth 앱 수)이 CLAUDE.md와 같은가 |

## 절차

### 1. 대상 결정

인자가 있으면 해당 키워드 문서만, 없으면 9개 전부. 존재하지 않는 키워드는 무시하고 보고에 명시. `postmortem`이 들어오면 "append-only라 대상이 아니다"로 안내.

### 2. 공통 컨텍스트 로드 (메인, 1회)

각 에이전트에 넘길 코드베이스 기준점을 메인에서 미리 읽는다:
- `CLAUDE.md` 코어 원칙·컨벤션·디렉터리 구조 절
- `package.json` (scripts·deps), `prisma/schema.prisma`(모델·enum 목록), `middleware.ts`(matcher)
- `git ls-files lib app components prisma scripts .github` 수준의 파일 목록
- `.claude/commands/` 목록 + `scripts/sync-agents.mjs`의 `EXCLUDE`

이 컨텍스트는 에이전트가 "문서가 주장하는 사실"을 빠르게 검증하는 출발점일 뿐, 에이전트는 실제 소스를 직접 열어 확인한다.

### 3. 문서별 병렬 검사

활성 문서마다 에이전트를 **동시에** 실행한다 (`subagent_type: general-purpose`). 각 에이전트에:
- 담당 문서 **전문** (전체를 읽고 섹션 단위로 검증)
- 위 공통 컨텍스트
- 아래 검사 지침

각 문서 에이전트는 **2-pass**로 검사한다. 한 방향만 보면 못 잡는 stale이 갈린다 — Pass 1은 문서→코드(틀린 단언), Pass 2는 코드→문서(빠진 내용). **둘 다 돌려야 한다.**

**Pass 1 — 문서→코드 (사실오류 탐지)**
1. 담당 문서를 섹션/주장 단위로 분해하고 **코드베이스에서 검증할 사실 목록**을 만든다 (파일 경로, 함수명, 환경변수 이름, 명령어, 테이블·컬럼 이름, 테스트 파일 이름, 스킬 개수, **기본값·매트릭스 셀**, 날짜가 붙은 "지금은 ~다" 류의 현재형 단언).
2. 항목별로 Explore 하위 에이전트를 **병렬** 생성 (`subagent_type: Explore`)해 실제 코드와 대조한다. ("이 파일/함수가 실재하는가", "이 컬럼이 스키마에 있는가", "이 표의 셀 값이 코드와 같은가", "이 '아직 ~않다'가 여전히 참인가").

**Pass 2 — 코드→문서 (누락 커버리지 탐지)** ← 이게 한 방향 검사의 사각이다
3. 문서가 **다루기로 선언한 주제 영역**을 식별한다 (그 문서의 섹션 제목·범위가 곧 책임 범위). 예: ARCHITECTURE는 "불변식·함정·계약", PRODUCT §4는 "범위와 비범위", `.env.example`은 "코드가 읽는 변수 전부".
4. 그 영역의 **코드에 실재하는 핵심 동작·기본값·엣지케이스·하위 기능**을 Explore로 훑어, 문서에 **반영 안 된 것**을 찾는다. 두 종류를 본다:
   - **통째 누락**: 코드엔 있는 모듈·테이블·스킬·환경변수인데 문서에 섹션·항목 자체가 없음.
   - **섹션 내부 누락**(가장 놓치기 쉬움): 섹션은 있는데 그 안의 기본값·분기·예외가 빠짐. 예: "차단은 두 층"은 있는데 미들웨어가 POST를 통과시키는 예외가 없음, "세션은 DB에 있다"는 있는데 `updateAge` 서술이 없음.
5. **노이즈 억제**: 코드의 *모든 것*을 요구하지 말 것. "설계상 의미 있는 누락"(동작을 바꾸는 기본값, 안전 캡, 회귀 위험 분기, 새 하위 시스템, 새 환경변수)만 올린다. 문서가 의도적으로 범위 밖이라 한 것은 제외.

6. 두 pass 결과를 합쳐 **문서 ↔ 코드 불일치만** 추린다. 일치 항목은 보고하지 않는다(노이즈 금지).

#### 에이전트 출력 형식

각 문서 에이전트는 아래 형식으로 **구조화된 stale 목록만** 반환:

```
## [문서명] 신선도 검사

### 발견 (stale)
각 항목:
- 위치: <문서 섹션/라인 추정. 섹션 자체가 없으면 "없음(누락)">
- 문서 주장: <문서가 말하는 것. 누락이면 "(서술 없음)">
- 실제 코드: <코드베이스 사실 + 근거 파일:라인>
- 종류: forward(틀린 단언) / coverage(누락)
- 심각도: 🔴 사실 오류(틀린 경로·컬럼·동작·기본값·"아직 ~않다"가 거짓) / 🟡 누락(코드엔 있는데 문서에 없음) / ⚪ 표현/사소
- 제안 수정: <한 줄>

### 깨끗 (참고)
"검증한 N개 단언 중 불일치 M개 / 커버리지 점검한 K개 주제 중 누락 J개" 한 줄 요약. 일치 항목 나열 금지.
```

stale이 없으면 "발견 0 — Pass1 N개 단언·Pass2 K개 주제 모두 일치" 한 줄.

### 4. 통합 리포트 (메인)

전 에이전트 결과를 **문서별 → 심각도순**으로 한 번에 정리해 제시한다. 사용자가 전체 그림을 먼저 본다. 심각도 집계(🔴 n / 🟡 n / ⚪ n)를 상단에.

**같은 사실이 여러 문서에 있으면 묶어서 올린다** — 이 리포는 CLAUDE.md↔README.md, CLAUDE.md↔ARCHITECTURE.md, PRODUCT.md↔ARCHITECTURE.md가 같은 결정을 반복 서술한다. 한 곳만 고치면 나머지가 반대 사실을 가르친다 (`/push` 4a의 "정책 반전" 경고와 같은 형태).

### 5. 항목별 확인 → 수정

심각도 순(🔴 → 🟡 → ⚪)으로 수정 후보를 **AskUserQuestion으로** 던진다:
- 🔴 명백한 사실 오류는 묶어서 일괄 수정 허락을 구할 수 있다.
- 🟡/⚪ 는 항목별로 적용/제외 선택지 제시.
- 합의된 항목만 Edit으로 반영.
- **`docs/features/*/tasks.md`가 남아 있으면 체크박스는 검증 조건이 실제로 통과한 것만 `[x]`로 바꾼다** — "코드를 썼다"는 완료가 아니다 (`/push` 4b와 같은 규칙).
- **`docs/ARCHITECTURE.md` §1.9의 숫자는 고치지 않는다.** 재측정이 필요하면 "`pnpm adapter-survey` 학습+홀드아웃 재실행 필요"로 리포트에만 남긴다.
- **`docs/PRODUCT.md`의 절 번호를 재정렬하지 않는다** — 코드 주석과 테스트가 `PRODUCT §7.8` 같은 번호를 직접 참조한다. 빈 번호는 의도된 것이다.
- CLAUDE.md를 고치면 **`pnpm sync:agents`를 돌려 미러(`AGENTS.md`)를 함께 커밋한다** — Claude Code 훅이 자동으로 돌리지만 결과 파일이 커밋에 들어갔는지 확인한다. 미러를 직접 편집하지 않는다.

### 6. 커밋

수정된 문서를 **문서별 별도 커밋**으로 묶는다 (영문, CLAUDE.md 문서 신선도 절의 prefix):
`docs(CLAUDE): ...` / `docs(PRODUCT): ...` / `docs(ARCHITECTURE): ...` / `docs(DIRECTORY): ...` / `docs(DESIGN): ...` / `docs(OPERATIONS): ...` / `docs(ACTIONS): ...` / `docs(README): ...` / `chore(env): ...` / `docs(AGENTS): sync codex mirror`

수정 없으면 커밋 없이 "변경 불필요" 보고.

### 7. 종료

수정 요약 보고 후 끝. 후속 액션 자동 실행 금지 — 푸시는 `/push`.

## 리포트

```
📄 doc-check: <대상 n개>
🔴 <n> / 🟡 <n> / ⚪ <n>

[CLAUDE.md]
🔴 <위치> — <문서 주장> ↔ <실제 코드 (파일:줄)>
...
[docs/ARCHITECTURE.md]
...

묶음: <같은 사실이 여러 문서에 걸린 항목 — 함께 고쳐야 하는 것>
수정: <n>건 반영 (문서별 커밋 m개) / 제외: <n>건 (사용자 선택)
재측정 필요: <ARCHITECTURE §1.9 숫자가 의심되는 항목 또는 "없음">
```

## 금지 사항

- **코드 수정 금지** — `lib/`·`app/`·`prisma/`·`scripts/`·`.github/` 일체. 문서만 수정. 코드 쪽이 틀렸다고 판단되면(문서가 맞고 코드가 어긋난 경우) 리포트에 "코드 후속"으로 갈라 적고 `/refactor`로 넘긴다.
- **빌드·테스트 실행 금지** — 읽기 전용 검사. 타입 확인이 필요하면 보고만.
- **에이전트 직접 수정 금지** — 에이전트는 stale 목록만 반환. 수정은 사용자 합의 후 메인이.
- **노이즈 금지** — 코드와 일치하는 항목을 "확인했다"고 나열하지 않는다. 불일치만 보고.
- **`docs/POSTMORTEM.md` 수정 금지** — append-only, `/postmortem` 전담.
- **`AGENTS.md`·`.agents/skills/` 직접 편집 금지** — 생성물이다. `pnpm sync:agents`로만.
- **푸시 금지** — 커밋까지만. 푸시는 `/push`.
