---
name: "source-command-audit"
description: "코드베이스 전체를 불변식·원칙·경계·부채 기준으로 감사. 리포트 전용 — fix·빌드·커밋 안 함."
---

# source-command-audit

Use this skill when the user asks to run the migrated source command `audit`.

## Command Template

최근 변경이 아닌 **코드베이스 전체**를 `CLAUDE.md`·`docs/PRODUCT.md`·`docs/ARCHITECTURE.md`에 비추어 감사한다. 4명의 전문 에이전트가 각자 담당 차원에 집중해 병렬 감사한다. **리포트 전용 스킬** — 자동 fix 안 하고, 커밋도 안 한다. 무엇을 고칠지·언제 고칠지는 전적으로 사용자가 결정한다.

**이 스킬을 만든 이유는 쌓인 부채를 주기적으로 정리하기 위해서다.** 그래서 대상이 "이번에 건드린 코드"가 아니라 "그동안 쌓인 것"이고, `/code-review`와 겹치지 않는다.

## 사용

- `/audit` — 4개 전문 에이전트 전부 병렬 실행.
- `/audit <agent> [agent...]` — 지정 에이전트만. 공백 구분으로 복수 선택.

| 키워드 | 에이전트 | 담당 차원 | 핵심 관심사 |
|---|---|---|---|
| `invariant` | Invariant | 결정성, 어댑터 계약, 변경 감지 | export 결정성 3규칙, blob SHA, `writeStrategy` vs `layout`, 커밋·PR 전략 |
| `principle` | Principle | 코어 원칙, 범위 | 병합 없음, 값 소유권, `orphaned`, PRODUCT §4.2 비범위 유입 |
| `boundary` | Boundary | 인증·인가, 테넌시, 실행 경계 | `middleware.ts` matcher, `projectId` 스코프, `server-only`, env 접근, 두 GitHub 자격증명 |
| `debt` | Debt | 부채, 테스트 공백, 문서 드리프트 | 데드 코드, 중복, `any`, 순수 함수 분리, 테스트 없는 순수 모듈, 문서-코드 불일치 |

```
/audit                      → 4개 병렬
/audit invariant            → Invariant만
/audit boundary debt        → Boundary + Debt 병렬
```

## 다른 스킬과의 분리

- `/code-review`: **변경분**(`git diff @{u}..HEAD` + 미커밋) 대상. 이번에 건드린 코드만.
- `/feature-review`: **설계 문서** 대상 4관점 크로스체크.
- `/audit` ← 여기. **전체 코드베이스** 대상. 변경 이력과 무관하게 축적된 문제를 찾는다.

## 절차

### 1. 기준 로드

`CLAUDE.md` · **`docs/PRODUCT.md`** · `docs/PRODUCT.md`(제품 판정) · `docs/ARCHITECTURE.md`를 읽어 감사 기준을 확립한다. **이 넷이 ground truth다.**

**`docs/POSTMORTEM.md`도 읽는다 — 이 스킬에서는 선택이 아니다.** **전 항목**(2026-09-12 기준 59개 — 숫자를 믿지 말고 `grep -c '^### 20'`로 센다; `^### `만 세면 템플릿 헤딩이 끼어 하나 많다)이 각각 "이 코드베이스가 실제로 밟은 함정"이고, 그 항목들의 **재발 방지 grep을 전수로 돌리는 것**이 audit의 가장 큰 값이다. `/code-review`는 변경분에 걸린 항목만 소환하므로, 손대지 않은 코드에 남아 있는 같은 패턴은 이 스킬만 잡는다.

에이전트 인자가 있으면 해당 에이전트만 활성화. 없으면 전체 4개.

### 2. 전문 에이전트 병렬 감사

활성화된 전문 에이전트를 **동시에** 실행한다 (`subagent_type: general-purpose`). 각 에이전트에게 전달할 것:
- `CLAUDE.md` + `docs/PRODUCT.md` + `docs/ARCHITECTURE.md`의 담당 차원 관련 규칙
- `docs/POSTMORTEM.md`에서 담당 차원에 걸리는 항목의 **재발 방지 grep 패턴**
- 하위 영역 분배 지침

#### 2단계 구조

