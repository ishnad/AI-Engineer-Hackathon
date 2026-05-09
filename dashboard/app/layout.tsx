import type { Metadata } from "next";
import { Providers } from "./providers";
import "./styles.css";

export const metadata: Metadata = {
  title: "Ring0 — The AI Cold-Call Killer",
  description: "Every scam call, weaponised.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
