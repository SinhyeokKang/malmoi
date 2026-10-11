# Image publish workflow — design

## 1. 영향 받는 흐름

push·편집 UI·pull **어디에도 붙지 않는다** — 릴리스 인프라(`/merge` 9-b)와 운영자 가이드만 바뀐다. 앱 코드·스키마·런타임 env는 그대로다.

```
/merge 9단계: gh release create v<x.y.z> --target <squash SHA>   (사용자 토큰 → release 이벤트가 발생한다)
        │
        ▼
.github/workflows/image.yml  (on: release[published] · workflow_dispatch[tag]) — job publish 하나
  checkout(워크플로 커밋) → git fetch 태그 → docker login(GITHUB_TOKEN) → buildx builder → scripts/publish-image.sh <tag>
        │
        ▼
/merge 9-b (사용자 토큰): run 대기 → 패키지 API digest → node scripts/release-image-note.ts → gh release edit → 리포트
```

## 2. 구성

### 2.1 `scripts/publish-image.sh <tag>` — 발행 로직의 집 (신규)

지금 `merge.md` 9-b 블록을 **스크립트 하나**로 옮긴다. 워크플로가 부르고, 비상시에는 사람이 로컬에서 같은 스크립트를 돌린다. 로그인과 builder 생성은 호출자가 한다. 절차가 하나뿐이라 두 벌로 갈리지 않는다.

- `set -euo pipefail`. `( … ) &&` 꼴로 감싸지 않는다(POSTMORTEM 2026-10-09 — 조건 문맥 subshell 안에서는 errexit가 꺼진다).
- **bash 3.2 호환**(macOS 기본 — 로컬 테스트·비상 경로가 그 셸이다). `${x,,}`·`mapfile`·연관 배열을 쓰지 않고, `set -u` 아래 빈 배열을 확장하지 않는다. 도구는 PATH로 찾는다(`/usr/bin/git` 같은 절대경로 금지 — 테스트 대역이 PATH 앞에 선다).
- 순서:
  1. 인자 검증 — `[[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]`(셸 정규식은 값 전체에 걸린다. 줄 단위로 맞추는 `grep -E`를 쓰지 않는다 — 개행이 섞인 값이 통과한다). 밖이면 exit 2.
  2. `git rev-parse --verify "<tag>^{commit}"` → 실패면 exit 1.
  3. `git cat-file -e "<SHA>:Dockerfile"` → 없으면 exit 1(v1.3.0 이전 태그).
  4. **존재 조회** — 아래 3분기.
  5. 없을 때만 `git archive <SHA> | docker buildx build --platform linux/amd64 --push -t <ref> --metadata-file <tmp> -`.
  6. `imagetools inspect` digest == metadata digest 대조.
  7. 결과 출력.
- **존재 조회는 3분기다**(POSTMORTEM 2026-09-03 "실패한 조회를 '없음'으로 읽었다"):
  - exit 0 → `exists <digest>`를 내고 exit 0(빌드 안 함).
  - exit ≠ 0이고 stderr가 정확히 `ERROR: <ref>: not found` 한 줄이면 계속한다. 이 문구는 공개 패키지의 없는 태그로 실측했다(`v0.0.0`, 2026-10-12 CTO 검수). 부분 문자열로 맞추지 않는다 — `command not found`(exit 127)와 겹친다.
  - 그 밖 → stderr를 그대로 내고 exit 1(fail-closed — 인증·네트워크 오류로 덮어쓰기 경로에 들어가지 않는다). ⚠️ 러너의 buildx가 문구를 바꾸면 첫 run이 여기서 red가 된다. 안전한 방향의 실패이고, 9-b가 이 경우를 진단 줄로 든다(§2.3).
- **digest를 꺼내는 방법**: 레지스트리 쪽은 `docker buildx imagetools inspect <ref> --format '{{json .Manifest}}'`의 `digest`, 빌드 쪽은 metadata JSON의 `containerimage.digest`다. JSON은 jq 없이 읽는다 — 러너와 macOS 둘 다에 jq가 있다고 가정하지 않는다. 두 출력의 실제 모양을 tasks §0에서 실측해 대역에 원문 그대로 박는다.
- **출력 계약**:
  - stdout은 **정확히 한 줄**이다 — `published <digest>` / `exists <digest>` / `mismatch <metadata digest> <registry digest>`. docker·buildx의 진행 로그는 전부 stderr로 간다.
  - `$GITHUB_OUTPUT`이 있으면 `digest=<digest>`를 쓰고, `$GITHUB_STEP_SUMMARY`가 있으면 결과 줄을 쓴다. 워크플로는 stdout을 파싱하지 않는다.
  - 종료 코드: 0 = `published`·`exists`, 1 = 실패·`mismatch`, 2 = 인자 오류. scripts/ 관례(`release-plan` 0/1/2)를 따른다.
