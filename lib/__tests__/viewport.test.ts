import { describe, expect, it } from "vitest";

import { viewportFor } from "../viewport";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15";
const IPHONE_KAKAO = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0";
const IPAD_MOBILE = "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const IPOD = "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";
/** iPadOS 데스크톱 모드 — UA가 Mac과 같아 서버가 가를 수 없다. 2026-10-18 사용자: 판정에 넣지 않는다. */
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const BASE = { interactiveWidget: "resizes-content" };

describe("viewportFor — iOS만 포커스 자동 확대를 막는다", () => {
  it.each([
    ["iPhone Safari", IPHONE_SAFARI],
    ["iPhone Chrome(CriOS)", IPHONE_CHROME],
    ["iPhone Firefox(FxiOS)", IPHONE_FIREFOX],
    ["카카오톡 인앱", IPHONE_KAKAO],
    ["인스타그램 인앱", IPHONE_INSTAGRAM],
    ["iPad(모바일 UA)", IPAD_MOBILE],
    ["iPod", IPOD],
  ])("%s → maximumScale 1", (_name, ua) => {
    expect(viewportFor(ua)).toEqual({ ...BASE, maximumScale: 1 });
  });

  it.each([
    ["Android Chrome", ANDROID_CHROME],
    ["Samsung Internet", SAMSUNG],
    ["Windows Chrome", WINDOWS_CHROME],
    ["Mac Safari(iPad 데스크톱 모드 포함)", MAC_SAFARI],
    ["UA 없음", null],
    ["빈 UA", ""],
  ])("%s → 확대 제한 없음", (_name, ua) => {
    expect(viewportFor(ua)).toEqual(BASE);
  });

  it("어떤 UA에서도 사용자 확대를 끄지 않는다(userScalable)", () => {
    for (const ua of [IPHONE_SAFARI, IPHONE_KAKAO, ANDROID_CHROME, MAC_SAFARI, null]) {
      expect(viewportFor(ua)).not.toHaveProperty("userScalable");
    }
  });

  it("모든 UA에서 키보드가 dvh를 줄인다(interactiveWidget — D20)", () => {
    for (const ua of [IPHONE_SAFARI, ANDROID_CHROME, WINDOWS_CHROME, null]) {
      expect(viewportFor(ua).interactiveWidget).toBe("resizes-content");
    }
  });
});
