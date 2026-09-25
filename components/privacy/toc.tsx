"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

import { currentSection } from "@/lib/public-doc/toc";

/** 절 윗변이 이만큼 아래를 지나면 그 절이 현재다(시안 Prototype `isPrivacy`). */
const ACTIVE_OFFSET = 96;
/** 클릭한 절이 서는 자리 — 스크롤러 윗변에서 48. h2의 `scroll-mt-12`와 같은 값이다. */
const LAND_OFFSET = 48;

/** 절 윗변의 스크롤러 좌표. ⚠️ offsetTop은 offsetParent에 매여 셸 구조가 바뀌면 조용히 틀린다(스테이지와 같은 판단). */
const topOf = (node: HTMLElement, scroller: HTMLElement) =>
  node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

/**
 * `/privacy`의 `On this page` 목차 — 스크롤러의 위치로 현재 절을 강조하고, 누르면 그 절로 스크롤한다 (DESIGN §6.616).
 *
 * ⚠️ **링크가 실제 `href="#id"`다** — JS 전·없이도 fragment 이동이 된다. JS는 그 위에 착지 위치(48)와 모션만 얹는다.
 * ⚠️ **스크롤러는 공개 셸의 것이다**(`[data-public-scroller]`) — 문서는 스크롤되지 않으므로 `window`를 구독하면 아무것도 안 온다.
 * ⚠️ **setState는 값이 바뀔 때만 리렌더한다** — 항목이 일곱이라 스테이지처럼 DOM에 직접 쓸 이유가 없다.
 * ⚠️ **`@/lib/**`는 잎 하나만 읽는다**(`lib/public-doc/toc.ts` — `client-graph.test.ts`의 `CLIENT_LIB_FILES`).
 */
export function Toc({ label, items }: { label: string; items: readonly { id: string; heading: string }[] }) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>("[data-public-scroller]");
    if (!scroller) return;
    let alive = true;
    let frame = 0;
    let tops: number[] = [];

    const measure = () => {
      tops = items.map(({ id }) => {
        const node = document.getElementById(id);
        return node ? topOf(node, scroller) : Number.NaN;
      });
    };
    const update = () => {
      frame = 0;
      setCurrent(currentSection(tops, scroller.scrollTop, ACTIVE_OFFSET));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    const remeasure = () => {
      if (!alive) return;
      measure();
      schedule();
    };

    remeasure();
    scroller.addEventListener("scroll", schedule, { passive: true });
    // 폭이 바뀌면 줄바꿈이, 폰트가 오면 글자 높이가 절 윗변을 옮긴다.
    const observer = new ResizeObserver(remeasure);
    observer.observe(scroller);
    void document.fonts?.ready.then(remeasure);

    return () => {
      alive = false;
      scroller.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [items]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const scroller = ref.current?.closest<HTMLElement>("[data-public-scroller]");
    const target = document.getElementById(id);
    // 못 찾으면 브라우저 기본 이동에 맡긴다.
    if (!scroller || !target) return;
    event.preventDefault();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: topOf(target, scroller) - LAND_OFFSET, behavior: reduced ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);
    // ⚠️ preventDefault가 fragment 이동의 포커스 이동까지 막는다 — 안 옮기면 키보드·스크린리더가 목차에 남는다.
    // `preventScroll` — 포커스가 smooth 스크롤을 끊고 즉시 점프시키지 않게 한다.
    target.focus({ preventScroll: true });
  };

  return (
    <nav ref={ref} aria-labelledby={titleId} className="sticky top-12 self-start">
      <p id={titleId} className="m-0 text-xs font-medium">
        {label}
      </p>
      <ul className="border-border mt-3 border-l">
        {items.map(({ id, heading }, index) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(event) => onClick(event, id)}
              aria-current={index === current ? "location" : undefined}
              className={`-ml-px block border-l py-1.5 pr-0 pl-3 text-xs leading-[1.5] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none ${
                index === current ? "border-foreground text-foreground" : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              {heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
