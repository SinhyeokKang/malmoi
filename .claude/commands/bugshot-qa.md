---
description: ego-browser 태스크 스페이스에서 앱을 수동 검증하고, 발견한 결함을 BugShot 확장으로 GitHub 이슈로 제출한다. 리포트+이슈 전용 — 코드 수정·빌드·커밋 안 함.
---

**실물 브라우저로 편집 UI를 훑어 결함을 찾고, BugShot으로 이슈를 낸다.** `pnpm test`가 값은 보지만 화면은 못 본다 — 라우트 이관·권한 UI 노출·거부 문구·입력값 유지처럼 **렌더 결과가 판정인 축**이 이 스킬의 자리다. `/l10n-roundtrip`이 어댑터 표현 층에 대해 하는 일을 편집 UI에 대해 한다.

**전 경로가 실측으로 통과했다** (2026-09-06, tenant-auth 라운드 — malmoi#3·bugshot-2#228 제출). 아래 규칙은 전부 그 라운드에서 **틀려본 뒤** 고친 것이다.

## 1. 무엇을 하는가 / 무엇이 아닌가

**관측 대상은 말모이고, BugShot은 도구다.** BugShot 제품 자체의 검증은 `~/code/bugshot-2`의 `/manual-smoke`이고 런타임도 다르다(Aside + 언팩 dev 빌드). 여기서 쓰는 것은 **스토어 빌드 설치본**이다.

**리포트+이슈 전용.** 결함을 찾아도 고치지 않는다 — fix는 사용자가 `/tdd`+`/implement`(또는 `/refactor`)로 따로 부른다.

## 2. 상수

```
확장 ID    : ohakhekagkodklkickemonmifdcbhmig   ← 스토어 빌드
패널 경로  : chrome-extension://<id>/src/sidepanel/index.html?tabId=<number>
바인딩 근거 : bugshot-2의 src/sidepanel/hooks/useBoundTabId.ts (readQuery → ?tabId)
picker host : #__bugshot_picker_host   (대상 페이지 DOM, open shadow root — id다)
대상 리포   : SinhyeokKang/malmoi   (BugShot Integrations에 이미 선택돼 있다)
```

**ID는 재설치하면 바뀐다.** 확장 페이지가 안 열리면 ego lite 프로필의 `Extensions/*/*/manifest.json`에서 `"name": "__MSG_EXT_NAME__"` + `_locales/en/messages.json`의 `EXT_NAME`이 `BugShot`인 디렉터리를 찾아 다시 얻는다.

## 3. 런타임 확인 — 없으면 즉시 중단

`ego-browser nodejs`로 한 줄이 돌아야 한다. **Codex 세션엔 없다** — 이 스킬은 Codex 미러에서 제외돼 있지만, 어떤 경로로든 그쪽에서 실행되면 "브라우저 런타임이 아니라 실행 불가"만 남기고 끝낸다. **시나리오를 흉내 내거나 코드를 읽어 추론하지 않는다** — 이 스킬의 가치는 실제로 관측했다는 데 있다.

## 4. ⚠️ 바인딩 — 이 스킬의 요지

**`?tabId=` 없이 패널을 열면 조용히 틀린다.** self-recover가 `chrome.tabs.query({ active: true, lastFocusedWindow: true })`로 떨어지는데, 에이전트 태스크 스페이스에선 그 전제("SidePanel은 윈도우당 1개")가 깨져 **사용자의 일반 창**을 잡는다. 에러도 `UnsupportedPage`도 아니다 — 엉뚱한 페이지의 URL·로그로 이슈가 완성된다.

`listTabs()`의 `targetId`(CDP)와 `chrome.tabs`의 숫자 `tabId`는 **다른 값이다.** 매핑이 반드시 필요하다:

```js
const task   = await useOrCreateTaskSpace('malmoi <무엇을 보는지>')
const target = await openOrReuseTab('http://localhost:3000/', { wait: true, timeout: 25 })
const panel  = await openOrReuseTab(PANEL_BASE, { wait: true, timeout: 25 })

await switchTab(panel.targetId)
const ids = await js(String.raw`(async () => {
  const me  = await chrome.tabs.getCurrent()      // ← 패널 자기 tabId. URL 매칭보다 확실하다
  const all = await chrome.tabs.query({})
  const t   = all.find(x => (x.url || '').includes('localhost:3000'))
  return { panelTabId: me.id, targetTabId: t ? t.id : null }
})()`)
if (ids.targetTabId == null) throw new Error('대상 탭을 chrome.tabs에서 못 찾았다')

await gotoAndWait(PANEL_BASE + '?tabId=' + ids.targetTabId, { timeout: 20, settle: 2 })
```

- `chrome.tabs.query({})`는 **태스크 스페이스의 탭까지 전부** 돌려준다.
- **패널 tabId를 URL 매칭으로 찾지 않는다** — 방금 연 탭의 `url`이 `""`인 구간이 있어 `null`이 난다.

### 바인딩 검증 — 건너뛰지 않는다

**새 draft에서** "Write issue" → Environment 펼치기 → `Page` 행을 대상 URL과 대조한다. 불일치면 중단한다 — 그 상태로 계속하면 이슈 본문이 통째로 거짓이 된다.

⚠️ **`Page` 행은 draft 생성 시점에 고정되고 read-only다**(`input.readOnly === true` — bugshot-2#228). 오래된 draft에서 읽으면 **거짓 불일치**가 난다. 재현 경로가 여러 라우트를 지나면 그 행이 최종 페이지를 안 가리키므로 **재현 절차에 실제 라우트를 적어 보완한다.**

## 5. ⚠️ 패널 조작 3규칙 (전부 조용히 실패한다)

1. **뷰포트 밖 요소는 `click('@N')`이 no-op이다.** 패널이 세로로 길어 폼 하단(Expected result·Submit)이 화면 밖이다. 에러도 안 난다. → `scrollIntoView({ block: 'center' })` 후 **좌표 클릭**:
   ```js
   const r = await js(String.raw`(() => {
     const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Submit issue')
     b.scrollIntoView({ block: 'center' })
     const q = b.getBoundingClientRect()
     return { x: Math.round(q.x + q.width/2), y: Math.round(q.y + q.height/2) }
   })()`)
   await click([r.x, r.y], { label: 'submit issue' })
   ```
2. **Description·Expected result는 tiptap/ProseMirror contenteditable이다.** `fillInput`이 안 먹는다. `[contenteditable="true"][aria-label="Description"|"Expected result"]`를 `scrollIntoView` → 좌표 클릭 → `activeElement` 확인 → `typeText`. 셀렉터 클릭만으로는 스크롤이 안 돼 포커스가 안 간다.
3. **`@N` ref는 매 스냅샷 재생성된다.** "빈 입력을 찾아 채우기"를 스냅샷 없이 루프로 돌리면 **같은 칸을 반복해서 덮어쓴다**(그 라운드에서 스텝 1을 세 번 덮었다). ref를 한 번에 걷어 **명시적으로 하나씩** 채운다.

제목은 예외다 — `fillInput('input[placeholder="Issue title"]', …)`로 된다.

## 6. ⚠️ 캡처 — 팝업 분리를 쓰지 않는다

bugshot-2의 `/manual-smoke`는 캡처 시 패널을 `chrome.windows.create({ tabId, type: 'popup' })`로 뺀다. **ego-browser에선 그러면 패널이 태스크 스페이스 밖으로 나가 `listTabs()`에서 사라지고 조작 불가가 된다**(실측 — 복구는 패널을 다시 여는 것뿐이다).

**같은 윈도우를 유지하고, 대상 탭을 활성으로 올린 뒤 패널 버튼은 `js()` DOM 클릭으로 누른다.** `chrome.tabs.update`가 옮긴 포커스를 CDP 입력이 다시 훔치지 않는다:

```js
await js(String.raw`(async () => {
  const all = await chrome.tabs.query({})
  const t = all.find(x => (x.url||'').includes('localhost:3000'))
  await chrome.tabs.update(t.id, { active: true })   // captureOwnedTab이 tab.active를 재확인한다
  document.querySelector('button[aria-label="Area capture"]').click()
})()`)
```

- 영역 선택은 `dragMouse([[x1,y1],[x2,y2]])`. 좌표는 대상 페이지에서 `getBoundingClientRect()`로 뽑는다.
- ⚠️ **`chrome.tabs.update(active:true)` 직후의 `snapshotText()`는 새로 활성된 탭을 본다.** 패널로 돌아가려면 `switchTab(panelTargetId)`를 명시적으로 부른다.

**로그는 소급 수집되지 않는다.** 패널을 페이지 로드 뒤에 열면 console·network가 0건("No logs to add")이다. Server Action 왕복을 로그로 잡아야 하면 **패널을 먼저 바인딩한 뒤** 화면을 조작한다.

## 7. 절차

1. **§3 런타임 확인.**
2. **태스크 스페이스 하나**를 작업 전체에 쓴다. 라운드마다 첫 줄에 `useOrCreateTaskSpace(task.id)` — Node 프로세스가 라운드마다 새로 뜬다.
3. **dev DB·서버 전제 확인.** `pnpm db:status`가 up to date여야 하고, `ProjectMember` 행이 있어야 아무나 들어갈 수 있다(없으면 fail-closed로 전원 차단 — `docs/features/tenant-auth/tasks.md` §3). `pnpm dev`를 백그라운드로 띄운다. **preview가 아니라 로컬을 쓴다** — preview는 Vercel SSO 뒤라 자동화가 `sso-api` 302를 받는다(CLAUDE.md 브랜치 정책).
4. **로그인.** 태스크 스페이스는 브라우저 프로필의 provider 자격증명은 상속하지만 **`localhost` 세션 쿠키는 없다** — OAuth를 태워 새로 만든다. 계정 선택·동의 화면은 `snapshotText()`로 행을 찾아 클릭하면 지난다. ⚠️ **`.env.local`의 OAuth 값이 틀리면 provider가 404를 준다** — 값을 출력하지 말고 **형태만**(자릿수·숫자 여부) 비교해 진단한다. `.env.local`은 편집하지 않는다.
5. **§4 바인딩 + 검증.** 로그가 필요하면 **페이지 조작보다 먼저.**
6. **시나리오 루프.** 구조 판정(`snapshotText()`) 먼저, 육안 판정은 구조로 못 가르는 축에만. 결함을 찾으면 재현 절차를 **그 자리에서** 적는다. 열고 닫는 것을 짝으로 — 잔여 탭이 있으면 URL 매칭이 엉뚱한 탭을 잡는다.
7. **브라우저 밖에서 만들어야 하는 상태.** 세션 회수·행 삭제는 일회용 tsx 스크립트로 한다 — **`lib/db.ts`는 `server-only`라 tsx가 못 쓴다**(`scripts/smoke-github.ts`처럼 `.env.local` 로드 + 자체 `PrismaPg`, `DIRECT_URL`). 미들웨어의 302·**본문 크기**는 브라우저가 리다이렉트를 따라가버리므로 `curl -si … | wc -c`가 맞다(RSC 페이로드 노출 검사의 유일한 수단 — ARCHITECTURE §6.1). **바꾼 DB 값은 라운드 끝에 되돌린다.**
8. **이슈 작성.** "Write issue" → 제목 → Description·Expected result(§5-2) → Steps(§5-3). 코드 위치(`파일:줄`)를 본문에 넣는다 — 스크린샷만으로는 고칠 자리를 못 찾는다.
9. **⚠️ 제출 게이트.** 제출은 리포에 흔적을 남긴다. **사용자가 이 라운드에서 제출을 명시적으로 지시하지 않았으면, 초안을 보여주고 확인을 받은 뒤에만 누른다.** 제출은 2단이다 — "Submit issue" → 플랫폼 다이얼로그(리포·Label·Assignee 확인)의 "Submit". 성공하면 `Issue submitted` + 이슈 링크가 뜬다.
10. **정리.** `completeTaskSpace(id, { keep: false })` + dev 서버 정지 + 워킹 트리 clean 확인.
11. **리포트.** 대화 응답으로. **실패·skip·못 밟은 시나리오를 성공 요약보다 먼저.** 제출한 이슈 URL을 목록으로. 실패가 나오면 `docs/POSTMORTEM.md`를 해당 영역으로 grep해 과거 함정과 대조한 뒤 리포트에 포함한다.

## 8. 어느 리포에 내는가

| 결함 | 어디로 |
|---|---|
| **말모이** 결함 | **BugShot으로 제출** (`SinhyeokKang/malmoi`) — 도구도 함께 검증된다 |
| **BugShot** 결함 | `gh issue create -R SinhyeokKang/bugshot-2` — BugShot이 자기 자신을 못 찍는 상황이 있다 |
| **ego-browser** 결함 | 사용자에게 보고만 — 우리 리포가 아니다 |

BugShot 제출이 막히면 말모이 결함도 `gh issue create` 폴백으로 낸다 — **관측 결과를 잃지 않는 것이 우선이다.** 폴백을 썼다는 사실을 리포트에 적는다.

**확신하지 못하는 것을 BugShot 결함으로 올리지 않는다.** 자동화의 헛클릭과 제품 버그는 증상이 같다 — DOM 속성처럼 직접 확인한 부분만 단언하고, 나머지는 이슈 본문에 `unverified`로 갈라 쓴다.

## 9. 실측 결과 (2026-09-06, tenant-auth 라운드)

| 항목 | 결과 |
|---|---|
| `?tabId=` 바인딩 | ✅ Environment `Page`가 대상 탭과 일치 |
| `chrome.tabs.getCurrent/query/update`·`chrome.windows.create` | ✅ 확장 페이지에서 전부 동작 |
| 팝업 분리(`windows.create`) | ❌ 패널이 태스크 스페이스 이탈 — §6대로 쓰지 않는다 |
| picker 주입(`#__bugshot_picker_host`) | ✅ shadow root, 12 children |
| 영역 캡처 → Description 이미지 | ✅ 같은 윈도우 + DOM 클릭 |
| console·network 로그 | ⚠️ 소급 없음 — 패널을 먼저 열어야 한다 |
| 제출 | ✅ 2단 다이얼로그 → `Issue submitted` + 링크 |
| 첨부 업로드 | ✅ `github.com/user-attachments/…`로 인라인 |
| Record tab(녹화) | ⏭ 미시도 — 시스템 화면 피커가 필요해 핸드오프 전제 |

## 10. 금지 사항

- **§7 9단계의 제출 게이트를 건너뛰지 않는다.**
- **코드 수정 금지.** `lib/`·`app/`·`prisma/` 일체. 결함이 나와도 고치지 않는다.
- **`.env.local` 편집·값 출력 금지** (CLAUDE.md 새 머신 셋업 3항).
- **`?tabId=` 검증 생략 금지** (§4).
- **BugShot 설정 변경 금지** — 연결된 계정·선택된 리포·기본 라벨을 임의로 바꾸지 않는다.
- **prod DB를 겨누지 않는다.** 이 스킬은 dev(`DIRECT_URL`)만 쓴다.
- **스크린샷·녹화물을 저장소에 넣지 않는다.** 세션 스크래치패드에만.
- **커밋·푸시 안 함. 후속 스킬 자동 제안 금지.**