- 이미지 이름은 **소문자 리터럴** `ghcr.io/sinhyeokkang/malmoi`다. `github.repository_owner`는 대문자가 섞여(`SinhyeokKang`) 도커 참조로 무효다.
- **빌드 입력은 태그 커밋의 `git archive`다** — 지금과 같다. 추적 파일만 context에 들어가고, `.dockerignore`가 나머지를 뺀다. 작업 트리가 어느 커밋이든 상관없다. 이 성질 덕분에 워크플로가 태그가 아니라 자기 커밋을 체크아웃할 수 있다(§2.2).
- 비밀은 넣지 않는다(`--build-arg`·`--secret` 없음, Dockerfile 머리 주석).
- 실행 비트를 갖는다(`git ls-files -s`가 `100755`). 워크플로가 직접 실행한다.

### 2.2 `.github/workflows/image.yml` (신규)

```yaml
on:
  release: { types: [published] }
  workflow_dispatch:
    inputs: { tag: { required: true, type: string } }
permissions: {}
concurrency:
  group: image-${{ github.event.release.tag_name || inputs.tag }}
  cancel-in-progress: false
defaults: { run: { shell: bash } }
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    env: { TAG: "${{ github.event.release.tag_name || inputs.tag }}" }
    steps:
      - uses: actions/checkout@<40자 SHA>   # ci.yml과 같은 핀. ref 없음 = 워크플로 커밋
        with: { persist-credentials: false }
      - run: git fetch --no-tags --depth=1 origin "+refs/tags/$TAG:refs/tags/$TAG"
      - run: printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
      - run: docker buildx create --use --driver docker-container
      - run: scripts/publish-image.sh "$TAG"
```

- **트리거가 `release`이고 tag push가 아닌 이유**: `/merge`는 로컬 `git tag`를 쓰지 않고, `gh release create`가 서버에서 태그와 Release를 함께 만든다. 이 이벤트는 사용자 토큰으로 생기므로 워크플로를 깨운다(`GITHUB_TOKEN`이 만든 이벤트는 깨우지 않는다). action 태그(`malmoi-i18n-push-vN`)는 Release를 만들지 않아 이 워크플로를 타지 않는다. 그래도 스크립트의 정규식이 한 번 더 거른다.
- **체크아웃은 워크플로 자신의 커밋이다**(CPO·QA·CTO 검수 🔴 — 태그를 체크아웃하면 스크립트가 없던 v1.3.x에서 `No such file`로 죽는다).
  - `release` 이벤트면 워크플로 커밋이 곧 태그 커밋이다.
  - `workflow_dispatch`면 main이다. 이때 발행 로직의 정본은 **main의 스크립트**이고, 태그는 `git fetch`로 받아 `git archive` 입력으로만 쓴다.
  - 공개 리포라 `persist-credentials: false` 뒤의 fetch에 자격증명이 필요 없다.
- ⚠️ **`workflow_dispatch`는 워크플로가 기본 브랜치에 있어야 보인다** — 머지 전에는 실물을 밟을 수 없다(tasks §5).
- **주입 금지**: `${{ … }}`를 `run:` 본문에 넣지 않는다. job `env: TAG:`와 스텝 `env:`로만 넘긴다. `with:`·`concurrency:`·`env:`의 표현식은 셸이 아니라 안전하다.
- **동시성**: 같은 태그로 release run과 dispatch run이 겹치면, 둘 다 존재 조회를 통과한 뒤 둘 다 push할 수 있다(= 덮어쓰기). 그래서 태그별 group으로 직렬화하고, 뒤의 run은 `exists`로 끝난다. `cancel-in-progress: false` — 발행 중인 run을 죽이지 않는다.
- 최상위 `permissions: {}` — 나중에 job이 늘어도 기본 권한이 붙지 않는다.
- `defaults.run.shell: bash` — 러너 기본값에 기대지 않고 `-eo pipefail`을 보장한다(POSTMORTEM 2026-09-30 — 파이프가 종료 코드를 삼켰다).
- **builder는 `docker-container` 드라이버로 명시한다**(2026-10-12 사용자 결정 — 이미지 형태 유지). 지금 GHCR의 태그마다 untagged 형제가 둘 있다 — 이미지 인덱스 + provenance 첨부 형태다. 러너의 기본 드라이버에 맡기면 러너 이미지가 바뀔 때 형태가 조용히 갈린다. 비상 경로도 같은 줄을 돈다(§2.3).
- 러너가 일회용이라 `docker logout`은 필요 없다.

