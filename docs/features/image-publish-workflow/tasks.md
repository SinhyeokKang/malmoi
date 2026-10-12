# Image publish workflow — tasks

검증 표기: **[자동]**은 명령 결과로 판정하고, **[수동]**은 사람이 판정한다.

커밋 1~5는 **같은 `/push` 배치**로 나간다. 워크플로만 먼저 나가고 `merge.md`가 옛 절차로 남으면, 다음 `/merge`가 로컬 빌드 전제를 계속 요구하고 발행을 두 번 시도한다.

커밋마다 `pnpm gate`가 green이어야 한다 — 출력을 `| grep`·`| head`로 거르지 않는다(POSTMORTEM 2026-09-30).

## 0. 사전 실측 (코드 전, 로컬)

전제: Docker가 떠 있어야 한다(이 머신은 Colima — `colima status`). 떠 있지 않으면 이 단계를 건너뛰지 말고 띄운다.

- [x] **없는 태그의 오류 문구**를 읽기 전용으로 실측한다.
  - 명령: `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v0.0.0`
  - 로그아웃 상태 한 번, 로그인 상태 한 번 돌린다. 로그인은 `gh auth token -u SinhyeokKang | docker login ghcr.io -u SinhyeokKang --password-stdin`이고, 실측 직후 `docker logout ghcr.io`을 한다.
  - 검증: [수동] 두 stderr 원문과 exit code를 tasks 1의 대역에 출처 주석과 함께 그대로 옮긴다. 원문이 `ERROR: ghcr.io/sinhyeokkang/malmoi:v0.0.0: not found`가 아니면 design §2.1의 분기 문자열을 고친다.
- [x] **성공 경로 출력 모양**을 실측한다.
  - 레지스트리: `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v1.3.3 --format '{{json .Manifest}}'`의 stdout 원문
  - 빌드: `--metadata-file`이 쓰는 JSON 모양 — 기존 `.scratch/image-v1.3.3.json`이 있으면 그것을 쓰고, 없으면 buildx 문서 예시를 쓴다.
  - 검증: [수동] 두 원문이 대역 픽스처에 출처 주석과 함께 들어간다. v1.3.3 digest `sha256:236756bc…`가 레지스트리 출력에서 뽑힌다.
- tasks 1의 red 확인은 이 두 실측 원문이 대역에 들어간 뒤에만 유효하다. 원문이 없는 대역은 대역끼리만 맞는 테스트다(POSTMORTEM 2026-09-04).

## 1. Release 본문 조립 — 커밋 1 `feat(release): add release image note helper`

- [x] `scripts/__tests__/release-image-note.test.ts`를 먼저 쓴다(design §3 첫 행: 순수 함수 사례 + `lib/changelog/markdown.ts` 교차 확인 + CLI spawn 사례).
  - 검증: [자동] 모듈이 없는 상태에서 red를 관측한다.
- [x] `scripts/release-image-note.ts`를 구현한다(import 없음, 지울 수 있는 타입만, `import.meta.main` CLI 껍데기, exit 0/2/3 계약).
  - 검증: [자동] `pnpm exec vitest run scripts/__tests__/release-image-note.test.ts` green. CLI 사례가 `process.execPath`로 실제 실행한다 — CI verify(Node 24)에서도 같은 사례가 돈다. 이후 `pnpm gate` green.

## 2. 발행 스크립트 — 커밋 2 `feat(release): add GHCR image publish script`

- [x] `scripts/__tests__/publish-image.test.ts`를 먼저 쓴다(design §3 둘째 행). 요건:
  - PATH 앞 임시 디렉터리에 `docker`·`git` 대역 실행 파일을 둔다.
  - 최소 env만 넘긴다(`...process.env` 금지).
  - 사례마다 spawn timeout은 5초다.
  - 대역의 오류·출력 문자열은 tasks 0의 실측 원문이다.
  - 검증: [자동] 스크립트가 없는 상태에서 red다.
- [x] `scripts/publish-image.sh`를 구현한다. 요건:
  - `set -euo pipefail`, bash 3.2 호환, 도구는 PATH로 찾는다.
  - 실행 비트 — `git add --chmod=+x`.
  - 머리 주석에 "왜"를 단다: 3분기 조회, 덮어쓰기 금지, 소문자 이름, 호출자가 로그인·builder를 만든다, 비상 경로도 같은 스크립트다.
  - 검증: [자동] `pnpm exec vitest run scripts/__tests__/publish-image.test.ts` green(실행 비트 단언 포함). 이후 `pnpm gate` green.

