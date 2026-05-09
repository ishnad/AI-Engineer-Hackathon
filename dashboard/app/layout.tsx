import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Ring0 — The AI Cold-Call Killer",
  description: "Every scam call, weaponised.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#fff" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
