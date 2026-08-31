---
name: "source-command-pull"
description: "git pull 후 최근 변경 파악 + 문서 확인 + 작업 맥락 브리핑. 코드 안 고침."
---

# source-command-pull

Use this skill when the user asks to run the migrated source command `pull`.

## Command Template

원격 변경을 받아오고 **지금 어디까지 왔는지** 브리핑한다. 세션을 새로 시작할 때 쓴다.

> 이름이 겹치지만 이 프로젝트의 **pull 흐름(DB → PR)** 과는 무관하다. 그건 `/api/pull`이다.

## 절차

1. **상태 확인** — `git status`. 미커밋 변경이 있으면 pull 전에 알린다 (stash 여부는 사용자 판단).
2. **`git pull`** — 현재 브랜치. 충돌이면 중단하고 보고.
3. **최근 변경 파악**
   - `git log --oneline -15`
   - `git diff HEAD@{1}..HEAD --stat` (pull로 들어온 것)
4. **문서 확인** — `docs/MVP.md` §10 "아직 안 정한 것"과 `docs/POSTMORTEM.md`의 최근 항목을 읽는다. 남은 결정과 최근 함정이 지금 작업의 출발점이다.
5. **구현 진행도 판정** — `docs/MVP.md` §8 구현 순서 7단계 중 어디까지 됐는지 실제 파일 존재로 확인한다 (문서 주장이 아니라 코드로).
6. **브리핑.**

## 리포트

```
📥 pull: <브랜치>
받아온 커밋: <n>건 / 없음
   <oneline 목록>

구현 진행도 (MVP.md §8):
  1. Prisma 스키마 + Supabase 연결      ✅ / ⬜
  2. lib/export.ts + lib/githash.ts     ✅ / ⬜
  3. 스캐너 CLI                          ✅ / ⬜
  4. /api/push                          ✅ / ⬜
  5. Auth + 편집 UI                      ✅ / ⬜
  6. GitHub App + /api/pull             ✅ / ⬜
  7. Actions + Vercel Cron              ✅ / ⬜

미결 항목 (MVP.md §10): <목록>
최근 POSTMORTEM: <최근 1~2건 또는 없음>
다음 할 일: <구현 순서상 다음 단계>
```

## 금지 사항

- **코드 수정·커밋 금지.** 읽고 브리핑만.
- **충돌 자동 해소 금지** — 중단하고 보고.