## 3. 워크플로 — 커밋 3 `ci: publish the self-hosting image on release`

- [x] `scripts/__tests__/image-workflow.test.ts`를 먼저 쓴다(design §3 셋째 행).
  - 검증: [자동] 워크플로 파일이 없는 상태에서 red다.
- [x] `.github/workflows/image.yml`을 쓴다(design §2.2). 요건:
  - `actions/checkout` 핀은 `ci.yml`과 같은 SHA·버전 주석이다.
  - job 머리 주석에 권한 근거(design §6)와 "체크아웃은 워크플로 커밋, 태그는 빌드 입력만"을 단다.
  - 검증: [자동] 새 테스트와 기존 `workflow-pins.test.ts`가 green이고, 이후 `pnpm gate` green.
- [x] (선택) `actionlint`가 로컬에 있으면 돌린다. 없으면 건너뛰었다고 보고한다(새 패키지로 넣지 않는다). — 미설치로 건너뜀(orch D3).

## 4. 절차·정본 문서 — 문서별 커밋

- [x] `docs(merge): publish the image through the release workflow` — `.claude/commands/merge.md`:
  - 9-b를 design §2.3으로 바꾼다. 항목은 run 폴링 상한, `gh run watch`, `--paginate` digest, 본문 기입(exit 0/3), `mismatch`는 재실행 금지, 문구 차이 진단, 빠진 태그 점검의 수단 교체, 비상 경로 단락(로그인 → builder → 스크립트 → logout → 기입)이다.
  - 206행 비공개→Public 항목을 지운다.
  - 5단계 ② 양식 아래에 "이미지 줄은 9-b가 넣는다 — 손으로 쓰지 않는다"를 넣는다.
  - 140행 제목 강등 설명을 `shiftHeadings`의 실제 동작(가장 얕은 제목이 h1)으로 고친다.
  - 121행 "사용자가 체감하는 변화만"에 9-b의 이미지 줄 예외를 단다.
  - 183행 "태그 push는 어떤 워크플로도 돌리지 않는다"에 "Release 이벤트는 `image.yml`을 깨운다"를 단다.
  - 리포트 템플릿의 `이미지:` 줄(run 링크·digest·본문 기입 여부)과 금지 사항 줄을 맞춘다.
  - `.claude/commands/doc-check.md:39`의 CI 대조 대상을 `.github/workflows/*.yml`로 넓힌다.
  - 검증: [자동] `PostToolUse` 훅이 미러를 다시 만든 뒤 `pnpm sync:agents:check` green. [수동] 9-b에서 `docker buildx build`가 비상 경로 단락 밖에 0회.
- [x] `docs(CLAUDE): …` — 고칠 곳 넷:
  - CI 절의 "`ci.yml` 하나뿐"·"`uses:` 셋"을 워크플로 둘로 고친다(`verify` 게이트 + `image.yml` 발행자).
  - "태그 push는 어떤 job도 안 돌린다"는 참으로 두되 Release 이벤트를 덧붙인다.
  - "CI에서 `next build`를 돌리지 않는다"를 "게이트 CI는 …, 발행 워크플로는 이미지 빌드의 일부로 돈다"로 고친다.
  - 릴리스 절: 9-b 항목을 "워크플로가 발행하고 9-b는 확인·기입"으로, "Release = 사용자 체감 변화만"에 이미지 줄 예외를 단다.
  - 검증: [자동] `pnpm sync:agents:check` green. [수동] spec §3-10의 CLAUDE·DIRECTORY grep 단언을 만족한다.
- [x] `docs(SELF-HOSTING): …` — 고칠 곳 넷:
  - §2 이미지 발행 행.
  - §2 "컨테이너 CI" 행 — 게이트가 아니라 발행자라는 구분을 적는다.
  - §4 게이트 지도에 테스트 **셋**(`release-image-note`·`publish-image`·`image-workflow`)의 행을 넣는다.
  - §6 "이미지 발행 확인"·"릴리스 머신 전제"를 비상 경로 기준으로 고친다.
  - §7은 여기서 건드리지 않는다(tasks 6).
  - 검증: [수동] `rg -n "Colima|9-b" docs/SELF-HOSTING.md`의 남은 히트가 전부 비상 경로 또는 실습 기록이다.
- [x] `docs(DIRECTORY): …` — 넣을 것:
  - `.github/workflows/image.yml` — `ci.yml` 항목의 "유일한 CI" 문구를 고친다.
  - `scripts/publish-image.sh`·`scripts/release-image-note.ts`.
  - 테스트 셋.
  - 검증: [수동] DIRECTORY에 다섯 경로가 있고, "유일한 CI"가 사실과 맞다.
