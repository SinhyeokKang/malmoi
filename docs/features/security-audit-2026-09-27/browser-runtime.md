# Ego 브라우저 런타임 재검증

2026-09-27. **운영 CSP는 아직 이전 정책이다.** 수정된 dev에서는 이메일 경합 회귀가 통과했고, 실제 브라우저의 초대·권한 회수·폐기 세션 검사에서도 우회를 발견하지 못했다. 운영 DB ACL은 이번에 재조회하지 않았다.

## 환경과 격리

- Ego 전용 TaskSpace 17, `Malmoi security runtime verification`을 새로 만들어 사용했다. 기존 스페이스·탭은 조작하지 않았다.
- 운영 `https://mal-moi.com`: 기존 GitHub 로그인 상태를 이용한 실제 OAuth 왕복과 프로젝트 화면 조회, 공개 응답 헤더 확인만 수행했다. 운영 초대 발송·권한 변경·번역 저장은 하지 않았다.
- 로컬 기준: `b6b5bef1c1526a39a6d11c281877b2d633486dd0`. `security-runtime-2026-09-27` 별도 워크트리에서 Node 24.21.0으로 프로덕션 빌드 후 `next start`했다. 사용자 dev 서버 3100은 사용하거나 재시작하지 않았다.
- 브라우저 주소: `http://malmoi-security-audit.localhost:43187`. 기존 localhost 로그인 쿠키와 구분되는 전용 호스트다. DB는 socket-only 임시 PostgreSQL의 별도 `browser_audit` DB다.
- 합성 사용자 `owner-a`, `owner-b`, `editor-a`, 프로젝트 `audit-a`, `audit-b`를 사용했다. 이메일은 `example.test`, GitHub installation ID는 가짜이며 외부 서비스 자격증명은 제공하지 않았다. 따라서 프로젝트에 표시된 GitHub 연결 끊김은 이 fixture의 조건이다.
- 합성 로그인은 실제 DB 세션 해시를 만들고 해당 세션 쿠키를 브라우저에 주입했다. 이것을 실제 OAuth 로그인 검증으로 세지 않는다. 실제 제공자 왕복은 위 운영 GitHub 1건이다.

## 배치 R1 — 운영 로그인·배포 확인

| 검사 | 관측 |
|---|---|
| GitHub 로그인 | Sign in → GitHub 계정 선택 → Malmoi Projects 왕복 성공 |
| 로그인 후 프로젝트 탐색 | 소유 프로젝트 링크를 클릭해 프로젝트 셸·메뉴 표시 |
| 운영 `/privacy` 헤더 | `script-src 'self' 'unsafe-inline'`; nonce·strict-dynamic 없음 |

기존 S3의 운영 미반영 상태가 재확인됐다. 인증 성공은 테넌트 격리 전체나 다른 OAuth 제공자의 안전성을 증명하지 않는다.

## 배치 R2 — 초대·프로젝트 경계

1. `owner-b`는 처음에 자기 프로젝트 B만 볼 수 있었다. A 설정 URL을 직접 열면 `/projects`로 돌아왔다.
2. 만료된 합성 초대는 `This invitation expired` 안내로 거부됐다.
3. B의 이메일 앞으로 발급한 초대를 A 계정으로 열면 이메일 불일치 안내와 계정 전환 버튼만 나타났다.
4. B로 돌아와 실제 `Accept invitation` 버튼을 클릭했다. A 프로젝트로 이동했고, DB의 초대는 `acceptedAt`이 기록되고 역할은 `EDITOR`였다. 메일 발송은 수행하지 않았다.
5. 같은 링크를 다시 열면 `This link was already used` 안내로 거부됐다.
6. 수락한 Editor의 A 설정 접근은 `/projects`로 돌아왔다. A 번역 화면은 열렸고 `Hello` 키의 언어별 편집 폼이 표시됐다.

## 배치 R3 — 열린 화면에서의 권한 회수·세션 폐기

1. B의 번역 폼을 열린 채로 두고 합성 번역 초안을 입력했다.
2. 별도 탭에서 A Owner의 실제 멤버 관리 UI로 B를 제거했다. 확인 다이얼로그의 `Remove`까지 클릭했다.
3. 브라우저 쿠키를 다시 B 세션으로 맞춘 뒤 기존 편집 화면의 `Save`를 클릭했다. **`You no longer have access to this project` 오류가 표시됐고, 실제 DB Translation 조회 결과는 빈 배열로 유지됐다.**
4. 같은 B 계정으로 A 번역 URL을 새로 열면 `/projects`로 돌아왔다. 자신의 B 프로젝트는 계속 열렸다.
5. 임시 DB에서 B의 세션 행을 제거하고 B 프로젝트를 새로고침했다. 브라우저는 `/signin`으로 이동했다. 이것은 폐기된 DB 세션의 차단 검사이며, 재인증을 포함한 세션 폐기 UI 전체의 검증은 아니다.

Ego 스페이스 안의 탭들은 쿠키를 공유한다. 따라서 탭별 독립 세션이라고 가정하지 않고 **각 요청 전에 합성 쿠키를 명시적으로 전환**했다. 이미 전달된 편집 화면의 내용이 제거 즉시 사라지지 않는 것을 신규 데이터 접근 우회로 세지 않았다. 검증 대상은 제거 후 새 읽기와 저장이다.

## 배치 R4 — CSP의 실제 브라우저 집행

수정된 dev의 `/privacy`는 nonce·strict-dynamic CSP를 반환했다. 하지만 `page.evaluate()`로 DOM에 추가한 스크립트는 실행돼, 이 자동화 경로를 일반 HTML 삽입 공격의 재현 근거로 쓰지 않았다.

대신 로컬 43188 포트의 독립 검사 서버에서 **실제 앱 응답의 CSP를 복사**해 동일한 HTML을 두 조건으로 제공했다. HTML에는 nonce 없는 canary와 정확한 nonce를 가진 결과 표시 스크립트가 있었다.

| 조건 | 브라우저 화면 | nonce 스크립트 |
|---|---|---|
| CSP 없음 — 양성 대조 | `UNTRUSTED_SCRIPT_EXECUTED` | 실행됨 |
| 실제 dev CSP 적용 | `UNTRUSTED_SCRIPT_BLOCKED` | 실행됨 |

따라서 브라우저의 HTML 파서가 삽입한 nonce 없는 인라인 스크립트는 정책으로 차단됨을 확인했다. **앱에서 HTML 주입 취약점을 발견하거나 악용한 결과는 아니다.** 검사 서버 소스는 `csp-parser-probe.cjs`에 보관했다.

## 추가 검증·종료

- `pnpm build` 통과.
- `pnpm exec vitest run --config docs/features/security-audit-2026-09-27/vitest.config.ts`: **3/3 통과**. 1차에서 실패했던 연결 해제 중 이메일 갱신 경합이 수정된 dev에서는 재현되지 않는다.
- 브라우저 전용 합성 세션 쿠키만 삭제했다. 프로필 전체 쿠키를 지우거나 운영 로그인을 강제로 로그아웃하지 않았다.
- TaskSpace를 `finish({ keep: [] })`로 종료하고, 감사 서버 43187·43188 및 임시 PostgreSQL을 종료했다.
- Google 로그인, 운영 DB ACL의 현재 상태, 실제 메일 전달, 외부 GitHub/Blob 쓰기, 전체 세션 폐기 재인증 왕복은 이번 검증 범위 밖이다.
