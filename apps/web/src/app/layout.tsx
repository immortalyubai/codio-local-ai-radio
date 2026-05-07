import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codio FM",
  description: "Codio FM local AI station"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <main className="shell">
          {children}
        </main>
      </body>
    </html>
  );
}
