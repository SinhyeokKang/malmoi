import type { SessionRead } from "./read-session";
import { routes } from "@/lib/routes";

/**
 * 세션 상태 → 착지 경로. **축이 둘이고, 그것을 가르는 것이 이 모듈의 존재 이유다.**
 *
 * 이 판정은 8-1a까지 **세 파일에 흩어진 `if` 문**이었다(`app/page.tsx` · `lib/auth/session.ts` ·
 * `app/(edit)/layout.tsx`). 셋이 같은 목적지를 각자 적고 있어서, 로그인 화면을 `/signin`으로
 * 옮기는 것 같은 변경에서 **하나만 빠뜨려도 화면이 정상으로 보인다** — 경로 문자열은 타입이
 * 못 보는 부류다 (POSTMORTEM 2026-09-05).
 *
 * ⚠️ **한 함수로 접지 않는다.** 실물은 이렇게 갈려 있다:
 * - `lib/auth/session.ts`·`app/(edit)/layout.tsx`는 **`unavailable`·`none` 2갈래뿐**이다.
 *   그 자리에는 `ok` 갈래가 아예 없다(이미 인증을 지난 뒤에 부르는 것이 아니라, 거부·장애를
 *   튕기는 자리다)
 * - `app/page.tsx`만 `ok → /projects`를 든다
 *
 * `ok`를 반환하는 함수를 `requireUser` 자리에 꽂으면 의미가 안 맞는다 — 그래서 둘이다.
 *
 * ⚠️ **잎이다** — `lib/routes.ts`(import 0)만 읽고 `SessionRead`는 **타입으로만** 가져온다.
 * 그 모듈을 값으로 읽으면 `@/auth`가 따라와 그래프가 통째로 열린다.
 */

/**
 * 거부·장애를 어디로 튕기나. **`ok`는 이 함수의 입력이 아니다** — 타입이 그것을 배제한다.
 *
 * ⚠️ **장애는 사유를 싣는다.** 그냥 로그인 화면으로 보내면 정당한 비로그인과 **바이트 단위로 같은
 * 응답**이 되어, 프로덕션 전면 장애를 "리다이렉트 100% = 정상"으로 읽었다 (POSTMORTEM 2026-09-06).
 *
 * ⚠️ **삼항이 아니라 맵 + `satisfies`인 이유**: `SessionRead`에 갈래가 늘면 **키가 없어 컴파일
 * 에러**가 난다. 삼항이면 새 갈래가 else로 떨어져 **사유 없이** 로그인 화면으로 가고 타입 검사가
 * 아무 말도 안 한다(실측: 갈래를 넷으로 늘려도 `tsc`가 조용히 통과했다). `lib/auth/message.ts`의
 * `ACCESS`·`INVITE`와 같은 관용구다 — 같은 문제에 두 가지 형을 만들지 않는다.
 */
const REJECT = {
  none: routes.signIn(),
  unavailable: routes.signIn({ error: "Unavailable" }),
} satisfies Record<Exclude<SessionRead["status"], "ok">, string>;

export function rejectTarget(status: Exclude<SessionRead["status"], "ok">): string {
  return REJECT[status];
}

/**
 * 루트(`/`)의 착지. **랜딩이 `/`에 들어온 뒤에도 로그인 상태면 `/projects`다** — *"로그인 이후
 * 랜딩 못 가게"*가 2026-09-10 사용자 결정이고, 그 결정이 사라지면 다음 배송이 뒤집는다.
 */
export function landingTarget(status: SessionRead["status"]): string {
  return status === "ok" ? routes.projects() : rejectTarget(status);
}

/**
 * 루트(`/`)가 무엇을 그리나 — `landingTarget`의 후계(docs/features/landing — `app/page.tsx`가 옮겨 오는 T7에서
 * `landingTarget`이 지워진다).
 *
 * ⚠️ **`unavailable`도 랜딩이다**(옛: `/signin?error=Unavailable`). 공개 화면이 세션 장애로 안 열리는 것이
 * 더 나쁘다(DESIGN §6.61과 같은 쪽). 일반 로그인은 `redirectTo: "/projects"`라 `/`를 지나지 않으므로
 * "로그인 직후 조용히 랜딩"이 되는 흐름이 없고, 장애 신호는 보호 라우트의 `rejectTarget`이 계속 든다.
 * 맵 + `satisfies`는 `REJECT`와 같은 이유다 — 갈래가 늘면 컴파일 에러가 난다.
 */
export type RootView = { redirect: string } | { landing: true };

const ROOT = {
  ok: { redirect: routes.projects() },
  none: { landing: true },
  unavailable: { landing: true },
} satisfies Record<SessionRead["status"], RootView>;

export function rootView(status: SessionRead["status"]): RootView {
  return ROOT[status];
}
