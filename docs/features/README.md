# docs/features — 기능 문서 인덱스

`/feature`가 만든 산출물이 사는 곳이다. 디렉터리 하나가 기능 하나이고 안에 `spec.md`(무엇을 왜) ·
`design.md`(어떻게) · `tasks.md`(순서와 검증)가 있다. 넷째 종류로 **외부 검토·감사 원문**이 있다
(`saas-review.md`, `tenant-auth/audit-2026-09-06-codex.md`) — 근거로 보관하고 실행 계획으로 읽지 않는다.

**여기 있는 문서는 스펙이 아니다.** 정본은 셋 — `docs/SAAS.md`(현재 단계 — 무엇을 만드는가),
`docs/MVP.md`(PoC — 닫힘), `docs/ARCHITECTURE.md`(불변식·함정) — 이고, 이 디렉터리는 **그 결론에
도달한 과정**을 남긴다. 기능이 끝나면 결론은 정본으로 올라가고 여기는 근거로 남는다.

**셋의 수명이 다르다** (2026-09-05 정리):

- **`spec.md`·`design.md`는 완료돼도 지우지 않는다.** "왜 그 선택을 했나"를 담고 있어서, 되살릴 때
  재작성 비용을 없애고 나중에 묻는 사람에게 답한다.
- **`tasks.md`는 닫히면 지운다.** 순서와 검증 체크리스트라 전부 `[x]`가 된 시점에 남는 정보가 없다 —
  결론은 정본으로 올라갔고 "왜"는 앞의 둘에 있다. 실제로 완료된 셋(adapter-generality ·
  key-order-preservation · format-preservation, 841줄)을 밖에서 참조하는 문서가 하나도 없었다.
- **예외는 체크리스트 밖의 기록이 붙은 경우다.** `pull-to-pr/tasks.md`는 §4에 실물 검증 7시나리오가
  있고 MVP §9와 TASKS가 그것을 직접 참조하므로 남긴다. **`tenant-auth/tasks.md`도 같은 이유로
  남긴다** — §6.1이 preview 실물 검증 5항목과 **거기서만 잡힌 결함 넷**을 들고 있고, 그건 체크박스가
  아니라 "자동 검증이 원리적으로 못 보는 것이 무엇인가"의 기록이다.

## 상태

| 기능 | 상태 | 결과가 사는 곳 | 남은 것 |
|---|---|---|---|
| [pull-to-pr](./pull-to-pr/) | ✅ 완료 (2026-09-01) | MVP §3.3 · ARCHITECTURE §2·§3 · TASKS §6 | 없음 — `tasks.md` §4는 실물 검증 기록이라 남겼다 |
| [adapter-generality](./adapter-generality/) | ✅ 완료 (2026-09-02) | **ADAPTER-COVERAGE.md** · TASKS §8 | 없음 — **단 코퍼스 파일은 살아 있는 입력이다**(아래) · `tasks.md` 삭제 |
| [key-order-preservation](./key-order-preservation/) | ✅ 완료 (2026-09-03) | ADAPTER-COVERAGE §10·§11 · MVP §4.1 · ARCHITECTURE §1.1 | 없음 · `tasks.md` 삭제 |
| [format-preservation](./format-preservation/) | ✅ 완료 (2026-09-04) | ADAPTER-COVERAGE §14·§15·§16 · MVP §4.1 · ARCHITECTURE §1.1 | 완료 조건 ③ **판정 불가**(계측 없음) · `tasks.md` 삭제 |
| [key-separator-contract](./key-separator-contract/) | ⏸️ **보류 — SaaS화 이후** | — | 문서 전체. 검수 미반영 항목부터 본다 |
| [tenant-auth](./tenant-auth/) | ✅ 완료 (2026-09-06, 프로덕션 반영까지) | **SAAS.md §5·§6·§8 2단계** · ARCHITECTURE §5.1·§6~§6.3 · CLAUDE.md(차단 두 층·세션) | 없음 · `tasks.md` **남긴다**(§6.1이 실물 검증 기록이다) · `audit-2026-09-06-codex.md`는 배포 뒤 Codex 정적 감사 9건 — 7건은 `1da8d8b`가 닫았고(세션 토큰 노출·`getPrisma` 캐시·마지막 OWNER 경합 등), #4(동시 초대 발급)는 아래 백로그 |
| [saas-review.md](./saas-review.md) | 📄 **근거 문서** (기능 디렉터리가 아니다) | **SAAS.md** | 없음 — 원문 보관 |

