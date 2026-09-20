# project-settings-rework — spec

`/projects/[slug]/settings`(OWNER 전용) 개편. 시안은 Claude Design 프로젝트
`b99d54cd-3034-44f1-8446-0a864da9d767`의 `design_handoff_project_settings/`이고, 캔버스
`Project Settings.dc.html`(아트보드 `1a`–`1i` + 교차 검증 `1k`)과 `README.md`가 그 정본이다.

⚠️ **핸드오프가 "이 캔버스가 코드보다 정본이다" 표를 들고 있다**(README §4). 이 스펙은 그 표를
뒤집지 않고, 코드를 읽어야만 알 수 있는 값(현행 Action 시그니처·컬럼·프리미티브 소비자 수)을
채우고 **열린 결정에 답을 고른다.**

## 사용자

**개발자(나) 하나다.** 이 화면을 여는 permission은 `project:settings`이고 그것은 OWNER만 갖는다
(PRODUCT §3.3). 번역 편집자는 이 화면에 도달하지 않으므로, 둘의 요구가 상충하는 지점이 없다.

단 **산출물 하나가 비개발자에게 새어 나간다** — 프로젝트 썸네일은 목록·Home·**초대 카드**에 뜨고,
초대 카드는 아직 로그인도 안 한 사람이 보는 화면이다(`components/invite/project-card.tsx`).

## 문제

1. **카드가 여섯이고 순서에 축이 없다** — Repository · Status · Surfaces · Push token · Workflow ·
   Account + 맨 아래 Archive. `space-y-6`(24)로 평평하게 쌓여 있어 위에서 아래로 읽어도 무엇이
   무엇의 전제인지 안 읽힌다. `/account`가 2026-09-16에 정확히 같은 문제를 풀었고(DESIGN §6.67
   — *"카드 다섯이 `space-y-6`으로 평평하게 쌓여 축이 안 보였다"*), **이 화면만 그 규칙 밖에 남았다.**
2. **적재 상태가 프로젝트 하나로 접혀 있다.** `page.tsx`가 `surfaces[].lastImportError` 여럿 중
   `find(isImportFailureCode)`로 **하나를 골라** 카드 한 장에 쓴다. 표면이 둘 이상이면 그 화면은
   "무엇이 실패했나"에 답하지 못하고, [Run first import]도 `defaultSurface` 하나만 돌린다
   (`runFirstIngest`).
3. **그릇이 전역 규칙보다 앞선 값이다.** `components/ui/card.tsx`가 머리 `px-4 py-3` · 제목
   `text-sm`(14)/500 · 설명이 제목 아래인데, 2026-09-15 전역 패널 규칙은 머리 16 · 제목 15/500 ·
   설명이 머리 **오른쪽**이다. ⚠️ **`Card` 프리미티브의 소비자는 둘뿐이다** — 이 화면과
   `/projects/:slug/surfaces/:surface/locales`.
4. **카드 안의 실패가 카드와 같은 모양이다.** 블록 안 `Alert`가 `rounded-lg border p-4`라 그릇 안에
   그릇이 서고, 필드 단위 거부(브랜치 저장 실패·업로드 거부)까지 같은 48px 블록을 쓴다.
5. **긴 것 둘이 페이지 높이를 정한다.** 워크플로 YAML이 카드 안에 펼쳐져 있어 Archive 카드를 화면
   밖으로 밀고, 소스 추가는 **별도 페이지**(`/projects/:slug/surfaces/new`)에 라디오 **하나**라
   다섯 개를 붙이려면 같은 왕복을 다섯 번 돈다. 그 페이지의 결과 화면은 새로고침 한 번에 사라진다.
6. **프로젝트에 이름표가 없다.** 생성 시 정한 `Project.name`을 **고칠 자리가 없고**, 이미지 컬럼
   자체가 없어 목록·Home의 `ProjectThumbnail`이 항상 `toneOf(name)` 폴백으로만 선다
   (`src`를 받도록 이미 만들어져 있는데 그것을 주는 경로가 0이다). **초대 카드는 별도 구현**으로,
   `InviteProjectCard`가 `Box`를 직접 그리며 이미지 prop도 없다 — 조회부터 렌더까지 연결해야 한다.
7. **GitHub 계정 카드가 두 곳에 있다.** `/account`의 `GitHub App` 카드와 이 화면의 `Account` 카드가
   **같은 로더**(`loadAccountView`)를 부르고 같은 4갈래를 그린다. 프로젝트마다 연결·해제가 있으면
   하나를 끊었을 때 나머지 프로젝트가 어떻게 되는지 화면이 답하지 못한다 — 실제로 **안 끊긴다**
   (야간 pull·PR은 설치 토큰이 낸다). 화면이 거짓을 암시하고 있다.

