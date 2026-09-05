> ## ⚠️ 이 문서는 스펙이 아니라 근거다
>
> **정본은 [../SAAS.md](../SAAS.md)이고, 이 문서는 그 결론에 도달한 과정이다.** 2026-09-04에 Codex가
> 낸 종합 검토를 원문 그대로 보관한다 — 보안 모델(§5)과 운영 경계(§10)는 상당 부분 여기서 SAAS.md로
> 올라갔다. 아래 셋을 알고 읽는다.
>
> **① 사전 단계와 0단계는 이미 닫혔다** (작성 시점 이후). 실행 계획으로 쓰면 끝난 일을 다시 한다:
> 리네임 10항목은 `174023e`(2026-09-04), 무결성 부채 4항목은 감사 1·2회차가 닫았다 —
> push 단일 트랜잭션(ARCHITECTURE §5.5.15) · `Locale.orphaned`(`_add_locale_orphaned`) ·
> `writeWithErrors` → `PullResult.warnings` · `contract.ts`의 `ADAPTERS` 순회.
> §10.4가 요구한 `lastPulledAt` 계약도 `lib/pull/run.ts:73`이 이미 그렇게 한다.
>
> **② 이 문서가 놓친 결함이 하나 있었다** — `SYNC_BRANCH`가 상수 `"l10n/sync"`였다
> (`lib/pull/trigger.ts`). §8이 권하는 "한 리포에 표면이 둘이면 Project를 둘로"가 성립하면
> **그 둘이 같은 브랜치를 force update로 다툰다.** TASKS §7에 실측 기록이 있다. → SAAS 0단계가
> `syncBranchFor(slug)`로 닫았고(2026-09-05), 소비자(action.yml·스모크·ACTIONS.md)는 `289ec22`(09-06)가 맞췼다.
>
> **③ SAAS.md가 갈라선 판정 셋**: 이메일 매직링크 로그인을 1차에서 뺐고(메일 인프라 운영이
> 포트폴리오 대비 면적이 넓다 — 초대는 OAuth가 검증한 이메일로 성립한다), push 웹훅도 뺐으며
> (MVP §7 비범위이고 Actions 경로가 실물 검증됐다), UI 이관을 6단계에서 3단계로 당겼다
> (인증만 만들고 화면이 없으면 그 뒤 단계를 preview에서 확인할 수 없다).

---

# 말모이(malmoi) SaaS화 종합 검토

작성일: 2026-09-04

서비스명: **말모이(malmoi)**

권장 태그라인:

> malmoi — GitHub-native localization

`말모이`는 흩어진 말을 모아 함께 다듬는다는 제품 역할과 맞고 한국어 사용자에게 기억되는 이름이다. 영문 사용자에게는 이름만으로 기능을 알기 어려우므로 제품명 단독보다 설명형 태그라인을 항상 함께 사용한다. 최종 확정 전 도메인, 상표, GitHub organization·repository 이름의 사용 가능 여부를 확인한다.

## 1. 결론

i18n-poc의 SaaS화 목표는 상용 TMS의 기능표를 복제하는 것이 아니라, **처음 온 개발자가 GitHub 리포를 연결하고 비개발자 동료와 첫 번역 PR을 안전하게 만드는 전 과정을 혼자 완료하게 하는 것**이어야 한다.

제품의 단일 완료 조건은 다음 문장으로 잡는 것이 좋다.

> 낯선 리포를 연결한 사용자가 10분 안에 로케일을 발견하고, 번역을 수정하고, 기존 리포에 결정적인 pull request로 반영할 수 있다.

현재 프로젝트의 강점은 이미 엔진 쪽에 있다. 결정적 export, blob SHA 비교, strict push, orphan 보존, 포맷별 어댑터, GitHub App 기반 PR 생성, 실물 리포 검증은 일반적인 CRUD 포트폴리오와 명확히 구분된다. SaaS 단계에서는 엔진 기능을 더 넓히기보다 **온보딩·테넌트 인가·운영 상태 표시**를 닫아 다른 사람이 실제로 사용할 수 있게 만드는 것이 우선이다.

## 2. 제품 포지셔닝

권장 포지셔닝:

> GitHub-native localization pipeline that deterministically synchronizes repository locale files, a translation database, and a reusable pull request across heterogeneous formats.

Crowdin이나 Tolgee의 대체품으로 설명하면 번역 메모리, 기계 번역, 승인 워크플로, 스크린샷, ICU, 과금 같은 기능 부재가 약점으로 보인다. 반대로 다음 문제를 해결하는 개발 도구로 설명하면 현재 설계가 강점이 된다.

- 기존 리포 구조를 바꾸지 않고 로케일 파일을 발견한다.
- 번역 값과 소스 키의 소유권을 분리해 병합 로직을 제거한다.
- 같은 DB 상태에서 같은 파일을 생성한다.
- 변경된 파일만 하나의 고정 PR에 반영한다.
- JSON, YAML, TypeScript/JavaScript 딕셔너리의 구조와 표현을 보존한다.

수익화가 목적이 아니므로 사용자 수나 기능 수보다 다음 두 가지가 포트폴리오의 성패를 결정한다.

1. 제3자가 설명 없이 첫 왕복을 완료할 수 있는가.
2. 데이터 손실·권한 누출·무의미한 PR을 구조적으로 막았는가.

## 3. 핵심 사용자

### 개발자 또는 프로젝트 소유자

원하는 것:

- GitHub 리포를 빠르게 연결한다.
- 어떤 로케일 파일이 선택됐는지 확인한다.
- 번역 변경을 코드 리뷰 가능한 PR로 받는다.
- 자동화 실패 원인을 GitHub Actions나 서버 로그를 뒤지지 않고 안다.

책임:

- GitHub App 설치
- 리포와 기준 브랜치 선택
- 탐지된 번역 표면과 기준 로케일 확인
- 연동 PR 머지
- 번역 PR 리뷰와 머지

