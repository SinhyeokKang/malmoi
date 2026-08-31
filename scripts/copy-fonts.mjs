#!/usr/bin/env node
// Pretendard Variable 동적 서브셋을 node_modules에서 public/으로 복사한다.
//
// 왜 복사하나: 단일 PretendardVariable.woff2는 2.0MB고 초회 방문자가 그걸 다 받는다.
// 동적 서브셋은 92개 구간으로 쪼개져 있고 브라우저가 unicode-range를 보고 필요한 구간만
// 받으므로(ko/en/fr 혼용 UI면 보통 150~450KB) 실 전송량이 크게 줄어든다. CDN을 쓰면
// 렌더 방해 외부 요청이 생기고 오프라인 개발이 깨지므로 자사 호스트한다.
//
// 왜 git에 안 담나: 3.0MB 바이너리 92개다. node_modules에 이미 있으니 생성물로 취급하고
// predev/prebuild에서 만든다(package.json 참조). public/fonts/는 .gitignore에 있다.
//
// CSS의 url()이 `./woff2-dynamic-subset/...` 상대 경로라 **디렉터리 구조를 보존하면
// 경로 재작성이 필요 없다.** 구조를 바꾸면 폰트가 조용히 404가 되고 시스템 폰트로 떨어진다.

import { cp, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "node_modules/pretendard/dist/web/variable");
const DEST = join(ROOT, "public/fonts/pretendard");

const CSS = "pretendardvariable-dynamic-subset.css";
const SUBSET_DIR = "woff2-dynamic-subset";

if (!existsSync(SRC)) {
  console.error(`pretendard 패키지를 찾을 수 없다: ${SRC}\n  → pnpm install 먼저.`);
  process.exit(1);
}

await mkdir(DEST, { recursive: true });
await cp(join(SRC, CSS), join(DEST, CSS));
await cp(join(SRC, SUBSET_DIR), join(DEST, SUBSET_DIR), { recursive: true });

const { size } = await stat(join(DEST, CSS));
console.log(`Pretendard 복사 완료 → public/fonts/pretendard/ (CSS ${(size / 1024).toFixed(1)}KB + ${SUBSET_DIR}/)`);
