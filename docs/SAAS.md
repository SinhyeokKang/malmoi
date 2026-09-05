# SaaS화 스펙

**PoC가 닫혔다.** MVP의 세 축(A 모듈 계약 · B 값 전달 · C 자동화)이 전부 ✅이고, 브랜치·환경 분리까지
섰다. 이 문서는 **그다음에 무엇을 만드는가**의 정본이다.

- **PoC 스펙은 [MVP.md](./MVP.md)** — 닫힌 문서다. §8.4가 이 단계를 예고하고 거기서 끝난다.
- **PoC 태스크 기록은 [TASKS.md](./TASKS.md)** — 닫힌 기록이다. §0이 여기를 가리킨다.
- **불변식·함정의 정본은 여전히 [ARCHITECTURE.md](./ARCHITECTURE.md)** 다. 이 문서가 그것을 대체하지 않는다.

> **근거 문서**: 2026-09-04에 Codex가 낸 종합 검토가 [features/saas-review.md](./features/saas-review.md)에
> 있다. 보안 모델과 운영 경계는 상당 부분 거기서 왔다. **스펙이 아니라 근거다** — 그 문서가 요구한
> 사전 단계·0단계는 작성 시점 이후에 이미 닫혔고, 그 문서가 놓친 결함 하나(`SYNC_BRANCH`)를 §8이
> 0단계로 들고 있다.

## 1. 완료 조건

제품의 단일 완료 조건은 하나다.

> **낯선 리포를 연결한 사용자가 10분 안에 로케일을 발견하고, 번역을 수정하고, 기존 리포에 결정적인
> pull request로 반영할 수 있다.**

PoC의 완료 조건이 "값이 손실 없이 도는가"였다면, 여기는 **"설명 없이 제3자가 혼자 완주하는가"** 다.
엔진을 더 넓히는 것이 아니라 **온보딩·테넌트 인가·운영 상태 표시**를 닫는 단계다.

포트폴리오 목적이므로 사용자 수나 기능 수는 성패가 아니다. 성패를 가르는 것은 둘이다.

1. 제3자가 설명 없이 첫 왕복을 완료할 수 있는가.
2. 데이터 손실·권한 누출·무의미한 PR을 **구조적으로** 막았는가.

## 2. 포지셔닝

> GitHub-native localization pipeline — 리포의 로케일 파일과 번역 DB와 재사용되는 PR 하나를
> 포맷을 가로질러 결정적으로 동기화한다.

Crowdin·Tolgee의 대체품으로 설명하면 번역 메모리·기계 번역·승인 워크플로·ICU의 **부재가 약점으로
보인다.** 반대로 아래 문제를 푸는 개발 도구로 설명하면 지금 설계가 그대로 강점이 된다.

- 기존 리포 구조를 바꾸지 않고 로케일 파일을 발견한다.
- 번역 값과 소스 키의 소유권을 분리해 **병합 로직을 제거**한다.
- 같은 DB 상태에서 같은 바이트를 만든다.
- 변경된 파일만 고정 PR 하나에 반영한다.
- JSON·YAML·TS/JS 딕셔너리의 **구조와 표현을 보존**한다.

## 3. 사용자와 역할

**역할은 둘뿐이다.** Viewer·Admin·Billing은 실제 요구가 생기기 전까지 만들지 않는다 —
MVP §7의 "세밀한 권한" 비범위가 여기서도 유지된다.

| 작업 | OWNER | EDITOR |
|---|:---:|:---:|
| 번역 조회·수정 | O | O |
| Publish (PR 생성·갱신) | O | O |
| 리포·기준 로케일·base branch 변경 | O | X |
| 멤버 관리·프로젝트 삭제 | O | X |

**EDITOR에게 Publish를 허용한다.** Publish는 base branch 직접 쓰기가 아니라 **검토 가능한 PR 생성**이다.
비개발자가 Publish하고 개발자가 GitHub에서 리뷰·머지하는 경계가 병목을 줄이면서 코드 승인권은 남긴다.
"개발자만 Publish"가 필요해지면 그때 별도 permission으로 좁힌다.

**로그인 방식이 역할을 정하지 않는다.** GitHub으로 로그인한 EDITOR도, Google로 로그인한 OWNER도
성립한다. 권한은 `ProjectMember.role`만 결정한다.

번역 편집자가 **알 필요 없는 것**: `adapterName` · `pathTemplate` · `layout` · `writeStrategy` ·
`nestedByPath` · blob SHA · Git Data API · OAuth 토큰과 installation token의 차이.

## 4. 범위

### 4.1 만드는 것

- **테넌트 인증·인가** — User·Account·ProjectMember·초대, DB 세션
- **GitHub 설치 연결** — OAuth 계정 ↔ installation ↔ repository 3중 검증
- **탐지 기반 프로젝트 생성** — 후보를 보여주고 사용자가 확정
- **프로젝트 단위 번역 UI** — 동결을 풀고 인가 경계 위에서 다시 만든다
- **Publish 경험** — 미배포 수, PR 상태, 버린 값 보고
- **SyncRun** — 실행 이력·idempotency·동시 실행 차단

