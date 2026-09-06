# tenant-auth — spec

> `docs/SAAS.md` §8 **2단계**. 결론은 SAAS.md와 ARCHITECTURE.md로 올라가고 이 문서는 근거로 남는다.
>
> **2026-09-05 검수 반영**: SAAS §8 **3단계("최소 UI 이관")를 이 단계에 흡수했다.** 인가만 만들고
> 라우트에 slug가 없으면 완료 조건 3·8이 도달 불가이고, 초대·멤버 Action이 호출자 없이 나간다 —
> 이 리포의 반복 실패 유형("만든 것이 실제로 호출되는가", POSTMORTEM 2026-09-02·09-03)이다.
> SAAS.md §8 3단계를 그만큼 접는 것은 tasks §7의 문서 태스크다.

## 사용자

**둘 다이고, 이 기능이 처음으로 둘을 갈라놓는다.**

- **개발자(프로젝트 소유자)** — 리포를 연결하고 동료를 부른다. GitHub 계정이 있다.
- **번역 편집자(비개발자 동료)** — 초대받아 들어와 번역만 한다. **GitHub 계정이 없어도 된다** —
  Google 로그인으로 초대를 수락하고 편집·Publish까지 한다 (SAAS.md §3).

지금은 이 구분이 코드에 없다. `AUTH_ALLOWED_LOGINS`에 핸들이 있으면 **모두가 같은 권한**이고,
GitHub 계정이 없으면 아예 못 들어온다.

## 문제

**관측된 사실 셋.**

1. **편집 경로가 환경변수 하나를 본다.** `ACTIVE_PROJECT_SLUG`가 프로젝트를 결정하므로 편집 UI는
   **한 번에 한 프로젝트만** 보인다. 검증 대상을 바꿀 때마다 **프로덕션 env를 갈아야 했다**
   (TASKS 전역 미결에 실측 기록). ⚠️ 같은 env가 `/api/push`(`lib/push/guard.ts` 409)와
   `/api/pull`(cron)에도 걸려 있지만 **그 둘은 이 기능이 풀지 않는다** — SAAS.md §7.8
   (`Project.pushTokenHash`)의 구현은 **5단계(온보딩)** 로 보낸다 (검수 결정 2026-09-05. SAAS.md
   §4.3 ②의 "1단계 필수" 표기를 고치는 것이 tasks §7에 있다).
2. **인가가 핸들 목록 하나다.** `AUTH_ALLOWED_LOGINS`를 통과한 전원이 **env가 가리키는 프로젝트
   하나를 같은 권한으로** 수정한다. 프로젝트가 둘 이상이 되는 순간 테넌트 경계가 스키마에만 있고
   인가에는 없다.
3. **권한 회수가 최대 24시간 지연된다.** JWT 세션이고 허용 목록 검사가 최초 로그인 1회뿐이라,
   목록에서 뺀 사람이 하루 동안 편집할 수 있다 (MVP §5가 명시한 대가).

## 완료 조건

**검증 가능한 문장으로.** 각 항목이 `tasks.md`의 검증 줄과 1:1이고, 검증 줄마다 `[auto]`(`pnpm test`)
/ `[manual]`(`pnpm dev`·브라우저·DB)이 붙어 있다 — 이 프로젝트엔 e2e가 없다.

1. **교차 프로젝트 접근이 전부 거부된다** — 프로젝트 A의 멤버가 B의 slug·`projectId`·`keyId`·
   `localeCode`·초대 토큰을 직접 보내도 조회·수정 모두 실패한다. `[auto]`
2. **멤버 제거가 다음 요청부터 반영된다** — 세션이 살아 있어도 `ProjectMember` 행이 사라지면
   그 프로젝트에 접근할 수 없다. `[auto]` (세션 유효 + 행 없음 → 거부) / `Session` 행 삭제 →
   다음 요청 거부 `[manual]`. (JWT였다면 최대 24시간 살아 있었다.)
3. **GitHub 계정 없이 번역이 가능하다** — Google로 로그인한 사용자가 초대 링크를 열어 수락하고
   `/projects/<slug>/translations`에서 편집·Publish까지 한다. `[manual]` + 각 홉 `[auto]`.
   프로젝트 **생성**이 GitHub 계정을 요구하는 판정은 **4단계가 호출부와 함께** 만든다.
4. **같은 이메일이라는 이유만으로 계정이 병합되지 않는다** — Google 사용자가 있는 상태에서 같은
   이메일의 GitHub으로 로그인하면 **거부된다**(`OAuthAccountNotLinked`). Auth.js 어댑터의 기본
   동작이고, 이 조건은 **`allowDangerousEmailAccountLinking`을 어느 provider에도 켜지 않는 것**으로
   지킨다. `[auto]`(설정 검사) + `[manual]`. 명시적 병합은 4단계다.
