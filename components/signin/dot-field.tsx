"use client";

import { useEffect, useRef } from "react";

import { autoCursor, dotGrid, dotScale } from "@/lib/signin/dot-field";

/** 시안 값 — 지름 4px(반지름 2), 간격 16px. 커서 반경과 확대치는 목측으로 정했다. */
const GAP = 16;
const BASE_RADIUS = 2;
const MAX_RADIUS = 3.5;
const CURSOR_RADIUS = 180;

/**
 * ⚠️ **크기와 투명도를 함께 보간한다** (2026-09-10 사용자). 크기만 바꾸면 커서 주변이 "커진 점"일
 * 뿐이고, 알파가 같이 오르면 **빛이 따라오는 것처럼** 읽힌다. 반경 밖에서 기본값으로 수렴하므로
 * 경계가 생기지 않는다.
 *
 * 기본 알파는 시안(5%)보다 한 단계 진하다 — 그 값에서는 도트가 거의 안 보였다.
 */
const BASE_ALPHA = 0.08;
const MAX_ALPHA = 0.3;

/**
 * 커서가 없을 때의 **자동 순회** (2026-09-10 사용자). 가상 커서가 ㄹ자로 천천히 지나간다.
 *
 * ⚠️ **가로·세로가 같은 속도다** — `autoCursor`가 줄바꿈도 같은 px/s로 움직이므로 코너에서
 * 속도가 튀지 않는다. 너무 빠르면 장식이 아니라 로딩 인디케이터로 읽히고 로그인 버튼에서
 * 시선을 빼앗는다 — 640px 폭 기준 한 줄에 약 2초다.
 */
const AUTO_SPEED = 320;
const AUTO_ROWS = 5;

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

    /**
     * **실제** 커서. 캔버스 좌표계이고 `null`이면 자동 순회가 대신 든다.
     *
     * ⚠️ **실제 커서가 항상 이긴다** — 사용자가 움직이는 동안 가상 커서가 겹쳐 돌면 도트가
     * 두 군데서 밝아져 어느 쪽이 자기 커서인지 알 수 없다.
     */
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    /** ⚠️ 루프가 도는 동안만 참 — 중복 rAF 예약을 막는다. */
    let running = false;

    let dots = dotGrid(0, 0, GAP);
    let width = 0;
    let height = 0;

    /**
     * ⚠️ **`prefers-reduced-motion`이면 rAF를 아예 시작하지 않는다.** 로그인은 첫 진입점이라
     * 여기서 배터리를 태우지 않는다 — 자동 순회도 애니메이션이므로 그때는 정적 렌더 한 번이다.
     * `matchMedia`는 **effect 안**에서 읽는다(SSR에 없다).
     */
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** 자동 순회의 기준 시각 — effect가 살아 있는 동안 고정이다. */
    const startedAt = performance.now();

    /**
     * 지금 도트가 반응해야 할 지점. **실제 커서가 항상 이긴다** — 사용자가 움직이는 동안 가상
     * 커서가 겹쳐 돌면 도트가 두 군데서 밝아져 어느 쪽이 자기 커서인지 알 수 없다.
     *
     * ⚠️ `motionOk`가 거짓이면 **둘 다 없다** — 정적 렌더가 되어야 한다.
     */
    const focus = (): { x: number; y: number } | null => {
      if (pointer !== null) return pointer;
      if (!motionOk) return null;
      return autoCursor(performance.now() - startedAt, width, height, AUTO_SPEED, AUTO_ROWS);
    };

    const draw = () => {
      const spot = focus();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (const dot of dots) {
        /**
         * ⚠️ **같은 보간 함수를 두 번 부른다** — 크기용·알파용으로 함수를 따로 만들면 두 곡선이
         * 갈려 커서 주변에 링이 생긴다. 거리는 한 번만 잰다.
         */
        const distance = spot === null ? Infinity : Math.hypot(dot.x - spot.x, dot.y - spot.y);
        ctx.globalAlpha = dotScale(distance, CURSOR_RADIUS, BASE_ALPHA, MAX_ALPHA);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotScale(distance, CURSOR_RADIUS, BASE_RADIUS, MAX_RADIUS), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = () => {
      draw();
      /**
       * ⚠️ **`prefers-reduced-motion`이면 한 프레임만 그리고 끝낸다** — 자동 순회도 애니메이션이다.
       * 그 외에는 커서가 나가도 **가상 커서가 이어받으므로** 루프가 계속 돈다.
       */
      if (!motionOk) {
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

    /** ⚠️ 커서가 없어도 도는 루프이므로 시작 조건이 여기 하나다. */
    if (motionOk) start();

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

    /** ⚠️ 커서가 나가면 **자동 순회가 이어받는다** — 루프를 멈추지 않는다. */
    const onLeave = () => {
      pointer = null;
    };

    if (motionOk) {
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
