---
description: dev를 origin/main으로 hard reset + force push (머지 후 동기화)
---

`dev`를 `origin/main`과 같게 만든다. `/merge`가 6단계에서 자동으로 하지만, 그게 실패했거나 다른 창구(웹 UI·Codex 세션·다른 머신)에서 머지가 일어났을 때 손으로 복구하는 경로다. **두 대에서 작업하므로 다른 머신이 머지한 뒤 이쪽 dev가 뒤처지는 경우가 실제 경로다.**

## 왜 필요한가

squash 머지는 main에 **새 해시**의 커밋을 만든다. `dev`가 옛 해시들을 그대로 갖고 있으면 다음 PR diff에 이미 머지된 변경이 다시 나타난다.

## 절차

### 1. `git fetch origin` — **검사보다 먼저**

⚠️ **순서가 이 스킬의 안전장치 전부다** (2026-09-13, Codex 하네스 검토 지적 1). 전에는 검사가 먼저고 `fetch`가 뒤였다. remote-tracking ref는 `fetch` 전까지 **마지막으로 본 원격**이므로:

- 다른 머신이 방금 푸시한 커밋을 검사가 **보지 못하고 3개 다 통과**한다 → 뒤이은 `fetch` + `reset --hard`가 그것을 날린다.
- `--force-with-lease`도 못 막는다. 인자 없는 lease는 `refs/remotes/origin/dev`를 기준으로 삼는데, 그 ref를 **방금 그 `fetch`가 갱신**했다. 기준이 실제 원격과 같아져 lease가 항상 통과한다.

### 2. 안전 검사 (⚠️ 이 스킬은 파괴적이다)

- `git status --porcelain` — 비어 있지 않으면 **중단.** hard reset이 변경을 날린다.
- `git log origin/dev..dev --oneline` — 로컬에만 있는 커밋이 있으면 **중단.**
- `git diff --quiet origin/main origin/dev` — **exit 0이 아니면 중단.** origin/dev에 main으로 안 간 내용이 있다는 뜻이다. 이 검사가 이 스킬의 핵심 안전장치다.

⚠️ **커밋 목록이 아니라 tree를 비교한다.** 전에는 `git log origin/main..origin/dev`가 비었는지 봤는데, squash 머지는 **새 해시**를 만들므로 정상적으로 머지된 뒤에도 그 목록이 비지 않는다 — 즉 **이 스킬이 선언한 주 용도(다른 머신이 머지한 뒤)에서 항상 걸리는 false positive**였다. tree가 같으면 내용이 main에 다 있다는 직접 증거이고, 그때 사라지는 것은 커밋 이력뿐인데 그 이력을 접는 것이 squash 머지의 의도다.

- 참고용으로 `git log origin/main..origin/dev --oneline`도 함께 찍어 **무엇이 접히는지** 보여준다. 검사에는 쓰지 않는다.
- 중단 시 무엇이 날아갈 뻔했는지 목록으로 보여주고 사용자 판단을 기다린다.

### 3. 검사한 SHA를 기억한다

```
git rev-parse origin/dev
```

이 값이 4단계 lease의 기준이다. **2단계가 통과를 선언한 그 상태**를 가리킨다.

### 4. 실행

```
git checkout dev
git reset --hard origin/main
git push --force-with-lease=dev:<3단계 SHA> origin dev
```

⚠️ **`--force-with-lease`를 인자 없이 쓰지 않는다.** 인자 없는 형태는 remote-tracking ref를 암묵 기준으로 삼아, 1단계의 `fetch`와 이 push 사이에 다른 머신이 푸시하면 **그것을 덮는다.** SHA를 박으면 그 창에서 원격이 움직였을 때 push가 거부된다 — 그게 lease의 요지다.

- 거부되면 **재시도하지 않는다.** 1단계부터 다시 돌고, 2단계에서 걸리면 중단한다.

### 5. 확인

`git log --oneline -3`으로 dev와 origin/main이 같은 해시인지.

## 리포트

```
🔄 sync: dev ← origin/main
fetch: 완료 (검사보다 먼저)
안전 검사: 미커밋 없음 / 미푸시 없음 / origin/main↔origin/dev tree 동일
접히는 커밋: <n>개 (<한 줄 목록> — 내용은 main에 있다)
reset: <옛 해시> → <새 해시>
force push: --force-with-lease=dev:<검사한 SHA> 완료
```

## 금지 사항

- **`fetch`보다 검사를 먼저 하지 않는다.** stale ref 위의 검사는 검사가 아니다.
- **2단계 안전 검사 3개를 전부 통과하지 않으면 실행 금지.** 하나라도 걸리면 중단하고 보고한다.
- **`--force` 금지, 인자 없는 `--force-with-lease`도 금지.** `=dev:<SHA>` 형태만 쓴다.
- **lease 거부를 `--force`로 뚫지 않는다.** 거부는 다른 머신의 작업이 있다는 신호다.
- **main에 실행 금지.**