### 4.2 만들지 않는 것

MVP §7을 그대로 잇고, SaaS 문맥에서 새로 거절하는 것을 더한다.

**MVP §7에서 이어지는 것**: ICU 복수형, 동시 편집, 세밀한 RBAC, in-context 편집, 스크린샷 첨부,
번역자 노트, 승인 워크플로(draft→reviewed).

**SaaS에서 새로 거절하는 것**:

- **과금·플랜** — 포트폴리오다.
- **조직 계층** — account 개념을 두더라도 개인/조직 구분까지다. 팀·하위 그룹은 없다.
- **번역 메모리·기계 번역·AI 번역** — 이 도구의 축이 아니다.
- **실시간 공동 편집** — MVP §7 "동시 편집"의 연장.
- **범용 알림 시스템** — 이메일 발송 자체를 1차에서 뺀다(§5.1).
- **포맷별 무제한 설정 UI** — 어댑터 내부는 사용자에게 노출하지 않는다(§3).

### 4.3 1차에서 빼되 2차에 열어두는 것 — 판정 둘

**둘 다 "필요 없다"가 아니라 "지금 넣으면 면적 대비 얻는 게 작다"는 판정이다.**

#### ① 이메일 매직링크 로그인 → 뺀다

**1차 로그인은 GitHub OAuth + Google OAuth 둘뿐이다.**

근거: 이메일 로그인은 코드가 아니라 **메일 인프라 운영**을 끌고 온다 — SPF·DKIM·DMARC, 반송 처리,
스팸 분류 모니터링, 발송 rate limit, 보안 스캐너가 링크를 먼저 열어 토큰을 소비하는 문제. 포트폴리오
목적에 비해 면적이 너무 넓고, 이 중 어느 하나가 깨져도 **"로그인이 안 된다"는 형태로만 드러나** 진단이
길다.

**초대는 이메일 없이 성립한다**: OWNER가 초대 링크를 만들어 **직접 전달**하고(슬랙·메신저), 받은
사람이 GitHub이나 Google로 로그인하면 **그 provider가 검증한 이메일**로 초대 대상과 대조한다. 이메일
소유권 증명이라는 요구는 그대로 지켜지고, 발송만 우리 책임에서 빠진다.

2차에 열 조건: 사내 비개발자가 GitHub·Google 계정을 못 쓰는 상황이 실제로 나올 때.

#### ② GitHub push webhook → 뺀다

**1차는 지금의 Actions 경로를 유지한다** (`.github/actions/l10n-push` → `/api/push`).

근거: MVP §7의 "push 웹훅"이 명시적 비범위이고, Actions 경로는 **실물로 검증돼 있다**(TASKS §7 —
`[skip-l10n]` 스킵, 열린 PR 경고, 적재 실패만 red). 웹훅으로 얻는 것은 "워크플로 파일 없이 연결"
하나인데, 서명 검증·delivery 중복 방지·이벤트 allowlist·재시도 원자성이 통째로 딸려온다.

⚠️ **대신 `/api/push`의 인증을 프로젝트별로 바꿔야 한다** — 지금은 `ACTIVE_PROJECT_SLUG` 하나에
묶여 있어 두 리포의 CI를 동시에 받을 수 없다(TASKS 전역 미결). 이건 §8 1단계의 필수 항목이고,
**대상 리포의 Actions secret이 바뀐다는 뜻**이다.

2차에 열 조건: 워크플로 파일을 못 넣는 리포가 실제 도입 대상이 될 때.

## 5. 보안 모델

### 5.1 가장 중요한 규칙

> **모든 서버 요청에서 사용자·프로젝트·GitHub 설치의 관계를 다시 확인하고, 일치하지 않으면 거부한다.**

`middleware.ts`는 **로그인하지 않은 사용자의 페이지 렌더를 막는 1차 방어**이고, 프로젝트 인가를
대신하지 않는다. Page·Server Action·Route Handler가 **각각 자기 경계에서** 확인한다.

이건 새 규칙이 아니라 이미 밟은 지뢰의 확장이다 — MVP에서 "레이아웃 조건부 렌더는 차단이 아니다"를
1.3MB RSC 페이로드 노출로 배웠다(POSTMORTEM 2026-08-31). SaaS에서 같은 실수의 형태는
**"middleware가 로그인을 확인했으니 프로젝트 접근도 됐겠지"** 다.

### 5.2 인가 판정의 주인은 하나다

```ts
requireProjectAccess({ userId, projectId, permission: "translation:write" })
```

모든 서버 진입점이 이것을 지난다. **클라이언트가 보낸 role·owner 여부·projectId의 정당성을 믿지
않는다.** ID 기반 mutation도 반드시 프로젝트를 조건에 함께 넣는다 — 이건 이미 코드 컨벤션이다
("모든 DB 쿼리는 `projectId`로 좁힌다", CLAUDE.md).

