import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "i18n-poc",
  description: "사내 로컬라이제이션 관리 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/*
          Pretendard 동적 서브셋. globals.css의 @import가 아니라 <link>로 넣는다 —
          CSS @import는 스타일시트 체인을 직렬화해 폰트 요청이 한 단계 늦게 시작된다.
          이 파일은 scripts/copy-fonts.mjs가 만드는 생성물이라 gitignore돼 있다.
        */}
        <link
          rel="stylesheet"
          href="/fonts/pretendard/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