- [x] PRODUCT `/changelog` 행(:792)에 원문 구성 변화(체감 변화 + 이미지 줄)를 적는다. `/feature`는 PRODUCT를 직접 고치지 않으므로 `/implement` 또는 `/push` 신선도 단계에서 고친다.
  - 검증: [수동] 그 행이 이미지 줄을 언급한다.

## 5. 가이드 — 커밋 `docs(guide): copy the image digest from the release notes`

- [x] `/guide`로 `guide/{en,ko,es}/self-hosting/install.md` 1단계와 `operate.md` 업데이트 2단계를 고친다(design §2.5). 주 경로는 릴리스 노트의 `Self-hosting image` 줄 복사, 대체 경로는 `imagetools inspect`다. 외부 링크·라벨은 `guide/AUTHORING.md` 허용 목록을 지난다.
  - 검증: [자동] `pnpm test` green(가이드 구조·번역·링크 검사). [수동] 세 언어의 두 단계가 같은 두 경로를 같은 순서로 말한다.

## 6. 실물 확인 — `/merge` 때와 그 뒤 (마지막 항목만 커밋)

- [x] **머지 전, 사람이 콘솔에서 한 번만**: GitHub → Packages → `malmoi` → Package settings → *Manage Actions access*에서 `SinhyeokKang/malmoi`에 **Write**를 주고, *Inherit access from source repository* 상태를 본다. 기존 패키지를 PAT로 만들어서 `GITHUB_TOKEN`에 쓰기가 없다.
  - 검증: [수동] 설정 화면에 리포가 Write로 보인다(이 단계는 에이전트가 못 한다). — 2026-10-12 사용자 확인: `SinhyeokKang/malmoi` Write 명시 추가 · Inherit access 꺼짐 유지(명시 권한 하나로 범위를 좁힌다).
- [ ] 이 기능을 싣는 릴리스의 `/merge`에서 새 9-b대로 진행한다.
  - 검증: [수동] 다섯 가지를 본다.
    - release run이 green이다.
    - run summary의 `published <digest>`와 패키지 API digest가 같다.
    - `release-image-note.ts`가 exit 0이고, 본문에 이미지 줄이 Full changelog 앞에 섰다.
    - 같은 기입을 한 번 더 돌리면 exit 3이다.
    - 로그아웃 상태 `docker pull`이 성공한다.

    red면 원인(대개 Actions access)을 고치고 `gh workflow run image.yml -f tag=v<그 버전>`. `mismatch`면 재실행하지 않는다.
- [ ] 머지 뒤 소급(2026-10-12 사용자 결정): `gh workflow run image.yml -f tag=v1.3.0` … `v1.3.3`을 네 번 돌린다. 이어서 각 digest로 9-b의 기입 명령을 돌린다.
  - 검증: [수동] 다섯 가지를 본다.
    - 네 run이 모두 `exists`다 — dispatch가 main의 스크립트로 구 태그를 다룬다는 실물 확인이다.
    - 실행 전후 `gh api --paginate …/versions` 목록 길이가 같다(새 push 0).
    - 네 Release 본문의 digest가 각각 `v1.3.0 sha256:23d3408f…` · `v1.3.1 sha256:b5353d2c…` · `v1.3.2 sha256:4e516409…` · `v1.3.3 sha256:236756bc…`와 같다.
    - 두 번째 기입은 넷 다 exit 3이다.
    - 캐시가 돈 뒤 `/changelog`에 이미지 줄이 문단으로 보이고 Full changelog 줄은 안 보인다.
    - 이 소급이 끝나야 가이드(install·operate)의 "v1.3.0 이후 릴리스 노트에 그 줄이 있다"가 참이 된다 — 그 전까지는 가이드의 imagetools 폴백이 받친다(review-B3 ⚪4).
- [ ] 결론을 정본으로 올리고 `docs/features/image-publish-workflow/`를 지운다(`/feature` 규칙). 같은 커밋 묶음에서 SELF-HOSTING §7의 "GHCR 발행" 미실행 행을 위 두 실물 결과로 채운다. 그 자리가 실물 증거의 정본이다. 이 커밋은 dev에 쌓여 **다음 릴리스**에 실린다.
  - 검증: [수동] §7에 날짜·digest·run 링크가 있는 행이 있고, `docs/features/image-publish-workflow/`가 없다.