### 5.3 세션 — JWT에서 DB 세션으로

**MVP의 JWT 세션 결정이 여기서 뒤집힌다.** 근거는 그때 명시해둔 그대로다: JWT는 권한 회수가 최대
24시간 지연되는데(MVP §5), SaaS에서는 **멤버 제거와 역할 변경이 즉시 반영돼야 한다.**

- 세션에는 **안정적인 `userId`만** 담는다.
- 프로젝트 목록과 role은 **매 요청 DB에서 조회**한다.
- 토큰에 `projectIds`나 role 전체를 넣지 않는다 — 넣는 순간 JWT의 지연 문제가 그대로 돌아온다.
- `@auth/prisma-adapter`로 전환한다.

대가는 요청마다의 DB 왕복이고, 그것이 MVP에서 JWT를 고른 이유였다. **그 대가를 지금 지불한다.**

### 5.4 두 GitHub 자격증명 — 경계는 그대로다

MVP에서 세운 경계가 SaaS에서 더 중요해진다.

| 자격증명 | 용도 |
|---|---|
| GitHub **OAuth Account** | 사용자가 **어떤 설치와 리포를 선택할 자격**이 있는지 확인 |
| GitHub App **installation token** | 트리 조회 · 브랜치 갱신 · PR 생성 |

**OAuth 토큰이 커밋 경로에 들어가면 안 된다** — 커밋이 개인 명의가 되고 그 사람이 떠나면 파이프라인이
깨진다. 이건 MVP부터의 규칙이다.

**프로젝트 생성 조건 — 셋 다 서버가 확인한다**:

```
User에 GitHub Account가 연결됨
  AND 로그인 사용자가 그 installation에 접근 가능
  AND installation이 선택한 repository에 접근 가능
```

⚠️ **브라우저가 보낸 `installationId`·`owner`·`repo`를 그대로 저장하지 않는다.** 그러면 접근 권한이
없는 설치를 자기 프로젝트로 등록할 수 있다.

**GitHub App 권한은 최소로**: Metadata read · Contents read/write · Pull requests read/write.
Workflows 권한은 **연동 PR이 워크플로 파일을 쓸 때만** 필요하고, §8 5단계에서 판정한다.

### 5.5 계정 병합 — 자동으로 하지 않는다

Google과 GitHub가 **같은 이메일을 반환해도 자동으로 계정을 병합하지 않는다.** 기존 로그인 세션에서
사용자가 명시적으로 "GitHub 연결"을 실행한 경우에만 같은 User에 Account를 추가한다.

잘못된 자동 병합은 불편이 아니라 **계정 탈취**다 — provider가 반환하는 이메일이 검증됐다는 보장이
provider마다 다르다.

### 5.6 초대 — 토큰은 해시만 저장한다

- 초대 토큰 **원문을 DB에 저장하지 않는다**(해시만). 안전한 난수 · 단일 사용 · 만료형.
- 수락 성공과 동시에 무효화한다.
- 초대 대상 이메일과 **provider가 검증한 이메일이 일치**해야 수락된다.
- Project에는 **항상 OWNER가 한 명 이상** 있어야 한다 — 마지막 OWNER는 탈퇴·자기 제거 불가.
- membership은 이메일이 아니라 **`User.id`를 참조**한다 (이메일 주소는 재할당될 수 있다).

### 5.7 보안 테스트 완료 조건

아래가 **전부 거부**돼야 §8 2단계가 닫힌다.

- 비로그인 사용자의 프로젝트 조회·수정·Publish
- 프로젝트 A 멤버가 프로젝트 B의 URL·ID를 직접 전송
- 다른 프로젝트의 `keyId`·`localeCode`·`translationId` 조합
- EDITOR의 멤버·리포 설정 변경
- 설치되지 않은 리포를 Project로 등록
- 설치에 접근할 수 없는 사용자의 프로젝트 생성
- **제거된 멤버가 기존 세션으로 재접근**
- 같은 이메일이라는 이유만의 provider 계정 자동 병합
- 초대받은 이메일과 다른 계정으로 초대 수락
- 초대 토큰 재사용·만료 후 사용
- 로그·클라이언트 응답에 토큰·PEM·DB URL 노출 (이미 `lib/failure.ts`가 든다)

## 6. 스키마 변화 — 5테이블에서 11테이블로

**MVP가 5테이블을 지킨 것은 절제였다.** JWT 세션을 고른 이유가 정확히 "사용자 테이블 4개가 사라진다"
였다(MVP §5). SaaS는 그 절제를 되돌린다 — 정당한 대가이지만, **한 번에 하지 않는다**(§8이 단계로 쪼갠 이유).

