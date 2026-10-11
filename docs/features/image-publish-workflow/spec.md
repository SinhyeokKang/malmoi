# Image publish workflow — spec

셀프 호스팅 이미지(`ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`) 발행을 `/merge` 9-b의 로컬 손 빌드에서 GitHub Actions로 옮긴다. `/merge` 9-b는 발행 확인과 Release 본문 기입만 맡는다.

## 1. 사용자

- **개발자(릴리스 담당, 나)** — 1차 사용자. 발행 절차를 손으로 조립하지 않게 된다.
- **셀프 호스팅 운영자** — Release 본문과 `/changelog`에 붙는 이미지 참조 한 줄의 독자다. 설치·업데이트 때 고정할 `@sha256` digest를 레지스트리 조회 없이 복사한다. 가이드 설치·업데이트 단계가 이 경로를 가리킨다(2026-10-12 사용자 결정).
- 번역 편집자·호스팅 사용자 — `/changelog`에서 각 릴리스 끝에 메타 한 줄이 보이는 것 말고는 변화가 없다.

## 2. 문제 (관측된 사실)

- **빠뜨린다**: v1.3.2는 9-b를 건너뛴 채 머지됐고 2026-10-12에 뒤늦게 발행했다(`merge.md` 9-b 마지막 항목).
- **로컬 전제가 실패를 만든다**: v1.3.3은 `ghcr.io` 로그인 없이 push해 빌드가 끝난 뒤 `403 Forbidden`으로 떨어졌다. squash 커밋을 fetch하지 않아 `git archive`가 `not a tree object`로 죽은 적도 있는데, docker 오류(`no local sources enabled`)만 봐서는 원인을 알 수 없었다(둘 다 2026-10-12 실측).
- **릴리스 머신에 묶인다**: Docker + Colima `vz` + Rosetta가 있어야 하고, arm64 머신에서 `linux/amd64`를 에뮬레이션으로 빌드해 느리다.
- **토큰이 평문으로 남는다**: credential helper가 없어 로그인 토큰이 `~/.docker/config.json`에 남는다. 그래서 `docker logout`까지 절차에 넣어 뒀다.
- 지금은 LLM이 `/merge`마다 이 블록을 손으로 다시 조립한다. 매 조립이 위 함정을 다시 연다(POSTMORTEM 2026-09-30과 같은 부류).
- 운영자는 digest를 얻으려고 `docker buildx imagetools inspect`를 따로 돌려야 한다(`guide/*/self-hosting/install.md:45`).

⚠️ **이 기능은 옛 판정 둘을 뒤집는다.**
- release-versioning(2026-09-27)의 "태그·Release는 어떤 워크플로도 돌리지 않는다" — 이제 Release 이벤트가 `image.yml`을 깨운다. 태그 push 자체는 여전히 아무것도 돌리지 않는다.
- changelog(2026-09-28)의 "Release 원문 = 사용자 체감 변화만" — 이제 체감 변화에 더해 `/merge` 9-b가 붙이는 이미지 참조 한 줄이 들어간다.

## 3. 완료 조건

**전제 (머지 전, 사람이 콘솔에서)**: GHCR 패키지 `malmoi`의 *Manage Actions access*에서 이 리포에 **Write**가 있고, *Inherit access from source repository* 상태를 확인했다. 이게 없으면 조건 1의 첫 run은 403으로 red다.

1. 앱 태그 `v<x.y.z>`의 GitHub Release가 **published**되면, 사람 손 없이 그 태그 커밋에서 `ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`(`linux/amd64`)가 발행된다.
2. 그 태그가 레지스트리에 **이미 있으면** 빌드·push 없이 성공으로 끝나고, job summary에 `exists <digest>`가 남는다. 발행된 태그는 덮지 않는다.
3. 존재 조회가 정확히 `ERROR: <ref>: not found`가 **아닌** 이유로 실패하면 빌드하지 않고 job이 red다(인증·네트워크·`command not found` 포함). 조회 실패를 "없음"으로 읽지 않는다.
4. `workflow_dispatch`에 태그를 넣어 같은 발행을 다시 돌릴 수 있다. 발행 로직은 **워크플로가 선 커밋(dispatch면 main)의 스크립트**이고, 태그 커밋은 빌드 입력으로만 쓴다. 그래서 스크립트가 없던 v1.3.x도 다시 돌릴 수 있다. `^v[0-9]+\.[0-9]+\.[0-9]+$` 밖의 입력(개행이 섞인 값·action 태그 포함), 없는 태그, 그 커밋에 `Dockerfile`이 없는 경우(v1.3.0 이전)는 아무것도 쓰기 전에 red다.
5. 워크플로 최상위 권한은 `{}`이고, job은 `publish` 하나뿐이며 권한은 정확히 `contents: read` + `packages: write`다. 서드파티 action 없이 `actions/checkout`(`persist-credentials: false`, `ref` 없음) 하나만 쓰고 40자 SHA로 고정한다. `latest` 태그·빌드 캐시·빌드 비밀이 없다. **이 리포 CI에 `contents: write`는 생기지 않는다**(2026-10-12 사용자 결정 — Release 기입은 9-b가 사용자 토큰으로 한다).
6. push 뒤 레지스트리 digest가 빌드 metadata의 `containerimage.digest`와 같은지 대조한다. 같으면 `published <digest>`를 내고, 다르면 `mismatch <metadata> <registry>`로 red다. digest는 job summary와 `$GITHUB_OUTPUT`에 남는다.
7. `/merge` 9-b가 로컬에서 빌드하지 않는다. 대신 다섯 가지를 한다.
   - run을 기다린다(대기 상한 있음).
   - 패키지 API로 digest를 읽는다(`--paginate`).
   - Release 본문에 이미지 참조 줄을 기입한다.
   - 리포트에 digest를 적는다.
   - run이 red면 `workflow_dispatch`로 다시 돌린다. 단, `mismatch`는 다시 돌리지 않고 조사한다.

   **발행 머신 전제(Docker·Colima·`ghcr.io` 로그인)가 `/merge`의 정상 경로에서 사라진다.** 비상 경로(Actions 장애)는 같은 스크립트를 사람이 로컬에서 돌리는 한 단락만 남긴다(2026-10-12 사용자 결정).
