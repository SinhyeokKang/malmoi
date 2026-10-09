# 업데이트·백업·복원

한 번에 한 릴리스씩 업데이트하고, 데이터베이스·업로드·키를 함께 백업하며, 데이터를 잃지 않고 키를 회전합니다.

## 새 릴리스로 업데이트 {#update}

업데이트는 순서대로 한 번에 한 릴리스씩, 최신 릴리스로만 합니다. 릴리스를 건너뛰는 업데이트는 아직 검증하지 않았습니다. 마이그레이션은 web을 다시 만들기 전에 끝나야 낡은 앱이 새 데이터베이스를 읽는 일이 없습니다. 새 버전이 확인을 통과할 때까지 외부 트래픽과 스케줄러는 꺼 둡니다. 그래야 백업으로 되돌아가더라도 그사이 누가 저장한 내용을 잃지 않습니다.

1. 앱을 멈추고 [백업](#backup) 명령으로 백업을 만들고, `backup ok`가 찍혔을 때만 다음으로 넘어갑니다. 끝난 뒤 `docker compose up -d`를 실행하지 않습니다.
2. 새 태그의 `deploy/`를 지금 것과 비교해(`.env`는 그대로 둡니다) Compose·nginx·스케줄러의 변경을 반영하고, `.env`의 `MALMOI_IMAGE`를 새 태그와 digest로 바꿉니다. `deploy/scheduler/`가 바뀌었다면 `docker compose build scheduler`를 실행합니다.
3. `docker compose pull --ignore-buildable`을 실행합니다. 스케줄러 이미지는 로컬에서 빌드해 레지스트리에 없으므로 `--ignore-buildable` 없이는 명령이 실패합니다.
4. `docker compose run --rm migrate`를 실행합니다. 새 마이그레이션을 적용하고 bootstrap을 다시 돌리며, 여러 번 돌려도 안전합니다. 예전 `up`에서 돈 migrate를 믿지 마세요.
5. 클라우드 제공업체의 방화벽에서 80·443 포트를 내 IP 주소로만 제한합니다. Docker가 공개한 포트는 서버 자체의 방화벽을 우회하므로 서버 방화벽만으로는 부족합니다.
6. `docker compose up -d --force-recreate --no-deps web proxy`를 실행합니다. `--no-deps`가 migrate를 다시 돌리지 않게 하고, 스케줄러는 멈춘 채로 둡니다.
7. 내 브라우저로 새 버전을 확인합니다. `docker compose ps`에서 web이 healthy이고, 로그인이 되고, 번역 화면이 열리고, 업로드한 사진이 보이고, `docker compose logs web --since 5m`에 `EACCES`나 `preflight:` 줄이 없어야 합니다. 아직 게시하지 마세요.
8. 모두 정상이면 `docker compose up -d --no-deps scheduler`를 실행하고 80·443 포트를 다시 모두에게 엽니다. 1단계 이후 시작된 워크플로 실행은 서버에 닿지 못했으므로 Run workflow로 다시 실행합니다.
9. 문제가 있으면 포트를 계속 제한해 둡니다. 이전 버전이 새 데이터베이스와 함께 동작한다고 확인된 경우에만 이전 `MALMOI_IMAGE`와 2단계 전의 `deploy/` 파일로 되돌려 4단계와 6단계를 다시 합니다. 그렇지 않으면 1단계의 백업을 데이터베이스·이미지·키 모두 함께 복원합니다([복원](#restore)). 되돌리는 마이그레이션은 없습니다.

## 백업 {#backup}

백업은 앱을 멈춘 상태에서 함께 뜬 셋입니다. 데이터베이스 덤프, 업로드 볼륨, `.env`(키)입니다. 하나라도 시점이 다르면 복원본이 맞지 않습니다. 데이터베이스 행이 업로드 파일을 가리키고, 암호화된 값은 그 시점의 키로만 열립니다. 백업은 리포지토리 체크아웃 밖에 두고 서버 밖에도 사본을 둡니다. 권한은 파일 600, 디렉터리 700입니다. 명령은 `deploy/` 디렉터리에서 root로 실행합니다. 업로드 압축 파일은 컨테이너가 root로 쓰고, `/var/backups`도 root가 필요합니다. 괄호 안은 처음 실패한 명령에서 멈추므로, 마지막에 `backup ok`가 찍혔을 때만 백업을 믿습니다.

이 블록은 독립적으로 실행하세요. `if`·`&&`·`||`로 감싸면 실패 시 중단이 무효가 될 수 있습니다.

```sh
( set -eu
  STAMP=$(date -u +%Y%m%dT%H%M%SZ); B=/var/backups/malmoi/$STAMP
  docker compose stop scheduler proxy web            # 새 트래픽과 쓰기를 멈춘다. postgres만 남는다
  mkdir -p "$B"
  chmod 700 "$B"
  docker compose exec -T postgres pg_dump -U postgres -d malmoi -Fc > "$B/db.dump"
  docker compose exec -T postgres pg_restore -l < "$B/db.dump" > /dev/null   # 덤프를 다시 읽을 수 있는지
  docker run --rm -v malmoi_uploads:/data:ro -v "$B":/backup alpine:3.22 tar czf /backup/uploads.tar.gz -C /data .
  cp .env "$B/env"
  cp -r certs nginx "$B/"
  { echo "taken_at=$STAMP"; grep '^MALMOI_IMAGE=' .env
    docker compose exec -T postgres psql -U postgres -d malmoi -Atc 'select count(*), max(migration_name) from _prisma_migrations'
  } > "$B/manifest.txt"
  (cd "$B" && sha256sum db.dump uploads.tar.gz env >> manifest.txt)
  chmod -R go-rwx "$B"                              # 마지막에 — manifest까지 권한이 걸린다
  echo "backup ok: $B"
)
```

- manifest에는 비밀이 없습니다. 시각, 이미지, 마이그레이션 상태, 체크섬만 담깁니다.
- 정기 백업이면 `docker compose up -d`로 전부 다시 띄웁니다. [업데이트](#update)의 첫 단계로 뜬 백업이면 앱을 멈춘 채로 둡니다.
- 업로드 볼륨에 쓰는 것은 web 컨테이너 하나뿐이어야 합니다. 다른 서비스에 마운트하거나 서버의 다른 프로세스가 쓰게 하지 마세요. 쓰는 주체가 둘이면 web이 볼륨 밖의 파일을 내보내게 만들 수 있습니다. 백업은 읽기 전용으로 읽고, 복원은 web을 멈춘 동안에만 씁니다.
- 키는 덤프와 함께 보관합니다. PII 키가 없으면 이메일과 이름을, 토큰 키가 없으면 GitHub 연결을 복구할 수 없습니다. 키를 회전한 뒤에도 옛 키를 남겨 두세요. 예전 백업이 그 키를 요구합니다.
- `log_statement`(`ddl`이나 `all`)나 `track_utility`를 켠 `pg_stat_statements`를 쓰고 있다면 서버 로그나 통계에 `CREATE ROLE … PASSWORD` 문이 남습니다. 기본 postgres 이미지는 둘 다 꺼져 있으니, 켰다면 bootstrap이 도는 동안 끄세요.
- 복원이 성공해야 백업입니다. 아래 복원을 다른 서버에서 스케줄러를 끈 채 한 번 해 보세요. 그곳에서 실제 리포지토리에 쓰는 동작(게시, 야간 동기화)은 테스트 리포지토리로 제한합니다.

## 빈 볼륨에 복원 {#restore}

새 서버에서, 또는 `docker compose down -v` 뒤에 백업을 되살립니다. 키는 백업 시점의 것이어야 합니다. 다른 키로는 암호화된 값이 열리지 않습니다.

복원 연습과 격리 검증은 운영 중인 서버가 아닌 다른 서버에서 합니다. `deploy/compose.yaml`이 Compose 프로젝트 이름을 고정하므로, 같은 서버에서는 디렉터리를 복사해도 운영 중인 `malmoi_pgdata`·`malmoi_uploads` 볼륨을 그대로 씁니다. 2·4단계가 운영 데이터 위에서 돌고 `down -v`는 그 데이터를 지웁니다. 꼭 같은 서버에서 해야 한다면 모든 Compose 명령에 `-p <another name>`(`<another name>`은 운영과 다른 프로젝트 이름)을 붙이고, 4단계의 볼륨 이름을 `<that name>_uploads`(그 이름 + `_uploads`)로 바꾸고, 프록시 포트를 다르게 줍니다. 하나라도 빠지면 운영 설치본을 건드립니다.

1단계 전에 클라우드 제공자의 방화벽에서 프록시가 공개하는 모든 포트를 본인 IP 주소로 제한하세요. 기본 설정은 80·443이고, 격리 복원용으로 포트를 바꿨다면 그 포트도 제한해야 합니다. Docker가 공개한 포트는 서버 자체 방화벽을 우회하므로 그 방화벽만으로는 부족합니다. 로그인 확인 중에도, 8단계까지 이 제한을 유지하세요. 검토 전에 되살아난 자격증명으로 외부에서 접근할 수 없어야 합니다.

1. 같은 태그의 `deploy/`를 받아 백업의 `env`를 `deploy/.env`로 복사하고 `certs/`와 `nginx/`를 되돌립니다. `MALMOI_IMAGE`는 백업 시점의 digest나, 호환을 확인한 더 새 태그로 둡니다. `deploy/`에서 `read -r B`를 실행하고 복원할 백업 디렉터리의 절대 경로를 입력하세요. `docker compose stop scheduler proxy web`가 성공했을 때만 진행하세요.
2. `docker compose up -d postgres`를 실행합니다. 빈 볼륨이면 `.env`의 `MIGRATE_DB_PASSWORD`로 데이터베이스와 마이그레이션 롤을 만듭니다.
3. 소유자·권한 없이 마이그레이션 롤로 덤프를 올립니다(소유자는 마이그레이션 롤이 되고, 권한은 5단계가 다시 겁니다): `docker compose exec -T postgres pg_restore -U malmoi_migrate -d malmoi --no-owner --no-acl < "$B/db.dump"`. 끝의 `errors ignored on restore: N`을 읽습니다. `public` 스키마의 `already exists` 메시지만 정상이고, 그 밖의 오류가 있으면 일부만 복원된 데이터 위에서 마이그레이션하지 말고 멈춥니다.
4. 업로드를 되살립니다: `docker volume create malmoi_uploads && docker run --rm -v malmoi_uploads:/data -v "$B":/backup alpine:3.22 sh -c 'tar xzf /backup/uploads.tar.gz -C /data && chown -R 1000:1000 /data'`(앱 사용자 `node`는 uid 1000). 이후 모든 Compose 명령이 볼륨이 `already exists but was not created by Docker Compose`라고 경고합니다. 동작에는 문제가 없고 `down -v`는 이 볼륨도 지웁니다.
5. `docker compose run --rm migrate`를 실행합니다. 복원한 마이그레이션 이력이 최신이면 적용할 것이 없고, bootstrap이 런타임 롤을 만들어 권한을 건 뒤 다른 모든 롤의 스키마 접근을 다시 거둡니다. 복원 뒤에는 반드시 실행하세요. 건너뛰면 복원한 데이터베이스가 모든 롤에 열린 채로 남습니다.
6. web을 시작하기 전에 `docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d malmoi -c 'DELETE FROM "Session"'`로 모두 로그아웃시키고, 성공했을 때만 진행하세요. `docker compose up -d --no-deps web proxy`를 실행하고 스케줄러는 꺼 둡니다. 허용한 IP 주소에서 로그인, 프로젝트 번역 조회, 업로드한 사진을 확인하고 `docker compose logs web`에 복호화 오류(`credential-…`)가 없는지 봅니다.
7. 접근 제한을 유지한 채 백업에서 되살아난 권한을 점검하세요. 개인 토큰, 연결한 앱, 프로젝트 푸시 토큰, 제거한 멤버, 철회한 초대가 다시 유효해질 수 있습니다. 신뢰하는 검토자의 IP 주소만 클라우드 방화벽에서 허용하세요. 사용자는 MCP 페이지에서 되살아난 자격증명을 폐기하고, 프로젝트 소유자는 불필요한 멤버와 초대를 제거하고 해당 푸시 토큰을 회전합니다. 백업 이후의 기록과 대조하고, 검토를 마칠 수 없다면 외부 접근을 계속 막아 두세요. 백업 뒤의 편집과 게시는 사라지므로 대상 리포지토리의 PR과 대조합니다.
8. 이 점검을 마쳤고 이 설치본을 운영에 쓸 때만 `docker compose up -d --no-deps scheduler`로 스케줄러를 시작하고 80·443 포트를 다시 모두에게 여세요. 테스트 서버라면 스케줄러를 끄고 접근 제한을 유지하세요.

## 키 회전 {#rotate-keys}

키 도구는 앱 이미지 안에서 돌고 `DIRECT_URL`로 마이그레이션 롤에 접속합니다. 데이터베이스 관리 자격증명과 키 여섯을 함께 받는 Compose 서비스는 없으므로 `DIRECT_URL`을 셸에서 넘깁니다. 비밀번호를 명령줄에 직접 쓰지 마세요. 셸 기록과 `ps`에 남습니다. 셸 변수에만 두고 `-e DIRECT_URL`을 값 없이 넘깁니다.

1. [백업](#backup)을 만듭니다. 이 백업이 데이터베이스와 옛 키를 짝지어 둡니다.
2. `deploy/.env`에서 키링에 옛 키를 둔 채 새 키를 더하고 `*_ACTIVE_KEY_ID`를 새 키 이름으로 바꿉니다. 조회 키는 `EMAIL_LOOKUP_KEY`와 `EMAIL_LOOKUP_KEY_ID`를 새 값으로 바꾸며 옛 키가 필요 없습니다. 새 값은 모두 서로 달라야 합니다.
3. 트래픽을 막고 쓰기를 멈춥니다: `docker compose stop proxy scheduler web`. 프록시가 없으면 외부 유입(브라우저, 대상 리포지토리의 워크플로, 코딩 에이전트, 로그인 콜백)이 모두 막히고, 스케줄러가 없으면 야간 동기화가 돌지 않습니다. postgres만 남습니다.
4. 기록에 남지 않게 `DIRECT_URL`을 셸에 둡니다: `read -rs P && export DIRECT_URL="postgresql://malmoi_migrate:${P}@postgres:5432/malmoi" && unset P` 뒤 프롬프트에 `MIGRATE_DB_PASSWORD`를 입력합니다. TLS를 생략해도 되는 것은 호스트가 정확히 `postgres`일 때뿐이고, 다른 호스트의 데이터베이스라면 `?sslmode=verify-full`을 붙입니다. 다른 query 매개변수는 거부됩니다.
5. 확인하고, 적용하고, 검증합니다. `--no-deps`가 migrate 실행을 막습니다:

   ```sh
   RUN='docker compose run --rm --no-deps -e DIRECT_URL web pnpm credentials:self-hosted'
   $RUN --mode=rotate-token                                              # 확인만
   $RUN --mode=rotate-token --apply --traffic-blocked --writers-drained
   $RUN --mode=rotate-pii   --apply --traffic-blocked --writers-drained
   $RUN --mode=reindex      --apply --traffic-blocked --writers-drained  # 조회 키를 바꿨을 때만
   $RUN --mode=verify
   ```

   각 명령은 JSON 한 줄을 출력합니다. 새 키로 앱을 띄우기 전에 `verify`의 `oldTokenKey`와 `oldPiiKey`가 모두 0이어야 합니다. 실패하면 값 없이 `credential-conversion-failed: keep traffic blocked`만 나오고, 바로 앞 stderr 줄 `[credentials] … credential-env: missing environment variable <name>`이 이유를 알려 줍니다(활성 키 ID가 비었거나 키링에 없음). 데이터가 일부만 바뀐 상태로 앱을 다시 띄우지 마세요.
6. `unset DIRECT_URL` 뒤 `docker compose up -d --force-recreate --no-deps web proxy scheduler`를 실행해 web이 새 `.env`를 읽게 하고, 로그인과 초대를 확인합니다.
7. 옛 키는 키링에 남겨 둡니다. 예전 백업이 그 키를 요구합니다.

그 밖의 비밀과 확인:

- `pnpm credentials:finalize:self-hosted`(같은 `RUN` 꼴, 기본 `--mode=backfill`)는 읽기만 합니다. 자격증명 저장 마이그레이션이 적용되었는지 확인하고 `{"target":"self-hosted","pending":false,"applied":false}`를 출력합니다. 새 설치나 정상 업데이트는 migrate 서비스가 모든 마이그레이션을 적용하므로 항상 `pending:false`입니다. `--apply`는 마이그레이션을 직접 적용하는 길이라 일반 절차가 아니고, 업데이트는 `docker compose run --rm migrate`를 씁니다.
- `APP_SIGNING_SECRET`과 `AUTH_SECRET`: `.env`를 바꾸고 `docker compose up -d --force-recreate web`을 실행합니다. 트래픽을 막을 필요는 없고, 그 순간 진행 중이던 로그인과 GitHub 연결만 처음부터 다시 합니다. `CRON_SECRET`은 web과 스케줄러가 같아야 하므로 둘 다 다시 만듭니다(`--force-recreate web scheduler`). 한쪽만 바뀌면 야간 동기화가 401을 받습니다.
- 데이터베이스 비밀번호: 볼륨이 생긴 뒤에는 `.env`의 `MIGRATE_DB_PASSWORD`나 `RUNTIME_DB_PASSWORD`만 바꿔서는 아무것도 바뀌지 않습니다. `docker compose exec postgres psql -U postgres -d malmoi -X`를 열고 `\password malmoi_app`(또는 `malmoi_migrate` — psql이 비밀번호를 해시해 보내므로 서버 로그에 남지 않습니다)을 실행한 뒤 `.env`를 바꾸고 `docker compose up -d --force-recreate web`을 실행합니다. 마이그레이션 롤의 새 비밀번호는 다음 `docker compose run --rm migrate`부터 적용됩니다.

## 다음 단계 {#next}

업데이트나 복원 뒤에는 web 로그에서 `preflight:` 줄과 복호화 오류를 확인하고([문제 해결](troubleshooting.md#startup-checks)), 저장 항목을 내 개인정보 처리방침과 대조합니다([개인정보 재료](troubleshooting.md#privacy)).
