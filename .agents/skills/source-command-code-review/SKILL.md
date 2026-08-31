---
name: "source-command-code-review"
description: "변경된 코드를 시급도별로 보고. 리포트 전용 — fix·빌드·커밋 안 함."
---

# source-command-code-review

Use this skill when the user asks to run the migrated source command `code-review`.

## Command Template

변경분을 정적으로 리뷰한다. **리포트 전용** — 수정은 `/refactor`가 한다.

## 사용

- `/code-review` — 커밋됐지만 아직 push되지 않은 변경분(`git diff @{u}..HEAD`) + 미커밋 변경.
- `/code-review <경로|커밋범위>` — 대상 명시.

## 절차

1. **대상 확정** — `git diff @{u}..HEAD`, `git status`, 필요하면 `git diff`. 변경 파일 목록부터 파악.
2. **`docs/POSTMORTEM.md` grep** — 변경 영역으로 검색. 과거에 밟은 함정을 이번 diff가 다시 밟는지 **명시적으로 확인**한다. 이게 이 스킬의 가장 큰 값이다.
3. **`docs/ARCHITECTURE.md` 대조** — 코어 로직이 diff에 걸렸으면 불변식 위반을 1순위로 본다.
4. **아래 체크리스트로 훑고** 발견을 시급도별로 분류.

## 체크리스트 (이 프로젝트 특화)

### 🔴 즉시 수정 — 조용히 깨지는 부류

- **export 결정성 붕괴**: `localeCompare` 사용, 끝 개행 누락/중복, DB 순서 의존(`ORDER BY` 없는 쿼리 결과로 객체 조립), `orphaned` 키가 export에 섞임
- **blob SHA 오산**: `content.length`(문자 수)를 바이트 수로 사용 — 한글·프랑스어에서 즉시 틀린다
- **`base_tree` 누락**: 리포의 나머지 파일이 전부 삭제된 커밋이 만들어진다
- **`[skip-l10n]` 누락**: push↔pull 무한 루프
- **parents가 base head가 아님**: 3-way merge가 필요해져 코어 원칙이 무너진다
- **인증 경계 혼입**: OAuth 토큰으로 커밋, App 토큰으로 사용자 식별, `PUSH_TOKEN`·`CRON_SECRET` 미검증 엔드포인트
- **fail-open 인가**: `AUTH_ALLOWED_ORG`가 비었을 때 통과시키는 코드
- **push가 번역 값을 씀**: 원칙 위반. 키·원문·`orphaned`·`needsReview`까지만
- **키 삭제**: `orphaned` 대신 `DELETE` — 되돌릴 수 없다
- **시크릿 노출**: 로그·에러 메시지·클라이언트 번들에 토큰/PEM/DB URL

### 🟡 수정 권장

- **순수 함수에 I/O 혼입** — 테스트 불가능해진다
- **`any`·타입 단언으로 경계 무력화**, 인덱스 접근 undefined 미처리
- **에러 조용히 삼킴** — `catch {}` 또는 기본값 폴백으로 실패를 숨김
- **환경변수 산발 접근** — 누락을 런타임까지 숨긴다
- **`.env.example` 미갱신** — 새 환경변수를 읽는데 문서화 안 됨
- **`docs/MVP.md`·`ARCHITECTURE.md`와 코드 불일치** — 스펙이 거짓이 된 상태
- **비범위 기능 슬며시 유입** (MVP.md §7)
- **N+1 쿼리** — 키가 수백 개인 리스트 화면에서 체감된다
- **날짜를 로컬 타임존으로 저장**

### ⚪ 참고

- 네이밍·주석 밀도, 중복 추출 여지, 테스트 케이스 보강 여지

## 리포트

```
🔍 code-review: <대상>
범위: <파일 n개, +a/-b>
POSTMORTEM 대조: <재발 위험 항목 또는 해당 없음>

🔴 <n>건
1. <file:line> — <한 줄 요약>
   왜 문제인가: <실패 시나리오 — 어떤 입력/상황에서 어떻게 깨지는가>
   제안: <수정 방향>

🟡 <n>건
...

⚪ <n>건
...

다음: /refactor (🔴/🟡 있으면) / 없으면 /push
```

**🔴은 "실패 시나리오"를 반드시 채운다.** 구체적 입력·상황을 못 쓰면 그건 🔴이 아니라 🟡이나 ⚪다.

## 금지 사항

- **코드 수정 금지.** 리포트만. 발견을 고치고 싶으면 `/refactor`를 호출한다.
- **커밋·빌드 금지.**
- **시급도 인플레 금지** — 실패 시나리오를 못 쓰는 항목을 🔴로 올리지 않는다. 전부 🔴이면 아무것도 🔴이 아니다.
