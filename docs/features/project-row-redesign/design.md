# project-row-redesign — design

## 영향 받는 흐름

**편집 UI 하나** — `/projects` 목록(`app/(edit)/projects/(list)/`). push·pull·export 경로는 건드리지 않는다.

| 층 | 파일 | 변경 |
|---|---|---|
| 판정(순수) | `lib/projects/list.ts` | 판정 넷(`rowChip`·`projectGroup`·`rowBanner`·`meterSlot`)을 **`planProjectRow` 하나**로 접는다 · `rowLocaleProgress` → `projectLanguageProgress` |
| 로더 | `lib/keys/query.ts` `loadProjectList` | 대표 메타 재료 select 추가(아래 표) · `meters` 대신 `languages` |
| 화면 | `components/projects/project-list.tsx` · `components/locale-meter.tsx` · `app/(edit)/projects/(list)/loading.tsx` | 시안대로 재조립. 행 전체가 `withRepoHost` |
| 사전 | `messages/{en,ko,es}.tsx` | 새 메타 문장 · 쓰이지 않게 된 `projects.meter.note.*` 정리 |
| 셸 | `lib/shell/switcher.ts` | 주석만 `projectGroup`을 가리킨다 — 이름이 바뀌면 같이 고친다 |

## 1. 대표 메타 — 후보와 추천

**"이 행이 무엇의 행인가"와 "얼마나 됐나"만 든다.** 운영 상세(Connection·CI·Branch·Members·Created)는 Home 메타 열이 정본이고 행은 거기로 가는 입구다.

| 후보 | 출처(이미 저장됨) | 추천 | 근거 |
|---|---|---|---|
| 이름 · 썸네일 | `Project.name`·`image` | ✅ 유지 | |
| 호스트 · `owner/repo` | `repoHost`·`repoOwner`·`repoName` | ✅ 유지 | 섞인 목록에서 호스트가 정보다(G4a) |
| **언어 수** | 비보관 소스의 비-orphaned `Locale.code` 중 base가 아닌 **고유 코드** 수 | ✅ 새로 | 편집자의 첫 질문 "몇 개 언어를 하나"에 답한다. 막대가 잘려도 전체 규모가 남는다 |
| **키 수** | `loadProjectListAggregates`의 `keyTotals` 합 | ✅ 새로 | 사이드바 배지·Home `Keys`와 같은 수다(`MembershipRow.keyCount`와 같은 정의) |
| **마지막 동기화** | `max(TranslationSurface.lastImportedAt)` (비보관) | ✅ 새로 — 상대 시각 | "살아 있는 프로젝트인가"를 한 낱말로 말한다. `relativeTime` + `<time dateTime>`(UTC ISO) |
| 소스 수 | 비보관 `TranslationSurface` 수 | ⚪ 2개 이상일 때만 | 소스 하나가 대부분이라 상시면 잡음이다 — 시안 판단에 맡긴다 |
| 마지막 Publish | `Project.lastPublishedAt` | ❌ | 열린 PR·미발송 띠가 같은 축을 이미 말한다 |
| 전체 진행률 하나 | 언어별 합의 합 | ❌ | 언어 막대와 같은 사실을 두 번 말한다 |
| 역할 · 멤버 수 | `ProjectMember` | ❌ | 2026-09-30 사용자 결정으로 걷었다(spec 비목표) |
| 브랜치 | `baseBranch` | ❌ | 띠의 `repo_ahead` 문장이 필요할 때만 든다 |

## 2. 언어 진행 — `projectLanguageProgress` (순수)

```ts
type LanguageProgress = { code: string; total: number; done: number; review: number; percent: number };
type ProjectLanguages = { shown: LanguageProgress[]; hidden: number; count: number };

function projectLanguageProgress(
  locales: readonly LiveLocale[],          // 그대로 — (projectId, surfaceId, code, isBase)
  keyTotals: ReadonlyMap<string, number>,  // surfaceId → 활성 키 수
  cells: readonly LocaleCellCount[],
  limit: number,                           // 시안이 정한다(기본 3)
): Map<string, ProjectLanguages>;
```

- **로케일 코드로 합친다** — 같은 코드의 (소스, 로케일)들의 `total`·`done`·`review`를 더한다. 소스 이름은 행에 서지 않는다(소스 구분은 Sources 화면의 일).
- **base인 (소스, 로케일)은 빠진다** — 분모·분자 모두. 어떤 코드가 한 소스에서는 base이고 다른 소스에서는 대상이면 대상인 쪽만 센다.
- **정렬은 덜 된 것 먼저** — `percent` 오름차순, 같으면 코드 유닛 순(`localeCompare` 금지 — `reviewByLocale`과 같은 이유). 목록에서 편집자가 묻는 것은 "어디가 밀렸나"다.
- **`hidden = count - shown.length`** — 잘린 수를 화면이 말한다(spec 완료 조건 2).
- `percent`는 지금과 같이 `floor((done + review) / total * 100)` · 분모 0이면 0 — 902/903이 100%로 보이면 안 된다.
- ⚠️ **`foldCells`를 그대로 쓴다** — orphaned 로케일 번역을 거르는 필터가 거기 있다. 손으로 다시 짜면 분자가 분모를 넘는다(그 함수 주석).
- 대상 언어가 0개(base만 있는 프로젝트)면 `count: 0` — 화면은 막대 대신 아무것도 그리지 않거나 시안이 정한 한 줄을 둔다.

