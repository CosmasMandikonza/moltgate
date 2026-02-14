import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoltGate — x402 Payment Gateway for Stacks",
  description:
    "Gate any API with Bitcoin-secured micropayments. The x402 reverse-proxy payment gateway for the Stacks ecosystem. Zero upstream code changes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="bg-mesh" aria-hidden />
        <div className="bg-grain" aria-hidden />
        <div className="bg-scanlines" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
