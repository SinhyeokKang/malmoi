import { describe, expect, it } from "vitest";

import { isPublicAddress } from "../ssrf";

/**
 * CIMD 문서 가져오기의 SSRF 방어 (mcp-oauth design §2) — **DNS 해석 뒤** 주소를 본다. 호스트 이름이 무엇이든 사설·루프백·링크 로컬·예약
 * 대역으로 풀리면 가져오지 않는다. IPv4를 품은 IPv6(mapped · NAT64)는 품은 주소로 판정한다 — 그 모양이 사설 대역 우회의 고전이다.
 */
describe("isPublicAddress", () => {
  it("공개 주소는 받는다", () => {
    for (const ip of ["8.8.8.8", "160.79.104.10", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4001:82a::200e"]) expect(isPublicAddress(ip)).toBe(true);
  });

  it("IPv4 사설·루프백·링크 로컬(메타데이터)·CGNAT·예약·멀티캐스트는 거부한다", () => {
    for (const ip of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255",
      "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.9", "224.0.0.1", "240.0.0.1", "255.255.255.255"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("100.128.0.1")).toBe(true);
  });

  it("IPv6 루프백·미지정·ULA·링크 로컬·멀티캐스트·문서 대역은 거부한다", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1", "ff02::1", "2001:db8::1", "0:0:0:0:0:0:0:1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("IPv4를 품은 IPv6는 품은 주소로 판정한다", () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a9fe:a9fe", "64:ff9b::169.254.169.254", "::127.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("6to4(2002::/16)는 품은 IPv4로 판정한다", () => {
    expect(isPublicAddress("2002:7f00:1::")).toBe(false);
    expect(isPublicAddress("2002:a9fe:a9fe::1")).toBe(false);
    expect(isPublicAddress("2002:0808:0808::1")).toBe(true);
  });

  it("Teredo · NAT64 local-use · SIIT · 새 문서 대역은 거부한다", () => {
    for (const ip of ["2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "64:ff9b:1::a9fe:a9fe", "64:ff9b:1:ffff::8.8.8.8", "::ffff:0:7f00:1", "::ffff:0:808:808", "3fff::1", "3fff:0fff::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    // 경계 밖 — 2001:1::/32(Teredo 아님)·3fff:1000::(3fff::/20 밖)은 이 규칙으로 막지 않는다.
    expect(isPublicAddress("2001:4860::8888")).toBe(true);
    expect(isPublicAddress("3fff:1000::1")).toBe(true);
  });

  it("주소가 아닌 문자열은 거부한다", () => {
    for (const ip of ["", "localhost", "1.2.3", "1.2.3.256", "::gg", "1::2::3", "01.2.3.4"]) expect(isPublicAddress(ip), ip).toBe(false);
  });
});
