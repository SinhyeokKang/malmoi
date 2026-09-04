# 원본 포맷 보존 — tasks

> ## ✅ 완료 — 2026-09-04
>
> 태스크 1a~9 전부 끝났다. **회차가 셋으로 늘었다**: §14(들여쓰기) · §15(한 줄 컨테이너·이스케이프)
> · §16(엔트리 필드 순서 + **슬래시**). 완료 조건 판정은 `ADAPTER-COVERAGE.md` §16.3에 있고
> ⑨ 중 ③만 **판정 불가**로 남았다.
>
> **계획에 없던 축이 하나 늘었다** — 10차 측정이 Midnight-Lizard의 잔여 0.109가 전부 `\/`임을
> 드러냈다. 설계 시점에 표현 축을 코퍼스에서 전수로 세지 않은 결과다 (POSTMORTEM 2026-09-04).
>
> 태스크 8(실물 왕복)은 `i18n-order-check`로 돌렸다 — 그 리포를 표현 5축이 섞이도록 재포맷했고,
> 이제 재생성 어댑터 실물 확인의 정본이다. 결과는 MVP §9.

**순서 원칙**: 순수 함수 → 어댑터 → 껍데기(pull) → CLI → 지표(survey) → 골든 → 측정 → 문서.
역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.

**커밋 경계**를 `───`로 표시했다.

> ⚠️ **네트워크가 붙는 태스크는 7뿐이다.** 설계·구현 단계에서 `pnpm adapter-survey`를 돌리지 않는다.
>
> ⚠️ **기준선은 이미 있다.** `ADAPTER-COVERAGE.md` §13.4가 7차 측정으로 냈고, 좁힌 분모의 값은
> spec 완료 조건 ①에 적혀 있다(학습 **19개 · 0.9779**, 홀드아웃 **0개**). 별도 `baseline.md`를
> 만들지 않는다.
>
> ⚠️ **회차가 8·9·10·11차로 늘었다** (§14·§15·§16). 착수 시점에는 8차 하나로 잡혀 있었다.

## 의존 그래프

```
1a (들여쓰기)  ──┬── 2 (어댑터) ── 3 (pull) ── 4 (CLI) ── 5 (survey) ── 7 (측정) ── 8 (실물) ── 9 (문서)
1b (컨테이너·이스케이프) ┘                                   │
                                              6 (L2 골든) ───┘  ※ 6의 헬퍼 수정은 2보다 먼저
```

- **1b는 뺄 수 있다.** 들여쓰기(30개)와 나머지(6개)를 같은 커밋에 묶지 않는다.
- **6의 헬퍼 수정(`roundtrip()`이 `currentFiles`를 싣게)은 2 이전이다.** 안 그러면 픽스처를
  추가해도 전부 기본값 경로로 흘러 red가 한 번도 안 난다.

---

## 1a. `lib/adapters/json-style.ts` — 들여쓰기 축 (`/tdd` 진입점)

`JsonStyle` · `DEFAULT_JSON_STYLE` · `observeJsonStyle` · `serializeJson`.
**이 태스크에서는 `indent`만 산다.** `JSON.stringify`의 `space`가 문자열을 받으므로 직렬화기를
직접 짜지 않는다 — 명세상 `space: 2`와 `space: "  "`가 동일해 **"기본 경로 바이트 동일"이 구성상
참**이고, 서로게이트 쌍·제어문자 위험을 아예 안 지난다.

`lib/survey/json-shape.ts`의 `indentOf`를 여기로 옮기고 `json-shape.ts`가 import한다
(두 벌이 되면 지표와 프로덕션이 갈린다). **그 함수는 지금 export되지 않았다** — 선언부 변경이 포함된다.

테스트를 먼저 쓴다:

- **기본 경로 동일**: `serializeJson(v)` === 지금의 `serialize(v)` (flat·중첩·배열·비ASCII·
  이스케이프 필요 문자). **첫 줄이다** — 깨지면 `clean` 고정 집합의 0.000이 무너진다.
