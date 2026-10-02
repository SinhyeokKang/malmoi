"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { BEZEL, CANVAS_H, CANVAS_W, TOOLBAR_H, frame as frameAt, pinnedSpan, trackHeight, typedPrefix, type Frame } from "@/lib/landing/stage";

type Five<T> = readonly [T, T, T, T, T];

/**
 * 랜딩의 스크롤 구동 목업 (DESIGN §6.615).
 *
 * ⚠️ **스테이지가 재생 동안 뷰포트를 가진다** (2026-09-27 사용자) — 트랙 윗변이 스크롤러 윗변에 닿으면 sticky 한 장이 화면
 * 전부이고, 씬은 그 고정 구간 안에서만 움직인다. 위 히어로·아래 CTA는 재생 동안 보이지 않는다 — 그래서 CTA를 음수
 * margin으로 끌어올리지 않는다(옛 `--landing-y-pin`).
 *
 * ⚠️ **배율은 크기만의 함수다** — 스크롤 구동 확대(대기 0.8배 → 맞춤)를 걷었다. 툴바와 베젤은 상시다
 * (44px 툴바 + 안쪽 베젤 + 얇은 회색 외곽선 + `shadow-medium`).
 *
 * ⚠️ **프레임마다 setState하지 않는다** — 씬 DOM이 수천 노드라 재조정이 스크롤을 먹는다. 스크롤 → rAF에서
 * `frame()`(순수) → ref로 transform·opacity·`data-*`·텍스트 노드를 직접 쓴다. 이 컴포넌트는 한 번 렌더된다.
 *
 * ⚠️ **SSR·JS 없음에서는 접혀 있고 프레임이 보이지 않는다** — 배율이 없으면 1440 폭 컨테이너가 패널을 넘치므로 프레임·크롬이
 * `invisible`이다. 트랙은 `data-ready`가 선 뒤에만 고정 구간 길이를 갖는다(그 전엔 패널 1개 높이 — 빈 세로 구간이 남지 않는다).
 *
 * 씬(`scenes`)은 서버 컴포넌트가 그린 정적 DOM이다. 목업이 스크롤에 반응하는 자리는 둘뿐이다 —
 * `[data-landing-typed]`의 텍스트(타이핑 접두)와 프레임의 `data-badge`(`group-data-[badge=1]/frame:`로 읽는다).
 */
