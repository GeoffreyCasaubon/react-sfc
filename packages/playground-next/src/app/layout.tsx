import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "RSFC Playground — Next.js",
  description: "React Single File Components with Next.js 15 + SSR",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 1rem;
            font-family: system-ui, -apple-system, sans-serif;
            background: #f8fafc;
            color: #1e293b;
          }
          h1, h2, h3 { line-height: 1.2; }
          code { font-family: ui-monospace, monospace; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