- **들여쓰기**: 4칸·탭·3칸 원본 → 그 폭. 한 줄 파일·들여쓴 줄 없음 → DEFAULT(2칸).
- **혼합 들여쓰기**: 첫 들여쓴 줄만 보는 `indentOf`의 알려진 근사다. 그 경우에도 **고정점이
  성립**하는지 단언한다(출력이 균일해지므로 2차 관측이 같은 값).
- **끝 개행**: 원본에 끝 개행이 없어도 **출력은 정확히 1개**다. 그 불변식은 안 바뀐다.
- **키 0개**: 재생성은 `null`을 낸다. 그 경로에서 관측이 불려도 안전하다.
- **관측 실패**: 깨진 JSON·`undefined` → DEFAULT. 던지지 않는다.
- **고정점**: `observe(serializeJson(v, s)) === s`. 예외(관측 불가 → DEFAULT)를 명시적으로 단언.

**검증**: `pnpm test` green. `lib/survey/__tests__/json-shape.test.ts`가 그대로 green.

───  *(커밋: `feat(adapters): reproduce the source file's indentation`)*

## 1b. (뺄 수 있다) 한 줄 컨테이너 + 이스케이프

커스텀 직렬화기가 필요한 것은 여기뿐이다. 대상은 학습 **컨테이너 4 + 이스케이프 2**.

- **이스케이프 관측을 `Scanner.string()` 안으로 옮긴다.** 🔴 전역 정규식(`hasEscapedNonAscii`)을
  그대로 쓰면 **고정점이 깨진다** — DB 값이 리터럴 `\u00e9`를 담으면 재관측이 뒤집힌다
  (design 축별 관측 규칙).
- **`compactPaths`의 키를 세그먼트 배열로 둔다.** `.` 조인이면 점 든 키 리포 8개에서 별칭 버그다.
- **`placeholders`가 임의 JSON이다** — 객체·배열·숫자·불린·`null`을 다루고 **내부 키 순서를
  원본대로** 보존한다.
- 서로게이트 쌍(이모지)이 두 개의 `\uXXXX`로 나가고 `JSON.parse`가 원값을 되돌린다.
- 빈 `{}`·`[]`와 **루트**는 `compactPaths`에 안 들어간다.
- **부분 이스케이프 원본**은 첫 write에서 전부 이스케이프로 정규화되고 그다음이 고정점이다.

⚠️ **깨질 기존 테스트**: `lib/adapters/__tests__/adapters.test.ts`의 `expect(out).not.toContain("\\u")`
— 그 블록이 "인코딩 규칙의 집"이라 **거기를 확장**하는 것이 맞다.

**검증**: `pnpm test` green.

───  *(커밋: `feat(adapters): keep compact containers and escaped non-ascii`)*

## 2. 재생성 writer 둘이 스타일을 쓴다

- `json-catalog.writeWithErrors` — `serialize(out)` 2곳을 스타일 경유로.
- `chrome-locales.write` — 같은 교체 + **엔트리 필드 순서 다수결**. 지금 `_format`이라
  **시그니처부터 바꿔야 한다.**
- `shared.serialize` — 본문을 `serializeJson(value)` 위임으로. **시그니처·이름 불변.**
- ⚠️ **원본을 `currentFiles?.[0]`가 아니라 경로로 조회한다** — `writeWithErrors`가 이미 대상
  경로를 계산한다 (design).

**계약 테스트 개정** (`__tests__/contract.ts`):

- 2칸 단언을 **"원본을 안 주면 2칸"** 으로. **지우지 않는다.**
- 재생성 어댑터의 `formatFor`에 **4칸 원본을 든 변형**을 만들어 "주면 4칸"을 단언.
- **네거티브**: 원본에 `STYLE_DONOR_VALUE_MUST_NOT_LEAK`를 심고 출력에 나타나면 위반.

**검증**: `pnpm test` green. **`key-order-golden.test.ts`·`entry-order.test.ts`가 손대지 않고 green**
— red면 순서 층을 밟은 것이다.

───  *(커밋: `feat(adapters): regenerate writers follow the source file's formatting`)*

## 3. pull 배선 — 재생성도 원본을 받는다

- `lib/pull/run.ts` — `if (writeStrategy === "surgical")` 조건을 걷어내고 트리에 있는 로케일
  경로의 blob을 전부 읽는다.
- `lib/pull/render.ts` — 재생성도 `currentFiles`를 싣되 **원본이 없어도 계속 쓴다.**
  surgical의 `content: null`은 그대로. ⚠️ **이 갈림이 계약이다.**

⚠️ **깨질 기존 테스트가 셋이고 전부 정당한 red다** (design 불변식 표의 단서):

- `lib/pull/__tests__/run.test.ts` — `fake-client.ts`의 `getBlobText`가 **주입 안 된 blob에 던진다.**
  json-catalog 트리에 `blobs`를 하나도 안 주는 describe가 통째로 죽는다 → 픽스처에 blob 주입.
- 같은 파일의 호출열 단언 둘(`["getRefSha","getTree"]`, 8개 시퀀스).
- 같은 파일의 **테스트 이름** `"per-locale인데도 blob 내용을 읽는다 — writeStrategy가 surgical이기
  때문이다"` — 명제가 거짓이 된다. 제목을 다시 쓴다 (POSTMORTEM 2026-09-03 "이름만 정확했다").

**검증 (L1 진입점 — 이 태스크의 존재 이유)**: fake `GitClient`가 **4칸 원본**을 주고 `runPull`이
커밋에 실은 파일 바이트가 4칸인지 단언한다. 홉 a·b 중 하나만 끊겨도 red다.
추가 단언 둘: **원본 없는 로케일도 파일이 나온다**(2칸) / **수술적 어댑터는 원본이 없으면 여전히
파일을 안 낸다**.

───  *(커밋: `feat(pull): hand regenerate adapters the current file so formatting survives`)*

## 4. CLI 층

POSTMORTEM 2026-09-02가 남긴 규칙이 **"원본이 필요한 층은 pull·survey·CLI 셋"** 이다.

- `scripts/ingest.ts` — `writeFormat`에 `currentFiles`가 없어 4칸 리포에서 왕복 검증이 계속
  `⚠️ 정렬 정규화`를 찍는다. 고친 뒤엔 **거짓 경고**가 된다.
- `scripts/smoke-github.ts` — 같은 `writeStrategy` 분기를 든다.

**검증**: 4칸 픽스처 리포에 `pnpm ingest`를 돌려 **바이트 동일 ✅**가 나온다.

───  *(커밋: `fix(scripts): ingest and smoke follow the same original-content rule`)*

## 5. survey 배선 + 지표 갱신

- `lib/survey/one.ts` `writePerLocale` — 재생성도 `currentFiles`를 싣는다.
  **안 하면 8차 측정이 개선을 하나도 못 본다** (POSTMORTEM 2026-09-02).
  ⚠️ 2차 write가 **1차 결과를 원본으로 넘기므로**, 이 홉이 빠지면 write2가 DEFAULT로 떨어져
  **바이트 고정점 지표가 구조적 거짓 음성**이 된다 — "측정이 개선을 못 본다"보다 나쁘다.
- `lib/survey/types.ts`·`summarize.ts` — `indent`·`compactContainer`·`escapedNonAscii`를
  `DiffCauses`에서 **관측치로 옮긴다.** 안 옮기면 **29개**가 `clean` 분모에서 계속 빠진다.
- **`chromeFields.descriptionFirst` 신설** — 새 지표를 넣고 배선을 안 하는 것이 이 리포에서 세 번
  반복된 실패다. **8차에서 0이 아닌지 확인한다**(Midnight-Lizard ≥ 1).

⚠️ **깨질 기존 테스트**: `lib/survey/__tests__/order-metrics.test.ts`의 `BASE_INDENT_ONLY`·
`ALL_INDENT`는 **오직 들여쓰기로 diff를 만들려고 만든 픽스처**라 `toBeGreaterThan(0)`이 red가 된다
— **의도된 사망자**다. `diffRatioNonBase`가 판별력을 유지하려면 **이 기능이 안 고치는 원인**
(`emptyValues`·`dottedWithNested`)으로 픽스처를 다시 만든다. 함께 움직이는 곳: `json-shape.test.ts`,
`order-metrics.test.ts`의 `DiffCauses` 키 목록.

**검증**: `pnpm test` green + `summarize` 단위 테스트가 `clean` 분모가 넓어진 것을 단언한다.

───  *(커밋: `refactor(survey): formatting causes become observations, not diff causes`)*

## 6. L2 골든 픽스처 확장 (헬퍼 수정이 먼저)

⚠️ **`key-order-golden.test.ts`의 `roundtrip()` 헬퍼가 write에 `currentFiles`를 안 넘긴다.**
고치지 않으면 픽스처 다섯을 추가해도 전부 기본값 경로로 흘러 **픽스처만 늘고 축은 검증되지
않는다.** 헬퍼 수정 → **구현을 임시로 되돌려 red 확인** → 픽스처 추가 순서다. ARCHITECTURE §1.1이
"셋 다 red가 아니면 고친 층이 프로덕션 경로가 아니었을 가능성을 먼저 의심한다"고 적은 자리다.

픽스처 다섯: **4칸 json-catalog · 탭 json-catalog · 한 줄 엔트리 chrome · `\uXXXX` 이스케이프 ·
`description` 선행 chrome**.

각각 `lib/survey/diff.ts`의 **프로덕션 함수**로:

- `roundtripDiffRatio === 0` · `changedHunks === 0` (⚠️ `number | undefined`라 undefined 처리)
- write → read → write **바이트 고정점**
- 키 하나만 바꾸면 hunk 1

**검증**: `pnpm test` green, 네트워크 0. **이게 없으면 8차 수치가 한 번 재고 끝난다.**

───  *(커밋: `test(adapters): golden fixtures for indent, compact and escape shapes`)*

## 7. 8차 재측정 (네트워크 ~4분 × 2)

**학습과 홀드아웃 둘 다** 돌린다. 한쪽만 돌리면 수정이 만든 회귀를 못 본다.

| 게이트 | 기준 | 출처 |
|---|---|---|
| 대상 부분집합(좁힌 분모) 중앙값 | ≤ 0.10 — 기준선 **19개 · 0.9779** | §13.4 재계산 |
| **홀드아웃 같은 분모** | **표본 0개 — 게이트 없음**(사실만 기록) | 7차 실측 |
| `clean` **고정 slug 집합** | 중앙값 0.000 · 초과 0건 **유지** | spec ② |
| `clean` 새 정의(넓어진 분모) | 값을 **나란히** 적는다 (개선 확인용) | — |
| `changedHunks` 중앙값 | **내려간다** (방향만) | — |
| `chrome-locales` 학습 중앙값 | 0.096보다 **내려간다** (방향만) | §11 |
| 바이트 고정점 | 100/100 · 16/16 **유지** ← 최대 위험 | §13 |
| 왕복 의미 동일 | **99/100** · 16/16 **유지** | §13.1 |
| `surgicalEditHunks` | 학습 20/29 · 홀드아웃 2/4 **그대로** | §13.2 |
| `not-run` | 학습 9 / 홀드아웃 4 **유지** | §13 |
| `chromeFields.descriptionFirst` | **≥ 1** (새 지표 배선 확인) | — |

⚠️ **게이트를 못 맞추면 초과 리포를 전수 조사한 뒤에 목표를 손댄다.**

**검증**: `docs/ADAPTER-COVERAGE.md` **§14에 8차 회차**가 표로 들어간다.

───  *(커밋: `docs(ADAPTER-COVERAGE): eighth round after formatting preservation`)*

## 8. 실물 확인 — `/l10n-roundtrip`

⚠️ **대상은 `i18n-order-check`(json-catalog)다.** `i18n-format-check`는 `yaml-catalog`+`code-dict`
리포라 **이 기능이 한 줄도 안 지나는 경로를 검증하게 된다.** `chrome-locales`는 **실물 PR 이력이
0**이므로 이 회차에서 다루지 않고 그 사실을 기록한다.

전제(그 스킬이 "하나라도 어긋나면 중단"으로 못 박은 것):

1. 그 리포를 **4칸으로 재포맷**하고 push해 기준을 만든다.
2. `Project` 행 · `installationId` · `ACTIVE_PROJECT_SLUG` **임시 전환과 원복**.
3. `pnpm smoke:github`으로 설정 확인.

- **대조군**: 편집 0건 pull → `skipped/no-changes`.
  ⚠️ 편집이 0이면 1층이 `no-edits`로 끝나 2층이 안 돈다. `no-changes`를 보려면 **push가
  `Translation.updatedAt`을 먼저 움직였고** **열린 `l10n/sync` PR이 없어야** 한다.
- **본실험**: 키 3개만 편집 → `git diff --numstat`이 `3 3`, `grep -c '^@@'`가 3.

───  *(기록만 — 코드 변경 없음)*

## 9. 문서

- **`docs/MVP.md` §4.1** — 재생성의 "입력" 열이 `DB 상태` → `DB 상태 + 원본 파일 내용(있으면)`.
  **끝 개행 1개는 그대로 불변식이다.**
- **`docs/MVP.md` §3.3** — "재생성 어댑터는 SHA만으로 충분하다"가 거짓이 된다. 4항의 "전부 같으면
  GitHub API를 한 번도 더 부르지 않는다"도 **"blob 읽기 뒤"** 로 한정된다.
- **`docs/ARCHITECTURE.md` §1.1 · §2** — 불변식 표의 들여쓰기 행 + 배선 홉 표. §2의 "판단 기준은
  `writeStrategy === surgical`"이 **이 기능으로 없어진다** (그 축이 지던 두 번째 역할).
- **`CLAUDE.md`(+ `AGENTS.md` 미러)** — 결정성 3규칙의 "들여쓰기 2칸". ⚠️ **고치면
  `pnpm sync:agents`를 돌린다** — 안 돌리면 CI의 미러 드리프트 job이 red다.
- **`lib/adapters/types.ts`** — `writeStrategy`·`currentFiles` 주석(지금 `ts-dict`만 명시).
- **`docs/TASKS.md` §8** — 해당 항목 체크.
- **`docs/POSTMORTEM.md`** — 구현 중 회귀를 잡았으면 `/postmortem`.

**검증**: `grep -rn "2칸" docs/ CLAUDE.md`로 남은 거짓 단언을 전수 확인. `pnpm sync:agents:check` 통과.

───  *(문서별 별도 커밋)*

---

## 후속 (이번 범위 아님)

### 원본이 없는 파일에 base 스타일을 빌려준다

`renderLocaleFiles`가 재생성 + 원본 부재일 때 **base 로케일 파일의 원본**을 스타일 기증자로 넘긴다.
값은 안 읽으므로 태스크 2의 네거티브가 안전을 강제한다.

⚠️ **전제가 실재하는지 먼저 확인한다.** 로케일은 push(리포 파일)로만 DB에 들어오고,
2026-09-04의 `Locale.orphaned`가 사라진 로케일의 되살림을 이미 막았다. **"DB에만 있는 로케일"이
실제로 발생하는 경로가 0이면** spec 자신의 기준("관측 0건인 축을 선반영하는 것은 그 자체가 결함")에
걸린다.

### `\uXXXX`의 hex 대소문자 보존

원본이 `\uD55C`인데 `\ud55c`로 내면 이스케이프된 줄이 전부 diff다. 8차에서 이 원인으로 게이트를
못 맞추는 리포가 나오면 그때 별건으로 다룬다.

### CRLF·BOM

**"관측 0건"이 아니라 "미측정"이다** — 세는 카운터가 없다. 카운터를 만드는 것도 별건이다.