| 테이블 | 언제 | 왜 |
|---|---|---|
| `User` · `Account` · `Session` · `VerificationToken` | 2단계 ✅ | Auth.js DB 어댑터(`@auth/prisma-adapter` 2.11.3). `VerificationToken`은 이메일 provider를 안 쓰므로 **항상 비어 있다** — 어댑터가 그 델리게이트를 부르므로 테이블은 있어야 한다 |
| `ProjectMember` | 2단계 ✅ | 권한의 유일한 정본 |
| `ProjectInvitation` | 2단계 ✅ | 수락 전 상태. `tokenHash` unique |
| `SyncRun` | 7단계 | 실행 이력·idempotency·동시 실행 차단 |

**✅ 여섯 테이블이 dev에 섰다** (2026-09-05, `20260904182548_add_tenant_auth_tables`). **prod는 아직이다** —
`/merge` 1단계의 `pnpm db:deploy`가 반영한다. `Authenticator`(WebAuthn)는 만들지 않는다 — 그 provider를
쓰지 않으므로 어댑터의 네 메서드가 호출될 경로가 없고, 위 11테이블 셈도 그것을 빼고 있다.

⚠️ **`onDelete`가 둘로 갈렸다.** `Account`·`Session` → `User`는 **Cascade**여야 한다 — 어댑터의
`deleteUser`가 `p.user.delete` 하나만 부르므로 `Restrict`면 그 메서드가 항상 실패한다. `ProjectMember`·
`ProjectInvitation`은 **Restrict**다: 마지막 OWNER가 조용히 사라진 프로젝트는 되살릴 수 없다.

⚠️ **타입 검사가 어댑터 계약을 검증하지 못한다** (2026-09-05 실측). 어댑터가 인자를 `@prisma/client`의
`PrismaClient`로 받는데 그 패키지는 `.prisma/client/default`를 re-export하고, Prisma 7의 `prisma-client`
생성기는 그 경로를 만들지 않는다(우리 산출물은 `generated/prisma`다). `skipLibCheck`가 해결 실패를
삼켜 파라미터가 사실상 `any`가 된다 — `PrismaAdapter({ nope: true })`도 컴파일된다.
**`prisma/__tests__/schema-contract.test.ts`가 유일한 자동 방어선이고**, 어댑터 소스의 `where` 키와
델리게이트 목록을 스키마와 직접 대조한다. 어댑터 버전을 올리면 그 테스트가 먼저 답한다.

**`AuditEvent`는 1차에서 만들지 않는다.** 근거: 멤버 변경·리포 재연결·Publish 결과는 `SyncRun`과
`ProjectMember.updatedAt`으로 대부분 추적되고, 감사 로그를 제대로 하려면 보존 기간·개인정보 마스킹
정책이 따라온다. 실제로 "누가 언제 뭘 했는지"를 못 찾는 상황이 생기면 그때 만든다.

**마이그레이션은 additive-first**로 배포한다 — nullable 관계와 새 테이블을 먼저 넣고, 기존 `Project`에
소유자를 backfill한 뒤, 애플리케이션을 새 인가 경로로 전환하고, 필요하면 그다음에 NOT NULL을 건다.
⚠️ 브랜치가 갈린 뒤로 이건 **두 단계**다: `pnpm db:migrate`(dev) → `pnpm db:deploy`(prod, `/merge` 직전).

## 7. 설계 결정

### 7.1 1 Project = 1 repository + 1 translation surface

한 리포에 번역 표면이 둘이면 **Project를 둘로** 만든다. 하나의 Project가 여러 어댑터·여러 브랜치를
관리하면 단일 소유자·결정성·고정 PR 모델이 빠르게 무너진다.

⚠️ **그래서 `SYNC_BRANCH`를 프로젝트별로 갈라야 한다** — §8 0단계. 지금은 `lib/pull/trigger.ts`의
상수 `"l10n/sync"` 하나라, 같은 리포를 가리키는 두 Project가 **force update로 서로를 덮는다.**
TASKS §7에 실측 기록이 있다(순차로 돌려 피했다). bugshot-2가 정확히 그 모양이라
(`_locales` 4키 + `ts-dict` 903키) 첫 실사용에서 터진다.

### 7.2 로케일 소유권 — 리포가 정본이다

SaaS UI에서 로케일을 **추가·삭제하지 않는다.** 별도 화면이 필요하면 편집 기능이 아니라 **발견 결과와
활성 상태를 보여주는 진단 화면**이어야 한다. 리포에서 사라진 로케일은 `Locale.orphaned`가 이미
비파괴적으로 든다(ARCHITECTURE §5.5.16).

### 7.3 자동 탐지는 추천이지 진실이 아니다

사용자가 후보와 base locale을 **확인하기 전에는 설정을 확정하지 않는다.** 후보가 여럿이면 키 수가
큰 쪽을 추천하되 자동 확정하지 않는다.

근거는 실측이다 — bugshot-2에서 작은 `_locales`(4키)가 실제 UI 딕셔너리(903키)를 가렸고, **조용히
작은 쪽으로 떨어져 에러가 나지 않았다**(TASKS §7). 온보딩의 필수 분기다.