### 번역 편집자

원하는 것:

- Git이나 파일 형식을 몰라도 원문과 번역을 나란히 본다.
- 수정한 내용이 저장됐는지 안다.
- 무엇이 아직 publish되지 않았는지 안다.
- Publish 결과와 PR 상태를 이해한다.

알 필요가 없는 것:

- adapter 이름
- pathTemplate
- nestedByPath
- blob SHA
- Git Data API
- OAuth 토큰과 installation token의 차이

## 4. 권장 사용자 여정

```text
이메일·Google·GitHub 로그인
→ 필요하면 GitHub 계정 연결
→ GitHub App 설치
→ 접근 가능한 리포 선택
→ base branch와 로케일 후보 탐지
→ 번역 표면·기준 로케일 확인
→ 연동 PR 생성
→ 사용자가 PR 머지
→ 최초 sync 수신
→ 번역 편집 가능
→ Publish
→ l10n/sync PR 생성 또는 갱신
→ PR 머지 후 동기화 완료
```

### 4.1 계정 생성과 로그인

첫 CTA는 `프로젝트 만들기`보다 `GitHub 리포 연결`이 적합하다. 사용자는 내부 도메인인 Project보다 리포를 먼저 이해한다.

계정 모델의 기준은 이메일이다. 다만 DB의 실제 식별자는 변경 가능한 이메일이 아니라 내부 `User.id`로 둔다.

지원 로그인:

- 이메일 매직링크
- Google OAuth
- GitHub OAuth

Google과 이메일 로그인만으로 초대 수락, 번역 편집, Publish가 가능하다. 프로젝트 생성과 리포 연결에는 **현재 로그인 방식과 무관하게 User에 연결된 GitHub Account가 필요하다.** Google로 로그인한 사용자가 GitHub 계정을 연결했다면 다시 GitHub 로그인으로 전환할 필요는 없다.

```text
User
├── verified primary email
├── Google Account (optional)
└── GitHub Account (프로젝트 생성 시 필수)
```

로그인은 사용자 신원 확인에만 사용한다. GitHub OAuth 사용자 토큰으로 리포에 커밋하지 않는다. 실제 리포 쓰기는 GitHub App installation token이 담당한다.

Google과 GitHub가 같은 이메일을 반환해도 자동으로 계정을 병합하지 않는다. 기존 로그인 세션에서 사용자가 명시적으로 `GitHub 연결`을 실행한 경우에만 같은 User에 Account를 추가한다. 잘못된 자동 병합은 불편을 넘어 계정 탈취가 된다.

비개발자 초대 흐름:

```text
OWNER가 이메일로 초대
→ PendingInvitation 생성
→ 초대 링크에서 이메일 소유권 확인
→ User 생성 또는 기존 User 확인
→ ProjectMember 생성
→ 번역 화면 진입
```

초대받은 주소와 GitHub가 반환한 이메일이 다를 수 있으므로 GitHub 로그인만으로 이메일 초대를 자동 수락하지 않는다. 초대 대상 이메일의 소유권을 이메일 매직링크 또는 같은 주소를 검증한 Google Account로 증명해야 한다.

### 4.2 GitHub App 설치

GitHub App은 별도 관리 기능처럼 노출하지 않고 리포 연결 과정 안에서 필요한 권한을 얻는 단계로 보여준다.

사용자 문구는 다음 정도면 충분하다.

> 선택한 리포의 번역 파일을 읽고 동기화 pull request를 만드는 데 사용합니다.

이미 접근 가능한 설치가 있다면 설치 화면을 건너뛰고 리포 선택으로 이동한다.

### 4.3 리포 선택

사용자가 접근할 수 있는 리포가 아니라, **로그인 사용자와 GitHub App 설치가 모두 접근할 수 있는 리포**만 보여준다.

리포 선택 직후 Project를 완성 상태로 만들지 않는다. 최초 sync 전에는 설정 중인 프로젝트다.

권장 상태:

```text
setup
awaiting_installation_pr
awaiting_first_sync
ready
error
```

별도 상태 컬럼을 즉시 만들 필요는 없다. 초기에는 기존 nullable 필드와 최근 작업 결과로 계산할 수 있다. 다만 `ready` 전 프로젝트가 번역 화면에 들어가는 것은 막아야 한다.

### 4.4 로케일 자동 탐지와 확인

GitHub App으로 base branch의 트리와 후보 파일을 읽어 탐지한다. 사용자에게 내부 어댑터 대신 관측된 결과를 보여준다.

```text
경로       src/i18n/{locale}.json
언어       en, ko, ja
기준 언어  en
키         1,446개
형식       JSON
```

사용자가 반드시 확인할 값:

- 번역 대상으로 삼을 파일 집합
- 기준 로케일
- base branch

내부에만 둘 값:

- adapterName
- pathTemplate의 구체적 표현
- layout
- writeStrategy
- nestedByPath

한 리포에서 후보가 여러 개면 키 수가 큰 후보를 추천하되 자동 확정하지 않는다.

```text
○ src/i18n/{locale}.json — 1,446키 — 추천
○ public/_locales/{locale}/messages.json — 4키
```

bugshot-2에서 작은 `_locales` 표면이 실제 UI 번역 딕셔너리를 가린 전례가 있으므로 이 선택은 온보딩의 필수 분기다.

### 4.5 연동 PR

사용자가 YAML을 직접 복사하게 하지 말고 서비스가 연동 PR을 만든다. PR은 다음만 포함한다.

- push 워크플로
- 프로젝트 식별자
- 확정된 adapter·경로·base locale 설정
- `[skip-l10n]` 처리

GitHub App이 `.github/workflows`를 수정하려면 별도 Workflows 권한이 필요할 수 있다. 이 권한이 부담스럽다면 1차 SaaS에서는 복사 가능한 워크플로와 검증 버튼을 제공하고, 다음 단계에서 자동 PR로 올리는 편이 낫다. 권한을 요청한다면 왜 필요한지 설치 화면에서 설명한다.

