# Sync repository — 인계 (2026-09-15 · Codex → Claude Code)

> ⚠️ **이 문서는 그날 오전의 기록이고 현황이 아니다.** 아래 §시안 대조(아트보드 `4a`~`4f`의 값)는
> 그대로 유효하지만, **미완료 목록은 같은 날 저녁에 바뀌었다.** 지금 무엇이 남았는지는
> [tasks.md](./tasks.md) 머리의 현황 블록이 든다 — **거기부터 읽는다.**

## 미완료·사용자 지시 (~~오전~~ → 저녁 정정)

- ~~**Home 배선이 없다**~~ → ✅ **끝났다.** `project-home` T6이 배선했다(`components/home/actions.tsx`의
  컨텍스트 Provider가 머리의 `[Sync]`와 본문의 결과·배너를 잇는다). 그 feature 디렉터리는 결론이
  정본으로 올라가 지워졌다.
- **실물 왕복(T12)·실제 Home에서의 실측(T11)은 여전히 미검증.** 아래 §시안 대조의 실측은 **임시
  측정용 라우트**로 잰 것이고 그 라우트는 지웠다 — **실제 Home에서 다시 재야 한다.**
- ~~요청 범위는 push 전까지다~~ → ✅ **dev에 나갔다**(`a0fbbd7`, preview). 프로덕션은 아직이다 —
  `/merge`가 받고 그 1단계에서 `pnpm db:deploy`가 필요하다(마이그레이션이 들어 있다).

## 시안 대조 (2026-09-15 · Claude Code)

**SoT**: Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`의
`design_handoff_sync_repository/` (`README.md` · `Sync Repository.dc.html` 아트보드 `4a`~`4f`).

Codex가 준비한 T8 컴포넌트는 **텍스트 계약만 맞고 시안과 형이 달랐다.** 다시 구현했다:

| 무엇 | 전 (T8 준비물) | 지금 (시안) |
|---|---|---|
| Dialog 제목·본문 | `Sync from repository?` · 대상 없음 | `Sync {name} from the repository?` · `malmoi will read the locale files on {branch} …`(브랜치 mono) |
| 조용한 갈래(`4a`) | `refsHint`가 늘 서서 본문이 있었다 | **본문 자체가 없다** — 부재가 곧 정보다 |
| 위험 줄 | 평문 셋(미발송·PR·머지 주의)이 흩어짐 | **amber 블록 하나 안의 두 줄**(간격 6), 글리프는 블록 머리에 하나 |
| PR 미확인 | 위험 줄과 같은 급의 평문 | 확인된 경고와 **같은 amber**(muted 한 줄이면 부재와 같은 신호로 읽힌다) |
| 권유 | 링크만 | 미발송>0 → `Send changes first`(앱 내부) / 미발송 0 ∧ PR → `Nothing is waiting to be sent.` + `See what's open`(외부) / 미확인 → **줄 없음** |
| 진행 중 트리거 | 라벨 `Sync` 유지 + sr-only 상태 | 라벨 `Syncing…` + `LoaderCircle` 14 (여전히 `aria-disabled`) |
| 결과 성공 | 표면을 전부 나열 | **한 줄**(헤드라인뿐) — 성공한 표면을 나열하지 않는다 |
| 결과 사고 | 같은 목록 형 | **두 줄** — 헤드라인(수) + `{slug} — {message}`(slug mono). 형의 차이가 불변식 9의 방어다 |
| 사고 헤드라인 | `Synced 640 keys from main, but …` | `Synced 640 keys, but …` — 사고가 붙으면 브랜치를 빼 절을 셋으로 만들지 않는다 |
| 거부 | 전부 `danger` + `Sync could not finish` 제목 | tone 표(`lib/import/refusal.ts`): `already-running` info+닫기 / `not-ready`·`not-connected` warning+액션 / `no-surfaces` warning / `repo-replaced` **danger·액션 없음** / `AccessError` danger |

