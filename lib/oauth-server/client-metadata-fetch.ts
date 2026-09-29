import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

import { logFailure } from "@/lib/github-connect/log";
import { isClientIdUrl, planClientMetadata, type ClientMetadata } from "@/lib/oauth/client-metadata";
import { isPublicAddress } from "@/lib/oauth/ssrf";

/**
 * **CIMD 문서 가져오기** (mcp-oauth design §2 · 결정 기록) — authorize 시점에 `client_id` URL의 문서를 읽는다. 무인증 공개 진입점이 우리 서버에게
 * **남이 고른 URL**을 가져오게 하는 자리라 SSRF 방어가 이 파일의 전부다. 순서가 방어다:
 * 1. clientId가 HTTPS 문서 URL인가(`isClientIdUrl`) — 아니면 해석도 하지 않는다.
 * 2. DNS 해석 → **해석된 주소 전부** 공개 유니캐스트인가(`isPublicAddress`). 하나라도 사설·루프백·링크 로컬이면 거부한다.
 * 3. 그 주소에 **고정해** 연결한다 — 요청이 다시 해석하면 두 번째 답이 내부 주소일 수 있다(DNS rebinding). TLS 인증서는 원래 호스트 이름으로 검사된다.
 * 4. 리다이렉트를 따르지 않는다(200만) · 시간·크기 상한 · `application/json`만 → `planClientMetadata`.
 *
 * ⚠️ 결과는 캐시하지 않는다 — 클라이언트가 문서를 바꾸면(콜백 추가) 다음 authorize가 본다. authorize는 사람이 누르는 빈도다.
 */

export type FetchedClientMetadata =
  | { ok: true; client: ClientMetadata }
  | { ok: false; reason: "invalid-client-id" | "blocked-address" | "unreachable" | "invalid-document" };

type Address = { address: string; family: 4 | 6 };
type Limits = { timeoutMs: number; maxBytes: number };
/** `body: null`은 상한 초과다. */
type PinnedResponse = { status: number; contentType: string | null; body: string | null };

export type FetchDeps = {
  resolve: (hostname: string) => Promise<Address[]>;
  get: (url: URL, pinned: Address, limits: Limits) => Promise<PinnedResponse>;
};

/** 문서는 작다(두 CLI 모두 1KB 미만 — T1 실측). 상한은 무인증 요청이 우리 메모리를 쓰게 하는 양이다. */
const LIMITS: Limits = { timeoutMs: 5_000, maxBytes: 65_536 };

export async function fetchClientMetadata(clientId: string, deps: FetchDeps = NODE_DEPS): Promise<FetchedClientMetadata> {
  if (!isClientIdUrl(clientId)) return { ok: false, reason: "invalid-client-id" };
  const url = new URL(clientId);
  // IPv6 literal은 `[...]`로 온다 — 해석기에는 괄호 없이 넘긴다.
  const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");

  let addresses: Address[];
  try {
    addresses = await deps.resolve(hostname);
  } catch (error) {
    logFailure("oauth-cimd-resolve", error);
    return { ok: false, reason: "unreachable" };
  }
  const pinned = addresses[0];
  if (pinned === undefined || !addresses.every(a => isPublicAddress(a.address))) return { ok: false, reason: "blocked-address" };

  let response: PinnedResponse;
  try {
    response = await deps.get(url, pinned, LIMITS);
  } catch (error) {
    logFailure("oauth-cimd-fetch", error);
    return { ok: false, reason: "unreachable" };
  }
  // 3xx도 여기다 — 리다이렉트를 따르면 1·2단계를 건너뛴 URL을 가져오게 된다.
  if (response.status !== 200) return { ok: false, reason: "unreachable" };
  const type = (response.contentType ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json" || response.body === null) return { ok: false, reason: "invalid-document" };

  let doc: unknown;
  try {
    doc = JSON.parse(response.body);
  } catch {
    return { ok: false, reason: "invalid-document" };
  }
  const plan = planClientMetadata(doc, clientId);
  return plan.ok ? plan : { ok: false, reason: "invalid-document" };
}

/**
 * 실제 네트워크 층 — 해석과 **고정된 주소로의** HTTPS GET. `lookup` 옵션이 연결 주소를 정하고 `servername`(SNI)·인증서 검사는 URL의 호스트
 * 이름으로 남는다. `https.request`는 리다이렉트를 따르지 않는다.
 * ⚠️ Node 24의 `net`은 `autoSelectFamily` 때문에 `lookup`을 `{ all: true }`로 부를 수 있다 — 두 모양 다 답한다.
 * ⚠️ **`agent: false`** — 기본 전역 에이전트는 keep-alive라 같은 호스트로 열린 소켓을 재사용하고, 그때는 `lookup`이 불리지 않아 고정이
 * 건너뛰어진다(리뷰 재현). 요청마다 새 연결을 연다 — authorize는 사람이 누르는 빈도라 잃는 것이 없다.
 */
export const pinnedGet: FetchDeps["get"] = (url, pinned, limits) => new Promise((resolve, reject) => {
  const req = httpsRequest(url, {
    method: "GET",
    headers: { accept: "application/json" },
    agent: false,
    timeout: limits.timeoutMs,
    lookup: (_host, options, callback) => {
      if ((options as { all?: boolean }).all) (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [pinned]);
      else callback(null, pinned.address, pinned.family);
    },
  }, res => {
    const chunks: Buffer[] = [];
    let total = 0;
    let overflow = false;
    res.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > limits.maxBytes) {
        overflow = true;
        res.destroy();
        return;
      }
      chunks.push(chunk);
    });
    const done = () => resolve({
      status: res.statusCode ?? 0,
      contentType: typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : null,
      body: overflow ? null : Buffer.concat(chunks).toString("utf8"),
    });
    res.on("end", done);
    res.on("close", () => { if (overflow) done(); });
    res.on("error", error => { if (!overflow) reject(error); });
  });
  // 전체 시간 상한 — `timeout`은 소켓 유휴 시간이라 한 바이트씩 흘리는 응답을 못 끊는다.
  const timer = setTimeout(() => req.destroy(new Error("CIMD fetch timed out")), limits.timeoutMs);
  req.on("close", () => clearTimeout(timer));
  req.on("timeout", () => req.destroy(new Error("CIMD fetch timed out")));
  req.on("error", reject);
  req.end();
});

const NODE_DEPS: FetchDeps = {
  resolve: async hostname => (await lookup(hostname, { all: true, verbatim: true })).map(a => ({ address: a.address, family: a.family === 6 ? 6 : 4 })),
  get: pinnedGet,
};