```
메인 스레드
├── Invariant (general-purpose)
│   ├── Explore: lib/adapters/
│   ├── Explore: lib/pull/ + lib/githash.ts + lib/github.ts
│   └── Explore: lib/push/ + lib/survey/
├── Principle (general-purpose)
│   ├── Explore: lib/push/ + lib/pull/
│   ├── Explore: app/(edit)/ + lib/keys/
│   └── Explore: prisma/ + scripts/
├── Boundary (general-purpose)
│   ├── Explore: middleware.ts + auth.ts + lib/auth/ + app/api/
│   ├── Explore: lib/db.ts + lib/env.ts + lib/keys/query.ts + prisma/
│   └── Explore: app/ 전체 + lib/github.ts
└── Debt (general-purpose)
    ├── Explore: lib/ 전체
    ├── Explore: app/ + components/ + scripts/
    └── Explore: docs/ ↔ 코드 대조
```

각 전문 에이전트는:
1. 하위 Explore 에이전트를 **병렬** 생성 (`subagent_type: Explore`)
2. 각 하위 에이전트에게 **담당 경로 + 체크 차원 + POSTMORTEM grep 패턴**을 전달
3. 결과 수집·중복 제거
4. 전문가 차원에서 **영역 간 일관성** 추가 점검
5. `파일:줄 — 요약 (근거)` 형식으로 메인 스레드에 보고

---

#### Invariant 에이전트 (`invariant`)

**깨지면 조용히 망가지고 며칠 뒤에 발견되는 부류** 전담. ARCHITECTURE §1·§2·§3이 기준이다.

| 하위 에이전트 | 영역 | 체크 |
|---|---|---|
| adapters | `lib/adapters/**` | **재생성 규칙이 `shared.ts`를 지나는가** — 코드포인트 정렬(`orderedEntries`)·끝 개행 1개. ⚠️ **들여쓰기는 이 목록에 없다**: 재생성 어댑터도 **표현을 원본에서 읽고**(`observeJsonStyle`) 2칸은 원본이 없을 때의 폴백이다(신규 로케일 파일). "2칸 고정"을 검사하면 §1.4를 지키는 구현이 🔴가 된다 (2026-09-13 정정) / `localeCompare` 사용 / **`writeStrategy`가 아니라 `layout`으로 "원본이 필요한가"를 판단하는 코드** / 수술적 어댑터가 값 무변경 시 원본을 바이트 그대로 돌려주는가 / **표현(인용 부호·블록 스타일)을 원본에서 읽는가**(§1.4) / `orphaned` 제외가 재생성에만 적용되는가 / 계약 테스트(`__tests__/contract.ts`) 매트릭스와 실제 어댑터 일치 |
| pull-git | `lib/pull/**`, `lib/githash.ts`, `lib/github.ts` | blob SHA가 **UTF-8 바이트 길이**를 쓰는가(`content.length` 금지) / `base_tree` 전달 / parents가 **base head** / 커밋 메시지 `[skip-l10n]` / 브랜치 force update / **열린 PR 재사용** / 1층(`updatedAt` 스킵)·2층(blob 비교) 판정 순서 / `sortIndex → order` 4홉(§1.1의 a~d)이 끊기지 않았는가 |
| push-survey | `lib/push/**`, `lib/survey/**` | **페이로드 생산자가 `lib/push/payload.ts` 하나인가**(리터럴 조립이 다시 생겼는지) / `unnest` 컬럼 수 = 값 배열 수 / 오배송·역행 가드(409) / survey가 프로덕션 판정 함수를 쓰는가(자체 재구현 여부) |

**전문가 통합 점검**
- **결정성 관문의 주인이 하나인가** — 재생성 writer가 전부 `orderedEntries`를 지나는지, 우회로가 생겼는지
- **`layout`/`writeStrategy` 두 축을 혼동하는 코드가 남아 있는지** (ARCHITECTURE §1 경고: 혼동하면 그 프로젝트의 PR이 조용히 비어 나간다)
- POSTMORTEM 전수: 2026-09-02 "지표가 반년째 0", 2026-09-03 "이름만 정확한 테스트", 2026-09-03 "값이 맞으면 통과하는 검증"

---

#### Principle 에이전트 (`principle`)

**코어 원칙에서 파생되지 않는 복잡도**를 찾는다. ARCHITECTURE §0·§3.1·§7이 기준이다.