### 7.4 워크플로 없이 첫 적재를 한다

**연동 PR을 머지하기 전에 번역 화면을 보여준다.** 서버가 GitHub App으로 base 트리를 읽어 직접
적재하면(`ingest` 경로가 이미 있다) 사용자는 "이 도구가 뭘 하는지"를 **PR을 머지하기 전에** 본다.
그다음이 "계속 자동으로 받으려면 워크플로를 붙이세요"다.

Codex 검토는 연동 PR → 머지 → Actions를 온보딩의 전제로 뒀는데, 그 순서면 **신뢰를 요구하는 행동
(리포에 PR 머지)이 가치를 보기 전에 온다.**

### 7.5 `ready`는 설정 저장이 아니라 최초 적재 성공으로 판정한다

프로젝트 상태:

```
setup → awaiting_first_sync → ready
                            ↘ error / needs_reconnect / needs_configuration
```

**별도 상태 컬럼을 즉시 만들지 않는다** — 초기에는 기존 nullable 필드와 최근 `SyncRun` 결과로 계산할
수 있다. 다만 `ready` 전 프로젝트가 번역 화면에 들어가는 것은 막는다.

### 7.6 Publish — PR 생성은 완료가 아니다

사용자 용어는 `pull`이 아니라 **Publish**다. 다만 **Publish 완료와 리포 반영 완료를 구분한다** —
PR 생성은 `published`가 아니라 `review requested`에 가깝고, 반영은 PR 머지 뒤다.

결과 상태가 서로 달라야 한다: 배포할 변경 없음 / 새 PR 생성 / 기존 PR 갱신 / **일부 값을 파일에
기록하지 못함**(`PullResult.warnings` — 이미 있다) / 실패.

### 7.7 URL — `/projects/:slug`, slug는 전역 unique

```
/projects                      목록
/projects/new                  생성
/projects/:slug/translations   번역
/projects/:slug/publish        Publish
/projects/:slug/settings       설정
```

**account 단계를 두지 않는다** (`/:account/:project`가 아니다). 조직 계층이 §4.2 비범위이므로 그 단계를
지금 만들면 **쓰이지 않는 계층을 미리 만드는 것**이고, `Account` 테이블과 개인/조직 판정이 따라온다.

대가는 **slug 선점**이다 — 전역 unique라 먼저 만든 사람이 이름을 갖는다. 포트폴리오 규모에서는 무해하고,
조직이 실제로 필요해지면 `/:account/:project`로 옮기며 옛 URL에 redirect를 둔다.

⚠️ **URL을 안다는 사실은 접근 권한이 아니다.** slug는 사람이 읽는 주소일 뿐이고, 인가는 항상 내부
`projectId`와 `ProjectMember`로 판정한다 (§5.2).

### 7.8 push 인증 — `Project.pushTokenHash`

`ACTIVE_PROJECT_SLUG`(서버 env 하나)를 대체한다. 프로젝트마다 토큰을 발급해 **sha256 해시만 저장**하고,
페이로드의 `projectSlug`로 행을 찾아 대조한다.

- **원문은 발급 시 한 번만 보여준다** — 초대 토큰과 같은 모델이라(§5.6) 해시 저장 규칙이 한 곳에 모인다.
- 대상 리포의 composite action은 **이미 `project`·`push-token` input을 갖는다**(`docs/ACTIONS.md`) —
  **서버 쪽만 바꾸면 되고 대상 리포는 secret 값만 교체**한다.
- GitHub OIDC는 쓰지 않는다. 공유 시크릿이 사라지는 것은 매력적이지만 JWKS 검증 + claim 대조
  (`repository`가 그 Project의 리포인가) 구현이 늘고, 대상 리포 워크플로에 `id-token: write` 권한이
  필요해진다. **토큰 유출이 실제 문제가 되면** 그때 옮긴다.

⚠️ **`ACTIVE_PROJECT_SLUG`가 사라지는 순간 `lib/push/guard.ts`의 오배송 판정 근거가 바뀐다.** 지금은
"서버가 아는 프로젝트와 다른가"인데, 그때는 **"이 토큰이 그 프로젝트의 것인가"** 가 된다. 역행 거부
(`commitAt`)는 그대로다.

### 7.9 프로젝트 수명주기 — 보관까지만 만든다

```
active → archived (편집·sync 중단, 목록에서 숨김)
       → 영구 삭제는 손으로
```

**자동 영구 삭제를 구현하지 않는다** — 유예 기간을 세려면 스케줄러가 필요하고, 포트폴리오 단계에서
그것이 답하는 질문이 없다. 보관 상태와 정책만 둔다.

- 보관해도 **번역 데이터는 남는다.** 되돌릴 수 있는 것이 이 프로젝트의 성질이다(`orphaned`와 같은 이유).
- **열린 `l10n/sync-<slug>` PR은 닫지 않는다** — 리포는 사용자 것이고, 우리가 그쪽 PR을 정리할 권한을
  가정하지 않는다. 보관 화면에 "열린 PR이 있습니다"만 알린다.
