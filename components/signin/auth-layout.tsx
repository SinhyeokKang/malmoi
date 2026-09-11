import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import keyVisual from "@/public/brand/malmoi-signin-kv.png";

import { DotField } from "./dot-field";

/**
 * 셸 **밖** 화면 둘의 골격 (8-1b) — 로그인과 초대 수락.
 *
 * ⚠️ **둘이 같은 형을 쓰는 이유**: 번역자에게는 **초대 화면이 이 제품의 첫 얼굴**이고, 따로
 * 그리면 같은 제품이 두 얼굴이 된다(2026-09-10 사용자 결정). 초대 화면 시안이 따로 없는 것도
 * 그래서다 — 로그인 시안의 규칙을 그대로 적용한다.
 *
 * ⚠️ **`min-w-[1280px]`가 없으면 규약 3의 "1280 미만에서 가로 스크롤"이 실제로 일어나지 않는다** —
 * grid가 그냥 압축되고 우측 키비주얼만 잘린다. 규약이 허용한 것은 스크롤이지 잘림이 아니다.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  /**
   * ⚠️ **탭 두 장이 배경 위에 떠 있는 구조다** (시안 검산: 프레임 1920 → body가 x=8 y=8의
   * 1904×1064이고, 좌 탭 x=0(948)·우 탭 x=956 → **바깥 padding 8 · 탭 간 gap 8**).
   * 컬럼을 화면에 꽉 채우면 그 여백과 radius가 통째로 사라진다.
   */
  return (
    <>
      {/*
        ⚠️ **`body`까지 칠해야 스크롤 바운스에서 흰색이 안 보인다.** 이 래퍼는 `min-h-svh`라
        뷰포트를 채우지만 그 **바깥**(오버스크롤 영역)은 `body`의 색이고 그것이 흰색이다.

        ⚠️ **셸 밖 화면에서만이다** — 전역 CSS로 주면 셸 안 화면의 배경까지 회색이 된다. 그래서
        이 컴포넌트가 들고(마운트된 동안만 참이다), `useEffect`로 클래스를 붙이는 대신 인라인
        `<style>`을 쓴다 — effect는 첫 페인트를 놓쳐 흰색이 한 번 보인다.
      */}
      <style>{`body{background-color:var(--canvas)}`}</style>

      <div className="bg-canvas grid min-h-svh min-w-[1280px] grid-cols-2 gap-2 p-2">
        {/*
          ⚠️ `<main>`은 **좌측**이다 — 우측은 장식이고 랜드마크가 아니다.
          ⚠️ **true white다** — 바깥이 연한 회색이라 그 대비가 탭의 경계를 만든다.
          ⚠️ **`border-subtle`이다** — 시안의 `#f5f6f7`은 배경과 거의 같은 톤이라, 패널을 떼어내는
          것은 흰색 대비와 `shadow-low`이고 border는 가장자리를 정리할 뿐이다.
        */}
        <main className="border-border-subtle relative flex flex-col items-center justify-center overflow-hidden rounded-xl border bg-white px-8 shadow-low">
          {children}
          <Footer />
        </main>
        <Decoration />
      </div>
    </>
  );
}

function Footer() {
  return (
    <footer className="text-muted-foreground absolute bottom-6 flex gap-4 text-sm">
      <span>{m.signIn.footer.copyright}</span>
      {/*
        ⚠️ **외부 URL은 `lib/routes.ts`에 넣지 않는다** — 그 파일은 앱 **내부** 링크의 단일
        출처이고, `entry-points.test.ts`의 "죽은 라우트 링크"가 거기 값들을 실재하는 `page.tsx`와
        대조하므로 외부 URL을 섞으면 "없는 라우트"로 잡힌다.

        ⚠️ **리포가 아직 private이라 로그아웃 방문자에게 404다** — 출시 전 public 전환이
        전제다(2026-09-10 사용자).
      */}
      <FooterLink href="https://github.com/SinhyeokKang/malmoi" label={m.signIn.footer.github} external />
      <FooterLink href={routes.privacy()} label={m.signIn.footer.privacy} />
      <FooterLink href={routes.docs()} label={m.signIn.footer.docs} />
    </footer>
  );
}

function FooterLink({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  const className =
    "focus-visible:ring-ring hover:text-foreground focus-visible:ring-2 focus-visible:outline-none";
  return external ? (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

/**
 * 우측 장식 — 도트 필드 + 문구 둘 + 키비주얼.
 *
 * ⚠️ **패딩이 배치를 잡는다, 정적 폭이 아니다** (2026-09-10 사용자): **사방 80**(`p-20`).
 * 키비주얼은 `max-w-[768px]`이고 컨테이너에 맞춰 줄어들어, 1280px에서 우측 컬럼
 * 640 − 160 = 480px이라 **넘치지 않는다.**
 *
 * ⚠️ **이 패널엔 border가 없다** (시안) — 그라데이션 자체가 면을 만들어 선이 필요 없다. 좌측
 * 폼 패널만 `border-subtle`을 든다.
 *
 * ⚠️ **초대 화면의 실패 분기에서도 이 장식이 그대로 보인다** — 좌측이 "This invitation expired"인데
 * 우측이 환영 화면인 상태가 생긴다. KV에 문구가 **구워져 있어** 분기별로 못 바꾸고, 어색한지는
 * 런타임 목측(T11)이 판단한다.
 */
function Decoration() {
  return (
    <div className="from-auth-hero-from to-auth-hero-to relative flex flex-col items-center justify-between overflow-hidden rounded-xl bg-gradient-to-b p-20">
      <DotField className="absolute inset-0 size-full" />

      <p className="relative text-3xl font-medium">{m.signIn.hero.top}</p>

      {/*
        ⚠️ **`next/image`다.** `<img>`면 372KB PNG가 원본 그대로 나가고 LCP 요소가 된다 —
        로그인은 첫 진입점이고 서버 시간이 짧아진 뒤라(`regions: ["hnd1"]`) 이 화면의 비용은
        거의 전부 이 이미지다. `priority`가 없으면 발견도 늦다.

        ⚠️ **`alt=""`의 근거는 위아래 문구 두 줄이다** — 이미지 안에 구운 텍스트가 말하는 것을
        그 둘이 이미 말한다. 아니면 제품이 무엇을 하는지 보여주는 유일한 조각이 스크린리더에서
        통째로 사라진다.

        ⚠️ **그림자 여백을 보정하지 않는다** (2026-09-10 사용자). PNG(2172×996)가 3x(2088×936)보다
        크고 그 차이가 아래쪽 그림자 몫이라 시각 중심이 살짝 위로 가는데, **폭이 컨테이너를 따라
        변하므로 고정 보정값이 뷰포트마다 틀린다.** 여백째로 두는 것이 유일하게 일관된 상태다.
      */}
      <Image
        src={keyVisual}
        alt=""
        priority
        sizes="(min-width: 1856px) 768px, 50vw"
        className="relative w-full max-w-[768px]"
      />

      <p className="relative text-3xl font-medium">{m.signIn.hero.bottom}</p>
    </div>
  );
}
