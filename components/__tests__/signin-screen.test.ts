import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";
import { AuthLayout } from "@/components/signin/auth-layout";

/**
 * 로그인 화면의 배선을 **소스에서** 센다 (8-1b).
 *
 * `focus-ring`·`translations-screen`·`home-screen`과 같은 계열이다 — **렌더 테스트가 없는 층**을
 * 소스 스캔이 든다. 이 화면이 특히 그런 자리인 이유는 셋이다:
 *
 * 1. **비개발자가 이 제품을 처음 만나는 화면**이고, 깨져도 우리는 로그인돼 있어 안 본다
 * 2. 지켜야 할 것 대부분이 **눈에 안 보이는 속성**이다(1280px 최소 너비 · `aria-hidden` ·
 *    토스트 duration · 이미지 컴포넌트 종류)
 * 3. 그 속성들은 **틀려도 화면이 정상으로 보인다** — 이 리포가 반복해 밟은 부류다
 *    (POSTMORTEM 2026-09-05·09-06)
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** ⚠️ **주석을 벗기고 센다** — docstring이 자기가 피하는 것을 이름으로 적는다. */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const SIGNIN = "app/signin/page.tsx";
/**
 * ⚠️ **골격은 공유 컴포넌트가 든다** (8-1b) — 로그인과 초대 수락이 같은 2열 형을 쓰기 때문이다.
 * 이 검사가 보는 것은 **계약이지 파일이 아니므로**, 그 계약이 사는 자리를 따라간다.
 */
const SHELL = "components/signin/auth-layout.tsx";
const ROOT_LAYOUT = "app/layout.tsx";
const TOAST = "components/signin/auth-toast.tsx";
const DOTS = "components/signin/dot-field.tsx";
const ICONS = "components/signin/brand-icons.tsx";

describe("키비주얼 — 개별 카드", () => {
  const html = renderToStaticMarkup(createElement(AuthLayout, { children: null }));
  const images = html.match(/<img\b[^>]*>/g) ?? [];

  it("프로젝트와 번역 카드 세 장을 각각 장식 이미지로 렌더한다", () => {
    expect(images).toHaveLength(4);
    for (const number of [1, 2, 3, 4]) {
      expect(images.filter((tag) => tag.includes(`malmoi-kv-${number}.png`))).toHaveLength(1);
    }
    for (const tag of images) expect(tag).toContain('alt=""');
  });

  it("기존 캔버스 비율과 최대 너비를 보존한다", () => {
    expect(html).toContain("aspect-[724/332]");
    expect(html).toContain("max-w-[768px]");
  });

  it("번역 카드만 움직이고 모션 줄이기 설정을 존중한다", () => {
    expect(images.filter((tag) => tag.includes("motion-safe:group-hover:-translate-y-2"))).toHaveLength(3);
    expect(images.filter((tag) => tag.includes("motion-reduce:transition-none"))).toHaveLength(3);
    expect(html).not.toMatch(/tabindex|role="button"/i);
  });

  it("뒤쪽 프로젝트 카드에는 그림자가 없다", () => {
    const project = images.find((tag) => tag.includes("malmoi-kv-1.png"));
    expect(project).toBeDefined();
    expect(project).not.toContain("shadow-");
  });
});

describe("로그인 화면 — 레이아웃 계약", () => {
  /** 화면과 그 골격을 함께 본다 — 계약이 둘 중 어디에 있든 지켜지면 된다. */
  const src = read(SIGNIN) + read(SHELL);

  /** 스캐너가 조용히 0건이 되지 않는다 — 이 리포의 모든 소스 스캔이 갖는 자기검사다. */
  it("소스를 실제로 읽었다", () => {
    expect(src.length).toBeGreaterThan(200);
  });

  /**
   * ⚠️ **`min-w-`가 없으면 "1280 미만에서 가로 스크롤"이 실제로 안 일어난다** (규약 3).
   * grid가 그냥 압축되고 우측 키비주얼만 잘린다 — 규약이 허용한 것은 스크롤이지 잘림이 아니다.
   */
  it("최소 너비 1280px를 든다 — 그 아래에서 스크롤이 나야 한다", () => {
    expect(src).toMatch(/min-w-\[1280px\]/);
  });

  /**
   * ⚠️ **`lg:` 분기는 죽은 코드다** — 1280px 고정이므로 그 분기점이 영영 안 걸린다.
   * 남겨 두면 다음 사람이 "반응형이 있다"고 읽는다.
   */
  it("`lg:` 분기가 없다 — 모바일 대응을 생략했다", () => {
    expect(src).not.toMatch(/\blg:/);
  });

  /**
   * ⚠️ **인라인 `Alert`를 두지 않는다** (규약 8). 피드백 경로가 둘이면 하나가 낡는다.
   * **초대 화면은 예외다** — 거기 Layer A는 페이지 콘텐츠 자체라 인라인이 맞고, 그래서
   * 이 검사는 `signin/page.tsx`만 본다.
   */
  it("인라인 Alert가 없다 — 피드백은 토스트 하나다", () => {
    expect(src).not.toMatch(/<Alert\b/);
  });

  /** 경로 리터럴이 흩어지면 다음 이관에서 조용히 낡는다 (POSTMORTEM 2026-09-05). */
  it("내부 링크가 `routes.*`를 지난다", () => {
    expect(src).toMatch(/routes\.privacy\(\)/);
    expect(src).toMatch(/routes\.docs\(\)/);
  });
});

