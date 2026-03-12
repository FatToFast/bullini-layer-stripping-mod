import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bullini Layer Stripping",
  description: "Standalone local workbench for the Layer-Stripping analysis pipeline.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