5. **초대 토큰이 단일 사용이고 만료된다** — 재사용·만료 후 사용·다른 이메일로의 수락이 전부 거부되고,
   DB에는 **해시만** 있다. `[auto]`
6. **프로젝트 인가 없이 실행되는 편집 진입점이 0이다** — 프로젝트를 다루는 모든 Server Action과
   페이지가 `requireProjectAccess`를 지난다. **예외는 경계가 다른 넷이고 각자 자기 인증을 한다**:
   `/api/push`(Bearer `PUSH_TOKEN`) · `/api/pull`(`CRON_SECRET`) · `/api/auth/[...nextauth]` ·
   `signIn`/`signOut` 인라인 Action. **초대 수락 Action은 `requireUser`만 지난다** — 수락 전엔
   멤버가 아니다. `[auto]`(소스 스캔 테스트가 목록을 고정한다)
7. **마지막 OWNER를 제거할 수 없다** — 자기 제거·탈퇴·역할 강등 셋 다 거부된다. 순수 판정과
   **멤버 제거·역할 변경 Server Action** 둘 다에서. `[auto]`
8. **편집 경로가 `ACTIVE_PROJECT_SLUG` 없이 동작한다** — 프로젝트는 URL(`/projects/[slug]`)과
   세션·멤버십으로 결정된다. `[auto]`(`grep`이 `app/(edit)`·`lib/keys`·`lib/auth`에서 0건) +
   `[manual]`. `/api/push`·`/api/pull`은 5단계까지 계속 읽는다.

**SAAS.md §5.7 대비**: 11항목 중 **이 단계에서 7개**를 닫는다(위 1·2·4·5·7 + "비로그인 조회·수정·Publish"
+ "EDITOR의 멤버·설정 변경"). **4단계로 넘기는 것 2개**("설치되지 않은 리포 등록"·"설치에 접근할 수
없는 사용자의 생성"), **이미 닫힌 것 1개**("로그·응답에 토큰·PEM·DB URL 노출" — `lib/failure.ts`),
"`translationId` 조합"은 `saveTranslation`이 `translationId`를 받지 않아 **해당 없음**. tasks §6의
대조표가 이 셈을 든다.

## 비목표

**이번에 안 한다. 각각 어디로 가는지 적는다.**

- **이메일 발송** — 매직링크 로그인도, 초대 메일도 보내지 않는다 (SAAS.md §4.3 ①). 초대는 OWNER가
  **링크를 직접 전달**하고, 이메일 소유권은 **OAuth provider가 검증한 이메일**로 증명한다
  (`signIn` 콜백이 미검증·부재 이메일을 거부한다 — design §2).
- **GitHub 설치 연결** — installation ↔ repository 3중 검증, **기존 User에 GitHub Account 명시적
  연결(`planAccountLink`)**, "프로젝트 생성에 GitHub Account 필요" 판정 — 전부 4단계(`github-connect`).
  호출자 없는 함수를 여기서 미리 만들지 않는다.
- **프로젝트 생성 UI** — 5단계. 지금 `Project` 행은 계속 손으로 만든다.
- **`/api/push`의 프로젝트별 토큰 · `/api/pull`의 전 프로젝트 순회** — 설계는 SAAS.md §7.8, 구현은
  **5단계**다. 같은 커밋에 넣으면 인가 전환과 대상 리포 CI 전환이 한 배포에 섞인다.
- **화면 재작성** — 이 단계의 화면은 **최소 신설 셋**(로그인 Google 버튼 · `/invite/[token]` ·
  `/projects` 목록)과 **`/keys`의 이관**(`/projects/[slug]/translations`, 판정 로직 그대로)이다.
  **멤버 관리 섹션**과 Supabase 레퍼런스(DESIGN §9) 적용은 6단계다 — ⚠️ **설정 화면 자체는 4단계가
  만들었다**(`/projects/[slug]/settings`, 리포 연결 + GitHub 계정 두 섹션). 여기서 "설정 화면은
  6단계"라고 읽으면 4단계가 라우트를 새로 낸 것이 규칙 위반으로 보인다.
- **`AuditEvent`** — SAAS.md §6이 미룬 그대로.
- **역할 추가** — OWNER·EDITOR 둘뿐이다 (MVP §7 "세밀한 권한"이 유지된다). Publish는 별도
  permission이 아니라 `translation:write`에 포함된다 (SAAS §3 "필요해지면 그때 좁힌다").