## 3. 상태 — `planProjectRow` (순수)

### 판정을 하나로 접는다
지금은 넷이 각자 우선순위를 들어 칩·그룹·띠가 어긋났다(spec 문제 2). **표 하나**에서 셋을 함께 낸다.

```ts
type ProjectRowPlan = {
  chip: StateKey;                 // `StatusBadge` 입력 — 낱말·톤은 `STATE`가 든다(§2.4)
  group: ProjectGroup;            // "needs_attention" | "all_set" | "archived"
  banner: RowBanner;              // 다음 한 수(기존 union 재사용)
  progress: "languages" | "none"; // 둘째 줄에 언어 진행을 그리나
};
function planProjectRow(row: RowInput): ProjectRowPlan;
```

### 추천 모델 — **칩은 건강, 띠는 할 일**

칩은 "이 프로젝트가 돌고 있나"(개발자의 질문) 하나만 말하고, 그룹은 **칩에서 기계적으로** 나온다(초록 = `All set`, 그 밖 = `Needs attention`). 할 일(미발송·열린 PR·리포 앞섬·검토)은 칩을 바꾸지 않고 띠만 든다.

| # | 조건(위가 이긴다) | 칩 (`StateKey`) | 그룹 | 띠 | 둘째 줄 |
|---|---|---|---|---|---|
| 1 | 보관 | `archived` | archived | 없음 | 언어 |
| 2 | 연결 끊김(`needs_reconnect`) | `disconnected` | attention | `needs_reconnect` | 언어 |
| 3 | 적재 실패 danger | `syncFailed` | attention | `import_failed` | 데이터 있으면 언어, 없으면 없음 |
| 4 | 적재 실패 warning | `partiallySynced` | attention | `import_failed` | 언어 |
| 5 | 연결 전(`setup`) | `setup` | attention | `setup` | 없음 |
| 6 | 첫 적재 중 | `syncing` | attention | 없음 | 없음 |
| 7 | 첫 적재 대기 | `notSyncedYet` | attention | 없음 | 없음 |
| 8 | 열린 PR 조회 실패 | `prCheckFailed` | **attention**(지금 all set) | `pr_check_failed` | 언어 |
| 9 | 정상 | `active` | all set | 미발송 > 열린 PR > 리포 앞섬 > 검토 중 하나 | 언어 |

- **8이 attention으로 올라온다** — 조회 실패 동안 CI 적재가 fail-closed로 보류되니 "돌고 있다"가 거짓이다. 칩 낱말은 `prCheckFailed`의 기존 사전 값(§2.4 · "Couldn't check" 단독 금지 규칙을 따른다).
- **미발송·리포 앞섬이 `All set`으로 내려간다**(지금 attention) — 칩과 그룹이 어긋나던 원인이 이 둘이었다. 띠가 다음 한 수를 그대로 든다. ⚠️ **DESIGN §6.63 "검토 대기와 열린 PR은 All set"의 근거("읽고 누르면 되는 것")를 미발송·리포 앞섬까지 넓히는 결정이다** — 결정 1.
- **둘째 줄의 상태 문장(`m.projects.meter.note.*`)은 없어진다** — 칩이 말한 것을 되풀이하던 자리다(spec 완료 조건 4). "0% 바 금지"(DESIGN §6.63)는 그대로 — 값이 없으면 **바도 문장도 없다**.
- 띠의 우선순위·역할 분기·링크 목적지(`bannerTranslationsHref` 등)는 지금 것을 그대로 쓴다 — 바뀌는 것은 "칩·그룹과 같은 함수에서 나온다"뿐이다.
- **`projectStatus`는 남긴다** — `lib/inbox/load.ts`·`lib/pull/targets.ts`도 부른다(2026-10-14 확인). `planProjectRow`는 그것을 입력 판정으로 쓰고 다시 짜지 않는다.
- ⚠️ **8의 칩 낱말이 길다** — `STATE.prCheckFailed`의 사전 값은 `Couldn't check for an open pull request`(GitLab은 merge request)다. 칩은 줄지 않는 우측 묶음이라(`shrink-0`) 375 폭에서 이름 칸을 밀어낸다 — 시안이 칩 낱말을 줄일지(§10.1 표에 짧은 형 등재) 정한다.