| 하위 에이전트 | 영역 | 체크 |
|---|---|---|
| merge-free | `lib/push/**`, `lib/pull/**` | **머지 로직·3-way·충돌 해소·"누가 이겼나" 판정이 슬며시 들어왔는가** / push가 `ON CONFLICT DO UPDATE`(strict)를 유지하는가 / pull이 기존 파일 값과 DB 값을 견줘 고르는 코드가 있는가 / **키 삭제(`DELETE`) 대신 `orphaned`인가** |
| write-owners | `app/(edit)/**`, `lib/keys/**` | **`Translation.value` 쓰기 주체가 둘인가**(편집 UI `saveTranslation` + push strict). 셋째가 생겼으면 판정이 필요해진 것 / 저장이 `updatedAt`을 올려 pull 1층 스킵을 푸는가 / 같은 값 재저장이 noop인가(빈 PR 방지) |
| scope | `prisma/**`, `scripts/**`, 전역 | **비범위가 유입됐는가 — PRODUCT §4.2** — ICU 복수형, 동시 편집, 세밀한 권한, in-context 편집, 스크린샷, 번역자 노트, 승인 워크플로, push 웹훅 / 요청 없는 유연성·설정 가능성·추상화(PoC에서 선반영은 그 자체가 결함) / **새 모델이 코어 원칙에서 파생되는가** — `prisma/schema.prisma`는 현재 12모델(도메인 6 + Auth.js 4 + 멤버십 2)이고, ⚠️ **숫자 상한을 기준으로 쓰지 않는다**(2026-09-13 정정: "5테이블을 넘었는가"가 남아 있어 감사를 돌릴 때마다 걸렸다). 묻는 것은 개수가 아니라 **그 모델이 §0의 어느 불변식에서 나오는가**다 |

**전문가 통합 점검**
- **"병합 없음"이 실제로 지켜지는 경로 전수** — 값을 고르는 분기가 어디에도 없어야 한다
- 편집 손실 창(ARCHITECTURE §0 불변식 2)을 완화하려는 코드가 몰래 들어왔는지 — 완화하면 단순성이 무너진다

---

#### Boundary 에이전트 (`boundary`)

**뚫리면 데이터가 새는 경계** 전담. ARCHITECTURE §6 + CLAUDE.md 코드 컨벤션이 기준이다.

| 하위 에이전트 | 영역 | 체크 |
|---|---|---|
| authz | `middleware.ts`, `auth.ts`, `lib/auth/**`, `app/api/**` | **보호 라우트가 전부 `matcher`에 있는가**(레이아웃 조건부 렌더는 차단이 아니다 — RSC 페이로드가 실린다) / 레이아웃이 `redirect()`를 던지는가 / **인가가 `ProjectMember`인가** — 페이지는 최상단 `requireProjectAccess`, Server Action은 `getProjectAccess`. ⚠️ **허용 핸들 목록(`AUTH_ALLOWED_LOGINS`)은 2026-09-05에 사라졌다**(ARCHITECTURE §6): 로그인은 검증된 이메일만 요구하고 그것이 아무것도 열지 않는다. **그 변수가 코드에 다시 보이면 그것이 결함이고**, `app/__tests__/entry-points.test.ts`가 부재를 상시로 센다 / `/api/push`의 `PUSH_TOKEN`·`/api/pull`의 `CRON_SECRET` 검증 / **OAuth 토큰으로 커밋하거나 App 토큰으로 사용자 식별하는 코드**(두 자격증명 혼입) |
| tenancy-env | `lib/db.ts`, `lib/env.ts`, `lib/keys/query.ts`, `prisma/**` | **모든 DB 쿼리가 `projectId`로 좁혀졌는가**(RLS 없음 — 애플리케이션이 유일한 방어선) / Server Action이 `keyId`·`localeCode`의 프로젝트 소속을 스스로 확인하는가 / **환경변수를 모듈 최상위에서 평가하는 코드**(파일을 읽기만 해도 죽는다 — 두 번 밟은 함정) / `process.env` 산발 접근 / 코드가 읽는 변수가 `.env.example`에 전부 있는가 / ⚠️ **DB에 닿는 경로가 앱 하나인가** — 아래 |

⚠️ **`tenancy-env` 차원은 2026-09-09에 축이 하나 늘었다: "DB에 도달하는 경로를 전수로 센다."**

그날까지 이 감사는 **우리 코드 안의 경로만** 봤다. 그런데 Supabase는 PostgREST·GraphQL 데이터 API를 기본으로
켜 두고 `public` 스키마의 `pg_default_acl`이 `anon`·`authenticated`에 **새 테이블 전 권한을 자동으로 준다** —
prod·dev 12테이블이 전부 그렇게 열려 있었고, 앱 층 인가(미들웨어·진입점·테넌트 좁힘·fail-closed)를
얼마나 촘촘히 해도 **그 경로는 그것을 지나지 않는다.** 앱이 그 API를 **안 쓴다는 것**이 그 문이 **잠겼다는
뜻이 아니었다** (POSTMORTEM 2026-09-09).

