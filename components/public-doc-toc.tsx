"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

import { isPlainPrimaryClick } from "@/lib/keyboard";
import { DOCUMENT_HEADING_LANDED, documentTop as topOf, landDocumentHeading } from "@/lib/public-doc/landing";
import { currentSection } from "@/lib/public-doc/toc";
import { cn } from "@/lib/utils";

/** 절 윗변이 이만큼 아래를 지나면 그 절이 현재다(시안 Prototype `isPrivacy`). */
const ACTIVE_OFFSET = 96;

/** 사용자가 스스로 스크롤하는 입력 — 누른 절의 고정을 푼다. */
const RELEASE = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * 공개 문서의 `On this page` 목차 — 스크롤러의 위치로 현재 절을 강조하고, 누르면 그 절로 스크롤한다 (DESIGN §6.616).
 * **`/privacy`와 `/docs`가 한 벌을 쓴다**(§6.61) — 제목·항목은 그릇이 넘긴다.
 *
 * ⚠️ **링크가 실제 `href="#id"`다** — JS 전·없이도 fragment 이동이 된다. JS는 그 위에 착지 위치(48)와 모션만 얹는다.
 * ⚠️ **스크롤러는 공개 셸의 것이다**(`[data-public-scroller]` — `/docs`는 페이지가 그 스크롤러를 든다) — 문서는 스크롤되지 않으므로 `window`를 구독하면 아무것도 안 온다.
 * ⚠️ **setState는 값이 바뀔 때만 리렌더한다** — 항목이 열 안팎이라 스테이지처럼 DOM에 직접 쓸 이유가 없다.
 * ⚠️ **`@/lib/**`는 판정 `lib/public-doc/toc.ts`·공유 착지 `lib/public-doc/landing.ts`와 `cn`을 읽는다** — 셋 다 `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 있다.
 */
export function Toc({ label, items }: { label: string; items: readonly { id: string; heading: string }[] }) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(0);
  /**
   * 누른 절 — 사용자가 스스로 스크롤할 때까지 위치 판정을 이긴다. 뒤쪽 짧은 절은 48 자리까지 못 올라와 스크롤이
   * 끝에서 멈추고, 그러면 끝 규칙이 마지막 절을 켜서 누른 항목이 아닌 것이 강조됐다. `scrollend`가 아니라 입력으로
   * 푼다 — 끝난 스크롤 위치는 여전히 끝이라 풀리는 순간 같은 오판으로 돌아간다.
   */
  const pinned = useRef<number | null>(null);

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
      setCurrent(pinned.current ?? currentSection(tops, scroller.scrollTop, ACTIVE_OFFSET, scroller.scrollHeight - scroller.clientHeight));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    const remeasure = () => {
      if (!alive) return;
      measure();
      schedule();
    };

    const release = () => {
      if (pinned.current === null) return;
      pinned.current = null;
      schedule();
    };
    const land = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") return;
      const index = items.findIndex(({ id }) => id === event.detail);
      if (index < 0) return;
      pinned.current = index;
      setCurrent(index);
    };

    remeasure();
    scroller.addEventListener("scroll", schedule, { passive: true });
    scroller.addEventListener(DOCUMENT_HEADING_LANDED, land);
    // 목차 링크의 pointerdown·Enter도 여기를 지나지만 click이 곧바로 다시 고정한다.
    for (const type of RELEASE) scroller.addEventListener(type, release, { passive: true });
    // 폭이 바뀌면 줄바꿈이, 폰트가 오면 글자 높이가 절 윗변을 옮긴다.
    const observer = new ResizeObserver(remeasure);
    observer.observe(scroller);
    void document.fonts?.ready.then(remeasure);

    return () => {
      alive = false;
      scroller.removeEventListener("scroll", schedule);
      scroller.removeEventListener(DOCUMENT_HEADING_LANDED, land);
      for (const type of RELEASE) scroller.removeEventListener(type, release);
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [items]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // 수정 키·가운데 클릭은 새 탭·새 창이다 — 브라우저 몫이라 가로채지 않는다.
    if (!isPlainPrimaryClick(event)) return;
    const scroller = ref.current?.closest<HTMLElement>("[data-public-scroller]");
    const target = document.getElementById(id);
    // 못 찾으면 브라우저 기본 이동에 맡긴다.
    if (!scroller || !target) return;
    event.preventDefault();
    landDocumentHeading(id);
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
              className={cn(
                "-ml-px block border-l py-1.5 pr-0 pl-3 text-xs leading-normal focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                index === current ? "border-foreground text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
