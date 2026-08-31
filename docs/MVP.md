# MVP 스펙

**이 문서가 i18n-poc의 기본 스펙이다.** 무엇을 만들고 무엇을 안 만드는지, 그리고 각 선택의 근거가 여기 있다. 설계 결정이 바뀌면 코드보다 먼저 이 문서를 고친다.

- 설계 상세·함정·불변식 → [ARCHITECTURE.md](./ARCHITECTURE.md)
- 작업 규칙·명령어·컨벤션 → [../CLAUDE.md](../CLAUDE.md)

## 1. 문제와 목표

크롬 확장의 번역 파일(`_locales/<locale>/messages.json`)을 비개발자 동료가 편집할 수 있게 만든다. 지금은 개발자가 JSON을 직접 고치거나, 동료가 스프레드시트에 적어주면 개발자가 옮겨 심는다.

- **개발자는 1명** (나)
- **번역 편집자는 사내 비개발자 동료**
- Crowdin/Tolgee 대체가 목표가 **아니다.** 학습·실험이고, 사내에서 실제로 한 번은 써볼 수 있는 수준이 목표다.

## 2. 코어 설계 원칙

**번역 값은 DB가 진실, 소스 키는 코드가 진실.**

두 종류의 데이터에 각각 소유자를 하나씩 배정한다. 번역 값은 DB만, 소스 키는 코드만 안다. 각 축에 소유자가 하나뿐이므로 **머지 로직이 아예 존재하지 않는다** — export가 DB에서 결정적으로 재생성되므로 git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다. 3-way merge도, 충돌 해소 UI도, "누가 이겼나" 판정도 없다.

이 원칙이 파생시키는 제약은 [ARCHITECTURE.md](./ARCHITECTURE.md)에, 요약은 CLAUDE.md 동명 섹션에 있다.

## 3. 세 가지 흐름

### 3.1 push (코드 → DB)

base 브랜치 푸시 시 GitHub Actions에서 **소스 문자열만** 업로드한다 (base를 main/dev 어느 쪽으로 둘지는 §10 — 현재 가정은 main). 번역 값은 어떤 경로로도 건드리지 않는다.

1. Actions 트리거. 커밋 메시지에 `[skip-l10n]`이 있으면 스킵 (pull이 만든 커밋의 재업로드 루프 차단)
2. AST 스캔 → `{ key, sourceText, description?, refs: [{path, line}] }`
3. **CI 실패 조건**: 리터럴이 아닌 키/원문 인자, 같은 키에 서로 다른 원문
4. `POST /api/push` (Bearer `PUSH_TOKEN`), 페이로드에 `commitSha` 포함
5. 서버 처리:
   - upsert (키·원문·description)
   - 스캔에 없는 키 → `orphaned = true`, 다시 나타난 키 → `false`. **삭제하지 않는다**
   - `sourceHash`가 바뀐 키 → base 아닌 모든 번역에 `needsReview = true` 전파
   - `KeyRef` 전체 교체 (증분 갱신보다 단순하고, 스캔이 전수라 정확하다)

### 3.2 편집 UI

비개발자용. **이쪽 성패는 "이 문자열이 어디 나오는지"를 보여주는 컨텍스트 제공에 달려 있다.**

- 네임스페이스 사이드바 → 키 리스트 → 인라인 편집
- 키마다: 원문, description, **코드 참조 permalink**(스캔 당시 `commitSha` 고정), `needsReview`·`orphaned` 배지
- 필터 3개: 미번역 / 검토필요 / orphaned
- blur 시 저장, `updatedBy`에 GitHub 핸들 기록

컨텍스트는 **코드 참조 자동 수집 + 네임스페이스 그룹핑** 두 개까지다. 스크린샷·번역자 노트는 비범위(§7).

### 3.3 pull (DB → PR)

고정 브랜치 `l10n/sync` 하나에 커밋을 얹고 열린 PR 하나를 재사용한다. **clone 없이 GitHub Git Data API로만** 구현한다.

