---
description: dev를 origin/main으로 hard reset + force push (머지 후 동기화)
---

`dev`를 `origin/main`과 같게 만든다. `/merge`가 6단계에서 자동으로 하지만, 그게 실패했거나 다른 창구(웹 UI·Codex 세션)에서 머지가 일어났을 때 손으로 복구하는 경로다.

## 왜 필요한가

squash 머지는 main에 **새 해시**의 커밋을 만든다. `dev`가 옛 해시들을 그대로 갖고 있으면 다음 PR diff에 이미 머지된 변경이 다시 나타난다.

## 절차

1. **미커밋·미푸시 변경 확인 (⚠️ 이 스킬은 파괴적이다)**
   - `git status --porcelain` — 비어 있지 않으면 **중단.** hard reset이 변경을 날린다.
   - `git log origin/dev..dev --oneline` — 로컬에만 있는 커밋이 있으면 **중단.**
   - `git log origin/main..origin/dev --oneline` — **origin/dev에 있는데 main에 없는 커밋이 있으면 중단.** 아직 머지되지 않은 작업을 날리는 상황이다. 이 검사가 이 스킬의 핵심 안전장치다.

   중단 시 무엇이 날아갈 뻔했는지 목록으로 보여주고 사용자 판단을 기다린다.

2. **실행**
   ```
   git fetch origin
   git checkout dev
   git reset --hard origin/main
   git push --force-with-lease origin dev
   ```

3. **확인** — `git log --oneline -3`으로 dev와 origin/main이 같은 해시인지.

## 리포트

```
🔄 sync: dev ← origin/main
안전 검사: 미커밋 없음 / 미푸시 없음 / 미머지 없음
reset: <옛 해시> → <새 해시>
force push: 완료
```

## 금지 사항

- **1단계 안전 검사 3개를 전부 통과하지 않으면 실행 금지.** 하나라도 걸리면 중단하고 보고한다.
- **`--force` 대신 `--force-with-lease`** 를 쓴다.
- **main에 실행 금지.**
