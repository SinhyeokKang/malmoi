---
description: 원격 푸시 전 상태 점검 + MVP.md/ARCHITECTURE.md/CLAUDE.md/.env.example 신선도 확인 + Codex 미러 게이트 + 푸시
---

원격(`origin`)에 현재 브랜치를 푸시한다. 푸시 전에 문서 신선도를 점검하고 필요시 업데이트까지 커밋한다.

## 절차

0. **브랜치 가드** — `git branch --show-current`. `main`이면 즉시 중단하고 안내:
   > main은 직접 push가 막혀 있습니다. `/merge`로 PR 흐름을 타세요 (main 머지가 곧 Vercel 프로덕션 배포입니다).

1. **상태 점검 (병렬)**
   - `git status` — 미커밋 변경
   - `git log @{u}..HEAD --oneline` — 푸시될 커밋
   - `git log -1 --stat` — 마지막 커밋 규모

2. **미커밋 변경이 있으면 바로 커밋한다.** `/push` 실행 시점에 커밋 의도가 있다고 간주. 변경 파일을 stage하고 **영문 커밋 메시지**로 커밋한 뒤 계속 진행한다. 허락을 구하지 않는다.
   - **예외**: `.env`·`*.pem`·크레덴셜 파일이 staged면 **즉시 중단하고 경고**한다. `.gitignore`에 있지만 `-f`로 강제 추가된 흔적일 수 있다.

3. **푸시될 커밋이 없으면** "푸시할 커밋 없음" 알리고 종료.

4. **문서 신선도 검사 (트라이아지 → 정밀).**

   **4a. 트라이아지 (1회, 가볍게).** `git diff @{u}..HEAD`를 **한 번** 훑어 아래 트리거에 걸리는 문서를 후보로 매핑한다. 이 단계에서 문서를 읽지 않는다.
   - **후보 0개면 검사 종료, 바로 5단계.** 대부분의 push가 여기서 통과한다.

   트리거:
   - 기능 추가/삭제, 세 흐름(push·편집 UI·pull)의 단계 변경, 기술 선택 변경, 비범위 항목을 범위로 끌어들임, 스키마 변경 → **docs/MVP.md**
   - `lib/export.ts`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`·`prisma/schema.prisma` 변경, 새 불변식·함정 발견, 인증 경로 변경 → **docs/ARCHITECTURE.md**
   - `package.json` scripts 변경, 새 디렉터리·의존성, 브랜치·배포 방식 변경, 스킬 라인업 변경, 새 컨벤션·게이트웨이 → **CLAUDE.md**
   - **코드에서 새 `process.env.*`를 읽음** → **.env.example** (⚠️ 이건 diff에 `process.env`가 보이면 무조건 확인한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다)
   - `.github/workflows/*.yml` 변경 → **CLAUDE.md의 CI 섹션**

   **4b. 후보 정밀 검사.** 걸린 문서만 실제로 읽고 대조한다.
   - **docs/MVP.md** — 범위·기술 선택 표·세 흐름의 단계·스키마·구현 순서가 코드와 맞는지. §10 "아직 안 정한 것"에서 결정된 항목은 본문으로 올리고 목록에서 뺀다. prefix `docs(MVP): ...`
   - **docs/ARCHITECTURE.md** — 불변식·함정·계약이 실제 구현과 맞는지. `(미구현)` 표시가 남아 있는데 구현됐으면 제거하고 실제 동작으로 갱신. prefix `docs(ARCHITECTURE): ...`
   - **CLAUDE.md** — 명령어 표, 스택, 디렉터리 구조, 브랜치·배포, 스킬 라인업. prefix `docs(CLAUDE): ...`
   - **.env.example** — 코드가 읽는 환경변수와 1:1인지. 주석으로 무엇에 쓰는지·틀리면 어떻게 죽는지 남긴다. prefix `chore(env): ...`

   발견 시 확인 없이 바로 Edit으로 반영하고 **문서별 별도 커밋**. 변경 불필요하면 건너뜀.

   **4c. Codex 미러 게이트 (기계 검사).** 트라이아지와 무관하게 항상 `pnpm sync:agents:check`.
   - 통과 → 한 줄 보고.
   - 드리프트 → `pnpm sync:agents` 재생성 후 `docs(AGENTS): sync codex mirror` 커밋을 얹고 계속 (순수 생성물이라 확인 불필요).
   - 스크립트가 **에러**로 죽으면 중단하고 원인 보고. 미러는 생성물이므로 `AGENTS.md`·`.agents/skills/`를 직접 편집해 맞추지 않는다.

5. **푸시 실행.** 확인 없이 바로.
   - 푸시 **직전** `git rev-parse HEAD`를 기억 (6단계에서 run 특정에 쓴다).
   - `git push` (upstream 없으면 `git push -u origin <branch>`)
   - 출력에서 결과 줄만 발췌해 보고

6. **CI run 안내 (논블로킹).** 한 줄만 덧붙이고 **종료. 기다리지 않는다.**
   ```
   gh run list --branch <branch> --workflow ci.yml --limit 10 --json headSha,url,status
   ```
   - `headSha`가 5단계에서 기억한 HEAD와 **일치하는** run의 URL을 보고.
   - 아직 등록 전이면 Actions 탭 URL로 폴백. **최신 run을 그냥 집지 않는다** — 이전 커밋의 run URL은 오보다.
   - `gh run watch`로 대기하지 않는다.

7. **Vercel preview 안내.** `dev` push면 Vercel이 preview 배포를 붙인다. 배포 URL은 GitHub 커밋 status나 Vercel 대시보드에서 확인하라고 한 줄. **이 스킬이 배포를 기다리거나 조회하지 않는다.**

## 금지 사항

- `git push --force` / `--force-with-lease`는 **사용자가 명시 요청**한 경우에만. main에는 금지.
- `--no-verify`로 hook 스킵 금지.
- `.env`·`*.pem`·크레덴셜이 staged면 경고하고 멈춤.
- main에서 실행 금지.