describe("로그인 화면 — 장식은 접근성 트리 밖이다", () => {
  const dots = read(DOTS);
  const signin = read(SIGNIN) + read(SHELL);

  /** 948px짜리 장식이고 포커스 대상이 아니다 — 스크린리더가 읽을 내용이 0이다. */
  it("도트 캔버스가 `aria-hidden`이다", () => {
    expect(dots).toMatch(/aria-hidden/);
  });

  /**
   * ⚠️ **`alt=""`로 두는 판정의 성립 조건은 우측 문구 두 줄이다** — 그것이 같은 메시지를
   * 이미 말하고 있어야 장식이 된다. 아니면 제품이 무엇을 하는지 보여주는 유일한 조각이
   * 스크린리더·이미지 차단에서 통째로 사라진다.
   */
  it("키비주얼이 `alt=\"\"`다 — 장식이다", () => {
    expect(signin).toMatch(/alt=""/);
  });

  /**
   * ⚠️ **`<img>`면 372KB PNG가 그대로 나가고 LCP 요소가 된다.** `design.md` §6.2가
   * "`next/image`가 WebP로 변환한다"를 **PNG 하나만 커밋하는 근거**로 삼았으므로, 순수
   * `<img>`를 쓰면 그 근거가 무너진다. 로그인은 첫 진입점이고 서버 시간이 짧아진 뒤라
   * 이 화면의 비용은 거의 전부 이 이미지다.
   */
  it("키비주얼이 `next/image`다 — 372KB가 원본 그대로 나가지 않는다", () => {
    expect(signin).toMatch(/from "next\/image"/);
    expect(signin).toMatch(/priority/);
  });
});

describe("토스트 배선", () => {
  const layout = read(ROOT_LAYOUT);
  const toast = read(TOAST);

  /**
   * ⚠️ **`theme="light"`를 안 주면 OS 다크에서 토스트만 어두워진다** — `sonner`가 테마를
   * 스스로 감지하므로, 라이트 단일(DESIGN §3)이 **그 컴포넌트에서만** 깨진다.
   */
  it("Toaster가 라이트로 고정돼 있다", () => {
    expect(layout).toMatch(/<Toaster\b/);
    expect(layout).toMatch(/theme="light"/);
  });

  /** ⚠️ StrictMode에서 effect가 두 번 돌아 **토스트가 둘**이 된다 — 같은 id는 갱신된다. */
  it("토스트 id를 고정한다 — StrictMode 이중 실행이 쌓이지 않는다", () => {
    expect(toast).toMatch(/id:\s*["'`]/);
  });

  /**
   * ⚠️ **거부 사유는 조치가 필요한 정보다**("이메일이 검증되지 않았다"). 4초 뒤 사라지면
   * 화면에 설명이 0이 된다 — 인라인 Alert를 걷어낸 대가를 여기서 갚는다.
   */
  it("거부·장애는 닫기 전까지 남는다", () => {
    expect(toast).toMatch(/duration:\s*Infinity/);
  });

  /**
   * ⚠️ **`?error=`를 URL에서 지우지 않는다** — 지우면(`router.replace`) 새로고침으로 다시
   * 볼 길이 사라진다. 남겨 두면 새로고침이 곧 "다시 보기"다.
   */
  it("쿼리를 URL에서 지우지 않는다", () => {
    expect(toast).not.toMatch(/router\.replace|history\.replaceState/);
  });
});

describe("브랜드 아이콘의 자리", () => {
  /**
   * ⚠️ **`components/ui/`가 아니다.** 그 디렉터리는 프리미티브의 집이고 브랜드 글리프는
   * 프리미티브가 아니다 — DESIGN §6.8이 *"provider 로고가 필요하면 인라인 SVG를 그 컴포넌트
   * 안에 둔다"*로 이미 답해 뒀다. `ui/`에 두면 §6.4 표에 행을 늘려야 한다.
   */
  it("`components/signin/`에 산다", () => {
    expect(read(ICONS).length).toBeGreaterThan(100);
  });

  /** `lucide-react`에는 브랜드 아이콘이 없다 — 그 라이브러리가 브랜드 글리프를 제외한다. */
  it("lucide가 아니라 인라인 SVG다", () => {
    const src = read(ICONS);
    expect(src).not.toMatch(/from "lucide-react"/);
    expect(src).toMatch(/<svg/);
  });
});
