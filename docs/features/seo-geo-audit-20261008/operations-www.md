# www 도메인 변경안 — 실행 전

2026-10-08 읽기 전용 조회 결과:

- Vercel 프로젝트 `malmoi`에는 `mal-moi.com`(production)·`dev.mal-moi.com`(dev)만 등록되어 있다.
- `www.mal-moi.com`은 DNS 조회 결과가 없다.
- DNS 권한 서버는 가비아의 `ns.gabia.co.kr`, `ns.gabia.net`, `ns1.gabia.co.kr`이다. Vercel의 DNS API로 가비아 레코드를 바꿀 수 없다.
- 기존 apex·dev 설정과 인증 허용 호스트는 바꾸지 않는다.

원하는 최종 상태:

1. malmoi 프로젝트 도메인에 `www.mal-moi.com`을 추가하고 redirect=`mal-moi.com`, redirectStatusCode=308로 설정한다.
2. Vercel이 이 도메인에 실제 제시하는 CNAME 대상 값을 확인한다. 추측한 값을 가비아에 먼저 넣지 않는다.
3. 가비아에서 호스트 `www`의 CNAME을 그 값으로 추가한다. 기존 충돌 레코드가 있으면 작업을 멈추고 현재 값을 확인한다.
4. 도메인 검증·인증서 발급 뒤 `https://www.mal-moi.com/docs/faq?ref=a`가 경로와 쿼리를 유지한 apex 308인지 확인한다.

이 변경은 프로덕션 도메인 설정이므로 `/orchestrate`의 dev 배포와 분리한다. 현재는 **설정 변경 없음**이며 사용자 승인과 가비아 접근이 필요하다. main 코드 배포나 `/merge`를 대신하지 않는다.