### 4.6 최초 sync

연동 PR이 머지됐다는 사실만으로 프로젝트를 ready로 만들지 않는다. 실제 push payload를 받아야 키·로케일·번역 값이 성립한다.

```text
연동 PR 생성됨
→ 머지 대기
→ GitHub Actions 실행 중
→ 1,446키·3로케일 수신
→ 프로젝트 준비 완료
```

실패 상태에는 최소한 다음을 보여준다.

- 실패 단계
- 사람이 이해할 수 있는 진단
- 해당 GitHub Actions 실행 링크
- 다시 검사 버튼

### 4.7 번역 편집

준비 완료 뒤 정보 구조는 다음 정도로 제한한다.

```text
프로젝트
├── 번역
├── Publish
└── 설정
```

로케일은 리포가 정본이므로 SaaS UI에서 임의 추가·삭제하지 않는다. 별도 로케일 화면이 필요하면 편집 기능이 아니라 리포에서 발견된 상태와 최근 sync 결과를 보여주는 진단 화면이어야 한다.

### 4.8 Publish

사용자 용어는 `pull`보다 `Publish changes`가 낫다. 다만 Publish 완료와 리포 반영 완료를 구분한다.

```text
미배포 번역 12건
→ 파일 렌더
→ blob 비교
→ 변경 파일만 반영
→ 기존 PR 갱신 또는 새 PR 생성
```

결과 상태:

- 배포할 변경 없음
- 새 PR 생성
- 기존 PR 갱신
- 일부 값을 파일에 기록하지 못함
- 실패

PR 생성은 `published`가 아니라 `review requested`에 가깝다. 리포 반영 완료는 PR 머지 뒤다.

## 5. 보안 모델

### 5.1 가장 중요한 규칙

> 모든 서버 요청에서 사용자, 프로젝트, GitHub 설치의 관계를 다시 확인하고 일치하지 않으면 기본 거부한다.

middleware는 로그인하지 않은 사용자의 페이지 렌더를 막는 1차 방어다. 프로젝트 인가를 대신하지 않는다. Page, Server Action, Route Handler는 각각 자신의 서버 경계에서 권한을 확인해야 한다.

### 5.2 권장 데이터 모델

```text
User
├─ Account (email / Google / GitHub)
└─ ProjectMember
    └─ Project
        └─ GitHubInstallation
            └─ Repository
```

계정과 권한의 진실은 다음처럼 나눈다.

- `User.id`: 서비스 안의 불변 사용자 식별자
- `User.email`: 검증된 기본 이메일이자 초대 주소
- `Account`: 이메일·Google·GitHub 로그인 연결
- `ProjectInvitation.email`: 수락 전 초대 대상
- `ProjectMember.userId`: 수락 후 프로젝트 권한
- GitHub Account: 프로젝트 생성 자격
- GitHub App installation: 특정 리포 접근 자격

로그인 provider는 역할을 정하지 않는다. GitHub로 로그인한 EDITOR와 Google로 로그인한 OWNER도 모델상 가능하며, 실제 권한은 `ProjectMember.role`만 결정한다.

최소 역할:

```text
OWNER
EDITOR
```

| 작업 | OWNER | EDITOR |
|---|---:|---:|
| 번역 조회·수정 | O | O |
| Publish | O | O |
| 리포·기준 로케일 변경 | O | X |
| 멤버 관리·프로젝트 삭제 | O | X |

Viewer, Admin, Billing 같은 역할은 실제 요구가 생기기 전까지 만들지 않는다.

EDITOR에게 Publish를 허용하는 것이 제품 목표에 맞다. Publish는 base branch 직접 쓰기가 아니라 검토 가능한 PR 생성이므로, 비개발자가 Publish하고 개발자가 GitHub에서 리뷰·머지하는 경계가 병목을 줄이면서 코드 승인권을 유지한다.

### 5.3 초대 모델

권장 최소 모델:

```prisma
model ProjectInvitation {
  id         String   @id @default(cuid())
  projectId  String
  email      String
  role       ProjectRole
  tokenHash  String   @unique
  expiresAt  DateTime
  acceptedAt DateTime?
  invitedBy  String
  createdAt  DateTime @default(now())

  @@unique([projectId, email])
}
```

초대 토큰 원문은 DB에 저장하지 않고 해시만 저장한다. 토큰은 안전한 난수, 단일 사용, 만료형으로 만들고 수락 성공과 동시에 무효화한다. 초대받지 않은 이메일에 로그인 링크를 요청해도 계정 존재 여부를 드러내지 않는 동일한 응답을 보낸다.

### 5.4 공통 인가 함수

인가 판정의 주인을 하나로 만든다.

```ts
requireProjectAccess({
  userId,
  projectId,
  permission: "translation:write",
});
```

모든 서버 진입점이 이를 통과해야 한다. 클라이언트가 보낸 role, owner 여부, projectId의 정당성을 신뢰하지 않는다.

ID 기반 mutation도 반드시 프로젝트를 함께 조건에 넣는다.

```ts
prisma.translation.findFirst({
  where: {
    id: translationId,
    projectId: authorizedProjectId,
  },
});
```

### 5.5 세션

현재 JWT 세션은 단일 허용 목록에서는 합리적이다. SaaS에서는 멤버 제거와 역할 변경이 즉시 반영돼야 하므로 다음 구조가 낫다.

- 세션에는 안정적인 userId만 저장
- 프로젝트 목록과 role은 DB에서 조회
- SaaS 진입 시 Auth.js DB 세션으로 전환
- 토큰에 projectIds나 role 전체를 넣지 않음

이메일은 인증 가능한 식별자지만 계정 PK가 아니다. 원문 주소는 보존하고 비교 정책을 한곳에서 명시한다. 이메일 변경은 새 주소를 다시 검증하며 기존 주소에도 변경 알림을 보낸다.

