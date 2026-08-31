import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 타입·린트 오류를 빌드가 삼키지 않게 둔다(기본값이지만 명시). 게이트는 pnpm typecheck다.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
