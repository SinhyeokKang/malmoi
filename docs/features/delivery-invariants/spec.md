# spec — 전달 층 불변식 (audit B1)

출처: `docs/features/audit-report/tasks.md` "## B1 전달 층 불변식"(#1·2·3·4·58·59)과 그 결정 기록(2026-09-24). 이 문서는 그 절을 **코딩 직전까지** 구체화한다.

## 사용자

**둘 다다 — 그리고 둘의 요구가 여기서는 충돌하지 않는다.**
- **번역 편집자(비개발자)**: 편집이 "보냈다"로 표시되면 실제로 리포에 갔어야 하고, 안 갔으면 화면이 그렇게 말해야 한다. 지금은 보냈다고 거짓 표시되거나(#2) Publish가 통째로 멈춘다(#3·#4).
- **개발자(OWNER)**: 리포의 새 키·삭제가 앱에 들어와야 한다. 지금은 화면에 아무 표시 없이 CI 적재가 영구 보류된다(#1).

## 문제 (관측된 사실 — 정적 감사, 재현은 tasks의 첫 단계)

1. **#1 유령 보류** — 폐기를 승인한 수동 Sync가 orphan으로 떨어뜨린 키·로케일의 셀에 편집 토큰이 남는다(`apply.ts`의 upsert가 페이로드에 없는 셀에 안 닿는다). 그 키가 코드에 되살아나면 CI push가 unorphan → 사후 재집계 1 → 롤백 → `deferred`를 **매번** 반복한다. `pendingWhere`는 orphan을 빼므로 배너·Publish·Home 어디에도 0으로 보인다. 출구가 OWNER의 수동 Sync뿐이다.
2. **#2 거짓 전달** — 수술적 어댑터(ts-dict·yaml-catalog·code-dict)에서 UI로 비운 비-base 셀은 write entry가 없어 원본 리터럴이 그대로 남는데, pull이 그 토큰을 전달 확인으로 해제한다. 다음 CI push가 리포의 옛 값으로 DB를 덮는다. 불변식 9 위반.
3. **#3 서로 잠그는 보류와 거부** — 수술적 per-locale 표면에서 base에 로케일 파일 하나가 없으면 `original-file-missing` 경고가 나고 Publish 전체가 `writer-warnings`로 거부된다. 미리보기는 그 셀을 `withoutFile`로 빼고 "나머지는 나간다"고 보인다(ARCHITECTURE §5.6.35 ↔ §3 T10 모순). 미전달 편집이 있는 동안 CI는 보류라 그 로케일이 orphan되지도 않는다.
4. **#4 무관한 경고로 영구 거부** — ts-dict write가 **쓰려는 키와 무관한** 비리터럴 프로퍼티까지 `value-not-string-literal`로 낸다. `{ a: "A", b: someFn }` 파일이면 `a` 편집이 영영 나가지 않는다.
5. **#58 거짓 주석과 orphan 셀 덮기** — `apply.ts`의 "base에 없는 키는 조용히 버린다"가 거짓이다. `idByKey`에 기존 orphan 키가 들어 있어 비-base 파일에만 남은 orphan 키의 셀이 strict upsert되고 토큰이 비워진다.
6. **#59 일시 실패가 로케일을 지운다** — 수동 Sync의 blob 다운로드가 일시 실패하면 그 로케일이 `payload.locales`에서 빠지고 `apply.ts`가 그 로케일을 orphan시킨다.

## 결정 (2026-09-24, 사용자)

- **#1**: 승인 Sync가 **승인 집합의 토큰을 전부** 비운다 — 그 표면의 적재가 확정되는 같은 tx에서, 페이로드에 셀이 있든 없든.
- **#3**: `original-file-missing`은 reject 대상에서 뺀다. 빠진 파일의 셀은 **전달 확인에서 제외해 토큰을 남기고**, 나머지는 Publish한다. 그 밖의 writer 경고는 여전히 reject다.

## 완료 조건 (검증 가능한 문장)

1. 폐기 승인 Sync가 키 `a`를 orphan시킨 뒤 `a`를 되살리는 CI push가 `applied`로 끝나고, 그 뒤 `countPending`이 0이다. (`pnpm test:projects:postgres`)
2. 폐기 승인 Sync 뒤, 그 표면에서 **승인 집합에 든 토큰**을 가진 `Translation` 행이 0이다. 승인 뒤 새로 저장된 셀(토큰이 다르다)은 토큰이 남는다. (postgres)
3. 수술적 어댑터 표면에서 비-base 셀을 비운 상태로 Publish하면 **그 셀이 "전달됨"이 되지 않는다** — 토큰이 남거나, 비우기 자체가 막힌다(설계 결정 D2 — design.md). (단위 + postgres)
4. yaml-catalog per-locale 표면에 ko 편집 + fr 편집이 있고 base에 `fr.yml`이 없을 때 Publish가 `committed`로 끝나 ko가 PR에 실리고, **ko 토큰만 해제되고 fr 토큰은 남는다.** 미리보기의 `withoutFile`과 실행에서 빠진 셀 수가 같다. (단위 + postgres)
5. `original-file-missing` 외 writer 경고(예: json-catalog 접두 충돌)가 있으면 Publish는 여전히 `skipped/writer-warnings`다. (단위)
6. ts-dict 파일 `{ a: "A", b: someFn }`에서 `a`만 편집한 write가 경고 0건을 낸다. 편집 대상 키가 비리터럴이면 그 키의 경고는 그대로 난다. (단위)
7. CI push 페이로드의 비-base 파일에 base에 없는 키 `z`(기존 orphan)가 있어도 `z`의 셀은 upsert되지 않고 토큰이 그대로다. (postgres)
8. 수동 Sync에서 fr 파일 blob 다운로드가 실패해도 fr `Locale`이 orphan되지 않는다. 결과는 `partial-import`다. (단위 + postgres)
9. prod·dev DB에서 **orphan 키·로케일 위의 토큰 보유 셀 수**를 읽기 전용으로 센 결과가 기록되고, 0이 아니면 정리 경로가 적용돼 0이 된다. (수동 — tasks T0)
10. ARCHITECTURE §0 불변식 1·9 문단, §3 T10 문단, §5.5.2, §5.6.35가 위 동작과 모순 없이 서술된다. (`/push` 4단계 · `/doc-check`)

## 비목표

- **#2 해법 중 "수술적 writer가 키를 삭제하는 기능"** — 설계 결정 D2에서 고르지 않으면 이번에 하지 않는다(구조 변경이 §1.4 표현 보존 계약 전체를 건드린다).
- `write-locale-object-missing`(ts-dict 로케일 객체 부재)의 셀 단위 처리 — 여전히 reject다. multi-locale 파일은 키→파일 대응이 없어 셀 단위 제외가 로케일 전체 제외로 번지고, 그러면 다른 파일로 전달된 편집까지 pending이 남는다.
- multi-locale `original-file-missing`(`render.ts:129`) — 경로가 트리에서 오므로 실무상 도달하지 않는다. `writeStrategy` 판정 정정(#55)은 B7a다.
- 감사의 인접 항목 #12(PR base)·#51~57·#60·#61·#63 — B7. 단 #61(`apply.ts:133` 거짓 주석)은 이 기능이 재집계의 존재 이유를 바꾸면 여기서 같이 고친다.
- Publish 결과 화면의 **새 레이아웃** — 문구 한 줄 추가만 한다(design D3). 시각 규칙 변경은 B6.
