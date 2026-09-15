# Sync repository — Claude Code 인계 (2026-09-15)

## 미완료·사용자 지시

- **시안 대조 미검증.** Codex에 Claude Design/DesignSync 접근 도구가 없고 로컬 `.dc.html`도 없다. T1 여섯 아트보드를 확인했다고 보고하지 않는다.
- 사용자가 `term_3aa0205c-5b00-4868-a0c6-a4252cd716c8`의 Claude Code에 **UI를 시안 기준으로 다시 구현하고 `/design-sync`를 맡기라**고 지시했다. 현재 컴포넌트는 텍스트 계약과 DOM 동작을 구현한 준비물이다.
- Home 페이지는 배선하지 않았다. T11~T13과 실물 왕복은 project-home T6 및 시안 확인 이후다. 기능 완료로 보고하거나 feature 디렉터리를 지우지 않는다.
- 요청 범위는 **push 전까지**다. Codex는 push·main 머지·prod DB 변경을 하지 않았다. 다음 담당자도 자동으로 원격 단계를 실행하지 않는다.

## 준비된 범위

- T2~T6: 공용 리포 읽기, 정상 빈 카탈로그 판정, OWNER Action, 프로젝트 실행권, 표면 토큰·revision, CI 우선 적용, Sync refs 보존. 토큰 전환과 트랜잭션 전환은 별도 커밋이다.
- T7: 결과/위험 문구. PR 객체/null/undefined 구분과 발송 후 PR 머지까지 필요한 경고를 유지한다.
- T8: `components/home/sync-button.tsx`·`sync-result.tsx` 동작 준비. 시각적 완료는 아니다.
- `lib/projects/import-failure.ts`는 기존 실패 문구·guard·상수를 옮긴 클라이언트 안전 모듈이다. 기존 `import-status.ts`는 이를 재수출하며 Zod 검증은 서버 쪽에 남는다.
- 정적 리뷰의 필수 지적은 해소했다. 재시도 확인 창 연결과 대체 포커스도 회귀 테스트로 고정했다.

## T9 공개 연결 계약

Home의 안정된 클라이언트 호스트가 **원결과와 확인 창 상태**를 소유한다. `router.refresh()`에 따라 그 호스트의 key를 바꾸거나 언마운트하지 않는다. 다른 프로젝트로 이동할 때는 프로젝트 단위로 상태를 분리한다.

```tsx
const [outcome, setOutcome] = useState<RepositoryImportOutcome | null>(null);
const [open, setOpen] = useState(false);
const headingRef = useRef<HTMLHeadingElement>(null);

<h1 ref={headingRef} tabIndex={-1}>{name}</h1>
<SyncButton slug={slug} role={role} unsent={unsent}
  open={open} onOpenChange={setOpen} onResult={setOutcome}
  fallbackFocusRef={headingRef} />
<SyncResult outcome={outcome}
  onRetry={role === "OWNER" ? () => setOpen(true) : undefined} />
```

- Home의 기존 실패 배너 `Try again`도 `setOpen(true)`로 연결한다. Action을 직접 재호출하지 않는다. 기존 공용 라벨은 `m.common.retry`다.
- 트리거 `Sync`와 확정 `Sync from repository`의 접근 이름을 유지한다. 확정은 위험 집계가 0이어도 danger다.
- 실행 중 트리거는 `aria-disabled`이며 native `disabled`나 `Button.loading`을 쓰지 않는다. 클릭·Enter 연타는 막고 닫은 창의 포커스 복귀 대상으로 남긴다.
- PR은 창이 열릴 때만 조회한다. 조회 시작과 실패 모두 미확인이며 성공 null만 경고를 지운다. 이전 창의 응답은 무시한다.
- `SyncResult`에 원결과를 그대로 넘긴다. unreadable/superseded/invalidFormat을 구분하고 포맷 누락만 있으면 재시도 버튼을 내지 않는다. `ConnectError`와 표면 `resource-limit`도 원인 그대로 반환한다.
- 페이지 `maxDuration = 60`, 실제 Home refresh, 시각·접근성 측정은 project-home에서 배선·검증한다.

## 검증 근거

| 게이트 | 결과 |
|---|---|
| `pnpm test` | 266파일, 3,935건 통과 |
| `pnpm typecheck` | 통과 |
| `pnpm build` | 통과 |
| `pnpm test:projects:postgres` | 격리 로컬 PostgreSQL, 2파일 69건 통과 |
| `pnpm db:status` | dev 마이그레이션 21개 최신 |
| `pnpm sync:agents:check` | 최신 |
| 실제 Home·시안·실물 리포 왕복 | 미검증 |

`prisma/migrations/20260915060759_add_repository_import_ownership/migration.sql`은 기존 테이블에 nullable 토큰/시각과 revision default 0만 추가한다. dev에 적용했고 prod에는 적용하지 않았다. prod는 이후 `/merge`에서 additive-first로 `pnpm db:deploy`가 필요하다.

1446키×6로케일의 실제 `/api/push` 핸들러+격리 PG 측정: 변경 전 cold 743ms / warm 240·242·243ms, 변경 후 cold 1716ms / warm 689·677·543ms. `lib/push/apply.ts`에 기록했다. **로컬 핸들러 측정이며 Vercel 네트워크 성능 검증이 아니다.** 프로젝트/표면 잠금과 최신 상태 조회에 따른 증가를 배포 환경에서도 관찰해야 한다.

## 커밋과 다음 작업

- 테스트/구현 범위: `c0f6a5e`부터 `89407a4`까지. 주요 구현 `0ed67e7`, 스키마 `e33e0f5`, UI 준비 `89407a4`.
- 회고: `09b69c4` — 정상 0키 오판과 설정 변경 뒤 진행 표시 정리.
- Claude Code: Claude Design 시안 읽기 → UI 재구현 → 적용 가능한 환경에서 `/design-sync` → 관련 게이트 재검증 → push 전 상태 보고.
- 정본 문서 영향: ARCHITECTURE(적용 잠금·실행권·revision·refs), DIRECTORY(공용 import/문구 모듈), DESIGN(실측 후), PRODUCT(실제 통합 후). T13의 완료 경계를 유지하고 현재 준비 단계에서 기능 완료 표기로 바꾸지 않는다.

**dev 푸시 대기 — Claude Code에서 `/push` 실행. 프로덕션은 배포되지 않았으며 별도 `/merge`가 필요하다.**