## 완료 조건

검증 가능한 문장으로.

### 구조

- C1. **활성 프로젝트**의 `/projects/[slug]/settings` 본문이 **카드 다섯**이다 — `General` · `Repository` ·
  `Translation sources` · `CI integration` · `Archive project`. `pnpm test`의 설정 화면 테스트가
  카드 제목 다섯을 순서대로 단언하고, `Status`·`GitHub account` 제목이 **없음**을 단언한다. 보관 상태는 복원 카드가 첫 자리이고
  나머지 네 카드가 뒤따른다. 두 상태 모두 이름 있는 카드 다섯을 단언한다.
- C2. 카드 사이 간격이 **16**이고, 카드 머리가 padding **16** · 제목 **15/500** · 설명 **오른쪽**이다.
  `/account`와 같은 프리미티브를 쓴다(태스크 1에서 승격).
- C3. 워크플로 YAML이 **모달 1024** 안에 있고, 설정 페이지 어디에도 `<pre>`가 펼쳐져 있지 않다.
- C4. 소스 추가가 **모달 1024 + 체크박스 다중**이다. 이미 소스인 파일은 같은 목록에 **체크 + 잠금**으로
  뜬다. 잠긴 체크박스는 마우스·키보드로 해제할 수 없고 비활성 상태가 접근성 트리에도 드러난다.
  확정 중에는 선택·입력이 잠기며, 실패 뒤 선택을 유지한 채 기존 소스 이외의 컨트롤이 다시 열린다.

### 새로 되는 것

- C5. 썸네일을 올리면 그 이미지가 **설정 미리보기(56) · 프로젝트 목록 행(28) · Home 머리 · 초대 카드**
  넷에 전부 뜬다. 교체하면 넷이 새 URL을 쓰고, [Remove]를 누르면 넷에서 함께 사라지고 Blob 객체가
  지워진다. 네 화면의 조회·DTO·props·렌더까지 연결하며, 저장 성공 뒤 캐시를 갱신해 다음 조회에도
  이전 URL이 남지 않는다. 삭제 뒤에는 각 화면의 이미지 없는 표시로 돌아간다.
- C6. 이름을 고치고 [Save]를 누르면 **사이드바 스위처 · 목록 · Home 머리**가 같은 요청으로 갱신된다.
  address(`slug`) · URL · 저장소는 **바뀌지 않는다** — 테스트가 저장 전후 `slug` 동일을 단언한다.
- C7. 소스가 둘 이상인 프로젝트에서 **한 소스만** 적재에 실패하면, 실패한 그 행에만 사유가 서고
  나머지 행은 정상 상태를 보인다. **첫 적재 재시도가 가능한 상태에서는 그 소스만** 대상으로 돈다
  (design §1.1). 이미 적재된 뒤의 실패에는 첫 적재 재시도를 허용하지 않는다.
- C8. 소스를 한 번에 셋 고르면 **한 번의 확정**으로 셋이 생긴다. 하나가 경로 충돌이면 **행이 0개**이고
  (all-or-nothing — D4), 모달이 열린 채 선택을 유지하며 충돌 경로를 목록으로 낸다.
- C8b. 적재의 부분 실패는 **롤백이 아니다** — 표면은 생기고 "N couldn't be read"가 결과에 실린다
  (ARCHITECTURE §0 불변식 9). C8과 다른 축이고, 테스트가 그 둘을 따로 단언한다.
- C8c. 소스 행이 **키·언어 수**를 보인다(D5). `orphaned`를 뺀 수이고 목록·Home과 같은 술어를 쓴다.
- C8d. 다중 추가의 다운로드 예산은 **요청 전체 파일 200개·합계 10MB**다(파일당 2MB 유지).
  각 소스는 예산 안이어도 합계가 넘으면 다운로드 전에 `resource-limit`으로 거부하고 쓰기는 0건이다.
  모달은 선택을 유지한다. 트랜잭션은 표면 수와 무관하게 timeout 30초 상한이며 초과 시 전부 롤백된다.

### 없어지는 것

- C9. `components/github-account.tsx`의 `GithubAccount`·`ReauthorizePrompt`를 설정 화면이 렌더하지
  않는다. 남는 것은 **재인가가 필요할 때의 안내 한 줄 + `/account`로 가는 링크**뿐이다.
- C10. 독립 `Status` 카드와 `FirstIngestRetry`의 프로젝트 수준 호출이 사라진다.

### 표현

- C11. 카드 **안**의 실패가 테두리·radius 없이 전폭 · padding 13/16 · 위 디바이더다. 페이지 수준
  `?e=` 거부는 **지금의 테두리 형 그대로**다. 두 형이 동시에 서는 화면이 테스트에 있다.
