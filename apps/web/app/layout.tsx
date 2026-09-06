import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRACE — Trust & Attribution Chain for Visual Evidence",
  description: "Don't trust the image. Trace it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