**실측 (Chrome · computed style + CDP 접근성 트리)** — 캔버스 값과 **전부 일치**했다:
Dialog 360/radius 12/`rgba(22,24,27,.15) 0 6px 16px 2px` · 머리 `16 16 8`/gap 8 · 제목 15/500/22.5px/0.225px ·
설명문 13/20.8px/0.26px/`#737373`/padding `0 16` · 브랜치 mono 13/18px/`#525252` · 본문 `16 16 0`·블록 사이 8 ·
amber 블록 radius 10/padding 12/13px/글리프 14 mt2/줄 사이 6/`#fffbeb`·`#fde68a`·`#78350f` · 푸터 16/gap 8/flex-end ·
버튼 36/radius 10/pl 12/14px/0.28px · danger 글자 `#dc2626`+bg `#fff`+border `destructive/40` ·
트리거 글리프 14 `#525252` · 진행 중 `#737373`·`cursor:not-allowed`·`disabled=false`·포커스 유지 ·
Alert radius 12/padding 16/gap 12/글리프 16 mt2/제목 14/500/20px/본문 14/20px ·
열릴 때 포커스 `Cancel` · 접근 이름 `Sync` ≠ `Sync from repository` · 결과 `role=status`(live polite) · `repo-replaced` `role=alert` ·
400px에서 Dialog 360 유지·가로 스크롤 없음.

Dialog의 **접근 가능한 설명**(CDP AX `description`)도 Chrome에서 확인했다 —
*"malmoi will read the locale files on main and replace what's in the app with them. 12 edits that haven't
been sent yet will be replaced. We couldn't check whether anything is still waiting in a pull request."*
⚠️ **Radix는 `aria-describedby`를 설명문 하나에만 건다** — 그대로 두면 열릴 때 읽히는 것이 "덮는다"까지이고
**무엇이 지워지는지는 안 읽힌다.** 경고 블록 id를 함께 넘겨 넓혔고 `sync-button.test.tsx`가 그것을 센다.

### 리뷰가 잡은 것 (2026-09-15 · 서브에이전트)

1. **거부 갈래 절반이 없는 버튼을 가리킨 채 닫히지도 않았다.** `checkRepoAccess`가 돌려주는
   `reauthorize`·`repo-not-installed`의 기존 문구가 **설정 화면의 컨트롤을 이름으로 가리키는데**
   `planImportRefusal`의 폴백이 액션 없이 떨어뜨렸다 → 둘에 `action: "settings"`를 줬다.
   `installation-forbidden`·`repo-forbidden`은 일부러 뺐다(다음 행동이 화면이 아니라 사람이다).
2. **파일 일부 실패(`partial`)가 전부 성공과 글자까지 같은 헤드라인을 썼다** — `Synced 8 keys from main`.
   tone만 warning이고 문장은 성공이라 불변식 9가 문구에서 깨져 있었다 → 브랜치를 뺐다.
3. **전 표면 실패가 `Sync could not finish, but 1 surface could not be read`였다** — `but` 앞 절이 거짓이다
   → 그 갈래는 `withIssue`를 쓰지 않는다.
4. `aria-live`의 주석이 "줄이 사라지는 것을 알린다"고 적혀 있었다 — `aria-relevant` 기본값이 제거를
   announce하지 않으므로 **거짓 주석**이었다. 실제 보장(교체는 알린다)으로 고쳤다.
5. 테스트가 `Alert` 본문 래퍼의 **클래스 문자열**로 "한 줄/두 줄"을 재고 있었다 — 클래스가 바뀌면 셀렉터가
   항상 null이 되어 공허하게 green이 된다 → `p` 개수로 센다.
6. 죽은 클래스(`aria-disabled:border-border`) 제거 — `--border`와 `--input`이 같은 값이라 아무것도 안 바꿨다.

**남은 수용 비용**: 빌려 온 문구(`AccessError`·`OnboardError`·`ConnectError`)는 완전 문장이라 `Alert.title`의
"구두점 없는 조각" 계약을 지키지 못한다. 시안이 "기존 문구 재사용"을 지시했고 조각으로는 다음 행동을
말할 수 없어 받아들였다 — 화면 전용으로 다시 쓸지는 T11에서 판정한다.