### 2.3 `/merge` 9-b (개정 — 확인·기입)

```
# run을 찾는다 — Release 직후엔 이벤트 지연으로 비어 있는 게 정상이다. 10초 간격으로 최대 2분 폴링하고, 그래도 0건이면 dispatch한다
gh run list --workflow image.yml --event release --branch v<next> --json databaseId,status,conclusion   # release run의 headBranch = 태그
gh run watch <id> --exit-status
gh api --paginate "/users/SinhyeokKang/packages/container/malmoi/versions" \
  --jq '.[] | select(.metadata.container.tags | index("v<next>")) | .name'                       # digest — 로컬 Docker 불필요
gh release view v<next> --json body > .scratch/release-body-v<next>.json
node scripts/release-image-note.ts ghcr.io/sinhyeokkang/malmoi:v<next> <digest> \
  < .scratch/release-body-v<next>.json > .scratch/release-v<next>-image.md
# exit 0 → gh release edit v<next> --notes-file .scratch/release-v<next>-image.md / exit 3 → 이미 같음, edit 안 함 / 그 밖 → 중단
```

- **run이 red일 때**:
  - `published`·`exists`가 아닌 실패면 원인을 리포트에 적고 `gh workflow run image.yml -f tag=v<next>`로 다시 돌린다. 9단계와 같은 처리로, 머지·Release는 끝난 것이다.
  - ⚠️ **`mismatch`는 다시 돌리지 않는다.** 이미지는 이미 push됐고, 재실행은 `exists`로 green이 되어 불일치를 묻는다. 리포트에 두 digest를 적고 조사한다.
  - ⚠️ 존재 조회가 "그 밖" 분기로 red면 먼저 러너 buildx 문구가 `ERROR: <ref>: not found`에서 바뀌었는지 run 로그로 본다. 문구 차이는 재실행으로 고쳐지지 않는다.
- **빠진 태그 점검**(패키지 태그 목록 ↔ v1.3.0 이후 앱 태그)은 남긴다. 채우는 수단은 dispatch이고, 목록 조회에 `--paginate`를 붙인다.
- **비상 경로**(Actions 장애) — 9-b 본문의 한 단락:
  1. `gh auth token -u SinhyeokKang | docker login ghcr.io -u SinhyeokKang --password-stdin`
  2. `docker buildx create --use --driver docker-container`
  3. `git fetch origin && scripts/publish-image.sh v<next>`
  4. `docker logout ghcr.io`
  5. 위의 기입 명령

  Colima 전제는 이 단락 안으로 옮긴다(2026-10-12 사용자 결정 — 발행 로직은 하나).
- `merge.md` 5단계 ②의 Release 양식에 한 줄을 더한다 — **이미지 줄은 9-b가 넣으니 손으로 쓰지 않는다.** 같은 라벨의 문단을 손으로 썼다면 기입 함수가 교체한다(§2.4).
- 같은 단계 140행의 "`##` → `h3`" 설명을 실제 동작으로 고친다(`shiftHeadings`가 가장 얕은 제목을 h1로 올린다 — CDO·CPO·CTO 검수).
- 206행 "첫 발행은 비공개 → Public 전환"은 지운다. 패키지가 이미 Public이고 같은 패키지에 쌓인다.

### 2.4 `scripts/release-image-note.ts` — Release 본문 조립 (신규, 순수 함수 + CLI)

`withImageLine(body: string, image: { ref: string; digest: string }): string` + CLI 껍데기(`import.meta.main`일 때만).