**이 차원의 에이전트는 코드가 아니라 DB에 물어야 한다** (읽기 전용, `DIRECT_URL`·`DIRECT_URL_PROD`):

```sql
-- 1) anon·authenticated가 우리 테이블에 어떤 권한을 갖는가 (0건이어야 한다)
SELECT grantee, table_name, string_agg(DISTINCT privilege_type, ',') FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated') GROUP BY 1,2;
-- 2) 다음 마이그레이션이 만드는 테이블이 다시 열리는가 (anon이 없어야 한다)
SELECT pg_get_userbyid(defaclrole), array_to_string(defaclacl,' | ') FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace WHERE n.nspname = 'public';
-- 3) RLS 상태 (GRANT를 뺐으면 off여도 된다 — 둘 중 하나는 있어야 한다)
SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND relkind='r';
```

Supabase 대시보드의 **Advisors → Security**가 0 errors인지도 같은 신호다 — 그 화면이 이 결함을 계속
말하고 있었는데 아무도 보지 않았다.
| runtime-edges | `app/**`, `lib/github.ts` | **서버 전용 모듈에 `import "server-only"`가 있는가**, 반대로 **테스트가 직접 import하는 순수 모듈에 잘못 붙었는가**(`react-server` 조건 밖에서 던져 vitest가 죽는다) / 내부 쓰기에 Route Handler를 새로 만들었는가(Server Action이어야 한다) / 외부 진입점을 Server Action으로 만들었는가 / 시크릿이 로그·에러 메시지·클라이언트 번들로 새는가 |

**전문가 통합 점검**
- **인증 경로 end-to-end**: `middleware.ts` matcher ↔ 레이아웃 `redirect()` ↔ 라우트 Bearer 검증에 구멍이 없는지
- **테넌트 격리 전수**: `projectId` 없는 쿼리를 하나라도 남기면 그게 유출 경로다
- POSTMORTEM 전수: 2026-08-31 "RSC 페이로드 1.3MB 노출", 2026-08-31 "최상위 env 평가"(🔁 재발)

---

#### Debt 에이전트 (`debt`)

**축적된 것** 전담. 이 에이전트만 `/code-review`가 구조적으로 못 보는 것을 본다.

| 하위 에이전트 | 영역 | 체크 |
|---|---|---|
| lib-health | `lib/**` | 데드 코드·미사용 export / 중복 유틸(같은 판정을 두 곳에서 구현) / **`any`·타입 단언** / `noUncheckedIndexedAccess` 아래 인덱스 접근 미처리 / 순수 함수에 I/O 혼입 / **에러를 `catch {}`로 삼킴** / 주석이 "무엇"을 반복하는가("왜"만 남긴다) |
| app-scripts | `app/**`, `components/**`, `scripts/**` | 데드 컴포넌트·미사용 import / 스크립트 간 중복 로직 / N+1 쿼리 / 날짜를 로컬 타임존으로 저장 |
| test-doc-gap | `lib/**/__tests__/`, `docs/**` | **테스트 없는 순수 모듈**(CLAUDE.md: 신규 인터페이스는 테스트 우선) / **픽스처가 한 스타일만 가진 축**(그 축은 검증되지 않은 것 — POSTMORTEM 2026-09-03) / 테스트 이름과 본문 불일치(2026-09-03 "이름만 정확했다") / **문서-코드 드리프트**: `docs/PRODUCT.md` §10에 남은 결정된 항목, `docs/DIRECTORY.md`가 가리키는 없는 파일, `ARCHITECTURE.md`의 `(미구현)` 표시, `CLAUDE.md` 디렉터리 구조·명령어 표와 실제 불일치 |

**전문가 통합 점검**
- **`lib/` 하위 디렉터리가 늘었는데 `CLAUDE.md`의 코어 모듈 목록·`/push` 4단계 트리거에 반영됐는지** (ARCHITECTURE가 실제로 이걸로 낡은 전례가 있다)
- 영역 간 중복 헬퍼

### 3. 크로스 영역 통합 검사

