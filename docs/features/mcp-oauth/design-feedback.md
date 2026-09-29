# MCP OAuth — 시안 피드백 (1차)

대상: https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=MCP+OAuth.dc.html (`design_handoff_mcp_oauth/`)

전체 방향(KV 숨김 단일 패널, 동의 단계 960 + 고정 행동 바, 토큰 폼 as-is 공유, 방식 세그먼트, Disconnect Dialog 포커스 규칙)은 그대로 간다.
아래만 고쳐줘.

## 0. 먼저 — spec·design을 이제 읽을 수 있다

핸드오프 §3에 적은 대로 `spec.md`·`design.md`·`tasks.md`가 원격 `dev`에 없었다. 이번에 올렸으니 **§6.1과 §4.2를 기준으로 다시 대조**해줘.
아래 1번이 그 대조에서 나온 충돌이다.

## 1. 긴 이름·식별 정보 — 말줄임이 아니라 줄바꿈 (design §6.1과 충돌)

- 지금: 앱 이름·식별 줄 모두 한 줄 말줄임 + `title`.
- 바꿀 것: **식별 줄(clientId URL · `Client ID …` · `Returns to …`)은 전문을 줄바꿈으로 보여준다**(`break-all`). 앱 이름도 줄바꿈.
- 이유: 이름은 앱이 정한 문자열이라 사칭 가능하고, 사용자가 연결 대상을 구별할 근거는 식별 줄뿐이다.
  `https://claude.ai.example-attacker.com/…` 같은 주소는 말줄임하면 구별되는 부분이 잘린다. `title`은 키보드·터치에서 안 보인다.
- 이름 길이는 서버가 상한을 둔다(열린 결정 3 → 상한 둠). 그래서 이름 줄바꿈이 화면을 무너뜨리지 않는다.
- 같은 규칙을 `/mcp` 연결 행과 Disconnect Dialog 앱 블록에도 적용해줘. 이메일·프로젝트 이름은 기존대로 말줄임이어도 된다.

## 2. 빠진 상태 — 최초 조회 중·조회 실패

작업 지시 상태표 첫 행과 `/mcp` 절에 있었는데 아트보드가 없다.

- `/oauth/authorize` **요청 조회 실패(DB 장애)** — `1l`(요청 없음)과 다른 화면. `m.errors.access.unavailable` 계열 문구 + `Try again`(같은 URL 다시 로드).
  장애를 "찾을 수 없음"으로 접으면 사용자가 멀쩡한 요청을 버리고 처음부터 다시 한다.
- `/mcp` **Connected apps 조회 실패** — 빈 상태(`No connected apps`)와 구별되는 카드 내 오류 + 재시도. 토큰 카드·Connect 카드는 그대로 선다.
- 조회 중은 서버 렌더라 별도 스켈레톤이 필요 없으면 그렇다고 핸드오프에 적어줘.

## 3. 재동의 경고 문구 — 교체 시점을 정확히

`replaces`가 "Authorizing replaces that connection"이라 누르는 순간 끊기는 것처럼 읽힌다. 실제 교체는 앱이 code 교환에 성공할 때이고 Deny는 기존 연결을 유지한다.

```
replaces: (date) => `You connected this app on ${date}. If you finish connecting, the new connection replaces it and the app may be signed out on your other devices. Deny keeps the current connection.`
```

## 4. 정의가 빠진 인터랙션

- **`Not you?`** — 누르면 무엇이 일어나는지 없다. 권장: 로그아웃 후 **같은 요청의 로그인 전 화면(`1a`)** 으로 돌아온다. 폼 선택은 버린다(§9와 같다).
  아트보드 한 장 + 탭 순서·포커스(돌아왔을 때 첫 공급자 버튼) 명시.
- **Deny의 제출 중·실패·경합** — Deny도 요청을 소비하는 Server Action이다. 제출 중(Deny `loading` · Authorize `disabled` · fieldset disabled),
  명시적 실패(행동 바 Alert, 같은 버튼 재시도), 다른 탭에서 이미 처리된 경우(`1n`으로)를 적어줘.
- **`Check request` 결과 셋** — 대기 → 폼으로 복귀(선택 보존, Alert 치움) / 처리됨 → `1n` / 만료 → `1m`. 핸드오프 §10.5에 상태만 있고 화면 전이가 없다.

## 5. 문구 키 오기

§12 재사용 목록의 `m.mcpConnector.modal.*`는 실제로 **`m.mcpConnector.form.*`** 다(`expiresIn`·`days`·`grants`·`grantsHelp`·`scope`·`allMine`·`chosen`·`noMembership`·`chooseOne`).

## 6. 폼 추출 경계

토큰 모달은 `OnboardingModal` 2단계이고 바닥 상태 슬롯이 `form.step(1)`/`chooseOne`을 번갈아 쓴다. `TokenGrantFields`(가칭)는
**필드만**(만료 · 권한 · 범위 · 프로젝트 목록) 들고, 상태 슬롯·버튼·Alert는 각 호스트(모달 / 동의 행동 바)가 소유한다고 명시해줘.
동의 페이지에 "Step 1 of 2"가 새어 나오면 안 된다.

## 7. 열린 결정 판정 (§13)

1. 폼 밖 설명 문단 → **동의 페이지에만.** 모달은 바꾸지 않는다.
2. 재동의 폼 → **기존 연결 값으로 채운다.** 단 `projectIds`는 현재 비보관 멤버십과 교집합만 채운다(토큰 카드의 범위 표시와 같은 판정).
3. 앱 이름 상한 → **서버가 둔다**(값은 구현에서 정한다). 화면은 1번대로 줄바꿈.
4. 만료 행 → 별도 정리 규칙 없이 design §4의 삽입 시점 정리를 따른다. 화면은 조회된 만료 행만 그린다(지금 시안대로).
5. 종료 화면 비로그인 출구 → **버튼 없음 유지.** 할 일은 앱에서 다시 시작하는 것이고 본문이 그렇게 말한다.