⚠️ **`saas-review.md`는 예외적으로 파일 하나다.** `/feature` 산출물이 아니라 2026-09-04에 Codex가 낸
종합 검토이고, 결론이 `SAAS.md`로 올라갔다. 헤더에 **이미 닫힌 부분과 그 문서가 놓친 결함**을 달아
뒀으니 실행 계획으로 읽지 않는다.

## 살아 있는 백로그 (아직 문서가 없다)

앞의 셋은 `docs/TASKS.md` §8 후속이고 **`lib/adapters/**`를 쳐서 재측정 트리거가 각각 붙는다**
(`/push` 4d). 그 아래는 tenant-auth 검수와 2026-09-06 리뷰의 이월이다.

| 항목 | 근거 | 왜 아직 안 했나 |
|---|---|---|
| **`yaml-catalog` 범위 기반 치환** | ADAPTER-COVERAGE §13.3 — `doc.toString()`이 1키 편집에 redmine 1,585줄 중 816줄을 바꾼다 | 옵션으로 닫을 수 있는 축은 닫았고, 나머지는 스칼라 `range`로 원본 문자열을 직접 갈아끼워야 한다. 완료 조건은 **1키 편집 → 1 hunk** |
| **키 구분자 계약** | 손실 2건 중 siyuan 하나로 줄었다 (§13.1) | 문서는 [key-separator-contract](./key-separator-contract/)에 있고 **보류 판정**이 났다 — 도입 대상 bugshot-2가 `ts-dict`라 효과 0이다 |
| **minify된 파일** | HeaderEditor 1.000 (§15.3·§16.4) | 루트를 `compactPaths`에서 제외한 설계 + 한 줄 여백 미관측이 겹친 자리. **관측 상태를 늘릴 근거가 리포 1건뿐이다** |
| **`translation-input` 저장 상태 `role=status`·실패 시 포커스 복귀** | tenant-auth 검수(CDO) | 저장 실패 문구가 스크린리더에 안 읽히고, blur로 포커스가 떠난 뒤라 재시도 지점이 없다. **6단계(번역 UI 재작성)에서 화면과 함께** 고친다 — 동결된 UI를 지금 다듬으면 버려진다(MVP §8.3) |
| **동시 초대 발급이 유효 토큰을 둘 남긴다** | Codex 감사 2026-09-06 #4 | `createInvitation`의 회전(`updateMany`)과 `create`가 잠금 없이 갈라져 있다 — `changeMember`처럼 `FOR UPDATE`로 직렬화하면 닫힌다. 둘 다 OWNER가 발급한 토큰이고 수락 뒤엔 `already-member`가 막아 ⚪로 미뤘다. 6단계 멤버 화면과 함께 |
| **셀 메타의 `updatedBy`가 `User.id` cuid 원문** | SAAS §5.6 (2026-09-05 `User.id` 전환) | `CellMeta`가 문자열을 그대로 찍는다 — 이름으로 보이려면 `User` join이 필요하다. 6단계 "덮인 셀의 `updatedBy`"와 **다른 축**이라 따로 적는다 |

## ⚠️ `adapter-generality/`의 파일 넷은 생성물이 아니라 입력이다

```
repos.txt            학습 코퍼스 109개 — pnpm adapter-survey의 인자
repos-heldout.txt    홀드아웃 20개 — 일반화 판정 전용
verdicts.json        학습 정답 경로 — 오탐률의 분자를 사람이 정한 기록
verdicts-heldout.json 홀드아웃 정답 경로
```

**기능이 끝났어도 이 넷은 계속 쓰인다.** `lib/adapters/**`·`lib/survey/**`를 고치면 두 코퍼스를
**둘 다** 돌린다 — **3차(홀드아웃 검증)** 에서 수정 4건 중 2건이 수정이 만든 회귀였고 그중 하나는
학습에서만 나타났다 (ADAPTER-COVERAGE §0 3차, TASKS §8). 한쪽만 돌리면 못 본다.

`repos.md`는 대상 리포의 선정 근거와 구간 분류이고, 코퍼스를 늘릴 때 여기부터 읽는다.

## 문서를 새로 만들 때

`/feature`가 만들고 `/feature-review`가 4관점(CPO·CDO·CTO·QA)으로 크로스체크한다. **TASKS의 한
단계가 설계 문서를 요구할 만큼 클 때만** 부른다 — 작은 변경은 `/tdd` → `/implement`가 낫다.

기능이 끝나면 이 파일의 표에 한 줄을 옮기고, **결론을 정본(SAAS·ARCHITECTURE, PoC 시절엔 MVP)으로 올린다.**
올리지 않으면 정본이 낡고, 이 디렉터리가 스펙처럼 읽히기 시작한다.