1. 트리거: 편집 UI의 수동 버튼 + Vercel Cron 야간 1회 (웹훅 즉시 반영은 비범위)
2. base 브랜치 head SHA와 트리 조회
3. 로케일별 `messages.json` 결정적 생성 (§4)
4. **로컬 blob SHA 계산 → base 트리와 비교. 전부 같으면 여기서 종료 — GitHub API를 한 번도 더 부르지 않는다.** 변경 없는 날이 대부분이라 이게 기본 경로다
5. 변경분만: createBlob → createTree(`base_tree`) → createCommit(`parents: [baseHead]`, 메시지에 `[skip-l10n]`) → updateRef(`l10n/sync`, `force: true`)
6. 열린 PR 있으면 재사용, 없으면 생성

## 4. export 규칙 (결정적)

같은 DB 상태 → 언제나 바이트 단위로 같은 파일. 이게 깨지면 blob SHA 비교가 매번 "변경됨"을 뱉어 무의미한 커밋이 쌓이고 §3.3-4 최적화 전체가 무너진다.

- 키 정렬: **코드포인트 오름차순** 고정
- 들여쓰기: **2칸**
- 파일 끝 개행: **정확히 1개**
- `orphaned` 키는 **제외** (DB엔 남으므로 되돌릴 수 있다)
- 변경 감지: `sha1("blob <len>\0" + content)` 로컬 계산

## 5. 확정된 기술 선택

| 항목 | 선택 | 근거 |
|---|---|---|
| 앱 | Next.js 16 App Router, Vercel | UI·push/pull 라우트·cron이 한 배포 단위에 들어간다 |
| DB | Supabase Postgres | Auth·Storage를 나중에 쓸 여지가 있고 관리 부담이 없다 |
| DB 열쇠 | Prisma 7 + `pg` driver adapter (런타임 6543 / 마이그레이션 5432) | 스키마 파일 하나로 마이그레이션·타입. 쓰기가 전부 서버 라우트라 RLS 없이도 안전. v7은 접속 URL이 `prisma.config.ts`와 adapter로 갈린다 |
| 로그인 | GitHub OAuth **단독** + org 멤버십 검사 | 리포 기반 도구라 리포 접근 권한이 곧 편집 권한. 화이트리스트 테이블이 불필요해진다 |
| 리포 쓰기 | GitHub App installation token | 사용자 OAuth 토큰으로 커밋하면 커밋이 개인 명의가 되고 그 사람이 org를 떠나면 깨진다 |
| 키 추출 | **코드 스캔이 유일한 진실**, ts-morph AST (+ HTML·manifest는 정규식) | 소스 키는 코드가 진실이라는 원칙과 일관. 정규식 단독은 주석 속 호출·동적 조립을 구분 못 해 오탐이 섞인다 |
| 원문 출처 | **코드에 원문을 인라인하는 래퍼** | 스캔 한 번으로 키+원문+사용처가 같이 나온다. `en/messages.json`은 산출물이 된다 |
| 상태 모델 | `needsReview` 플래그만 | 미번역/번역됨/검토필요 3상태가 공짜로 생기고 필터링이 가능해진다 |
| 컨텍스트 | 코드 참조 자동 수집 + 네임스페이스 그룹핑 | 자동이라 유지보수가 0에 가깝다 |
| UI | shadcn/ui (`new-york`, `neutral`) + Tailwind 4 | 컴포넌트를 소스로 받아 직접 고칠 수 있다. Tailwind 4는 config 파일 없이 CSS의 `@theme`으로 끝난다 |
| 폰트 | Pretendard Variable **동적 서브셋, 자사 호스트** | 단일 파일은 2.0MB. 서브셋은 브라우저가 `unicode-range`로 필요한 구간만 받아 150~450KB. CDN은 렌더 방해 외부 요청이 생긴다 |
| 내부 쓰기 | **Server Action** | 클라이언트 fetch 배선·중복 스키마·수동 revalidate가 사라진다. 외부 진입점(`/api/push`·`/api/pull`)만 Route Handler |
| 세션 | **JWT** (DB 어댑터 없음) | 스키마가 4테이블로 유지되고 요청마다의 DB 왕복이 없다. 대가는 권한 회수가 최대 24h 지연 |
| 리스트 렌더링 | 네임스페이스 필터 + 순수 렌더 (가상화 없음) | 필터 후 한 화면이 수십~수백 행. 인라인 편집과 가상 스크롤을 섞으면 스크롤 튐·포커스 유실이 붙는다 |

### 5.1 래퍼 계약

```ts
// src/i18n.ts (대상 리포 쪽)
export function t(key: string, _source: string, subs?: string[]) {
  return chrome.i18n.getMessage(key, subs)
}
```