⚠️ **못 밟은 갈래 둘**: `4a`(미발송 0 ∧ PR 없음)와 `4c` 오른쪽(미발송 0 ∧ PR 번호)은 세션이 필요해
**jsdom 테스트로만 섰다**. 같은 블록·같은 규격이라 치수는 위와 같지만 "브라우저로 확인했다"고 적지 않는다.

### 시안·spec이 갈린 자리 (사용자 판정 2026-09-15)

1. **결과의 사용처 보조 문구를 뺐다.** spec 완료조건 3이 "결과의 보조 문구"를 요구하지만, 그것이 서면
   성공도 두 줄이 되어 `4e`의 "한 줄 vs 두 줄" 방어가 흐려진다. **캔버스가 이겼고** 그 완료조건은
   T11에서 다시 판정한다. 사전의 `refsHint`도 함께 지웠다(소비자가 0이 됐다).
2. **PR 미확인 문구는 캔버스 HTML을 따랐다** — `We couldn't check whether anything is still waiting in a
   pull request.` spec §10·README §6은 `We haven't confirmed …`로 적혀 있다. **spec §10의 그 줄이 낡았다.**

## 준비된 범위

- T2~T6: 공용 리포 읽기, 정상 빈 카탈로그 판정, OWNER Action, 프로젝트 실행권, 표면 토큰·revision, CI 우선 적용, Sync refs 보존. 토큰 전환과 트랜잭션 전환은 별도 커밋이다.
- T7: 결과/위험 문구. PR 객체/null/undefined 구분과 발송 후 PR 머지까지 필요한 경고를 유지한다.
- T8: `components/home/sync-button.tsx`·`sync-result.tsx` 동작 준비. 시각적 완료는 아니다.
- `lib/projects/import-failure.ts`는 기존 실패 문구·guard·상수를 옮긴 클라이언트 안전 모듈이다. 기존 `import-status.ts`는 이를 재수출하며 Zod 검증은 서버 쪽에 남는다.
- 정적 리뷰의 필수 지적은 해소했다. 재시도 확인 창 연결과 대체 포커스도 회귀 테스트로 고정했다.

## T9 공개 연결 계약

Home의 안정된 클라이언트 호스트가 **원결과와 확인 창 상태**를 소유한다. `router.refresh()`에 따라 그
호스트의 key를 바꾸거나 언마운트하지 않는다. 다른 프로젝트로 이동할 때는 프로젝트 단위로 상태를 분리한다.

```tsx
const [outcome, setOutcome] = useState<RepositoryImportOutcome | null>(null);
const [open, setOpen] = useState(false);
const headingRef = useRef<HTMLHeadingElement>(null);

<h1 ref={headingRef} tabIndex={-1}>{name}</h1>
<SyncButton slug={slug} name={name} branch={baseBranch} role={role} unsent={unsent}
  open={open} onOpenChange={setOpen} onResult={setOutcome}
  fallbackFocusRef={headingRef} />
<SyncResult outcome={outcome} slug={slug} branch={baseBranch}
  onDismiss={() => setOutcome(null)}
  onRetry={role === "OWNER" ? () => setOpen(true) : undefined} />
```

- ⚠️ **`name`·`branch`가 필수다** — 제목이 대상을, 설명문과 성공 헤드라인이 브랜치를 든다. `branch`는
  `Project.baseBranch`이고 Home이 이미 읽는 값이다.
- ⚠️ **`onDismiss`가 결과를 지운다** — 결과는 지난 실행의 보고이지 지속 상태가 아니다. 닫기는
  `already-running`과 모든 성공·사고 결과에만 서고, 나머지 거부에는 `refusal.dismissible`이 false라
  프롭을 넘겨도 안 그려진다(닫아도 같은 버튼이 같은 거부를 반복한다).
