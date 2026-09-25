import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * ⚠️ **외부 URL은 `lib/routes.ts`에 넣지 않는다** — 그 파일은 앱 **내부** 링크의 단일 출처이고,
 * `entry-points.test.ts`의 "죽은 라우트 링크"가 거기 값들을 실재하는 `page.tsx`와 대조하므로
 * 외부 URL을 섞으면 "없는 라우트"로 잡힌다.
 *
 * ⚠️ **리포가 public이어야 이 링크가 산다** — private이면 로그아웃 방문자에게 404다
 * (2026-09-18 public 전환).
 */
export const GITHUB_REPO_URL = "https://github.com/SinhyeokKang/malmoi";

export type FooterLink = { href: string; label: string; external: boolean };

/**
 * 셸 밖 화면의 푸터 링크 — **`/signin`과 랜딩이 이 목록 하나를 읽는다** (DESIGN §6.615). 사본이 둘이면
 * 순서가 갈린다 — 시안의 랜딩 푸터가 이미 `Docs · Privacy Policy`로 어긋나 있었다(2026-09-26 사용자가 이쪽 순서로 판정).
 */
export const FOOTER_LINKS: readonly FooterLink[] = [
  { href: GITHUB_REPO_URL, label: m.signIn.footer.github, external: true },
  { href: routes.privacy(), label: m.signIn.footer.privacy, external: false },
  { href: routes.docs(), label: m.signIn.footer.docs, external: false },
];
