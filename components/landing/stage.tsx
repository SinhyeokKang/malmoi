"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { BEZEL, CHROME_GAP, STATE_CANVAS_H, STATE_CANVAS_W, TOOLBAR_H, deviceForViewport, fitScale, frame as frameAt, pinnedSpan, trackHeight, typedPrefix, type Device, type Frame } from "@/lib/landing/stage";
import { SM_QUERY, WIDE_QUERY } from "@/lib/shell/breakpoint";

type Five<T> = readonly [T, T, T, T, T];

/** 정적 흐름 장의 그릇 크기 — 틱이 루트에 쓴다. 폴백은 SSR 기본(D)이다. */
const CANVAS_VAR_W = `var(--landing-canvas-w, ${STATE_CANVAS_W[0]}px)`;
const CANVAS_VAR_H = `var(--landing-canvas-h, ${STATE_CANVAS_H[0]}px)`;

/** 캡션 크기는 시안 1c의 `clamp(15, 9 + 0.4375vw, 20)` — 스케일 토큰 사이 값이라 인라인으로 준다(자간은 text-base가 든다). */
const CAPTION_SIZE = "clamp(15px, calc(9px + 0.4375vw), 20px)";

/** 고정 재생과 정적 흐름이 같은 껍데기를 쓴다. 모바일은 툴바 없이 네 면 8px이고 D·T는 44px 툴바를 유지한다. */
function Bezel({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="absolute inset-0 rounded-3xl border border-border bg-background shadow-medium" />
      <div data-landing-toolbar="" className="absolute inset-x-0 top-0 hidden items-center gap-2 px-5 sm:flex" style={{ height: TOOLBAR_H }}>
        <span className="size-3 translate-y-0.5 rounded-full border border-border" />
        <span className="size-3 translate-y-0.5 rounded-full border border-border" />
        <span className="size-3 translate-y-0.5 rounded-full border border-border" />
      </div>
      <div
        data-landing-screen=""
        // 논리 캔버스와 나머지 세 면이 px이므로 상단도 rem 배율을 따르지 않는다.
        className="absolute top-[8px] overflow-hidden rounded-xl border border-border-subtle bg-background sm:top-[44px]"
        style={{ right: BEZEL, bottom: BEZEL, left: BEZEL }}
      >
        {children}
      </div>
    </>
  );
}