- **줄의 모양**: `**Self-hosting image:** \`<ref>@<digest>\`` 문단 하나(2026-10-12 사용자 결정 — 제목 절이 아니라 굵은 라벨이다).
  - 기존 꼬리 메타 `**Full changelog:**`와 같은 모양이다.
  - `/changelog`에서는 문단으로 남고 제목 목록에 쌓이지 않는다.
  - 106자 인라인 코드는 그릇의 `wrap-anywhere`(`app/changelog/page.tsx`)로 꺾이고, 복사하면 값이 온전하다(CDO 검수).
- **위치**: 본문의 마지막 문단이 `**Full changelog:** …`면 그 **앞**에, 아니면 끝에 둔다(빈 본문이면 그 줄 하나).
- **멱등**:
  - `**Self-hosting image:**`로 시작하는 문단이 이미 있으면 그 문단을 교체한다.
  - `f(f(x)) == f(x)`이고, 같은 입력이면 바이트까지 같다.
  - 줄 끝은 `\n`(입력의 `\r\n`은 `\n`으로 읽는다), 문단 사이는 빈 줄 하나, 끝 개행은 하나다.
- **입력 검증**: `ref`가 `^ghcr\.io/sinhyeokkang/malmoi:v\d+\.\d+\.\d+$`, `digest`가 `^sha256:[0-9a-f]{64}$`가 아니면 던진다.
- **CLI**: `node scripts/release-image-note.ts <ref> <digest> < release.json`.
  - stdin은 `gh release view --json body`의 JSON이다. `-q .body`로 받지 않는다 — gh가 끝 개행을 하나 더 붙여, 비교가 매번 "다름"이 된다(QA·CTO 검수 실측). `body`가 `null`이면 빈 문자열로 읽는다.
  - **"바뀌었나"의 판정을 CLI가 한다** — 정규화한 원문과 결과가 같으면 exit 3에 stdout 빈 채로 끝난다. 다르면 exit 0에 stdout = 새 본문이다. 입력·인자 오류는 exit 2에 stdout 빈 채로 끝난다.
  - **exit 0인데 stdout이 빈 경우는 없다** — 빈 본문으로 Release를 지우는 경로를 막는다.
- **import가 없다** — 9-b가 `pnpm` 없이 `node`로 바로 돌린다(Node 24 기본 타입 제거, package.json `"type": "module"`이라 ESM). 그래서 지울 수 있는 타입 문법만 쓴다(`enum`·`namespace`·매개변수 속성 금지). tsconfig에 `erasableSyntaxOnly`가 없어 typecheck가 이 제약을 못 잡는다. 그래서 CI의 Node 24로 CLI를 실제로 spawn하는 테스트가 그 게이트다(§3).

### 2.5 가이드 (세 언어, 2026-10-12 사용자 결정)

- `guide/{en,ko,es}/self-hosting/install.md` 1단계: digest를 얻는 주 경로를 "그 릴리스 노트의 `Self-hosting image` 줄을 그대로 복사"로 바꾸고, `imagetools inspect`는 대체 경로로 남긴다. `operate.md` 업데이트 2단계("새 태그와 digest로 `MALMOI_IMAGE`")도 같은 출처를 가리킨다.
- 링크는 GitHub Releases(`/releases/tag/v<x.y.z>`)를 가리킨다. 설치본의 `/changelog`도 상류 Release를 읽어(`lib/links.ts` `GITHUB_RELEASES_API_URL`) 같은 줄을 보인다. 외부 링크·라벨은 `guide/AUTHORING.md` 허용 목록 규칙을 지난다.
- v1.3.0~v1.3.3은 소급 기입이 끝나야(tasks §5) 이 안내가 참이 된다. 그래서 가이드 문장은 "v1.3.0 이후 릴리스"를 전제로 쓴다.

## 3. 순수 함수로 분리 가능한 부분 → `/tdd` 대상