- **GitHub App을 제거해도 프로젝트를 지우지 않는다** — `needs_reconnect`로 두고 재설치로 되돌린다
  (§8 4단계).

## 8. 구현 순서

> **Codex 검토의 9단계와 다르다.** 사전 단계와 0단계(무결성 부채)는 이미 닫혔고, UI 이관을 앞으로
> 당겼다 — 인증만 만들고 화면이 없으면 3~5단계를 검증할 방법이 API 테스트뿐인데, preview 배포를
> 만든 이유가 정확히 "눈으로 확인할 곳"이었다.

### 0단계 — 선행 정리 ✅ (2026-09-05)

SaaS 기능이 아니라 **다중 프로젝트가 서는 순간 터지는 것**을 먼저 막는다.

- [x] **`SYNC_BRANCH`를 프로젝트별로 갈랐다** ✅ (2026-09-05) — 상수 `l10n/sync` → `syncBranchFor(slug)`가
      내는 `l10n/sync-<slug>`. **`Project` 컬럼으로 두지 않았다** — 마이그레이션이 필요하고, 사용자가
      브랜치 이름을 정하고 싶어하는 요구는 아직 없다. 필요해지면 그때 컬럼으로 승격한다
  - `Project.slug`에 형식 제약이 없어(`slug String @unique`) **이 함수가 유일한 방어선이다** — git이
    거부할 이름을 화이트리스트로 막고 던진다. 안 막으면 `createRef` 422가 "GitHub이 거절함"으로만 보인다
  - 검증: 18케이스(`lib/pull/__tests__/trigger.test.ts`) — 다른 slug는 다른 브랜치, 같은 slug는 같은
    브랜치, git이 거부할 15가지 slug를 던진다. 폐기용 리포 셋에 열린 `l10n/sync` PR이 없어(전부 머지됨)
    이름이 바뀌어도 고아 PR이 생기지 않는다
- [x] **dev DB 적재** ✅ (2026-09-05) — `order-check` 프로젝트(`SinhyeokKang/i18n-order-check`) 23키 ·
      로케일 en/ja/ko · 번역 69건. **prod에서 복제하지 않았다** — `DATABASE_URL_PROD`를 두지 않는
      규칙(CLAUDE.md) 때문에 로컬이 prod 런타임을 가리킬 길을 열지 않고, 대신 **GitHub App API로
      `installationId`를 조회**해(`GET /app/installations` → `158107153`) dev에 행을 새로 만들었다
  - `Project` 행은 여전히 **손으로 만든다** — `applyPush`는 `project.update`만 하고 생성 경로가 없다.
    프로젝트 생성이 §8 5단계의 내용이다
  - 나머지 컬럼(`adapterName`·`pathTemplate`·`nested`·`baseLocale`)은 push가 채웠다 —
    `json-catalog` / `locales/{locale}.json` / 중첩 / base `en`

### 1단계 — SaaS 경계 확정 ✅ (2026-09-05)

**화면보다 도메인과 주소를 먼저 확정했다.** 문서 작업이라 `/feature`를 부르지 않았고, 결정은 전부
§7로 올라갔다 — 아래는 그 목록이다.

- [x] **URL 구조와 slug 소유 범위** → §7.7. `/projects/:slug`, slug **전역 unique**. account 단계를
      두지 않는다 (조직 계층이 §4.2 비범위라 쓰이지 않는 계층을 미리 만드는 것이 된다)
- [x] **`/api/push` 인증** → §7.8. `Project.pushTokenHash`(sha256). **대상 리포는 secret 값만 교체**한다 —
      composite action이 이미 `project`·`push-token` input을 갖고 있어 워크플로는 안 바뀐다
- [x] **프로젝트 수명주기** → §7.9. 보관까지만 만들고 자동 영구 삭제는 안 만든다. App 제거는
      `needs_reconnect`이고 데이터를 지우지 않는다
- [x] **UI 레퍼런스 — Supabase 대시보드** → `docs/DESIGN.md` §9. 레이아웃·밀도·정보구조를 참조하고
      **색은 우리 토큰을 유지한다** (라이트 단일 강제가 그대로다)

완료 게이트: 모든 화면과 mutation을 **사용자·프로젝트·권한으로 표현**할 수 있다 ✅ /
`ACTIVE_PROJECT_SLUG` 없이 대상 프로젝트가 결정된다 — **설계로는 ✅(§7.8), 구현은 2단계 이후다**

### 2단계 — 인증·인가 토대 🚧 ← **현재 단계** → `features/tenant-auth/`

