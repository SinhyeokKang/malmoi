# syntax=docker/dockerfile:1
#
# 셀프 호스팅 이미지 한 벌 (self-hosting design §5). web(`next start`)·migrate(`prisma migrate deploy` + bootstrap)·키 운영
# (`pnpm credentials:self-hosted`)이 같은 이미지·같은 digest에서 돈다.
#
# ⚠️ standalone 출력을 쓰지 않는다 — 마이그레이션·키 운영에 prisma CLI·tsx·전체 node_modules가 어차피 필요하고, standalone은
#    가이드 원고·sharp·Prisma client의 tracing 누락이라는 새 사고 표면을 만든다(POSTMORTEM 2026-09-03 계열).
# ⚠️ 비밀을 빌드에 넣지 않는다 — env 없이 `pnpm build`가 끝나야 하고(POSTMORTEM 2026-08-31), 운영 값은 전부 런타임 env다.
#    `.dockerignore`가 `.env*`·키 파일을 context에서 뺀다.
# ⚠️ 빌드 플랫폼 = 실행 플랫폼이어야 한다 — sharp·Prisma 엔진은 설치 때 그 플랫폼 바이너리를 받는다(`--platform linux/amd64`).
#
# Node 메이저 == `.nvmrc`, pnpm == `packageManager`, `.npmrc` 복사를 `lib/deployment/__tests__/self-hosted-gates.test.ts`가 센다.
FROM node:24-bookworm-slim

# psql 15+(bookworm = 15)가 `deploy/bootstrap.sql`의 `\getenv`에 필요하다. pg_isready는 readiness(DB ping)가 쓴다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# pnpm은 corepack이 `packageManager`와 같은 버전으로 고정한다. COREPACK_HOME을 공용 경로에 두어야 non-root 실행이
# 런타임에 pnpm을 다시 내려받지 않는다.
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /opt/corepack \
 && corepack enable \
 && corepack prepare pnpm@10.33.0 --activate \
 && chmod -R a+rX /opt/corepack

WORKDIR /app

# install·build는 root로 한다 — 런타임 사용자(node)가 자기 코드·node_modules·.next를 고쳐 쓸 수 없게.
# `.npmrc`(enable-pre-post-scripts=true)가 빠지면 `prebuild`의 폰트 복사가 조용히 건너뛰어진다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
# 빌드 캐시는 버리고, 런타임 쓰기 대상(이미지 최적화 캐시·업로드 볼륨)만 node에게 준다.
RUN pnpm build \
 && rm -rf .next/cache \
 && mkdir -p .next/cache /data/uploads \
 && chown node:node .next/cache /data/uploads

USER node

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000
# 기본 명령은 web이다. preflight가 설정 결함을 기동 실패로 바꾼다(design §2) — 통과해야 `next start`.
CMD ["sh", "-c", "pnpm preflight && exec node_modules/.bin/next start"]