| 테스트 | 선례 | 무엇을 |
|---|---|---|
| `scripts/__tests__/release-image-note.test.ts` | `scripts/__tests__/release.test.ts`(하네스 순수 함수) · `scripts/__tests__/preflight-entry.test.ts`(최소 env spawn) | **순수 함수** `withImageLine` 사례:<br>· Full changelog 문단 앞 삽입<br>· 그 문단이 없을 때 끝에 붙임<br>· 빈 본문<br>· 1.0.0 꼴(compare 없음)<br>· 기존 라벨 문단 교체(Full changelog 바로 앞에 있을 때 포함)<br>· 멱등 `f(f(x))`<br>· `\r\n` 입력<br>· 잘못된 ref/digest는 던짐<br>**교차 확인**: 결과를 `lib/changelog/markdown.ts`의 실제 변환(`shiftHeadings`·`dropFullChangelog`)에 통과시키면 Full changelog 문단은 걷히고, 이미지 줄은 **문단**으로 남는다(제목 아님).<br>**CLI**: `spawnSync(process.execPath, ["scripts/release-image-note.ts", ref, digest], { input })`로 다섯 사례를 본다.<br>· 바뀜 → exit 0이고 stdout에 원문 포함<br>· 같음 → exit 3이고 stdout 빈 채<br>· 잘못된 인자 → exit 2이고 stdout 빈 채<br>· `body: null`<br>· gh JSON 모양 입력<br>CI verify가 `.nvmrc` 24로 돌므로 "Node 24 타입 제거로 실행된다"도 여기서 검증된다 |
| `scripts/__tests__/publish-image.test.ts` | `lib/guide/__tests__/backup-shell.test.ts`의 trace·`FAIL_AT` 패턴 차용. 단 대역은 셸 함수가 아니라 **PATH 앞 임시 디렉터리의 실행 파일**이다 — 별도 파일 스크립트에는 함수를 주입할 수 없다 | `bash scripts/publish-image.sh`를 spawn한다.<br>**env**: 최소만 넘긴다 — `PATH=<stub dir>:$PATH`, `HOME`, 임시 `GITHUB_OUTPUT`·`GITHUB_STEP_SUMMARY`, `TRACE`, `FAIL_AT`. `...process.env`는 금지다(CI verify의 실제 summary·output 파일에 쓰게 된다).<br>**사례**:<br>· 잘못된 태그(개행 섞인 값·action 태그 포함) → 2, 대역 호출 0<br>· 태그 없음 → 1<br>· Dockerfile 없음 → 1, build 0<br>· 이미 있음 → 0 + `exists`, build 0<br>· `ERROR: <ref>: not found` → build 1회 + `published`<br>· 조회가 403·네트워크·exit 127 → 1, build 0<br>· `git archive` 실패 → 1, 성공 줄 없음<br>· build 실패 → 1<br>· digest 불일치 → 1 + `mismatch`<br>**공통 단언**:<br>· stdout이 정확히 한 줄<br>· `GITHUB_OUTPUT`에 `digest=`<br>· trace로 **호출 순서**(조회가 build 앞)<br>· 사례마다 spawn timeout 5초<br>· `git ls-files -s scripts/publish-image.sh`가 `100755` |
| `scripts/__tests__/image-workflow.test.ts` | `scripts/__tests__/action-setup.test.ts`(YAML 파싱해 모양을 센다) | · 트리거 = `release[published]` + `workflow_dispatch(tag)`<br>· 최상위 `permissions: {}`<br>· job이 정확히 `publish` 하나이고 권한이 정확히 `{contents: read, packages: write}`<br>· `contents: write` 0개<br>· `uses:`는 `actions/checkout`만<br>· checkout `with`에 `ref` 없음 + `persist-credentials: false`<br>· 태그 fetch 스텝 존재<br>· `docker buildx create … --driver docker-container`<br>· `concurrency.group`이 태그를 포함하고 `cancel-in-progress: false`<br>· `run:` 본문에 `${{` 0개<br>· `latest`·`cache-from`·`cache-to`·`--build-arg`·`--secret` 0개<br>· 스크립트 호출 정확히 1회 |

`uses:` SHA 핀은 기존 `scripts/__tests__/workflow-pins.test.ts`가 `.github/` 전체를 훑으므로 새 파일도 자동으로 걸린다. 세 테스트는 모두 `vitest.config.ts`의 `**/__tests__/**/*.test.{ts,tsx}`에 수집되고, CI verify의 `pnpm test`가 돌린다.

## 4. 스키마 변경

없음.

## 5. 새 환경변수

없음 — `GITHUB_TOKEN`은 러너가 준다. 앱 env·`.env.example`·preflight 표는 그대로다.

## 6. 불변식 영향