### 대안 (추천하지 않음) — 칩이 가장 급한 한 가지
칩이 할 일까지 포함한 단일 우선순위의 첫 항목(`Unsent`·`PR open`…)을 말하는 형. 칩·그룹이 일치하는 것은 같지만 **칩과 띠가 같은 사실을 두 번 말하고**(띠가 그 항목의 문장이다), 정상 운영 중 프로젝트 대부분이 무색 칩이 되어 "훑어보는 화면이라 정상도 색을 든다"(§2.4 `active`)가 깨진다.

## 4. 호스트 문장

**행 전체가 `withRepoHost(useMessages(), row.repoHost)`를 지난다** — 지금은 `ProjectBanner`만 덮는다(`project-list.tsx:328`). 같은 사전이면 같은 결과 객체(memo)라 행마다 불러도 비용이 없다. 둘째 줄 상태 문장이 사라져 `onGitLab.meter`도 소비자를 잃는다 → 사전에서 지운다(`host.test.ts`의 세 사전 노드 일치가 같이 움직인다).

## 순수 함수 (`/tdd` 진입점)

1. `projectLanguageProgress` — 합치기 · base 제외 · 덜 된 것 먼저 · `hidden` · orphaned 거름.
2. `planProjectRow` — 위 표 전수 + **불변식 표 테스트**: 칩이 `active`면 그룹이 `all_set`, 그룹이 `all_set`이면 칩이 `active`, 보관이면 띠 없음, `progress: "languages"`면 언어가 1개 이상.
3. `projectRowMeta`(필요하면) — 언어 수·키 수·마지막 동기화 시각을 행 재료에서 뽑는 순수 함수. 수 포맷은 화면(`formatNumber`·`relativeTime`)이 한다.

## 스키마 변경

**없음.** `TranslationSurface.lastImportedAt`·`Project.lastPublishedAt`·`Locale`·`StringKey` 모두 있다. 로더 select만 는다.

## 새 환경변수

없음.

## 불변식 영향

- export 결정성·blob SHA·인증 경계·병합 없음(§0) — 무관(읽기 화면).
- **모든 쿼리는 `projectId`로 좁힌다** — 새 select는 기존 `loadProjectList`·`loadProjectListAggregates`의 `projectId in ids` 안에서만 는다. 새 왕복을 만들지 않는다(셸 로더 `loadMemberships`에 얹지 않는다 — DESIGN §6.63 끝 문단).
- `pendingWhere` SQL 사본(⑤ 미발송)은 건드리지 않는다 — `pnpm test:projects:postgres`가 대조한다.

## 과거 함정 (POSTMORTEM)

- **같은 엔터티를 여러 화면에 그릴 때 색·모서리 교차 계약**(썸네일 — 목록 4px vs Home `rounded`): 행 썸네일은 `ProjectThumbnail` 하나만 쓴다. `rg -n 'bg-foreground.*size-7|ProjectThumbnail' components/home components/projects`.
- **다른 화면의 컨트롤을 부르는 문구**(`Send changes` vs 실제 버튼 `Publish`): 띠 링크 문구는 대상 버튼의 사전 값을 테스트에서 참조해 묶는다. 이번에 띠 문구를 새로 쓰면 그 규칙을 따른다.
- **`.sr-only`와 스크롤 컨테이너**(`ContentPanel` 바깥 스크롤): 호스트 sr-only 라벨을 옮길 때 그 회고의 grep을 다시 돈다.
- **화면 용어를 늘리면 DESIGN §10.1 표부터** — `N languages`·`Synced 2h ago` 같은 새 낱말은 §10.1 표 대조 후 `terminology.test.ts`의 `BANNED`를 같이 본다.

## 결정 (2026-10-14 사용자 — 추천을 모두 채택)

1. **상태 모델은 "칩은 건강, 띠는 할 일"이다** — 그룹은 칩에서 기계적으로 나온다. 미발송·리포 앞섬은 `All set`으로 내려가고(띠가 든다), 열린 PR 조회 실패는 `Needs attention`으로 올라간다. 대안(칩이 가장 급한 한 가지)은 버렸다.
2. **대표 메타는 언어 수 · 키 수 · 마지막 동기화(상대 시각)다** — 소스 수는 2개 이상일 때만 넣을지 시안이 판단한다. 역할·멤버 수는 넣지 않는다.
3. **언어 막대는 덜 된 언어 먼저다** — `percent` 오름차순, 같으면 코드 유닛 순.
4. **첫 적재 전 행(j·k·l)의 둘째 줄은 비운다** — 바도 문장도 없다. 칩이 이미 상태를 말한다. 대가는 그 행만 한 줄 낮아지는 것이다.
5. **열린 PR 조회 실패의 띠는 다음 한 수를 말한다** — 칩(`STATE.prCheckFailed`)과 같은 문장을 쓰지 않는다. 문구는 시안이 제안하고 T0 수령 때 확정한다.