- [ ] `User`·`Account`·`Session`·`ProjectMember`·`ProjectInvitation` (§6)
- [x] Auth.js **DB 세션** 전환 (§5.3), GitHub + Google provider ✅ (2026-09-05, `0d80e5a`)
  - ⚠️ **Google은 아직 로그인이 거부된다** — 허용 목록이 GitHub 핸들을 요구하고 Google 사용자에겐
    핸들이 없다(의도된 fail-closed). 목록을 GitHub에만 걸면 그 순간 Google이 무인가 통로가 되는데,
    `requireProjectAccess`가 아직 편집 경로에 붙기 전이라 그 통로로 들어온 사람이 번역을 고칠 수 있다.
    **아래 두 항목이 같은 커밋에서 끝날 때 열린다.**
  - **이메일 검증이 provider의 `profile` 구성 자리로 올라갔다** — `signIn`에서 검사만 하면 검증한
    주소와 저장되는 `User.email`이 갈린다 (ARCHITECTURE §6.2, POSTMORTEM 2026-09-05)
- [x] `requireUser` · `requireProjectAccess` (§5.2) ✅ (2026-09-05, `bb94651`) —
      **호출부는 아직 0이다.** 편집 경로에 붙이는 것이 3단계와 합쳐진 §5다
- [x] 이메일 정규화·초대 수락·**멤버 변경**의 **순수 판정 함수** ✅ (2026-09-05, `2e0f7f4`) —
      `lib/auth/`에 9개(`normalizeEmail`·`canPerform`·`hashInviteToken`·`planInvitationAccept`·
      `planProjectAccess`·`planMemberChange`·`planOwnerBackfill`·`hasSessionCookie`·
      `accessErrorMessage`), 검증 67케이스. **호출부는 아직 없다** — 껍데기가 위 두 항목이다
  - ⚠️ **"계정 연결"이 빠졌다.** `planAccountLink`는 4단계(`github-connect`)로 옮겼다 — Auth.js
    어댑터가 기본으로 교차 provider 자동 연결을 거부하므로(`allowDangerousEmailAccountLinking`
    미설정) 이 단계의 방어선은 **그 옵션을 켜지 않는 것**이고, 명시적 연결 흐름은 4단계다.
    호출부 없는 판정 함수를 미리 만드는 것은 이 프로젝트에서 결함이다
- [x] 기존 `Project`에 소유자 backfill **스크립트** ✅ (2026-09-05, `bdd254b`) — `scripts/backfill-owners.ts`.
      ⚠️ **아직 실행하지 않았다** — dev·prod 양쪽의 `--apply`는 인가 전환 직전이 적기다.
      `User` + `Account(github)` + `ProjectMember`를 **한 트랜잭션**으로 만든다: `User`만 만들면
      첫 GitHub 로그인이 `OAuthAccountNotLinked`로 거부되고, 그게 이 스크립트가 존재하는 이유의 절반이다

완료 게이트: §5.7의 공격 시나리오가 **전부 거부** / 멤버 제거가 기존 세션에 **즉시** 반영 /
프로젝트 인가 없이 실행되는 Server Action·Route Handler가 0 / Google 사용자가 GitHub 계정 없이
초대 수락과 편집이 가능.

### 3단계 — 최소 UI 이관 ⬜

**전면 재작성이 아니다.** 동결된 `/keys`를 프로젝트 URL과 인가 경계 위로 옮기기만 한다 —
판정 로직(`lib/keys/view.ts`·`translationState`)이 이미 있어 이관 비용이 작고, 이게 있어야
4·5단계를 preview에서 화면으로 확인한다.

- [ ] `/keys` → `/projects/:slug/translations`, 프로젝트 전환
- [ ] 모든 조회·저장이 `requireProjectAccess`를 지난다

완료 게이트: 다른 프로젝트 ID를 주입해도 노출·수정되지 않는다 / 기존 push→편집→pull 값 전달
테스트가 새 경로에서도 통과한다.

### 4단계 — GitHub 설치 연결 ⬜ → `features/github-connect/`

- [ ] 기존 User에 GitHub Account **명시적 연결** (§5.5)
- [ ] installation 조회 · repository 조회 · **3중 검증** 후 Project 연결 (§5.4)
- [ ] App 제거·리포 접근 철회·이름 변경·소유자 이전 → `needs_reconnect` (데이터는 보존)

완료 게이트: 접근할 수 없는 `installationId`를 직접 보내도 생성되지 않는다 / OAuth 토큰이 커밋
경로에 들어가지 않는다 / App을 제거해도 번역 데이터가 보존되고 재설치로 재연결된다.

### 5단계 — 탐지 온보딩 ⬜ → `features/project-onboarding/`

- [ ] 탐지 후보를 **사용자 언어로** 요약 (경로·언어·기준 언어·키 수·형식), 내부 이름은 숨김 (§3)
- [ ] 후보 추천 순위와 **사용자 확정** (§7.3)
- [ ] **워크플로 없이 첫 적재** (§7.4)
- [ ] 연동 PR 생성 또는 복사 가능한 워크플로 — Workflows 권한 판정 (§5.4)
- [ ] `ready` 판정과 실패 진단 (실패 단계 · 사람이 읽는 원인 · Actions 링크 · 다시 검사)

