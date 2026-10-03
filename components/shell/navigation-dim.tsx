"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { isPlainPrimaryClick } from "@/lib/keyboard";
import { dimsNavigation } from "@/lib/shell/navigation-dim";

/** 커밋이 끝내 오지 않을 때(같은 화면으로 돌아오는 redirect 등) dim을 거두는 한도. */
export const NAVIGATION_DIM_GIVE_UP_MS = 10_000;

/**
 * **다른 화면으로 가는 클릭은 응답 전에 뷰포트 전체를 옅게 흐린다** (2026-09-29 사용자 — prod에서 0.5–1초 동안 반응이
 * 없어 누른 게 맞나 헷갈렸다). 골격(`loading.tsx`)은 prefetch가 끝났을 때만 즉시 서므로 그 앞의 창을 이것이 메운다.
 *
 * ⚠️ **링크마다 표식을 달지 않고 window의 클릭 하나를 듣는다** — `useLinkStatus`는 링크가 언마운트되면 값을 잃어(드롭다운
 * 항목·모달 안 링크는 누르는 순간 닫힌다) 앱 전체에 걸 수 없다. **bubble 단계**라 이탈 guard(`use-leave-guard.ts`)처럼
 * 앞에서 전파를 끊은 클릭은 여기 닿지 않는다. `defaultPrevented`는 보지 않는다 — Next `Link`가 늘 막는다.
 * ⚠️ **꺼짐은 pathname 커밋이다** — 골격이 서는 순간도 커밋이라 dim과 골격이 겹치지 않는다. 오지 않는 커밋은 한도가 거둔다.
 * ⚠️ **뒤로·앞으로 가기(`popstate`)도 거둔다** (malmoi#151) — 보류 중인 이동을 버리고 같은 pathname의 기록으로 돌아가면 커밋이
 * 오지 않아 한도(10 s)까지 화면 전체가 흐렸다. 기록 이동은 클릭으로 켠 dim의 대상이 아니다.
 * ⚠️ **`router.push`로 시작한 이동은 켜지 않는다** — 그 자리들은 각자 pending(`useTransition`)을 든다(DESIGN §6.4).
 * ⚠️ **`pointer-events-none`** — 막으면 느린 이동 중 다른 곳을 누를 수 없다(Next는 뒤 이동이 앞 이동을 대체한다).
 * ⚠️ **켜질 때만 150ms 지연** — prefetch가 끝난 이동은 그 안에 커밋해 깜빡이지 않는다. 꺼짐은 즉시다.
 */
export function NavigationDim() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => setActive(false), [pathname]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => setActive(false), NAVIGATION_DIM_GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (link === null) return;
      const on = dimsNavigation({
        plain: isPlainPrimaryClick(event),
        target: link.target,
        download: link.hasAttribute("download"),
        href: link.href,
        current: window.location.href,
      });
      if (on) setActive(true);
    };
    // bfcache 복원은 커밋 없이 옛 문서를 되살린다 — 켜진 채 얼어 있던 dim을 거둔다. 기록 이동도 같은 자리다(위 머리 주석).
    const restore = () => setActive(false);
    window.addEventListener("click", click);
    window.addEventListener("pageshow", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("click", click);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("popstate", restore);
    };
  }, []);

  return (
    <div
      aria-hidden
      data-navigation-dim
      data-active={active || undefined}
      className="bg-background/50 pointer-events-none fixed inset-0 z-50 opacity-0 transition-opacity duration-150 data-[active]:opacity-100 data-[active]:delay-150"
    />
  );
}