활성 에이전트가 **2개 이상**일 때만. 에이전트 결과가 돌아온 뒤 메인 스레드에서:

- **어댑터 5종 대칭** (invariant 활성): `chrome-locales`·`json-catalog`·`yaml-catalog`·`code-dict`·`ts-dict`가 각자 `writeStrategy`에 맞는 규칙을 따르는가. 계약 테스트가 실제로 그 매트릭스를 검사하는가
- **세 흐름의 값 전달** (invariant + principle): push → DB → pull의 홉마다 필드가 살아남는가. **단위 테스트가 전부 green인 채 기능이 멎은 사례가 POSTMORTEM에 넷 있다**
- **환경변수 전수** (boundary 활성): 코드가 읽는 `process.env.*` ↔ `lib/env.ts` ↔ `.env.example` 3곳 일치
- **문서 7개의 상호 모순** (debt 활성): 같은 정책을 다른 문서가 반대로 서술하는지 (정책 반전 시 한 문서만 고치면 나머지가 반대 불변식을 가르친다)
- **에이전트 간 중복 발견 합치기**

### 4. 시급도 분류 + 보고

- **🔴 심각** — 조용히 깨지는 것, 데이터 유출·손실, 코어 불변식 위반. 예: `projectId` 없는 쿼리, `matcher` 누락, blob SHA 문자 길이, `base_tree` 누락, `[skip-l10n]` 누락, 머지 로직 유입, 키 `DELETE`, fail-open 인가.
- **🟡 권장** — 컨벤션 위반, 회귀 위험, 부분 일관성 깨짐. 예: `layout`으로 원본 필요 여부 판단, 테스트 없는 순수 모듈, 문서-코드 드리프트, `any`, 순수 함수에 I/O.
- **⚪ 사소** — 정리 거리. 데드 코드, 잉여 주석, 미세 중복.

**🔴은 실패 시나리오를 반드시 채운다** — 구체적 입력·상황을 못 쓰면 🟡이나 ⚪다. 전부 🔴이면 아무것도 🔴이 아니다.

시급도와 무관하게 **전체 연번**을 매긴다 (사용자가 "3번 고쳐"로 지칭할 수 있게). 에이전트가 복수 활성이면 출처 태그 `[에이전트]` 표기.

```
1. [invariant] lib/adapters/foo.ts:42 — 한국어 한 줄 요약. (근거: ARCHITECTURE §1.1 "X" / POSTMORTEM 2026-09-03)
   실패 시나리오: <🔴만>
```

코드 수정 제안은 한 줄까지. **패치는 만들지 않는다.**

발견 0개면 "✅ 큰 문제 없음." 한 줄로 종료.

마지막에 통계 요약:

```
---
감사 범위: 전체 / <agent> [+ <agent>]
활성 에이전트: N개
검사 파일: N개
POSTMORTEM 전수 재검: <전체>항목 중 재발 <n>건
발견: 🔴 X · 🟡 Y · ⚪ Z (합계 N)
```

### 5. 종료

여기서 끝. 후속 질문·액션 없음. 사용자가 보고를 보고 직접 결정한다.

## 명시적 제외

- `components/ui/**` — shadcn 생성물. import 여부만 확인하고 내부는 감사하지 않는다.
- `generated/**`, `public/fonts/**` — 생성물 (gitignore).
- `AGENTS.md`, `.agents/**` — `scripts/sync-agents.mjs` 생성물. 드리프트는 `pnpm sync:agents:check`가 본다.
- `docs/adapter-survey/repos*.txt` — 실측 코퍼스 목록.
- `__tests__/**`의 스타일 — 테스트 코드 스타일은 대상 외. **단 테스트 공백과 픽스처 편향은 Debt의 담당이다.**

## 금지 사항

- **빌드 / typecheck / test 실행 금지** — 정적 코드 읽기만.
- **`pnpm adapter-survey` 실행 금지** — 네트워크 4분이고 audit의 일이 아니다. 재측정 판단은 `/push` 4d.
- **자동 fix 금지** — 리포트만.
- **"고칠까요?" 같은 후속 액션 제안 금지.**
- **커밋 / staging 안 함.**
- **추측성 발견 남발 금지** — `CLAUDE.md`·`docs/PRODUCT.md`·`docs/ARCHITECTURE.md`·`docs/POSTMORTEM.md`·실제 코드 패턴에 근거를 댈 수 있는 것만. "혹시 문제가 될 수 있다" 수준은 보고하지 않는다.