- ARCHITECTURE §0 불변식 11·export 결정성·blob SHA·인증 경계 — **건드리지 않는다**(앱 코드 무변경).
- **보안 경계 — 이 리포 CI에 쓰기 권한 job이 처음 생긴다**(`packages: write`, 그 하나뿐 — `contents: write`는 만들지 않는다). 노출 면을 줄이는 근거는 넷이다.
  - 이벤트를 띄울 수 있는 사람이 Release 생성자·dispatch 실행자(리포 write 권한자)뿐이다. PR·fork 코드는 이 job에서 돌지 않는다.
  - 서드파티 action이 없다(`docker/*-action`을 쓰지 않는다 — 쓰기 토큰이 닿는 공급망을 공식 `actions/checkout` 하나로 줄인다).
  - 토큰 스코프는 이 리포에 연결된 패키지 쓰기다. 리포 내용은 쓸 수 없다.
  - 태그 커밋의 `pnpm install`·`pnpm build`(서드파티 설치 스크립트 포함)는 BuildKit 컨테이너의 RUN 안에서 돈다. 러너 env·`~/.docker/config.json`·docker 소켓이 거기 닿지 않는다(`--secret` 없음, `git archive`라 `.git` 자격증명도 context 밖).
- ⚠️ **수용한 위험 둘**:
  - `docker-container` 드라이버가 받는 `moby/buildkit` 이미지가 고정되지 않았는데, 그 컨테이너가 쓰기 자격증명으로 push한다. 고정은 `--driver-opt image=moby/buildkit:<ver>@sha256:…`로 할 수 있고, 이번엔 비목표다.
  - base 이미지(`node:24-bookworm-slim`)를 digest로 고정하지 않는 것은 지금과 같다.
- **SELF-HOSTING §2 "컨테이너 CI는 두지 않는다"와 충돌하지 않는다** — 그 문장은 머지 전 게이트를 말한다. 이 워크플로는 Release 뒤의 발행자다. §2 표 문구를 그 구분이 보이게 고친다.
- **CLAUDE.md "CI에서 `next build`를 돌리지 않는다"는 게이트 CI(`verify`)에 한정해 참으로 남는다** — 발행 워크플로는 이미지 빌드의 일부로 `prisma generate && next build`를 돈다. 문장을 그 구분이 보이게 고친다(tasks §4).
- 셀프 호스팅 체크리스트(SELF-HOSTING §3): 마이그레이션·패키지·env·cron·토큰 경로 URL은 해당 없다. 설치 절차는 digest 출처 안내만 바뀐다(§2.5). 이미지 내용·태그 규칙·공개 범위는 그대로다.

## 7. 과거 함정 (POSTMORTEM·merge.md 인용)

| 출처 | 함정 | 이 설계에서 |
|---|---|---|
| POSTMORTEM 2026-09-03 "실패한 조회를 '없음'으로 읽어…" | `2>/dev/null \|\| true`가 조회 실패를 "없음"으로 접었다 | 존재 조회 3분기, not-found는 문구 전체 일치, 그 밖은 fail-closed(§2.1) |
| POSTMORTEM 2026-09-30 "손으로 조립한 게이트가…" | 파이프가 종료 코드를 삼켰다 | `pipefail`을 스크립트·워크플로 양쪽에 둔다. `git archive` 실패 주입 사례를 테스트한다 |
| POSTMORTEM 2026-10-09 "백업 subshell의 set -e…" | `( set -e; … ) &&`가 errexit를 껐다 | 그 꼴을 금지한다. 실패 주입 테스트로 확인한다 |
| POSTMORTEM 2026-09-04 "완료 조건에 '방향만 게이트'…" | 잴 수단이 없는 완료 조건 | 문서 완료 조건을 grep 단언으로 바꿨다(spec §3-10). 대역 문자열은 실측 원문으로 박는다(tasks §0) |
| `merge.md` 9-b (2026-10-12 실측) | squash 커밋 미fetch → `not a tree object` / 로그인 누락 → 빌드 뒤 403 / v1.3.2 누락 | 워크플로가 태그를 명시적으로 fetch하고, `rev-parse` 실패를 red로 낸다 / 로그인이 워크플로 스텝이다 / 발행이 Release 이벤트에 묶인다 |
| `lib/changelog/markdown.ts` `dropFullChangelog` | 마지막 문단만 Full changelog로 걷는다 | 이미지 줄을 그 문단 앞에 넣고, 실제 변환으로 교차 확인한다(§3) |
| `merge.md` 9-b 금지 사항 | 발행된 태그 덮어쓰기 금지, `latest` 금지 | 조회가 build 앞에 있고, 태그별 동시성 group을 둔다. `latest`가 0개인지 테스트가 센다 |
