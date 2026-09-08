# docs/features — 기능 문서 인덱스

`/feature`가 만든 산출물이 사는 곳이다. 디렉터리 하나가 기능 하나이고 안에 `spec.md`(무엇을 왜) ·
`design.md`(어떻게) · `tasks.md`(순서와 검증)가 있다. 넷째 종류로 **외부 검토·감사 원문**이 있다
(`saas-review.md`, `tenant-auth/audit-2026-09-06-codex.md`) — 근거로 보관하고 실행 계획으로 읽지 않는다.
다섯째로 **`user-stories.md`**(화면별 사용자 스토리 — `translation-ui/`에만 있다)가 있고, **완료돼도
남긴다**: `docs/DESIGN.md`가 "화면별 구성은 그쪽"이라고 **정본에서 가리키므로** 지우면 그 참조가 죽는다.

⚠️ **다음 단계 하나는 이름이 정해졌고 디렉터리만 없다** (SAAS §8): 7단계 `sync-runs/`. CLAUDE.md가
이 파일을 "`/feature` 착수 전 필독"으로 지정하므로, **여기에 그 축이 없으면 그 단계를 시작하는 사람이
지정된 필독 문서만 읽고도 자기 단계의 존재를 못 본다.** 태스크와 완료 게이트는 SAAS §8에 있다.
(6단계 `translation-ui/`는 2026-09-07에 디렉터리가 생겼고 **지금 진행 중이다** — 아래 표. 5단계
`project-onboarding/`은 2026-09-07에 생기고 같은 날 T1~T8이 프로덕션까지 갔다.)

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
  아니라 "자동 검증이 원리적으로 못 보는 것이 무엇인가"의 기록이다. **보류 중인 문서(`key-separator-contract`)의
  `tasks.md`는 애초에 이 규칙의 대상이 아니다** — 닫히지 않았고, 되살릴 때 볼 검수 미반영 항목이 거기
  §후속에 있다. **`github-connect/tasks.md`도
  같다** — T5가 실물 10시나리오와 거기서만 잡힌 결함(malmoi#7)을, 그리고 **못 밟은 둘이 왜 못
  밟혔는지**를 든다. 뒤쪽이 특히 지워지면 안 된다: 다음 사람이 같은 벽에 다시 부딪힌다.
  **`project-onboarding/tasks.md`도 남긴다** — T8이 실물 검증 14행 표와 **전환 계획의 전제 둘이 틀렸다는
  실측**(l10n 워크플로가 붙은 리포는 하나 / prod는 여섯 행에 한 리포 두 프로젝트)을 들고 있고, 그 둘은
  다른 어디에도 없다.

## 상태

| 기능 | 상태 | 결과가 사는 곳 | 남은 것 |
|---|---|---|---|
| [pull-to-pr](./pull-to-pr/) | ✅ 완료 (2026-09-01) | MVP §3.3 · ARCHITECTURE §2·§3 · TASKS §6 | 없음 — `tasks.md` §4는 실물 검증 기록이라 남겼다 |
| [adapter-generality](./adapter-generality/) | ✅ 완료 (2026-09-02) | **ADAPTER-COVERAGE.md** · TASKS §8 | 없음 — **단 코퍼스 파일은 살아 있는 입력이다**(아래) · `tasks.md` 삭제 |
| [key-order-preservation](./key-order-preservation/) | ✅ 완료 (2026-09-03) | ADAPTER-COVERAGE §10·§11 · MVP §4.1 · ARCHITECTURE §1.1 | 없음 · `tasks.md` 삭제 |
| [format-preservation](./format-preservation/) | ✅ 완료 (2026-09-04) | ADAPTER-COVERAGE §14·§15·§16 · MVP §4.1 · ARCHITECTURE §1.1 | 완료 조건 ③ **판정 불가**(계측 없음) · `tasks.md` 삭제 |
| [key-separator-contract](./key-separator-contract/) | ⏸️ **보류 — SaaS화 이후** | — | 문서 전체. 검수 미반영 항목부터 본다 |
| [tenant-auth](./tenant-auth/) | ✅ 완료 (2026-09-06, 프로덕션 반영까지) | **SAAS.md §5·§6·§8 2단계** · ARCHITECTURE §5.1·§6~§6.3 · CLAUDE.md(차단 두 층·세션) | 없음 · `tasks.md` **남긴다**(§6.1이 실물 검증 기록이다) · `audit-2026-09-06-codex.md`는 배포 뒤 Codex 정적 감사 9건 — **9/9 전부 닫혔다**: 7건은 `194fb91`(PR #6 squash)이, #4(동시 초대 발급)와 #8(CI 경고가 프로젝트별 sync 브랜치를 안 봤다 — `289ec22`)이 같은 날 |
| [github-connect](./github-connect/) | ✅ 완료 (2026-09-07, 실물 검증까지) | **SAAS.md §5.4·§5.7·§8 4단계** · CLAUDE.md(자격증명 셋·`lib/github-connect/`) · MVP §7(비범위 정정) | 없음 · `tasks.md` **남긴다**(T5가 실물 검증 10시나리오와 **거기서만 잡힌 결함 하나**를 들고 있다 — malmoi#7, `redirect_uri` 누락) · **둘은 끝내 못 밟았다**: App 제거(폐기용과 프로덕션이 같은 설치를 공유) · 다른 User의 GitHub 계정으로 연결 시도(세션 둘 필요) |
| [project-onboarding](./project-onboarding/) | ✅ **완료 (2026-09-07, 프로덕션 반영까지)** | ✅ **올라갔다**: 워크플로 판정 → SAAS §10 · 후보 순위 → §7.3 · 조회 방향 → §7.8 · 3개 제한 → §8 7단계 · `StateDest` → §5.4.1 · 2패스 탐지와 첫 적재 → ARCHITECTURE §3.1 · 잎 모듈 규칙 → §6.35 | ✅ **없음** — 마지막 잔여였던 Vercel 옛 env(`ACTIVE_PROJECT_SLUG`·`PUSH_TOKEN`) 삭제가 2026-09-07 리뷰 ⚪16에서 끝났다(**두 스코프였다** — Development엔 없었다). ⚠️ T8이 전제 둘을 뒤집었다: **토큰 발급은 `order-check` 하나**(l10n 워크플로가 붙은 리포가 그것뿐이고 쓰는 곳 없는 토큰은 발급하지 않았다)이고, **prod `Project` 행은 여섯**이다(`i18n-format-check` 하나에 프로젝트가 둘 — SAAS §7.1의 "표면이 둘"이 실재한다) |
| [translation-ui](./translation-ui/) | 🚧 **진행 중** (SaaS 6a — ship 1 프로덕션 `46df51a`/PR #12 · ship 2 dev) | **SAAS.md §8 6단계** · DESIGN §3.1·§6.4·§6.5·§6.8·§7 · ARCHITECTURE §1.35·§3·§5.5·§6.35 · CLAUDE.md(`messages/`·`lib/i18n`·`lib/routes`·`components/shell`·`components/ui`) · POSTMORTEM 2건(2026-09-08) | **ship 3**(T7 번역 화면 + Publish) · **ship 4**(T8 나머지 화면 · T9 문서·정리) · **6b 넷**(어댑터 오류 코드화+재측정 · base 변경 필드 · 멤버 화면 · `/account` 판정). `user-stories.md`는 완료돼도 남긴다(DESIGN이 참조한다) |
| [saas-review.md](./saas-review.md) | 📄 **근거 문서** (기능 디렉터리가 아니다) | **SAAS.md** | 없음 — 원문 보관 |

⚠️ **`saas-review.md`는 예외적으로 파일 하나다.** `/feature` 산출물이 아니라 2026-09-04에 Codex가 낸
종합 검토이고, 결론이 `SAAS.md`로 올라갔다. 헤더에 **이미 닫힌 부분과 그 문서가 놓친 결함**을 달아
뒀으니 실행 계획으로 읽지 않는다.

## 살아 있는 백로그 (아직 문서가 없다)

앞의 **다섯**은 `docs/ADAPTER-COVERAGE.md`에서 왔고(§6 후속 표 셋 · §13.3 · §15.3·§16.4) **`lib/adapters/**`를 쳐서
재측정 트리거가 각각 붙는다** (`/push` 4d). 그 아래는 tenant-auth 검수와 2026-09-06 리뷰의 이월이다.

| 항목 | 근거 | 왜 아직 안 했나 |
|---|---|---|
| **`yaml-catalog` 범위 기반 치환** | ADAPTER-COVERAGE §13.3 — `doc.toString()`이 1키 편집에 redmine 1,585줄 중 816줄을 바꾼다 | 옵션으로 닫을 수 있는 축은 닫았고, 나머지는 스칼라 `range`로 원본 문자열을 직접 갈아끼워야 한다. 완료 조건은 **1키 편집 → 1 hunk** |
| **키 구분자 계약** | 손실 2건 중 siyuan 하나로 줄었다 (§13.1) | 문서는 [key-separator-contract](./key-separator-contract/)에 있고 **보류 판정**이 났다 — 도입 대상 bugshot-2가 `ts-dict`라 효과 0이다 |
| **로케일 디렉터리의 네임스페이스 여러 개** | ADAPTER-COVERAGE §6 순위 6 — Ghost 5개·automa 4개·Folo 10개 (**관측 3리포** — 5+4+10은 그 셋의 네임스페이스 합계다) | 한 프로젝트가 하나만 덮는다. ⚠️ **5단계가 답하지 않고 이월했다** (2026-09-07): `(repoOwner, repoName)`에 unique가 없어 같은 리포로 프로젝트를 두 번 만드는 것이 막히지 않고, 안내를 넣으려면 "표면이 둘"을 탐지가 먼저 알아야 하는데 그 판정 규칙이 없다. 온보딩은 후보 목록 + "더 있을 수 있어요"까지만 간다 |
| **단일 로케일 리포 지원 여부** | ADAPTER-COVERAGE §6 순위 4 — arkadiyt/zoom-redirector 1개 | "로케일 2개 이상" 규칙의 대가다. ⚠️ **5단계가 규칙을 바꾸지 않고 진단 문구까지만 갔다** (2026-09-07): `no-candidates`가 이유를 말한다("언어가 2개 이상인 로케일 파일이 필요해요"). 규칙을 바꾸면 어댑터 재측정이 따라오고 근거가 아직 리포 1건이다 |
| **minify된 파일** | HeaderEditor 1.000 (§15.3·§16.4, **관측 1리포**) | 루트를 `compactPaths`에서 제외한 설계 + 한 줄 여백 미관측이 겹친 자리. **관측 상태를 늘릴 근거가 리포 1건뿐이다** |
| **한 리포에 프로젝트가 둘일 때 Actions secret 배선** | project-onboarding T8 실측 · SAAS §7.1 | 토큰이 프로젝트를 정하므로 `PUSH_TOKEN` secret 하나로 둘을 먹일 수 없다 — 워크플로에 스텝 둘 + secret 둘이 필요하다. prod에 실재한다(`i18n-format-check` → `format-check-code`·`format-check-yaml`). **워크플로를 붙일 때 결정할 자리라** 미결로 둔다 |
| **번역 화면의 고정 3.3초** | translation-ui T7 재측정 (2026-09-08 프로덕션) | 기본 착지 LCP 3.30초인데 **24키 프로젝트도 3.29초**다 — 행 렌더가 아니라 키 수와 무관한 고정 비용이고, 필터 없는 화면은 12.7 → 4.66초로 이미 2.7배 줄었다. **가상화도 조회 좁힘도 이걸 못 줄인다.** 수단 셋(표를 `Suspense`로 감싸 셸을 먼저 그리기 · 순차 DB 왕복 병합 · 폰트 CSS의 렌더 블로킹 해제)이 전부 번역 화면 밖이라 T7에 넣지 않았다. **착수 전에 어느 왕복이 얼마인지부터 재야 한다** — 지금 근거는 "고정분이 있다"까지다 |
| ~~**`translation-input` 저장 상태 `role=status`·실패 시 포커스 복귀**~~ ✅ **닫혔다** (2026-09-08 ship 3) | tenant-auth 검수(CDO) → **`translation-ui/tasks.md` T7**(ship 3) | `components/translations/announcer.tsx`(표 하나의 live region) + `lib/keys/refocus.ts`의 `shouldRefocus`로 들어갔다. 확정됐던 해법 그대로다 — 표 **하나**에 시각 숨김 `aria-live="polite"` 영역(셀마다 두면 903행×3로케일에 2,700개다) + 실패 시 `document.activeElement`가 `body`이거나 같은 셀일 때만 `focus()`, 아니면 상태줄 `[Retry]`(비동기 저장이라 응답이 올 때 사용자는 이미 다음 셀을 치고 있을 수 있다) |
| ~~**GitHub 계정 해제가 `project:settings` 뒤에 있다**~~ ✅ **닫혔다** (2026-09-07 리뷰 🟡9) | github-connect code-review 🟡3 (2026-09-07) · design §3.4 | `disconnectGithub`이 `projects/actions.ts`로 가고 인가가 `requireUser`가 됐다(인자 없음). `/projects`에 계정 섹션. ⚠️ **미룬 사유가 낡았던 것이 앞당긴 이유다** — "OWNER 강등 경로가 실사용에 없다"였는데 5단계가 연결을 사용자 수준으로 열면서 **프로젝트를 하나도 안 만든 사용자**가 같은 잠금에 걸리게 됐고, 그 사람에겐 설정 화면이 없다 |

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