- C12. 필드 단위 거부 셋(썸네일 업로드 · 이름 저장 · 브랜치 저장)이 `Alert` 블록이 아니라 **아이콘
  14 + 13px 붉은 한 줄**이다.
- C13. 폭 분기가 **카드 폭 container query 640**이고, 새 뷰포트 브레이크포인트가 0개다.
- C14. `pnpm typecheck && pnpm test` green. `pnpm test:projects:postgres` green
  (`lib/surfaces/**`·`lib/import/**`이 움직인다 — CLAUDE.md 명령표).

## 비목표

이번에 **안 하는 것**. 몇몇은 핸드오프가 "이미 닫힌 결정"으로 적은 것이고, 몇몇은 이 스펙이 미룬다.

- **소스 제거·보관.** `TranslationSurface.archivedAt`은 지금 **쓰는 곳이 0**이고(스키마 주석), 표면
  보관·복원은 PRODUCT §7.1이 다음 라운드로 미뤄 둔 항목이다. 소스를 지우는 것은 번역을 버리는
  동작이라 확인 Dialog와 그 결과의 명세가 따로 필요하다.
- **프로젝트 영구 삭제.** 보관이 유일한 수명주기 종료다(PRODUCT §7.9).
- **address(slug) 수정 · 저장소 교체.** 리포는 생성 시점에 고정이고 `connectRepository`가 다른
  `repositoryId`로의 재고정을 `repo-forbidden`으로 거부한다(sec-audit-2 발견 34).
- **탭 · 설정 전용 사이드바 · 페이지 하나의 [Save].** 다섯이 한 화면에 들어간다.
- **push 토큰의 확인 Dialog · 마스킹 값.** 현행 `push-token-panel.tsx` 그대로다(핸드오프 §9).
- **크롭 편집기.** 계정 사진과 같이 즉시 업로드 + 서버 재인코딩이다.
- **언어 관리 · 멤버 관리.** 각자 `/surfaces/:surface/locales` · `/members`다.
- **워크플로 파일을 리포에서 읽어 `sources:`와 대조하는 것.** 근사로 간다 — 확정 결정 D8.
- **소스별 집계를 위한 비정규화 컬럼.** 행의 키·언어 수는 그리지만(D5 — C8c), 그것이 느릴 때
  `TranslationSurface.keyCount` 같은 컬럼을 만드는 것은 **이번 범위 밖**이다 — 적재 경로가 그것을
  써야 하고, 그 순간 이 기능의 "additive 컬럼 하나"가 거짓이 된다. design §3.5의 성능 기준에 미달하면 **그 줄을 내리고 미완료로 보고한다** — C8c를 완료로 처리하지 않는다.
- **보관한 사람(`archivedBy`) 기록.** 시안 §12의 `Archived — by {name} on {date}`는 `Archived on
  {date}`로 줄인다(A1) — 컬럼이 없고, 지금 OWNER가 사실상 혼자라 "누가"가 답하는 질문이 없다.

## 선행 사실 (스펙이 근거로 삼는 코드 실측)

이 넷은 핸드오프가 "결정할 값"으로 남긴 자리의 입력이다.

1. **Blob 저장소는 있다.** `malmoi`(prod) · `malmoi-dev`(preview+dev) 둘이 2026-09-20에 생겼고
   `BLOB_READ_WRITE_TOKEN`이 세 환경에 들어 있다. 새 환경변수가 필요 없다.
2. **아바타 경로가 `avatars/`로 하드코딩돼 있다.** `imageObjectKey`가 접두를 문자열로 박고,
   `planImageDelete`의 정규식이 `^avatars/…`이며, `listImages`가 `prefix: "avatars/"`로만 훑는다.
   프로젝트 썸네일은 **세 자리를 전부 지나야** 저장·삭제·고아 탐지가 성립한다.
3. **`Project`에는 PII 봉투가 없다.** `User.image`는 `encodeUserFields`를 지나지만 그것은 URL이
   사용자 식별자를 담기 때문이고, 프로젝트 이미지 URL은 그 부류가 아니다 — 봉투를 지나지 않는다.
4. **워크플로 파일명이 이미 하나다.** 리포 전체에서 `l10n.yml`은 **0건**이고
   `.github/workflows/malmoi-i18n.yml`이 다섯 자리(`workflow.ts` 주석 · `workflow-block.tsx` 기본값 ·
   온보딩 ④ `result.tsx` · locales 대기 문구 · ACTIONS.md)에 있다. 핸드오프 §13.6의 전제가 틀렸고,
   **열린 결정이 아니다.**