/**
 * 랜딩의 스크롤 구동 목업 (DESIGN §6.615).
 *
 * ⚠️ **스테이지가 재생 동안 뷰포트를 가진다** (2026-09-27 사용자) — 트랙 윗변이 스크롤러 윗변에 닿으면 sticky 한 장이 화면
 * 전부이고, 씬은 그 고정 구간 안에서만 움직인다. 위 히어로·아래 CTA는 재생 동안 보이지 않는다 — 그래서 CTA를 음수
 * margin으로 끌어올리지 않는다(옛 `--landing-y-pin`).
 *
 * ⚠️ **배율은 크기와 그릇만의 함수다** — 스크롤 구동 확대(대기 0.8배 → 맞춤)를 걷었다. **그릇은 뷰포트가 고른다**(2026-10-11 사용자 정정 —
 * ≥1024 D 1440×900 · 640~1023 T 786×900 · <640 M 393×776, 목업 루트 1422 · 768 · 375): 틱이 `WIDE_QUERY`·`SM_QUERY`의 `.matches`를 직접 읽는다.
 * change 리스너가 없다 — 뷰포트가 바뀌면 스크롤러도 바뀌어 `ResizeObserver`가 틱을 예약하므로 저장해 둔 오래된 값을 쓸 여지가 없다.
 * ⚠️ **스크롤러 `clientWidth`로 판정하지 않는다** — 셸 거터·스크롤바만큼 늘 좁아 1024~1041에서 CSS `lg`와 어긋난다.
 * 목업 루트(베젤 안 화면)가 그릇 폭을 채우고 안은 `@container`로 앱 규칙을 고른다(목업에 폭 prop을 넘기지 않는다).
 * M은 CSS `sm` 미만에서 툴바를 숨기고 상단도 8px로 둔다. D·T의 44px 툴바와 모든 그릇의 외곽선·그림자는 유지한다. 재생 중 그릇은 바뀌지 않아 스크롤 프레임은
 * transform·opacity만 쓴다(레이아웃 0) — 다섯 씬 레이어가 배치된 채로 교차한다.
 *
 * ⚠️ **프레임마다 setState하지 않는다** — 씬 DOM이 수천 노드라 재조정이 스크롤을 먹는다. 스크롤 → rAF에서
 * `frame()`(순수) → ref로 transform·opacity·`data-*`·텍스트 노드를 직접 쓴다. 이 컴포넌트는 한 번 렌더된다.
 *
 * ⚠️ **SSR·JS 없음에서는 접혀 있고 프레임이 보이지 않는다** — 배율이 없으면 1440 폭 컨테이너(SSR 기본 D 그릇)가 패널을 넘치므로 프레임·크롬이
 * `invisible`이다. 트랙은 `data-ready`가 선 뒤에만 고정 구간 길이를 갖는다(그 전엔 패널 1개 높이 — 빈 세로 구간이 남지 않는다). 첫 틱이
 * 그릇 폭·높이를 `data-ready`보다 먼저 쓰므로 모바일 방문자에게 D가 비치지 않는다.
 *
 * ⚠️ **캡션 높이는 잰 값이다** (design §4) — 다섯 문장이 같은 grid 칸에 겹쳐 칸 높이가 가장 긴 문장이고, 좁으면 감긴다(고정 28이 아니다).
 * `chromeRef`의 높이를 틱이 재 간격 16을 더해 `frame()`에 넘긴다. 세로가 목업 최소 표시조차 못 담으면(`pinnable` false) 고정 재생을
 * 접고 같은 5씬을 정적 흐름으로 보인다 — 모드가 바뀔 때만 setState하고 프레임마다는 여전히 0이다.
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
  const blockRef = useRef<HTMLDivElement | null>(null);
  const captionRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  /** 높이 부족 — 고정 재생 대신 정적 흐름. 틱이 모드가 바뀔 때만 쓴다. */
  const [isStatic, setIsStatic] = useState(false);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const frameNode = frameRef.current;
    const chrome = chromeRef.current;
    const block = blockRef.current;
    if (!root || !track || !frameNode || !chrome || !block) return;
    // 셸의 스크롤러가 스테이지의 뷰포트다(`components/public-shell/scroller.tsx`). 없으면 접힌 채로 둔다.
    const scroller = root.closest<HTMLElement>("[data-public-scroller]");
    if (scroller === null) return;
    const typedNodes = [...frameNode.querySelectorAll<HTMLElement>("[data-landing-typed]")];

    // matchMedia는 effect 안에서만 읽는다(SSR에 없다).
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // 그릇 질의 — 리스너 없이 틱이 `.matches`를 읽는다(위 머리 주석).
    const wide = window.matchMedia(WIDE_QUERY);
    const sm = window.matchMedia(SM_QUERY);
    let reduced = motion.matches;
    let pending = 0;
    let ready = false;
    let staticNow = false;
    /** 직전 프레임의 H·stageTop·scrollTop — 리사이즈 때 재생 위치를 보존하는 데 쓴다. */
    let lastH = 0;
    let lastStageTop = 0;
    let lastScrollTop = 0;
    /** 같은 값을 다시 쓰지 않는다 — 루트·스크롤러의 CSS 변수는 서브트리 전체의 스타일을 무효화한다. */
    let written = { stageH: "", width: "", height: "", transform: "", chromeTransform: "", caption: -1, typed: "", chromeW: -1, staticScale: -1, staticCanvas: "" };

    /** 트랙 윗변의 스크롤러 좌표. offsetTop은 offsetParent에 매여 셸 구조가 바뀌면 조용히 틀린다. */
    const stageTopOf = () => track.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

    const setStageH = (H: number) => {
      const value = `${H}px`;
      if (value === written.stageH) return;
      // 스테이지 높이만 스크롤러에 쓴다 — 랜딩 배경 캔버스(`app/page.tsx`의 `[data-landing-kv]` 래퍼)가 스테이지 밖에서 같은 값을 읽는다
      // (landing-kv-background R3). 스크롤러는 페이지마다 다시 마운트되므로 다른 공개 화면에 남지 않는다.
      scroller.style.setProperty("--landing-stage-h", value);
      root.style.setProperty("--landing-track-h", `${trackHeight(H)}px`);
      written = { ...written, stageH: value };
    };

    const paint = (f: Frame) => {
      // 그릇 폭·높이와 배율·캡션 자리는 크기·뷰포트에서만 바뀐다 — 스크롤 틱마다 같은 문자열을 다시 쓰지 않는다.
      const width = `${f.canvasW}px`;
      if (width !== written.width) {
        frameNode.style.width = width;
        written = { ...written, width };
      }
      const height = `${f.canvasH}px`;
      if (height !== written.height) {
        frameNode.style.height = height;
        written = { ...written, height };
      }
      const transform = `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`;
      if (transform !== written.transform) {
        frameNode.style.transform = transform;
        written = { ...written, transform };
      }
      const chromeTransform = `translate3d(0px, ${f.chromeY}px, 0px)`;
      if (chromeTransform !== written.chromeTransform) {
        chrome.style.transform = chromeTransform;
        written = { ...written, chromeTransform };
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
      // 다섯 문장이 한 칸에 겹쳐 있다 — 활성 번호가 바뀔 때만 `data-active`와 비활성의 opacity 0을 쓴다(같은 값의 속성 쓰기도 스타일을 무효화한다).
      // 활성 캡션의 opacity만 전환 중 매 틱 움직인다.
      if (f.caption.index !== written.caption) {
        captionRefs.current.forEach((node, k) => {
          if (!node) return;
          const active = k === f.caption.index;
          node.dataset.active = active ? "1" : "0";
          if (!active) node.style.opacity = "0";
        });
        written = { ...written, caption: f.caption.index };
      }
      const activeCaption = captionRefs.current[f.caption.index];
      if (activeCaption) activeCaption.style.opacity = String(f.caption.opacity);
      const text = typedPrefix(typed, f.typed);
      if (text !== written.typed) {
        for (const node of typedNodes) node.textContent = text;
        written = { ...written, typed: text };
      }
    };

    const enterStatic = (scale: number, device: Device) => {
      if (!staticNow) {
        staticNow = true;
        ready = false;
        track.removeAttribute("data-ready");
        track.setAttribute("data-static", "");
        setIsStatic(true);
      }
      if (scale !== written.staticScale) {
        root.style.setProperty("--landing-static-scale", String(scale));
        written = { ...written, staticScale: scale };
      }
      // 정적 장도 같은 그릇이다 — 크기를 CSS 변수로 쓴다(setState 0 · 씬 DOM 재렌더 없음).
      const staticCanvas = `${STATE_CANVAS_W[device]}x${STATE_CANVAS_H[device]}`;
      if (staticCanvas !== written.staticCanvas) {
        root.style.setProperty("--landing-canvas-w", `${STATE_CANVAS_W[device]}px`);
        root.style.setProperty("--landing-canvas-h", `${STATE_CANVAS_H[device]}px`);
        written = { ...written, staticCanvas };
      }
    };

    const leaveStatic = () => {
      if (!staticNow) return;
      staticNow = false;
      track.removeAttribute("data-static");
      setIsStatic(false);
    };

    /**
     * ⚠️ **트랙 높이가 H에 비례하므로** 리사이즈 뒤 scrollTop을 그대로 두면 재생 위치가 튄다 — 씬 ③을 보던 사람이
     * 창을 키우면 씬 ②로 되감긴다. 고정 구간 안이면 직전 위치(H 단위)를 새 H로 되돌려 놓는다.
     * ⚠️ **`H`가 그대로여도 `stageTop`이 움직이면 같은 일이 난다** — `lg` 경계를 넘으면 트랙 여백(`mt-16 lg:mt-30`)과 히어로 h1(48 → 30)이
     * 바뀌어 q가 ΔstageTop/H만큼 튄다. 둘 중 하나라도 바뀌면 직전 `u`로 되돌린다.
     * ⚠️ **u는 직전에 칠한 scrollTop으로 잰다** — 스크롤 앵커링(Chrome·Firefox)이 틱 전에 scrollTop을 Δ만큼 먼저 옮겨 두므로, 현재 값으로 재면
     * 그 Δ를 한 번 더 더해 q가 반대로 튄다(리뷰 R1). 직전 값이면 앵커링이 있든 없든 같은 위치로 돌아간다.
     *
     * ⚠️ **보존은 관찰자 콜백이 아니라 여기서 한다** — 콜백은 레이아웃 뒤, rAF는 레이아웃 전에 돌아서 드래그 리사이즈에서는
     * 틱이 새 H를 먼저 읽는다. 콜백에서 하면 틱이 `lastH`를 덮은 뒤라 "바뀐 것 없음"으로 건너뛰었다(702 → 902가 q 2.3을 1.8로).
     */
    const tick = () => {
      pending = 0;
      const W = scroller.clientWidth;
      const H = scroller.clientHeight;
      const device = deviceForViewport(wide.matches, sm.matches);
      // ⚠️ 최대 폭을 **재기 전에** 쓴다 — 감긴 높이는 이 폭 기준이다. 폭은 chromeHeight와 무관하다(순환 없음).
      const chromeW = fitScale({ W, H, chromeHeight: 0, device }).chromeW;
      if (chromeW !== written.chromeW) {
        block.style.maxWidth = `${chromeW}px`;
        written = { ...written, chromeW };
      }
      const chromeHeight = CHROME_GAP + chrome.getBoundingClientRect().height;
      const fit = fitScale({ W, H, chromeHeight, device });
      if (!fit.pinnable) {
        // 정적 흐름에서도 H는 쓴다 — 랜딩 배경 캔버스가 이 값으로 스크롤러 높이를 맞춘다. 고정 → 정적 리사이즈가 옛 H를 남기면 캔버스가 더 길다.
        setStageH(H);
        // 정적 흐름은 폭이 정한 배율이다 — 세로로 줄이지 않는다(장마다 자기 높이를 갖는다).
        enterStatic(fit.chromeW / STATE_CANVAS_W[device], device);
        lastH = 0;
        return;
      }
      leaveStatic();
      // ⚠️ stageTop은 1px 문턱으로 본다 — 소수 스크롤 위치에서 rect·scrollTop 합이 틱마다 끝자리가 흔들려, 같음 비교면 스크롤 틱마다 scrollTop을 다시 쓴다.
      if (ready && lastH > 0 && (H !== lastH || Math.abs(stageTopOf() - lastStageTop) >= 1)) {
        const u = (lastScrollTop - lastStageTop) / lastH;
        setStageH(H);
        if (u > 0 && u <= pinnedSpan()) scroller.scrollTop = stageTopOf() + u * H;
      }
      setStageH(H);
      const stageTop = stageTopOf();
      paint(frameAt({ scrollTop: scroller.scrollTop, stageTop, W, H, chromeHeight, reducedMotion: reduced, device }));
      lastH = H;
      lastStageTop = stageTop;
      lastScrollTop = scroller.scrollTop;
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
    // 폰트·언어·폭으로 캡션 줄 수가 바뀌면 같은 관측이 받는다.
    observer.observe(chrome);
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

  // 정적 흐름의 장 — 씬 ②는 다 쳐진 채다(고정 재생의 끝 상태). 씬 ① 이전엔 비어 있다.
  useEffect(() => {
    if (!isStatic) return;
    rootRef.current?.querySelectorAll<HTMLElement>("[data-landing-static] figure").forEach((figure, k) => {
      for (const node of figure.querySelectorAll<HTMLElement>("[data-landing-typed]")) node.textContent = k >= 1 ? typed : "";
    });
  }, [isStatic, typed]);

  return (
    <div ref={rootRef} data-landing-root="">
      <section
        ref={trackRef}
        aria-label={label}
        className="group/track relative mt-16 h-[var(--landing-stage-h,calc(100svh-98px))] data-[ready]:h-[var(--landing-track-h)] data-[static]:h-auto lg:mt-30"
      >
        <ol className="sr-only">
          {captions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>
        {/* `98px` = 공개 셸의 윗 여백 6 · 헤더 44 + 6 · 푸터 40 · 패널 테두리 2(`public-shell.tsx`). ⚠️ 랜딩 패널은 `kv` 갈래라 테두리가 없어(landing-kv-background R13) 실제 스크롤러보다 2px 짧다 — JS 전에만 쓰이고 준비 뒤엔 정적 흐름까지 잰 H로 덮인다. 96으로 맞추지 않는 것은 `calc(100svh-96px)`가 `--spacing-modal-gutter`로 대체된 옛 철자라 `visual-system.test.ts`가 막기 때문이다. 셸 치수가 바뀌면 트랙과 함께 고친다. 정적 흐름에서는 흐름 밖(`absolute`)에서 `invisible`로 남아 캡션 높이를 계속 잰다. */}
        <div className="pointer-events-none sticky top-0 h-[var(--landing-stage-h,calc(100svh-98px))] group-data-[static]/track:absolute group-data-[static]/track:inset-x-0">
          <div
            ref={frameRef}
            data-landing-frame=""
            aria-hidden="true"
            inert
            className="group/frame invisible absolute top-0 left-0 origin-top-left group-data-[ready]/track:visible"
            // SSR·측정 전 기본은 D다 — 틱이 뷰포트의 그릇으로 바꾼다(그 전엔 `invisible`).
            style={{ width: STATE_CANVAS_W[0], height: STATE_CANVAS_H[0] }}
          >
            <Bezel>
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
            </Bezel>
          </div>
          {/* 측정 전엔 정상 흐름(`relative`)이라 겹칠 일이 없고, 준비 뒤에 계산한 윗변(`chromeY`)으로 겹쳐 선다. */}
          <div
            ref={chromeRef}
            data-landing-chrome=""
            aria-hidden="true"
            className="invisible relative inset-x-0 top-0 group-data-[ready]/track:visible group-data-[ready]/track:absolute"
          >
            {/*
              진행 다섯 칸과 캡션을 한 flex-wrap에 — 한 줄이 안 되면 감긴다. 최대 폭은 틱이 프레임 폭으로 쓴다.
              ⚠️ **최소 28(`min-h-7`)이다**(#216) — 한 줄이면 캡션 줄 21만 서서 R5 이전 `h-7`보다 낮았고 `lg` 이상 목업이 3.5 내려갔다. 감긴 블록(≥ 53)은 자연 높이다.
            */}
            <div ref={blockRef} data-landing-chrome-block="" className="mx-auto flex min-h-7 flex-wrap items-center justify-center gap-x-4 gap-y-2">
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
              {/* 다섯 문장이 같은 칸에 겹친다 — 칸 높이가 가장 긴 문장이라 씬마다 예산이 출렁이지 않는다. */}
              <div className="grid text-center">
                {captions.map((text, k) => (
                  <p
                    key={text}
                    ref={(node) => {
                      captionRefs.current[k] = node;
                    }}
                    data-landing-caption={k}
                    data-active={k === 0 ? "1" : "0"}
                    className="col-start-1 row-start-1 m-0 text-base leading-[1.4] text-balance"
                    style={{ fontSize: CAPTION_SIZE, opacity: k === 0 ? 1 : 0 }}
                  >
                    {text}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
        {isStatic && (
          // 높이 부족 — 같은 5씬을 위에서 아래로 한 장씩. 배율은 폭이 정한 CSS 변수 하나(좌우 여백 side를 이미 품는다)이고 캡션이 장 아래에 선다.
          // 장은 고정 재생과 같은 그릇이다 — 크기는 틱이 쓴 `--landing-canvas-w`·`-h`(T 정적 장은 길어진다 — 대가로 수용, DESIGN §6.615).
          <div data-landing-static="" className="flex flex-col items-center gap-12">
            {scenes.map((scene, k) => (
              <figure key={k} aria-hidden="true" className="m-0 flex flex-col items-center gap-4">
                <div
                  className="relative"
                  style={{ width: `calc(${CANVAS_VAR_W} * var(--landing-static-scale, 0))`, height: `calc(${CANVAS_VAR_H} * var(--landing-static-scale, 0))` }}
                >
                  <div
                    inert
                    data-badge={k >= 2 ? "1" : "0"}
                    className="group/frame absolute top-0 left-0 origin-top-left"
                    style={{ width: CANVAS_VAR_W, height: CANVAS_VAR_H, transform: "scale(var(--landing-static-scale, 0))" }}
                  >
                    <Bezel>
                      <div className="absolute inset-0">{scene}</div>
                    </Bezel>
                  </div>
                </div>
                <figcaption className="m-0 text-center text-balance" style={{ fontSize: CAPTION_SIZE, lineHeight: 1.4, maxWidth: `calc(${CANVAS_VAR_W} * var(--landing-static-scale, 0))` }}>
                  {captions[k]}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
      {closing}
    </div>
  );
}