완료 게이트: 새 사용자가 **문서나 터미널 없이** 첫 적재를 완료한다 / 작은 후보가 큰 표면을 조용히
가리지 않는다 / 확정하지 않은 추정값으로 `ready`가 되지 않는다.

### 6단계 — 번역 UI 재작성 + Publish ⬜ → `features/translation-ui/`

3단계에서 이관한 화면을 **여기서 제대로 만든다.**

- [ ] 원문 + 전 로케일, 저장 상태, `needsReview`·`orphaned` 배지, 코드 permalink
- [ ] **MVP §10 미결 둘을 여기서 답한다** — orphaned 로케일의 화면 처리, 덮인 셀의 `updatedBy`
- [ ] **편집 손실 창 배너** (MVP §3.1·§8.3이 SaaS로 이관한 항목)
- [ ] 미배포 변경 수 · Publish Server Action · PR 상태와 링크 · **버린 값 표시**(`warnings`)

완료 게이트: 변경 없음 / 새 PR / 기존 PR 갱신 / 부분 기록 불가 / 실패가 **서로 다른 상태**다 /
PR 생성과 머지를 같은 완료로 표시하지 않는다 / 같은 DB 상태의 반복 Publish가 새 커밋을 만들지 않는다.

### 7단계 — 운영 안전성 ⬜ → `features/sync-runs/`

- [ ] `SyncRun` — type · status · idempotencyKey · requestedBy · errorCode
- [ ] **프로젝트당 동일 종류 실행은 하나** / HTTP 성공은 접수이지 완료가 아니다
- [ ] Publish 동시성 계약 — 시작 시점의 `max(updatedAt)`까지 포함, 실패는 `lastPulledAt`을 전진시키지 않음
      (⚠️ **`lib/pull/run.ts`가 이미 그렇게 한다** — SyncRun으로 옮길 때 잃지 않는다)
- [ ] 로케일 파일이 사라지면 `needs_configuration` — **자동 재탐지하지 않는다** (§7.3의 연장)
- [ ] 고정 제한 — 사용자당 프로젝트 3 / 프로젝트당 멤버 10 / 동시 sync 1 / Publish 최소 간격 30초
- [ ] 오류 분류 — 안정적 내부 code + 사용자용 설명 + 재시도 가능 여부 (`lib/failure.ts` 확장)

완료 게이트: Publish 연속 클릭이 커밋·PR을 한 번만 만든다 / 실패한 sync가 마지막 성공 상태를 덮지
않는다 / 프로세스 중단이 영구 `running`을 남기지 않는다.

### 8단계 — 포트폴리오 마감 ⬜

- [ ] 공개 데모 — **읽기 전용 샘플 프로젝트**, 실제 왕복은 폐기 가능한 데모 리포로
- [ ] 온보딩 GIF, 아키텍처 다이어그램, 위협 모델 요약
- [ ] POSTMORTEM 3~5건을 문제→원인→**구조적 예방**으로 정리
- [ ] 지원 포맷과 **의도적 비범위** 명시

완료 게이트: 방문자가 로그인 없이 문제와 차별점을 이해한다 / 로그인한 평가자가 샘플 리포로 첫
왕복을 완료한다.

## 9. 불변식 — 구현 내내 확인한다

**앞의 넷은 MVP에서 그대로 이어진다. 뒤의 다섯이 SaaS에서 새로 생긴다.**

1. 번역 값은 DB, 소스 키와 로케일 존재 여부는 리포가 정본이다.
2. push 시점 외에는 리포 값과 DB 값을 비교해 **승자를 고르지 않는다**.
3. 키와 번역을 **삭제하지 않고** 비활성으로 보존한다.
4. 같은 DB 상태와 같은 원본 구조는 **같은 바이트**를 만든다.
5. 프로젝트를 식별하는 모든 DB 쿼리는 **인가된 `projectId`로 제한**한다.
6. GitHub 사용자 OAuth와 App installation token의 **역할을 섞지 않는다**.
7. 로그인 provider가 아니라 **`ProjectMember`가 권한을 결정**한다.
8. **`ready`는 설정 저장이 아니라 최초 적재 성공**으로 판정한다.
9. **버린 값을 성공으로 숨기지 않는다** — 실패한 sync는 마지막 성공 상태를 전진시키지 않는다.

## 10. 아직 안 정한 것

- **Workflows 권한을 요구할 것인가** (§5.4) — 연동 PR을 자동으로 내려면 필요하지만, 설치 화면에서
  "워크플로 파일을 수정합니다"는 신뢰 비용이 크다. 5단계에서 실제 설치 화면을 보고 정한다
- **`AuditEvent`를 만드는 시점** (§6) — "누가 언제 뭘 했는지"를 못 찾는 상황이 실제로 나올 때