JWT에 권한을 넣으면 멤버 제거 뒤에도 토큰 만료까지 권한이 남는다.

### 5.6 GitHub OAuth와 GitHub App

두 GitHub 자격증명의 역할을 분리한다.

- GitHub OAuth Account: 사용자가 어떤 설치와 리포를 선택할 자격이 있는지 확인
- GitHub App installation token: 트리 조회, 브랜치 갱신, PR 생성

프로젝트 생성 조건:

```text
User에 GitHub Account가 연결됨
AND 로그인 사용자가 해당 installation에 접근 가능
AND installation이 선택한 repository에 접근 가능
```

Project 생성 시 브라우저가 보낸 installationId, owner, repo를 그대로 저장하면 안 된다.

서버가 확인할 관계:

```text
로그인 사용자
→ 해당 GitHub 설치에 접근 가능
→ 설치가 선택한 리포에 접근 가능
→ installationId와 repo가 Project에 저장됨
```

백그라운드 sync와 PR 생성은 installation token으로 수행한다. 사용자 OAuth 토큰은 사용자 식별과 리포 선택 권한 확인에만 사용한다.

GitHub App 권한은 최소화한다.

- Metadata: read
- Contents: read/write
- Pull requests: read/write
- Workflows: 연동 PR이 워크플로 파일을 수정할 때만

installation token은 요청 시 대상 repository와 permission을 다시 좁히는 방식을 권장한다.

### 5.7 외부 진입점과 webhook

초기 SaaS에서도 현재 push endpoint를 프로젝트별 자격증명으로 확장할 수 있다. 장기적으로는 GitHub App webhook이 더 자연스럽다.

```text
GitHub push webhook
→ raw body HMAC 서명 검증
→ delivery ID 중복 방지
→ installationId와 repository로 Project 식별
→ 해당 프로젝트 sync 실행
```

웹훅을 도입할 때 필요한 것:

- webhook secret 검증
- raw request body 기준 서명 비교
- delivery ID 저장과 idempotency
- 이벤트 타입과 ref 명시적 allowlist
- installation과 repository의 Project 소속 확인
- 실패 재시도 시 부분 커밋이 남지 않는 원자성

### 5.8 보안 테스트 완료 조건

다음 공격 시나리오가 모두 거부돼야 한다.

- 비로그인 사용자의 프로젝트 조회·수정·Publish
- 프로젝트 A 멤버가 프로젝트 B의 URL이나 ID를 직접 전송
- 다른 프로젝트의 keyId·localeCode·translationId 조합
- EDITOR의 멤버·리포 설정 변경
- 설치되지 않은 리포를 Project로 등록
- GitHub App 설치에 접근할 수 없는 사용자의 프로젝트 생성
- 제거된 멤버가 기존 세션으로 재접근
- Google로 로그인한 기존 사용자가 명시적 연결 없이 같은 이메일의 GitHub Account와 자동 병합
- 초대받은 이메일과 다른 GitHub 이메일로 초대 수락
- 초대 토큰 재사용·만료 후 사용
- 로그인 링크 요청을 통한 가입 이메일 열거
- 위조된 webhook
- 같은 webhook delivery의 재전송
- 잘못된 base branch 이벤트
- 로그와 클라이언트 응답에 토큰·PEM·DB URL 노출

## 6. SaaS화 구현 순서

### 사전 단계 — i18n-poc에서 malmoi로 외부 식별자 정리

SaaS 기능을 시작하기 전에 사용자에게 노출되는 이름을 `malmoi`로 통일한다. 기능 구현 중 이름을 함께 바꾸면 OAuth·GitHub App·배포 오류와 제품 기능 회귀가 섞여 원인 판별이 어려워진다.

권장 변경 순서:

1. GitHub repository 이름을 `i18n-poc`에서 최종 이름으로 변경
2. 로컬 remote와 Orca/Vercel의 repository 연결 확인
3. Vercel 프로젝트명·production domain·Git integration 확인
4. GitHub OAuth App의 homepage URL과 callback URL 갱신
5. GitHub App의 이름, homepage, callback, setup URL, webhook URL 갱신
6. GitHub App installation과 repository 접근 권한 재확인
7. Auth.js trusted origin·production URL·redirect 설정 확인
8. UI 문구, metadata, README, 문서, package 이름을 `malmoi`로 변경
9. GitHub Actions의 action 참조와 repository URL 갱신
10. 로그인 → App 인증 → push → DB → pull PR 왕복 재검증

변경 대상:

- 서비스명과 로고
- GitHub repository·organization 노출 이름
- Vercel 프로젝트명과 공개 domain
- GitHub OAuth App 표시 이름과 URL
- GitHub App 표시 이름과 URL
- package metadata
- README·문서·화면에 표시되는 `i18n-poc`
- 대상 리포 workflow가 참조하는 action repository 경로

유지할 대상:

- Supabase project ref
- 기존 database와 migration history
- 이미 배포된 migration 이름
- 안정적으로 사용 중인 환경변수 key
- 내부 primary key와 기존 데이터 식별자
- 변경할 실익이 없는 코드 내부 역사적 명칭

DB project 이름이나 migration history까지 외형에 맞춰 바꾸면 위험만 늘고 사용자 가치는 없다. 외부 브랜드와 내부 인프라 식별자를 분리한다.

주의할 실패 지점:

- GitHub OAuth callback의 옛 domain 잔존
- GitHub App setup·webhook URL의 옛 domain 잔존
- repository rename 뒤 composite action 참조 경로 불일치
- Vercel Git integration이 옛 repository를 계속 가리킴
- OAuth와 GitHub App의 client/app identity 혼동
- production과 preview callback URL 누락
- 문서의 설치 링크와 badge가 옛 repository를 참조

완료 게이트:

