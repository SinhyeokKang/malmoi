"use client";

import { useEffect, useRef } from "react";

import { dotGrid, dotScale } from "@/lib/signin/dot-field";

/** 시안 값 — 지름 4px(반지름 2), 간격 16px. 커서 반경과 확대치는 목측으로 정했다. */
const GAP = 16;
const BASE_RADIUS = 2;
const MAX_RADIUS = 3.5;
const CURSOR_RADIUS = 180;

/**
 * 로그인 우측의 커서 추종 도트 (8-1b).
 *
 * ⚠️ **Canvas인 이유**: 시안의 도트가 커서 주변에서 스케일하는데 `radial-gradient` 배경은
 * **개별 도트가 요소가 아니라** 스케일 대상이 없고, DOM으로 그리면 948×1064 / 16px ≈ **4,000개**라
 * 리페인트로 죽는다.
 *
 * ⚠️ **판정은 `lib/signin/dot-field.ts`가 든다** — 그 모듈이 **import 0인 잎**이라
 * `client-graph.test.ts`의 그래프 검사를 지난다. 여기 있는 것은 캔버스 배선뿐이다.
 */
export function DotField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    /**
     * ⚠️ **`const`로 받는 것이 요지다.** `ref.current`를 콜백 안에서 다시 읽거나 `canvas!`로
     * 단언하면, TS가 아래 좁힘을 콜백까지 못 들고 가서 단언이 네 자리로 번진다 — 단언은
     * "여기서 null이 아니다"를 사람이 보증하는 것이라 effect 구조가 바뀌어도 조용하다.
     */
    const canvas = ref.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    /**
     * ⚠️ **색을 tsx에 hex로 박지 않는다** — 리포에 tsx 내 hex 리터럴이 0건이다(DESIGN §6.2).
     * CSS 커스텀 프로퍼티에서 읽어 값의 집을 `globals.css` 하나로 둔다.
     *
     * ⚠️ **폴백을 두지 않는다.** 이 코드는 effect 안에서만 돌므로 스타일시트가 이미 적용된
     * 뒤이고(SSR 경로가 없다), 폴백을 두면 **같은 색의 두 번째 사본**이 생겨 `globals.css`를
     * 고쳐도 여기가 안 따라오는 자리가 된다. 토큰이 없으면 도트가 안 보이는 것이 맞다 —
     * 그래야 그것이 결함으로 드러난다.
     */
    const color = getComputedStyle(canvas).getPropertyValue("--signin-dot").trim();

    /** 커서는 캔버스 좌표계다. `null`이면 확대 없이 기본 크기만 그린다. */
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    /** ⚠️ 루프가 도는 동안만 참 — 중복 rAF 예약을 막는다. */
    let running = false;

    let dots = dotGrid(0, 0, GAP);
    let width = 0;
    let height = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (const dot of dots) {
        const radius =
          pointer === null
            ? BASE_RADIUS
            : dotScale(Math.hypot(dot.x - pointer.x, dot.y - pointer.y), CURSOR_RADIUS, BASE_RADIUS, MAX_RADIUS);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = () => {
      draw();
      /**
       * ⚠️ **커서가 나가면 멈춘다.** `mouseleave`에서 `pointer`를 비우고 한 프레임 더 그린 뒤
       * 루프를 끝낸다 — 정지 화면에서 rAF가 계속 도는 것을 막는다.
       */
      if (pointer === null) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      /**
       * ⚠️ **DPR을 반영한다** — 안 하면 레티나에서 4px 도트가 뭉개진다. 버퍼는 물리 픽셀이고
       * 좌표계는 CSS 픽셀이라 `scale`로 되돌린다.
       */
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = dotGrid(width, height, GAP);
      draw();
    };

    resize();

    /**
     * ⚠️ **`prefers-reduced-motion`이면 rAF를 아예 시작하지 않는다.** 로그인은 첫 진입점이라
     * 여기서 배터리를 태우지 않는다. `matchMedia`는 **effect 안**에서 읽는다 — SSR에 없다.
     */
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    /**
     * ⚠️ **이 effect의 함수가 전부 화살표다.** `function` 선언은 호이스팅되므로 TS가 위
     * `canvas !== null`·`ctx !== null` 좁힘을 그 안까지 들고 가지 못하고, 그러면 `canvas!`·`ctx!`
     * 단언이 되살아난다 — 실제로 하나만 바꿨더니 에러가 다른 함수로 옮겨 다녔다.
     */
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      start();
    };
    const onLeave = () => {
      pointer = null;
      /** 루프가 이미 멈춰 있으면 한 번 그려서 기본 크기로 되돌린다. */
      if (!running) draw();
    };

    if (motionOk) {
      /**
       * ⚠️ **`pointerenter`가 아니라 `pointermove`로 시작한다** — 캔버스 위에서 처음 움직인
       * 순간이 곧 좌표를 아는 순간이다. 어느 쪽이든 **패널에 한 번도 안 가는 기본 경로**
       * (좌측 버튼 둘만 누른다)에서는 루프가 돌지 않는다.
       */
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  /** ⚠️ **장식이라 접근성 트리 밖이다** — 948px짜리 배경이고 읽을 내용이 0이다. */
  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