`_source`는 런타임에 쓰이지 않고 **스캐너 전용**이다. 번들에 문자열이 남지만 무시할 크기고, 신경 쓰이면 나중에 빌드 타임에 떼는 플러그인을 붙인다. 이 래퍼 도입은 대상 리포에 **일회성 리팩터링**을 요구한다.

### 5.2 동적 키 처리

스캐너가 리터럴이 아닌 인자를 만나면 **CI를 실패시킨다.** 명시 등록 탈출구는 주석 하나:

```ts
// @l10n-keys status_pending, status_running, status_done
const label = t(`status_${state}`, "...")
```

조용히 누락되어 문자열이 사라지는 경우가 없어야 하므로, 관용적으로 넘기지 않고 실패시킨다.

## 6. 스키마 (4테이블)

```
Locale       code PK, name, isBase
StringKey    id, key UNIQUE, namespace, sourceText, sourceHash,
             description, orphaned, updatedAt
KeyRef       id, keyId FK, path, line              -- push마다 전체 교체
Translation  id, keyId FK, localeCode FK, value, needsReview,
             updatedBy, updatedAt                  -- UNIQUE(keyId, localeCode)
```

`namespace`는 키에서 파생되는 값이지만 **컬럼으로 저장하고 인덱스를 건다** — 사이드바 쿼리가 이거 하나로 끝난다.

## 7. 명시적 비범위

**요청받아도 먼저 이 목록을 근거로 되묻는다.** PoC 범위를 지키는 게 이 프로젝트의 성패다.

원래부터 비범위: ICU 복수형·성별 변화, 동시 편집(락·CRDT), 다중 프로젝트/리포, 세밀한 권한, in-context 편집(오버레이).

MVP 범위를 잡으면서 추가로 뺀 것: 스크린샷 첨부, 번역자 노트 필드, draft→reviewed 승인 워크플로(편집자가 한 명이라 오버엔지니어링), push 웹훅 즉시 반영, 번역 메모리·기계번역.

## 8. 구현 순서

**태스크 단위 체크리스트와 완료 조건은 [TASKS.md](./TASKS.md)에 있다.** 이 절은 순서와 그 근거만 담는다 — 단계 구성을 바꾸면 두 문서를 함께 고친다.

1. ~~**Prisma 스키마 + Supabase 연결**~~ ✅ 완료 (`20260831012453_init` — 4테이블, 리전 `ap-northeast-1`)
2. **`lib/export.ts` + `lib/githash.ts`** — 의존성 0의 순수 함수. 테스트부터 쓴다
3. **스캐너 CLI (`lib/scan/`)** — 실제 리포에 돌려 결과를 눈으로 확인
4. **`/api/push`**
5. **Auth + 편집 UI**
6. **GitHub App + `/api/pull`**
7. **Actions 워크플로 + Vercel Cron**

2번을 먼저 하는 이유: 결정적 export와 blob SHA가 틀리면 3~7번이 전부 무의미해지는데, 이 둘만은 순수 함수로 완전히 검증할 수 있다.

## 9. 실전 검증

셋업 완료 후 **`~/code/bugshot-2`** 리포로 push→편집→pull 왕복을 돌린다. 로케일이 ko/en/fr 3개라 다중 로케일 export 검증에 적합하다. 이 단계에 들어가면 `/l10n-roundtrip` 스킬을 추가한다.

## 10. 아직 안 정한 것

- **대상 리포의 base 브랜치 정책** — bugshot-2는 `dev` 작업 / `main` 보호다. push 트리거를 main으로 둘지 dev로 둘지 실전 검증 때 정한다
- **로케일 목록의 정본** — `Locale` 테이블 시드를 대상 리포의 `_locales/` 스캔으로 자동 생성할지, 수동 등록할지
- **GitHub org** — 대상이 개인 계정 리포면 org 멤버십 검사가 성립하지 않는다. 그 경우 허용 GitHub 핸들 목록으로 대체해야 하고, `AUTH_ALLOWED_ORG` 하나로는 부족해진다
- **dev/prod DB 분리** — Supabase 인스턴스가 하나뿐이라 `migrate dev`가 프로덕션을 직접 바꾼다. 번역 데이터가 쌓이기 전에 두 번째 프로젝트를 만들어 분리할지 결정해야 한다