export function Stage({
  label,
  captions,
  typed,
  scenes,
  closing,
}: {
  label: string;
  captions: Five<string>;
  /** 씬 ②에서 타이핑되는 값 — 사전 전체를 클라이언트 청크에 싣지 않으려고 문자열 하나만 받는다. */
  typed: string;
  scenes: Five<ReactNode>;
  /** 마무리 CTA — 트랙이 끝난 뒤에 선다(재생 동안 보이지 않는다). */
  closing: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const captionRef = useRef<HTMLParagraphElement | null>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const frameNode = frameRef.current;
    const chrome = chromeRef.current;
    const caption = captionRef.current;
    if (!root || !track || !frameNode || !chrome || !caption) return;
    // 셸의 스크롤러가 스테이지의 뷰포트다(`components/public-shell/scroller.tsx`). 없으면 접힌 채로 둔다.
    const scroller = root.closest<HTMLElement>("[data-public-scroller]");
    if (scroller === null) return;
    const typedNodes = [...frameNode.querySelectorAll<HTMLElement>("[data-landing-typed]")];

    // matchMedia는 effect 안에서만 읽는다(SSR에 없다).
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motion.matches;
    let pending = 0;
    let ready = false;
    /** 직전 프레임의 H·stageTop — 리사이즈 때 재생 위치를 보존하는 데 쓴다. */
    let lastH = 0;
    let lastStageTop = 0;
    /** 같은 값을 다시 쓰지 않는다 — 루트 CSS 변수는 서브트리 전체의 스타일을 무효화한다. */
    let written = { stageH: "", transform: "", caption: -1, typed: "" };

    /** 트랙 윗변의 스크롤러 좌표. offsetTop은 offsetParent에 매여 셸 구조가 바뀌면 조용히 틀린다. */
    const stageTopOf = () => track.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

    const setStageH = (H: number) => {
      const value = `${H}px`;
      if (value === written.stageH) return;
      root.style.setProperty("--landing-stage-h", value);
      root.style.setProperty("--landing-track-h", `${trackHeight(H)}px`);
      written = { ...written, stageH: value };
    };

    const paint = (f: Frame) => {
      // 배율·위치는 크기에서만 바뀐다 — 스크롤 틱마다 같은 문자열을 다시 쓰지 않는다.
      const transform = `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`;
      if (transform !== written.transform) {
        frameNode.style.transform = transform;
        chrome.style.transform = `translate3d(0px, ${f.chromeY}px, 0px)`;
        written = { ...written, transform };
      }
      frameNode.dataset.scene = String(f.scene.i);
      frameNode.dataset.badge = String(f.badge);
      f.layers.forEach((opacity, k) => {
        const layer = layerRefs.current[k];
        if (layer) layer.style.opacity = String(opacity);
      });
      f.segments.forEach((fill, k) => {
        const segment = segmentRefs.current[k];
        if (segment) segment.style.transform = `scaleX(${fill})`;
      });
      if (f.caption.index !== written.caption) {
        caption.textContent = captions[f.caption.index] ?? "";
        written = { ...written, caption: f.caption.index };
      }
      caption.style.opacity = String(f.caption.opacity);
      const text = typedPrefix(typed, f.typed);
      if (text !== written.typed) {
        for (const node of typedNodes) node.textContent = text;
        written = { ...written, typed: text };
      }
    };

    /**
     * ⚠️ **트랙 높이가 H에 비례하므로** 리사이즈 뒤 scrollTop을 그대로 두면 재생 위치가 튄다 — 씬 ③을 보던 사람이
     * 창을 키우면 씬 ②로 되감긴다. 고정 구간 안이면 직전 위치(H 단위)를 새 H로 되돌려 놓는다.
     *
     * ⚠️ **보존은 관찰자 콜백이 아니라 여기서 한다** — 콜백은 레이아웃 뒤, rAF는 레이아웃 전에 돌아서 드래그 리사이즈에서는
     * 틱이 새 H를 먼저 읽는다. 콜백에서 하면 틱이 `lastH`를 덮은 뒤라 "바뀐 것 없음"으로 건너뛰었다(702 → 902가 q 2.3을 1.8로).
     */
    const tick = () => {
      pending = 0;
      const W = scroller.clientWidth;
      const H = scroller.clientHeight;
      if (ready && lastH > 0 && H !== lastH) {
        const u = (scroller.scrollTop - lastStageTop) / lastH;
        setStageH(H);
        if (u > 0 && u <= pinnedSpan()) scroller.scrollTop = stageTopOf() + u * H;
      }
      setStageH(H);
      const stageTop = stageTopOf();
      paint(frameAt({ scrollTop: scroller.scrollTop, stageTop, W, H, reducedMotion: reduced }));
      lastH = H;
      lastStageTop = stageTop;
      if (!ready) {
        track.setAttribute("data-ready", "");
        ready = true;
      }
    };

    const schedule = () => {
      if (pending !== 0) return;
      pending = requestAnimationFrame(tick);
    };

    const onMotion = () => {
      reduced = motion.matches;
      schedule();
    };

    scroller.addEventListener("scroll", schedule, { passive: true });
    motion.addEventListener("change", onMotion);
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    // 웹폰트가 들어오면 히어로 높이(= stageTop)가 바뀐다 — 스크롤 없이도 한 번 다시 그린다.
    void document.fonts?.ready.then(schedule);
    schedule();

    return () => {
      if (pending !== 0) cancelAnimationFrame(pending);
      // 0이 아닌 값으로 막아 둔다 — 언마운트 뒤에 풀리는 `fonts.ready`가 rAF를 다시 예약하지 않게.
      pending = -1;
      scroller.removeEventListener("scroll", schedule);
      motion.removeEventListener("change", onMotion);
      observer.disconnect();
    };
  }, [captions, typed]);

  return (
    <div ref={rootRef} data-landing-root="">
      <section
        ref={trackRef}
        aria-label={label}
        className="group/track relative mt-30 h-[var(--landing-stage-h,calc(100svh-98px))] data-[ready]:h-[var(--landing-track-h)]"
      >
        <ol className="sr-only">
          {captions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>
        {/* `98px` = 공개 셸의 윗 여백 8 · 헤더 40 + 8 · 푸터 40 · 패널 테두리 2(`public-shell.tsx`) — 셸 치수가 바뀌면 트랙과 함께 고친다. JS 전 폴백일 뿐이고 준비 뒤엔 `--landing-stage-h`가 잰 값이다. */}
        <div className="pointer-events-none sticky top-0 h-[var(--landing-stage-h,calc(100svh-98px))]">
          <div
            ref={frameRef}
            data-landing-frame=""
            aria-hidden="true"
            inert
            className="group/frame invisible absolute top-0 left-0 origin-top-left group-data-[ready]/track:visible"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {/* 툴바·베젤을 컨테이너 안에 두어 바깥 윤곽까지 16:10을 유지한다. */}
            <div className="absolute inset-0 rounded-3xl border border-border bg-background shadow-medium" />
            <div data-landing-toolbar="" className="absolute inset-x-0 top-0 flex items-center gap-2 px-5" style={{ height: TOOLBAR_H }}>
              <span className="size-3 translate-y-0.5 rounded-full border border-border" />
              <span className="size-3 translate-y-0.5 rounded-full border border-border" />
              <span className="size-3 translate-y-0.5 rounded-full border border-border" />
            </div>
            <div
              data-landing-screen=""
              className="absolute overflow-hidden rounded-lg border border-border-subtle bg-background"
              style={{ top: TOOLBAR_H, right: BEZEL, bottom: BEZEL, left: BEZEL }}
            >
              {scenes.map((scene, k) => (
                <div
                  key={k}
                  ref={(node) => {
                    layerRefs.current[k] = node;
                  }}
                  data-landing-layer={k}
                  className="absolute inset-0 opacity-0"
                >
                  {scene}
                </div>
              ))}
            </div>
          </div>
          <div ref={chromeRef} aria-hidden="true" className="invisible absolute inset-x-0 top-0 flex h-7 items-center justify-center gap-4 group-data-[ready]/track:visible">
            <div className="flex gap-1.5">
              {captions.map((text, k) => (
                <span key={text} className="block h-[3px] w-6 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    ref={(node) => {
                      segmentRefs.current[k] = node;
                    }}
                    data-landing-segment={k}
                    className="block h-[3px] origin-left bg-foreground"
                    // ⚠️ 초깃값도 인라인 transform이다 — `scale-x-0` 유틸은 v4에서 개별 `scale` 속성이라 틱이 쓰는 transform과 곱해져
                    // 채움이 늘 0이었다(#111).
                    style={{ transform: "scaleX(0)" }}
                  />
                </span>
              ))}
            </div>
            {/* 캡션 크기는 시안 1c의 `clamp(15, 9 + 0.4375vw, 20)` — 스케일 토큰 사이 값이라 인라인으로 준다(자간은 text-base가 든다). */}
            <p
              ref={captionRef}
              data-landing-caption=""
              className="m-0 text-base leading-[1.4] whitespace-nowrap"
              style={{ fontSize: "clamp(15px, calc(9px + 0.4375vw), 20px)" }}
            >
              {captions[0]}
            </p>
          </div>
        </div>
      </section>
      {closing}
    </div>
  );
}
