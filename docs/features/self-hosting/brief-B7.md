# B7 — 릴리스 검증 (QA, self-hosting)

**QA 전용 워커다 — 제품 코드를 고치지 않는다.** main 체크아웃(`/Users/sinhyeok/code/malmoi`, dev)에서 돈다. 결함은 고치지 말고 기록해 `ask`로 보고한다(지휘자가 소유 배치에 돌려보낸다). `git push`·`/merge`·`db:deploy` 금지. prod·dev Supabase에 닿지 않는다 — 전부 로컬 컨테이너다.

Docker: 이 머신의 Colima(vz + Rosetta, `docker context colima`). linux/amd64는 `--platform linux/amd64`로. 꺼져 있으면 `colima start`.

## 범위 (tasks §7, 사용자 결정으로 OAuth·App·메일 왕복 제외)
- **입력 목록**: `/private/tmp/claude-501/-Users-sinhyeok-code-malmoi/f5cf1603-70aa-4e36-9752-284510968f3e/scratchpad/handoff-B4.md`의 "런타임 검증 목록"(정정판) 전부 + `handoff-B2.md`·`handoff-B3.md`·`handoff-B5.md`·`handoff-B6b.md`의 런타임 항목. 각 항목을 실행하고 관측 값을 남긴다.
- **SH별**:
  - SH-01 설치 — 외부 앱 없이 갈 수 있는 데까지(preflight 거부·통과, ready). 로그인·프로젝트 생성은 OAuth가 없어 **미완**으로 적는다.
  - SH-02 빈 PG17 전체 migration + bootstrap(비-superuser), 실패 경로에서 web·scheduler 미기동, DB 포트 비공개.
  - SH-06 업로드: OAuth 없이 닿는 경로가 없으면 파일 저장 경계를 컨테이너 안에서 직접(스크립트) 확인하고 무엇을 못 봤는지 적는다.
  - SH-08 스케줄러 1회 호출(시각 당긴 crontab), 잘못된 비밀은 `curl -f` 실패, 이중 실행.
  - SH-09 같은 digest를 서로 다른 두 origin(예: `a.malmoi.localhost`·`b.malmoi.localhost`, 자가 서명 인증서, `curl --resolve`)에서 — 각자의 origin이 응답·리다이렉트·well-known에 나오는지. env 비운 build, layer·history·번들에 비밀 문자열 없음.
  - SH-10 백업→빈 볼륨 복원(DB dump·업로드·키), 복원 뒤 DB 접속·자격증명 복호화(`credentials:self-hosted` verify 모드), OPERATIONS 절차대로 — 절차가 틀리면 그 줄을 기록.
  - SH-12 robots·noindex·sitemap/llms 404·Analytics 스크립트 없음·`/privacy` redirect, HSTS 하나(200·429·502), 429.
  - SH-03·04·05·07의 [수동] 왕복은 **미완** — 단, OAuth 없이 볼 수 있는 부분(위조 Host·X-Forwarded-* 응답, MCP well-known issuer/resource, 생성 워크플로 `api-url`은 MCP·화면 없이 못 보면 미완)은 본다.
- **실습 기록**: `docs/OPERATIONS.md` "셀프 호스팅 실습 기록" 표를 채운다(명령·관측 값·digest·실패, 비밀 없음). 이 문서 편집과 그 커밋 하나만 허용한다(`docs(OPERATIONS): record the first self-hosting exercise`). 미실행을 통과로 적지 않는다.
- 끝나면 컨테이너·볼륨·이미지를 치우고(`docker compose down -v`, 생성한 인증서·env는 `.scratch/` 또는 스크래치패드), main 체크아웃의 추적 변경이 그 커밋 하나뿐인지 확인한다.

## 인계
`.scratch/handoff-B7.md`: SH별 통과/실패/미완 표 + 결함 목록(재현 명령) + 정리 확인. worker_done 한 번.