- production에서 Google·GitHub·이메일 로그인 경로가 정상이다.
- GitHub App installation token으로 대상 repository의 base tree를 읽을 수 있다.
- 대상 리포의 workflow가 새 action 경로를 사용해 push에 성공한다.
- DB 편집값이 새 브랜드·repository 연결을 거쳐 기존 `l10n/sync` PR로 돌아온다.
- 코드·문서의 사용자 노출 영역에서 `i18n-poc`가 남아 있지 않다.
- 내부 인프라 식별자를 불필요하게 rename하지 않았다.

### 0단계 — MVP 무결성 부채 닫기

SaaS 기능 전에 현재 감사의 데이터 무결성 문제를 해결한다.

- push의 두 독립 트랜잭션 사이 부분 커밋 방지
- 리포에서 사라진 로케일의 비파괴적 비활성화
- surgical writer가 버린 값을 warnings/errors로 보고
- 계약 테스트가 모든 surgical adapter의 오류 보고를 검사

완료 게이트:

- push 실패 뒤 DB가 전부 이전 상태이거나 전부 새 상태다.
- 삭제된 로케일 파일이 다음 pull에서 되살아나지 않는다.
- DB 값이 파일에 기록되지 않았는데 성공으로 끝나는 경로가 없다.

### 1단계 — SaaS 스펙과 URL 경계

먼저 화면보다 도메인과 주소를 확정한다.

권장 URL:

```text
/projects
/projects/new
/projects/:projectSlug/translations
/projects/:projectSlug/publish
/projects/:projectSlug/settings
```

결정할 것:

- 프로젝트 slug의 소유 범위
- 개인 계정과 조직 계정의 표현
- OWNER와 EDITOR 권한표
- 프로젝트 생성·삭제 정책
- GitHub App 제거 시 프로젝트 상태

완료 게이트:

- 모든 화면과 mutation을 사용자·프로젝트·권한으로 표현할 수 있다.
- `ACTIVE_PROJECT_SLUG` 없이 대상 프로젝트를 결정할 수 있다.

### 2단계 — 이메일 중심 User·Account·Membership·DB 세션

UI보다 인증·인가 토대를 먼저 만든다.

- User 모델
- Account 모델과 이메일·Google·GitHub provider
- ProjectMember 모델
- ProjectInvitation 모델
- OWNER·EDITOR
- Auth.js DB 세션
- requireUser
- requireProjectAccess
- 이메일 정규화·초대 수락·계정 연결 순수 판정
- 기존 Project 데이터에 소유자 backfill

스키마는 additive-first로 배포한다.

1. nullable 관계와 새 테이블 추가
2. 기존 프로젝트 소유자 backfill
3. 애플리케이션을 새 인가 경로로 전환
4. 필요하면 이후에 NOT NULL 제약 강화

완료 게이트:

- 교차 프로젝트 접근 테스트가 전부 거부된다.
- 멤버 제거가 기존 세션에 즉시 반영된다.
- 프로젝트 인가 없이 실행되는 Server Action과 Route Handler가 없다.
- 이메일·Google 사용자는 GitHub 계정 없이 초대 수락과 번역 편집이 가능하다.
- 동일 이메일이라는 이유만으로 provider 계정이 자동 병합되지 않는다.

### 3단계 — GitHub 설치 연결

- 기존 User에 GitHub Account를 명시적으로 연결
- 연결된 GitHub Account가 없는 사용자의 프로젝트 생성 거부
- 설치 callback/setup URL 처리
- 로그인 사용자에게 보이는 installation 조회
- installation이 접근 가능한 repository 조회
- installationId·owner·repo 검증 후 Project에 연결
- App 제거·리포 접근 철회 상태 처리

완료 게이트:

- 사용자가 접근할 수 없는 installationId를 직접 보내도 프로젝트가 생성되지 않는다.
- App이 선택한 리포에 접근할 수 없으면 연결이 거부된다.
- OAuth 토큰이 커밋 경로에 들어가지 않는다.
- Google로 로그인했더라도 GitHub Account가 연결돼 있으면 프로젝트를 생성할 수 있다.

### 4단계 — 탐지 기반 프로젝트 생성

순수 판정부터 만든다.

- 탐지 후보를 사용자용 요약으로 변환
- 후보 추천 순위
- base locale 추천
- 사용자 확정 입력 검증
- setup 상태 계산
- 이후 GitHub I/O와 DB 저장 연결

완료 게이트:

- 복수 번역 표면을 구별해 보여준다.
- 작은 후보가 큰 실제 번역 표면을 조용히 가리지 않는다.
- 사용자가 확정하지 않은 추정값으로 ready 프로젝트를 만들지 않는다.

### 5단계 — 연동 PR과 최초 sync 상태

- 워크플로 생성 또는 안내
- 연동 PR 생성·상태 조회
- 최초 push 대기
- 최근 Actions 실행과 서버 진단 연결
- ready 전 편집 차단

완료 게이트:

- 새 사용자가 문서나 터미널 없이 최초 sync를 완료한다.
- PR 머지만 되고 push가 실패한 프로젝트를 ready로 표시하지 않는다.
- 실패 원인과 복구 행동이 제품 화면에 나타난다.

### 6단계 — 프로젝트 단위 번역 UI 재작성

기존 동결 UI를 점진 확장하지 않고 새 프로젝트 URL과 인가 경계 위에서 다시 만든다.

최소 범위:

- 프로젝트 전환
- 원문과 모든 로케일 번역
- 저장 상태
- needsReview·orphaned
- 코드 permalink
- 마지막 sync 상태

완료 게이트:

- 모든 조회와 저장이 현재 프로젝트 membership을 검사한다.
- 다른 프로젝트 ID를 주입해도 데이터가 노출되거나 수정되지 않는다.
- 기존 push → 편집 → pull 값 전달 테스트가 새 UI 경로에서도 통과한다.

### 7단계 — Publish 경험

- 미배포 변경 수
- Publish Server Action
- 기존 PR 재사용
- PR 상태와 링크
- 버린 값과 adapter warning 표시
- PR 머지 뒤 상태 갱신

