# mockup-viewport-container — 태스크

[스펙](spec.md) · [설계](design.md). 줄 번호는 검수 시점(2026-10-11) 기준 — 착수 때 다시 찾는다.

- [ ] **T1 — 순수 테스트 먼저(red)** `test(mockup-viewport-container): …`
  - **지우거나 다시 쓸 기존 단언**(순환 전용 — 이것을 걷지 않으면 T2가 green이 될 수 없다): `lib/landing/__tests__/stage.test.ts` — :71-83 · :237-259(:236 `it.each` "캡션 자리가 상태와 무관"은 **반대 단언**으로 뒤집는다) · :269-270(`perScene` 1.5) · :275-369(sceneAt D/T/M 구간 전체) · :409-450 · :481-508 · :554-608 · :613-664(`live` 구간 집합) · :666-686. :409·:421·:510·:520에는 `device` 입력을 더한다.
  - **새 단언**(수치로):
    - `deviceForViewport` 네 조합 — (T,T) D · (F,T) T · (F,F) M · 모순 (T,F) D.
    - `STATE_CANVAS_H` = [900, 900, 776] · `fitScale`·`frame`이 `device` 없이 타입 오류(`// @ts-expect-error`).
    - `chromeW` = min(byWidthOf(Wk),1)·Wk — 1023×768 T에서 캡션 최대 폭 ≤ 프레임 폭.
    - 캡션 자리 = 그 상태 높이(y = (h − Hk·scale − chrome)/2).
    - 씬 안 폭·높이 불변 — 세 device × q 0 → 끝을 0.0005 간격으로 훑어 `canvasW`·`canvasH`가 상수.
    - `PLAY.perScene` 1 · `pinnedSpan()` 5 · `trackHeight(H)` = H·6 · HOLD 경계 f = 0.6 직전 t 0 / 직후 t > 0 · `h = min(f/0.6, 1)`의 배지 문턱(h .5 ↔ f .3).
    - 결정성 · 역스크럽 · reduced-motion(전환 한가운데 단절).
    - **#239 스윕을 device 셋과 곱한다** — 기존 격자(`stage.test.ts:455` PAGES 6개 · q 0.0005 · 캡션 한 줄/두 줄 · reduced) × device 3에서 프레임 ⊂ 스크롤러. 상한 기준은 `fitScale({ device }).y`(지금 :466의 M `slotTop` 기준을 고친다).
    - `pinnable`은 device와 독립 — 568×320(M) 하한 근처 사례.
  - `lib/shell/__tests__/breakpoint.test.ts`: `sm` 쿼리 상수가 Tailwind `--breakpoint-sm`(40rem)과 같다.
  - 검증: 새 단언 red, 지운 단언 0.
- [ ] **T2 — `lib/landing/stage.ts` 단순화(green)** — design §1·§3(걷기·남기기 목록 그대로, 순환 전제 주석 갱신 포함). 검증: `pnpm test lib/landing` green · `rg -n "TO_T|TO_M|CROSS|CONTENT_END|deviceAt|live" lib/landing/stage.ts` 0.
- [ ] **T3 — 셸 배선** `feat(…): pick the landing mockup frame by viewport`
  - **첫 단계 — 테스트 스텁 교체**: `components/__tests__/landing-stage.test.tsx:57`의 matchMedia 스텁이 reduce 밖 질의에 `false`를 돌려줘 새 규칙에선 기본이 M이 된다. **기본은 `WIDE_QUERY` 참(D)**, 세 상태는 개별 케이스에서 바꾼다. `components/__tests__/landing-mockup.test.tsx:58`(전부 `false` — :91의 `"1440px"` 단언이 뒤집힌다)도 같다. `vitest.setup.ts`엔 matchMedia 처리가 없다.
  - `lib/shell/breakpoint.ts`에 `SM_QUERY` + 머리 주석 "JS 다섯 자리". `stage.tsx`가 `WIDE_QUERY`·`SM_QUERY`를 import, 틱이 `.matches`를 읽는다(change 리스너 없음). 재생 위치 보존 조건 `H` 또는 `stageTop` 변화. 정적 흐름 `--landing-canvas-w`·`-h`. `live`·`data-idle` 제거. 순환 전제 주석·`app-frame.tsx:50` 갱신.
  - `landing-stage.test.tsx` 지우거나 다시 쓸 단언: :159-202 · :209-253(`live`/`data-idle`) · :292-300 · :322-354. :337·:458(캡션 최대 폭 = 프레임 폭)은 device 케이스로.
  - **새 jsdom 케이스**: 스텁 세 상태 → 프레임 `style.width` 1440/786/393 · `style.height` 900/900/776 · **H 고정 · `stageTop`만 이동 · 경계 넘김 → 전후 `data-scene`·씬 안 진행 동일**(V-03 — 기존 :337은 STAGE_TOP 고정이라 못 본다) · 고정 구간 한가운데 device 변경 → 즉시 폭 전환 · reduced-motion 토글과 device 변경이 한 틱에 같이 · device 고정 H만 변경 · 정적 ↔ 고정 왕복 중 device 변경(`--landing-canvas-w` 갱신) · `clientWidth` 1009 + `WIDE_QUERY` 참 → D(스크롤러 폭으로 판정하지 않음) · 첫 틱이 `data-ready` 전에 상태 폭을 쓴다.
  - 검증: `pnpm test` green · `pnpm typecheck` green.
- [ ] **T4 — 게이트** `pnpm gate --base dev`. 검증: exit 0 — 출력을 `| grep`·`| head`로 거르지 않는다(CLAUDE.md 게이트 경고).
- [ ] **T5 — 정본**(docs 커밋 — 문서별 `docs(DESIGN): …` · `docs(PRODUCT): …`) — design §5 전부(DESIGN §6.615 여섯 행 · DESIGN §5 · PRODUCT §4.1 예외 등재). 검증: §6.615에서 `rg -n "그릇 순환|\.18|\.74|1\.5|data-idle|live 레이어|M 정지로 끝난다"` 0 · "뷰포트 그릇" 행 존재 · DESIGN §5·PRODUCT §4.1에 `sm` 예외 문장 존재.
- [ ] **T6 — 런타임**(ego-browser + CDP 리사이즈 — 메모리 ego-qa-measurement-traps, 수동 확인). 뷰포트 1440·**1030(스크롤바 보임)**·1024·1023·768·640·639·375에서:
  - 프레임 `[data-landing-frame]` `style.width` = 1440/1440/1440/786/786/786/393/393 · 높이 900/…/776.
  - 모든 q에서 프레임 rect ⊂ 스크롤러 rect · 고정 재생 내내 폭 불변.
  - 1024↔1023 · 640↔639 왕복 리사이즈 전후 `data-scene`·진행 칸 동일(V-03).
  - V-08 네 뷰포트 누락·겹침 0 · M 776에서 다섯 씬(특히 ③ 번역 목록 · ④ Publish 시트) 내용 잘림 0.
  - 배율 표 값(design §5) 실측 대조.
  - 검증: 위 항목 전부 기록 · 실패는 BugShot 이슈.
- [ ] 끝나면 이 디렉터리를 지운다(T5가 결론을 옮긴 뒤).
