import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "./globals.css";
import { createMetadata } from "@/lib/seo";
import { fixtureMode } from "@/lib/config";

export const metadata: Metadata = createMetadata({ title: "Shagun" });
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf7f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="sh-skip-link" href="#main-content">Skip to content</a>
        {fixtureMode() && <div className="sh-fixture-banner" role="note">Local test fixtures — not real venues</div>}
        {children}
      </body>
    </html>
  );
}