완료 게이트:

- 변경 없음, 새 PR, 기존 PR 갱신, 부분 기록 불가, 실패가 서로 다른 상태다.
- PR 생성과 PR 머지를 같은 완료 상태로 표시하지 않는다.
- 동일 DB 상태에서 반복 Publish가 새 커밋을 만들지 않는다.

### 8단계 — 자동 sync와 운영 안전성

- GitHub webhook 또는 프로젝트별 push credential
- idempotency
- sync 실행 이력
- 실패 재시도
- GitHub App 제거·권한 변경 처리
- rate limit과 timeout 진단

완료 게이트:

- 중복 webhook이 중복 DB 변경이나 PR을 만들지 않는다.
- 실패한 sync가 마지막 성공 상태를 덮지 않는다.
- 어떤 사용자가 어떤 프로젝트에서 무엇을 실행했는지 진단할 수 있다.

### 9단계 — 포트폴리오 마감

- 공개 데모용 샘플 리포
- 5분 내 온보딩 영상 또는 GIF
- 아키텍처 다이어그램
- 위협 모델과 보안 테스트 요약
- 실제 POSTMORTEM 3~5건을 문제→원인→구조적 예방으로 정리
- 지원 포맷과 의도적 비범위 명시

완료 게이트:

- 방문자가 로그인하지 않아도 프로젝트의 문제와 기술적 차별점을 이해한다.
- 로그인한 평가자는 샘플 리포로 첫 왕복을 완료할 수 있다.

## 7. 만들지 않을 것

포트폴리오 목적에서는 다음 기능을 제외하는 것이 좋다.

- 과금과 플랜
- 복잡한 조직 계층
- 세밀한 RBAC
- 번역 메모리
- 기계 번역 또는 AI 번역
- draft→reviewed 승인 워크플로
- 실시간 공동 편집
- 스크린샷·in-context 편집
- 범용 알림 시스템
- 포맷별 무제한 설정 UI

이 기능들은 핵심 사용자 여정을 개선하지 않으면서 보안·운영 면적을 크게 늘린다.

## 8. 주요 설계 결정

### 프로젝트와 리포 관계

1 Project = 1 repository + 1 translation surface를 유지하는 것이 좋다.

한 리포에 번역 표면이 둘이면 Project를 둘로 만든다. 하나의 Project가 여러 어댑터와 여러 브랜치를 관리하게 만들면 현재 단일 소유자·결정성·고정 PR 모델이 빠르게 복잡해진다.

### 로케일 소유권

로케일 목록은 리포가 정본이다. SaaS UI는 추가·삭제가 아니라 발견 결과와 활성 상태를 보여준다. 리포에서 사라진 로케일은 번역 보존을 위해 DB에서 삭제하지 않되, 비활성화해 export와 UI에서 제외한다.

### Publish 권한

초기에는 OWNER와 EDITOR 모두 Publish 가능하게 두는 것이 단순하다. 실제 사용자 피드백에서 개발자만 Publish해야 한다는 요구가 나오면 별도 permission으로 좁힌다.

### 계정과 로그인 provider

계정은 내부 `User.id`와 검증된 기본 이메일을 중심으로 두고 이메일·Google·GitHub Account를 연결한다. 프로젝트 생성에는 연결된 GitHub Account가 필요하지만 번역과 Publish에는 필요하지 않다. provider가 반환한 이메일이 같다는 이유만으로 Account를 자동 병합하지 않는다.

### 자동 탐지

자동 탐지는 추천이지 진실이 아니다. 사용자가 후보와 base locale을 확인하기 전에는 설정을 확정하지 않는다.

### GitHub App 권한

자동 연동 PR 때문에 Workflows 권한을 항상 요구하는 것보다, 초기에는 최소 권한 설치와 수동 워크플로 복사를 허용하는 편이 신뢰를 얻기 쉽다. 이후 자동 PR을 선택 기능으로 추가할 수 있다.

## 9. 구현 중 계속 확인할 불변식

- 번역 값은 DB, 소스 키와 로케일 존재 여부는 리포가 정본이다.
- push 시점 외에는 리포 값과 DB 값을 비교해 승자를 고르지 않는다.
- 키와 번역을 삭제하지 않고 비활성 상태로 보존한다.
- 같은 DB 상태와 같은 원본 구조는 같은 바이트를 만든다.
- 프로젝트를 식별하는 모든 DB 쿼리는 인가된 projectId로 제한한다.
- GitHub 사용자 OAuth와 GitHub App installation token의 역할을 섞지 않는다.
- 로그인 provider가 아니라 ProjectMember가 권한을 결정한다.
- 프로젝트 생성에는 연결된 GitHub Account와 유효한 installation-repository 관계가 모두 필요하다.
- 초대 수락 전 이메일 소유권을 검증하고 초대 토큰은 단일 사용한다.
- 실패한 sync는 마지막 성공 상태를 전진시키지 않는다.
- 버린 값은 성공으로 숨기지 않고 사용자에게 보고한다.
- ready는 설정 저장이 아니라 최초 sync 성공으로 판정한다.

## 10. 추가로 닫아야 할 운영 경계

SaaS화에서 가장 놓치기 쉬운 부분은 정상 흐름의 기능이 아니라 **외부 상태가 바뀌거나 작업이 중간에 실패했을 때 복구되는 방식**이다. 아래 항목은 기능 확장이 아니라 제3자가 자기 리포를 안심하고 연결하기 위한 운영 계약이다.

### 10.1 GitHub App 설치 수명주기

정상 설치뿐 아니라 다음 변화를 제품 상태로 다뤄야 한다.

- GitHub App 삭제
- 특정 repository 접근 철회
- repository 이름 변경·이전·삭제
- 기본 브랜치 변경
- 개인 계정에서 조직 계정으로 이전
- App 권한 변경 후 새 권한 미승인