8. Release 본문의 이미지 참조는 **굵은 라벨 문단 하나**다(2026-10-12 사용자 결정 — 제목 절이 아니다).
   - 모양: `**Self-hosting image:** \`ghcr.io/sinhyeokkang/malmoi:v<x.y.z>@sha256:<64 hex>\``
   - 위치: 끝의 `**Full changelog:**` 문단 **앞**이다. `/changelog`의 `dropFullChangelog`(`lib/changelog/markdown.ts:29`)가 마지막 문단만 걷기 때문이다.
   - 같은 입력으로 다시 기입하면 본문이 바뀌지 않고 `gh release edit`도 불리지 않는다(멱등).
   - 공개 `/changelog`에도 이 문단이 보이고, Full changelog 줄은 보이지 않는다.
9. 다음을 `pnpm test`가 검증한다.
   - 조건 2~4·6의 셸 동작 — 스크립트를 docker·git 대역으로 실제 실행한다.
   - 조건 8의 본문 조립 — 순수 함수와, Node로 CLI를 실제 실행한 결과 둘 다.
   - 조건 5의 워크플로 모양.
10. 정본 문서가 다음 단언을 만족한다(각각 grep으로 판정한다).
    - `rg -n "ci\.yml. 하나뿐|유일한 CI|CI에서 .next build.를 돌리지 않는다" CLAUDE.md docs/DIRECTORY.md`의 남은 히트가 발행 워크플로와의 구분을 함께 적는다.
    - `.claude/commands/merge.md` 9-b의 `docker buildx build`는 비상 경로 단락 안에만 있다.
    - `rg -n "Colima" docs/SELF-HOSTING.md CLAUDE.md`의 히트가 비상 경로 또는 실습 기록뿐이다.
    - `merge.md` 5단계 ②와 CLAUDE.md 릴리스 절이 "체감 변화 + 9-b가 붙이는 이미지 줄"을 말한다.
    - `merge.md:140`의 제목 강등 설명이 실제 동작(`shiftHeadings` — 가장 얕은 제목이 h1)과 같다.
    - `doc-check.md`의 CLAUDE 대조 대상이 `.github/workflows/*.yml`이다.
    - PRODUCT `/changelog` 행이 원문 구성 변화를 적는다(`/implement`·`/push` 신선도 단계에서 고친다).
11. 가이드 세 언어(`guide/{en,ko,es}/self-hosting/install.md` 1단계, `operate.md` 업데이트 2단계)가 "릴리스 노트의 `Self-hosting image` 줄을 복사"를 주 경로로, `imagetools inspect`를 대체 경로로 말한다.
12. 실물 확인. 이 기능을 싣는 릴리스가 첫 push 경로 검증이다(2026-10-12 사용자 결정).
    - 그 릴리스의 run이 green이다.
    - 로그아웃 상태에서 `docker pull ghcr.io/sinhyeokkang/malmoi:v<그 버전>`이 된다.
    - digest가 `/merge` 리포트와 Release 본문에 남는다.
13. 소급(2026-10-12 사용자 결정): 머지 뒤 v1.3.0~v1.3.3을 dispatch로 한 번씩 돌린다.
    - 넷 다 `exists`로 끝나고, 새 패키지 버전이 0개다.
    - 그 digest를 9-b와 같은 기입 명령으로 네 Release 본문에 넣는다.

## 4. 비목표

- **arm64·멀티 아키텍처 이미지** — 지원 대상은 `linux/amd64` 하나다(SELF-HOSTING §2 이미지 발행 행 · §3-2).
- **머지 전 이미지 빌드 게이트**(push·PR마다 컨테이너 빌드) — SELF-HOSTING §2 "컨테이너 CI는 두지 않는다"를 유지한다. 이 워크플로는 게이트가 아니라 **발행자**다. 이미지 빌드 실패가 머지 뒤에야 드러나는 것은 지금과 같다.
- **CI가 Release 본문을 고치는 것** — `contents: write` job을 만들지 않는다. 기입은 9-b가 사용자 토큰으로 한다(2026-10-12 사용자 결정).
- **빌드 캐시**(`type=gha` 등) — 릴리스 빈도에서 이득이 작고, 캐시가 다른 워크플로와 공유되는 표면을 연다.
- **`actions/attest-build-provenance` 같은 서명·증명 추가** — 지금 이미지 형태(buildx 기본 provenance 첨부)를 유지하는 것까지만 한다.
- **BuildKit 이미지(`moby/buildkit`) digest 고정** — `docker-container` 드라이버가 받는 이미지는 지금 범위에서 고정하지 않는다(design §6에 위험을 적는다).
- **action 태그(`malmoi-i18n-push-vN`) 이동 자동화** — 별개 축이다.
- 패키지 공개 범위 자동화 — 이미 Public이고 같은 패키지에 쌓인다.
- `/changelog` 캐시(1시간) 무효화 — 배포 직후 읽힌 본문엔 이미지 줄이 없을 수 있다. 캐시가 돌면 보인다.