- Home의 기존 실패 배너 `Try again`도 `setOpen(true)`로 연결한다. Action을 직접 재호출하지 않는다.
  공용 라벨은 `m.common.retry`이고 결과 Alert와 **같은 라벨·같은 Action**이다.
- ⚠️ **진행 중 `[Publish]`도 함께 잠근다** (시안 `4f`) — 두 방향이 동시에 돌면 어느 쪽 값이 남는지
  화면이 설명할 수 없다. **이것은 Home 호스트의 몫이고 `SyncButton` 안에 없다.**
- 트리거 `Sync`와 확정 `Sync from repository`의 접근 이름을 유지한다. 확정은 위험 집계가 0이어도 danger다.
- 실행 중 트리거는 라벨이 `Syncing…`이 되고 `aria-disabled`다. native `disabled`나 `Button.loading`을
  쓰지 않는다 — 닫힌 창의 포커스 복귀 대상으로 남아야 한다.
- PR은 창이 열릴 때만 조회한다. 조회 시작과 실패 **둘 다 미확인**이며 성공 null만 경고를 지운다.
  이전 창의 응답은 무시한다.
- `SyncResult`에 원결과를 그대로 넘긴다. unreadable/superseded/invalidFormat을 구분하고 포맷 누락만
  있으면 재시도 버튼을 내지 않는다.
- 페이지 `maxDuration = 60`, 실제 Home refresh, 실물 왕복은 project-home에서 배선·검증한다.

## 검증 근거

| 게이트 | 결과 |
|---|---|
| `pnpm test` | 267파일, 3,946건 통과 (2026-09-15 재검증) |
| `pnpm typecheck` | 통과 |
| `pnpm build` | 통과 |
| `pnpm test:projects:postgres` | 격리 로컬 PostgreSQL, 2파일 69건 통과 |
| `pnpm db:status` | dev 마이그레이션 21개 최신 |
| `pnpm sync:agents:check` | 최신 |
| 시안 대조 | **완료** — 위 §시안 대조 (임시 측정 라우트, 갈래 둘 제외) |
| 실제 Home 배선·실물 리포 왕복 | 미검증 |

`prisma/migrations/20260915060759_add_repository_import_ownership/migration.sql`은 기존 테이블에 nullable 토큰/시각과 revision default 0만 추가한다. dev에 적용했고 prod에는 적용하지 않았다. prod는 이후 `/merge`에서 additive-first로 `pnpm db:deploy`가 필요하다.

1446키×6로케일의 실제 `/api/push` 핸들러+격리 PG 측정: 변경 전 cold 743ms / warm 240·242·243ms, 변경 후 cold 1716ms / warm 689·677·543ms. `lib/push/apply.ts`에 기록했다. **로컬 핸들러 측정이며 Vercel 네트워크 성능 검증이 아니다.** 프로젝트/표면 잠금과 최신 상태 조회에 따른 증가를 배포 환경에서도 관찰해야 한다.

## 커밋과 다음 작업

- 테스트/구현 범위: `c0f6a5e`부터 `89407a4`까지. 주요 구현 `0ed67e7`, 스키마 `e33e0f5`, UI 준비 `89407a4`.
- 회고: `09b69c4` — 정상 0키 오판과 설정 변경 뒤 진행 표시 정리.
- Claude Code(2026-09-15): 시안 읽기 → UI 재구현 → `/design-sync` 실측 → 게이트 재검증 완료. **다음은 project-home T6 배선이다.**
- 정본 문서 영향: ARCHITECTURE(적용 잠금·실행권·revision·refs), DIRECTORY(공용 import/문구 모듈), DESIGN(실측 후), PRODUCT(실제 통합 후). T13의 완료 경계를 유지하고 현재 준비 단계에서 기능 완료 표기로 바꾸지 않는다.

**dev 푸시 대기 — Claude Code에서 `/push` 실행. 프로덕션은 배포되지 않았으며 별도 `/merge`가 필요하다.**