연결이 끊겨도 Project와 번역 데이터를 삭제하지 않는다. 프로젝트를 `disconnected` 또는 `needs_reconnect` 상태로 전환하고, OWNER에게 재연결 방법을 보여준다.

완료 게이트:

- App을 제거해도 번역 데이터가 보존된다.
- 연결이 끊긴 프로젝트의 Publish는 명시적 오류로 끝난다.
- App을 다시 설치하면 기존 Project에 안전하게 재연결할 수 있다.
- 리포 이름이나 소유자가 바뀌었을 때 다른 리포로 오인하지 않는다.

### 10.2 비동기 작업과 실행 상태

탐지, 최초 sync, Publish를 하나의 HTTP 요청 안에서 끝내면 타임아웃, 중복 클릭, 네트워크 단절에 취약하다. 실행 자체를 저장하는 모델을 둔다.

```text
SyncRun
- id
- projectId
- type: detect | ingest | publish
- status: queued | running | succeeded | failed
- idempotencyKey
- requestedBy
- startedAt
- finishedAt
- errorCode
- errorMessage
```

원칙:

- 같은 idempotency key는 결과를 한 번만 반영한다.
- 프로젝트별 동일 종류의 실행은 동시에 하나만 허용한다.
- HTTP 응답 성공은 작업 완료가 아니라 접수 완료일 수 있다.
- UI는 마지막 요청이 아니라 SyncRun의 저장된 상태를 표시한다.
- 실패한 실행은 마지막 성공 기준점을 전진시키지 않는다.

완료 게이트:

- Publish 버튼을 연속 클릭해도 커밋과 PR 갱신은 한 번만 발생한다.
- 프로세스가 중간 종료돼도 실행이 영구히 `running`으로 남지 않는다.
- 실패 후 재시도가 부분 상태를 이어받아 혼합 결과를 만들지 않는다.

### 10.3 로케일 파일 변경과 재탐지

최초 연결 때 확정한 파일이 이후 이동·삭제·분할될 수 있다. 기존 설정이 무효해졌을 때 자동으로 다른 후보를 채택하면 안 된다.

권장 흐름:

```text
설정된 파일 집합이 사라짐
→ 자동 sync 중단
→ Project를 needs_configuration으로 전환
→ 새 탐지 후보 표시
→ OWNER가 번역 표면과 base locale 재확정
→ 기존 번역을 보존한 채 재개
```

자동 재탐지가 위험한 이유:

- 같은 리포의 작은 번역 표면을 새 정본으로 선택할 수 있다.
- 기존 키 대부분을 orphan으로 만들 수 있다.
- strict push가 DB 번역을 예상하지 않은 파일 값으로 덮을 수 있다.

완료 게이트:

- 설정 파일이 사라지면 다른 후보로 조용히 전환하지 않는다.
- 재설정 전에는 destructive한 push를 실행하지 않는다.
- 재설정 뒤에도 기존 번역과 orphan 복구 가능성을 보존한다.

### 10.4 Publish와 편집의 동시성

Publish가 DB snapshot을 읽는 동안 새로운 편집이 들어올 수 있다. 다음 계약을 명시한다.

- Publish는 시작 시점에 캡처한 `max(Translation.updatedAt)`까지 포함한다.
- 실행 중 들어온 편집은 다음 Publish 대상으로 남는다.
- 성공 후 `lastPulledAt`에는 현재 시각이 아니라 캡처한 최대 updatedAt을 기록한다.
- 실패한 Publish는 lastPulledAt을 갱신하지 않는다.
- 같은 프로젝트의 Publish는 동시에 하나만 실행한다.

완료 게이트:

- Publish 도중 저장한 번역이 다음 실행에서 스킵되지 않는다.
- 먼저 시작한 느린 Publish가 나중 Publish 결과를 덮지 않는다.
- PR에는 어느 시점까지의 변경이 포함됐는지 표시할 수 있다.

### 10.5 초대와 멤버 수명주기

처리해야 할 상태:

- 기존 멤버 이메일 재초대
- 대기 중 초대 재발송·취소
- 만료된 초대 사용
- 이미 사용된 초대 링크 재사용
- 멤버 제거와 접근 즉시 회수
- OWNER가 자기 자신을 제거
- 마지막 OWNER 제거
- 멤버 기본 이메일 변경
- 퇴사로 회사 이메일 접근권이 이전됨

원칙:

- Project에는 항상 OWNER가 한 명 이상 있어야 한다.
- 마지막 OWNER는 탈퇴하거나 자신을 제거할 수 없다.
- 초대 이메일 변경은 기존 초대를 취소하고 새 초대를 만든다.
- 멤버 제거 뒤 기존 세션이 살아 있어도 다음 요청부터 프로젝트 접근을 거부한다.
- 이메일 주소 재할당 가능성을 고려해 membership은 이메일이 아니라 User.id를 참조한다.

### 10.6 이메일 인증 운영

이메일 로그인은 코드 구현 외에 전달성과 악용 방지가 필요하다.

- 발송 실패와 반송 처리
- 스팸 분류 모니터링
- 로그인·초대 메일 요청 rate limit
- 링크를 메일 보안 스캐너가 먼저 여는 문제
- 초대 메일과 일반 로그인 메일 구분
- SPF·DKIM·DMARC 설정
- 토큰과 전체 로그인 URL의 로그 노출 방지
- 고정된 HTTPS origin으로 링크 생성

보안 스캐너의 자동 방문이 토큰을 먼저 소비하지 않도록, 가능하면 링크의 GET은 확인 화면만 열고 사용자의 명시적 동작에서 토큰을 소비한다.

사용자 열거를 막기 위해 로그인 요청 응답은 계정·초대 존재 여부와 무관하게 동일하게 유지한다.

```text
로그인 가능한 이메일이면 링크를 보냈습니다.
```

완료 게이트:

- 토큰과 전체 매직링크가 애플리케이션 로그에 남지 않는다.
- 같은 IP·이메일의 반복 요청이 제한된다.
- 만료·사용·취소 토큰을 구별해 내부 진단하되 외부에는 과도한 정보를 주지 않는다.

### 10.7 감사 기록

복잡한 이벤트 소싱은 필요 없지만 중요한 변경의 주체와 결과는 추적할 수 있어야 한다.

```text
AuditEvent
- projectId
- actorUserId
- action
- targetType
- targetId
- result
- occurredAt
- metadata
```

기록 대상:

- 멤버 초대·수락·제거
- 역할 변경
- 리포 연결·재연결·해제
- base branch·번역 표면·base locale 변경
- Publish 실행과 결과
- GitHub App 접근 철회 감지
- 프로젝트 보관·복원·영구 삭제

번역 값 전체와 시크릿은 감사 로그에 복제하지 않는다. 이메일은 가능하면 마스킹하거나 User.id로 기록한다.

### 10.8 프로젝트 삭제와 탈퇴

프로젝트 삭제는 즉시 hard delete하지 않는다.

권장 흐름:

```text
OWNER가 프로젝트 보관
→ 편집·sync 중단
→ 보존 기간 동안 복원 가능
→ 보존 기간 뒤 영구 삭제
```

정해야 할 정책:

- 열린 `l10n/sync` PR과 브랜치를 닫거나 남길지
- GitHub App 제거 시 DB 데이터를 유지할지
- 프로젝트 데이터 내보내기 형태
- User 탈퇴 시 소유 프로젝트와 마지막 OWNER 처리
- 감사 로그와 개인정보의 보존 기간

포트폴리오 단계에서는 자동 영구 삭제까지 구현하지 않아도 되지만, 보관 상태와 정책은 명시한다.

### 10.9 URL과 식별자

URL에서 사용하는 slug와 DB 식별자를 구분한다. slug는 사람이 읽는 주소이고, 인가는 항상 내부 projectId와 membership으로 판정한다.

권장 형태:

```text
/:accountSlug/:projectSlug
```

초기 구현을 단순화하려면 추측 불가능한 project ID를 URL에 사용할 수도 있다. 어느 경우에도 URL을 안다는 사실은 접근 권한이 아니다.

정할 것:

- project slug가 전역 unique인지 account 안에서만 unique인지
- 개인 account와 조직 account의 URL 표현
- slug 변경 시 redirect 또는 영구 링크 정책
- GitHub repository 이름 변경과 product slug의 관계

### 10.10 오류 분류

모든 실패를 `sync failed`로 접으면 사용자가 복구할 수 없다. 내부 예외 메시지와 사용자용 오류를 분리한다.

최소 error code:

```text
AUTH_REQUIRED
PROJECT_ACCESS_DENIED
GITHUB_ACCOUNT_REQUIRED
INSTALLATION_NOT_FOUND
REPOSITORY_ACCESS_DENIED
BASE_BRANCH_NOT_FOUND
LOCALE_FILES_NOT_FOUND
LOCALE_PARSE_FAILED
UNSUPPORTED_LOCALE_SHAPE
SYNC_ALREADY_RUNNING
DATABASE_WRITE_FAILED
GITHUB_RATE_LIMITED
PULL_REQUEST_FAILED
PARTIAL_WRITE_REJECTED
```

각 오류는 다음을 가진다.

- 안정적인 내부 code
- 사용자용 설명
- 다시 시도 가능한지
- OWNER 조치가 필요한지
- 내부 원인과 correlation ID

내부 예외 메시지를 그대로 클라이언트에 반환하지 않는다. 시크릿, DB 주소, GitHub 요청 세부가 섞일 수 있다.

### 10.11 악용과 비용 제한

과금하지 않아도 공개 서비스는 비용 공격과 우발적 과부하를 받는다. 포트폴리오 서비스에는 단순한 고정 제한이면 충분하다.

- 사용자당 프로젝트 수 제한
- 프로젝트당 멤버 수 제한
- 리포 파일 수·파일 크기·키 수 제한
- sync와 Publish 실행 빈도 제한
- 프로젝트당 동시 실행 하나
- 로그인·초대 이메일 발송 제한
- webhook payload 크기 제한
- GitHub API rate limit 관측
- 비정상적으로 큰 diff 생성 차단

권장 초기 제한 예시:

```text
사용자당 프로젝트 3개
프로젝트당 멤버 10명
프로젝트당 활성 sync 1개
Publish 최소 간격 30초
```

정확한 숫자보다 제한이 존재하고 사용자에게 이유를 설명할 수 있는지가 중요하다.

### 10.12 데모와 실제 사용자 격리

평가자가 안전하게 체험할 수 있는 별도 경로를 둔다.

- 공개 샘플 프로젝트는 읽기 전용
- 실제 왕복은 폐기 가능한 전용 데모 repository 사용
- 데모와 사용자 프로젝트의 DB 데이터를 구분
- 데모 상태 초기화 가능
- GitHub App 설치 없이도 핵심 흐름을 볼 수 있는 영상 또는 GIF 제공
- 실제 사용자 리포에 검증 PR을 만들지 않음

포트폴리오 방문자는 설치 권한을 주기 전에 프로젝트의 가치를 이해할 수 있어야 한다.

### 10.13 추가 운영 우선순위

위 항목을 한 번에 구현하지 않는다. 다음 세 가지를 우선한다.

1. SyncRun 기반 실패·재시도·중복 실행 모델
2. GitHub App 연결 해제와 repository 변경 수명주기
3. 이메일 초대·로그인의 전달성, 악용 방지, 접근 회수

이 세 가지가 닫혀야 정상 경로 시연을 넘어 제3자가 자기 리포를 연결할 수 있는 서비스가 된다.

## 11. 참고 자료

- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- GitHub App 권한 선택: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- GitHub App 인증: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app
- Installation access token: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- GitHub App webhook 보안: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps
