# spec — 전달 층 불변식 (audit B1)

출처: `docs/features/audit-report/tasks.md` "## B1 전달 층 불변식"(#1·2·3·4·58·59)과 그 결정 기록(2026-09-24), 그리고 같은 날 `/feature-review`(CPO·CDO·CTO·QA)가 더한 결정. 이 문서는 그 절을 **코딩 직전까지** 구체화한다.

**범위 게이트**: PRODUCT §4.2 비범위에 걸리는 항목 없음 — 병합·충돌 UI·승인 워크플로·동시 편집 모두 해당 없고, `withheld`는 수이지 값 비교가 아니다. ARCHITECTURE §0 "병합 없음"과 충돌 없음(design "불변식 영향").

## 사용자

**둘 다다.**
- **번역 편집자(비개발자)**: 편집이 "보냈다"로 표시되면 실제로 리포에 갔어야 하고, 안 갔으면 화면이 그렇게 말해야 한다. 지금은 보냈다고 거짓 표시되거나(#2·C) Publish가 통째로 멈춘다(#3·#4).
- **개발자(OWNER)**: 리포의 새 키·삭제가 앱에 들어와야 한다. 지금은 화면에 아무 표시 없이 CI 적재가 영구 보류될 수 있다(#1).
- ⚠️ **둘이 부딪치는 자리가 하나 남는다** — 보내지 못한(보류된) 편집이 남아 있는 동안 CI 적재는 계속 `deferred`다(§0 불변식 1의 보류 판정은 pending 수 하나). 편집자 쪽(편집을 잃지 않는다)을 우선하고, 그 대가를 완료 조건 11에 적는다. 풀리는 길은 파일 복구 · OWNER Revert(D3이 살린다) · 폐기 승인 Sync다.

## 문제 — 정적 감사로 확인한 결함 (운영 발생 0 — tasks T0)

2026-09-24 T0 실측: dev·prod 모두 해당 셀 0, 최근 14일 `deferred` 0. 우선순위(출시 차단)는 발생 빈도가 아니라 **결함의 구조**가 정당화한다 — 한 번 나면 무표시로 영구화된다.

1. **#1 유령 보류** — 폐기를 승인한 수동 Sync가 orphan으로 떨어뜨린 키·로케일의 셀에 편집 토큰이 남는다(`apply.ts`의 upsert가 페이로드에 없는 셀에 안 닿는다). 그 키가 코드에 되살아나면 CI push가 unorphan → 사후 재집계 1 → 롤백 → `deferred`를 **매번** 반복한다. `pendingWhere`는 orphan을 빼므로 배너·Publish·Home 어디에도 0으로 보인다.
2. **#2 거짓 전달(비우기)** — 수술적 어댑터(ts-dict·yaml-catalog·code-dict)에서 UI로 비운 비-base 셀은 write entry가 없어 원본 리터럴이 그대로 남는데, pull이 그 토큰을 전달 확인으로 해제한다. 다음 CI push가 옛 값으로 DB를 덮는다. 불변식 9 위반.
3. **C 거짓 전달(ts-dict 빈 자리)** — ts-dict write는 파일에 **있는** 프로퍼티만 돈다(`ts-dict.ts:294-297`). fr 객체에 아직 없는 키를 번역하면 파일은 그대로인데 토큰이 해제된다. code-dict·yaml은 삽입하거나 `write-slot-missing`을 보고하는데 ts-dict만 조용하다. #2와 같은 부류.
4. **#3 서로 잠그는 보류와 거부** — 수술적 per-locale 표면(yaml-catalog·code-dict)에서 base에 **비-base** 로케일 파일 하나가 없으면 `original-file-missing` 경고로 Publish 전체가 `writer-warnings`로 거부된다. 미리보기는 그 셀을 `withoutFile`로 빼고 "나머지는 나간다"고 보인다(ARCHITECTURE §5.6.35 ↔ §3 T10 모순).
5. **#4 무관한 경고로 영구 거부** — ts-dict write가 쓰려는 키와 무관한 비리터럴 프로퍼티까지 `value-not-string-literal`로 낸다. `{ a: "A", b: someFn }` 파일이면 `a` 편집이 영영 나가지 않는다.
6. **#58 orphan 셀 덮기** — `apply.ts:312`의 "base에 없는 키는 조용히 버린다"가 거짓이다. `idByKey`에 기존 orphan 키가 들어 있어, 비-base 파일에만 남은 orphan 키의 **토큰 없는** 셀은 값이 덮이고 `updatedBy`가 비고, 행이 없으면 INSERT된다. (토큰 있는 셀은 CI 경로의 upsert 가드가 이미 막는다.)
7. **#59 일시 실패가 로케일을 지운다** — 수동 Sync는 첫 다운로드 결과로 포맷을 재탐지하고(`lib/import/surface.ts:33-34`) 재시도(:43-45)는 blob만 채운다. 그래서 fr blob 다운로드가 한 번 실패하면 **재시도가 성공해도** fr이 `payload.locales`(`lib/push/payload.ts:131`)에서 빠지고 `apply.ts`가 fr을 orphan시킨다.

## 결정 (2026-09-24, 사용자)

| # | 결정 |
|---|---|
| #1 | 승인 Sync가 **이번 적재로 orphan이 된 승인 셀**의 토큰만 비운다(그 표면 적재 확정 tx). 빈 값·실패 파일 셀은 지금처럼 토큰이 남아 `remainingEdits`로 보인다 — 처음엔 "승인 집합 전부"였으나, 리포에 값이 없던 셀의 편집값이 pending 아닌 채 남아 다른 Publish에 조용히 실리는 경로 때문에 `/feature-review`에서 좁혔다 |
| #2 | 수술적 표면의 **비-base 비우기는 저장 단계에서 거부**한다. 키 단위 거부(저장은 전부 계획한 뒤 쓴다), 공백만의 입력도 정규화 뒤 빈 값이라 거부 |
| #3 | 수술적 per-locale 표면의 **비-base** `original-file-missing`은 reject 대상에서 뺀다. 그 로케일의 셀은 **보류**(전달 확인 제외, 토큰 유지)하고 나머지는 Publish한다. **base 파일 부재는 여전히 reject**(설정 오류다). 그 밖의 writer 경고도 reject다 |
| C | ts-dict의 "wanted인데 로케일 객체에 없는 키"는 **그 셀만 보류**한다 |
| 결과 | Publish 결과의 수는 **실제로 실린 수**다. 보류 한 줄을 붙이고, 실린 셀 0 + 보류만이면 "No changes"가 아니라 기존 **Not sent** 틀을 쓴다 |
| 기록 | 보류 수를 Publish 사건(`ProjectEvent`) payload에 싣고 Logs 상세에 한 줄 보인다 — 야간 cron도 같은 경로다 |
| Revert | 보류 셀이 있어도 표면 전달 확인은 쓴다. 보류 셀의 기준 행 revision만 새로 찍어 OWNER Revert가 산다 |

## 완료 조건 (검증 가능한 문장)

1. 폐기 승인 Sync가 키 `a`를 orphan시킨 뒤, `a`를 되살리는 CI push가 `applied`로 끝나고 그 뒤 `countPending`이 0이다. (postgres)
2. 폐기 승인 Sync 뒤, 그 표면에서 **이번 적재로 orphan이 된 승인 셀**의 토큰이 0이다. 같은 픽스처에서 **orphan 아닌 승인 셀 중 페이로드가 안 덮은 셀**(fr 파일에 그 키 없음)은 토큰이 남고 `remainingEdits`가 그 수다(N > 0 — 기존 `repository-import.integration.ts:342-351` 그대로 green). 승인 뒤 새로 저장된 셀도 토큰이 남는다. (postgres)
3. ts-dict·yaml-catalog·code-dict 표면의 비-base 셀에 `""`(또는 공백만)를 저장하면 `cannot-clear`로 거부되고 **그 키의 어떤 셀도 쓰이지 않는다**(행·값·토큰 불변). base 셀 `""`와 재생성 표면(json-catalog·chrome-locales)의 비-base `""`는 기존대로 저장된다. (postgres + jsdom)
4. yaml-catalog 표면에 ko·fr 편집이 있고 base에 `fr.yml`이 없을 때 Publish가 `committed`로 끝나 ko가 PR에 실리고, **ko 토큰만 해제되고 fr 토큰은 남는다.** 결과는 "1 change"로 말하고 보류 한 줄이 붙는다. 미리보기(pending 200행 이하)의 `withoutFile`과 실행의 `withheld`가 같다. (단위 + jsdom)
5. 같은 상황에서 **base 파일**(`en.yml`)이 없으면 여전히 `skipped/writer-warnings`다. json-catalog 접두 충돌도 여전히 `skipped/writer-warnings`다. (단위)
6. 보류 셀만 있고 실린 셀이 0이면 결과 화면이 "No changes"가 아니라 Not sent 틀이다. (jsdom)
7. ts-dict 파일 `{ a: "A", b: someFn }`에서 `a`만 편집한 write가 경고 0건이다. 편집 대상 키가 비리터럴이면 그 키의 경고는 그대로 난다. fr 객체에 없는 키 `z`를 번역하면 `z`의 fr 셀이 보류되고(토큰 유지) 나머지는 나간다. (단위)
8. CI push 페이로드의 비-base 파일에 base에 없는 키 `z`(기존 orphan, 토큰 없음)가 실려 있어도 `z` 셀의 값·`updatedBy`·행 존재가 불변이다. 같은 파일의 base 키 셀은 덮인다(짝). (postgres)
9. 수동 Sync에서 fr blob 첫 다운로드가 실패하면: 재시도도 실패 → fr `Locale.orphaned = false` · `partial-import` / 재시도 성공 → fr 적재 · `orphaned = false`. (단위 + postgres)
10. 보류 셀이 있는 Publish 뒤에도 OWNER의 `Revert to last sent`가 그 표면에서 열리고, 보류된 fr 셀도 마지막 전달 값으로 되돌릴 수 있다. (postgres — `delivery-confirm.integration.ts`)
11. **대가**: 보류 셀이 남아 있는 동안 CI push는 `deferred`다. 파일 복구 뒤 Publish, OWNER Revert, 폐기 승인 Sync 중 하나로 보류 셀이 0이 되면 다음 CI push가 `applied`다. (postgres)
12. Publish 사건 payload와 Logs 상세에 보류 수가 보이고, 결과 화면과 같은 수다. (단위 + jsdom)
13. 정본이 위 동작과 모순 없이 서술된다 — ARCHITECTURE §0-1·§0-9, §3 T10 문단, §5.5.2, §5.6.35, §5.8(확인 등식을 깨는 쓰기 목록) · PRODUCT §3(편집 규칙: 수술적 표면 비우기 불가) · §7.6(Publish 결과 상태). (`/push` 4단계)

## 비목표

- **명시적 빈값 export(PRODUCT §10 "빈값·누락 셀의 strict 적재 보완")** — 열지 않는다. D2의 비우기 거부는 **그 수단이 생기면 풀릴 임시 규칙**이고 PRODUCT에도 그렇게 적는다. 수술적 writer의 키 삭제(design D2 (c))도 같은 이유로 비목표다.
- **배포 전 잔존 유령 토큰** — D1은 승인 집합(`pendingWhere` 기준이라 이미 orphan인 셀을 뺀다) 안에서만 돈다. 기존 잔존분은 대상이 아니고, T0에서 0으로 확인했다.
- `write-locale-object-missing`(ts-dict 로케일 객체 통째 부재)의 셀 단위 처리 — 여전히 reject. ts-dict는 multi-locale이라(`ts-dict.ts:314`) 키→파일 대응 없이 로케일 전체로 번진다. (C의 "빈 자리"는 키 좌표가 정확해서 다르다.)
- multi-locale `original-file-missing`(`render.ts:129`) — 경로가 트리에서 오므로 실무상 도달하지 않는다. `writeStrategy` 판정 정정(#55)은 B7a.
- 미전달 **배너** 문구 — B4(용어 통일)와 함께. 배너가 파일 존재를 세려면 화면 로드마다 GitHub 트리를 읽어야 한다.
- 감사 인접 항목 #12(PR base)·#51~57·#60·#63 — B7. 단 #61(`apply.ts:133` 거짓 주석)은 이 기능이 재집계의 존재 이유를 바꾸면 같이 고친다.
