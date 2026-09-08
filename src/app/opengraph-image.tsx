import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "Shagun — wedding venues, city by city. An original decorative arch, not a venue photograph.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const font = await readFile(join(process.cwd(), "node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff"));
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#faf7f2", color: "#432c3d", padding: "58px 70px", fontFamily: "Shagun Display" }}>
      <div style={{ width: "66%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 48 }}>Shagun<span style={{ color: "#9b654f" }}>.</span></div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 79, lineHeight: 1.03, letterSpacing: "-2px" }}>
          <span>Every celebration</span><span>begins with a place.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 25 }}>
          <span>Wedding venues, city by city.</span><span style={{ fontSize: 20, color: "#54675a" }}>Open details. Direct conversations.</span>
        </div>
      </div>
      <div style={{ width: "34%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="330" height="460" viewBox="0 0 330 460" fill="none">
          <path d="M12 437V174a153 153 0 0 1 306 0v263Z" fill="#e6eae1" />
          <path d="M36 437V177a129 129 0 0 1 258 0v260Z" stroke="#a9b29f" />
          <path d="M61 419V180a104 104 0 0 1 208 0v239Z" fill="#d5bdac" />
          <path d="M81 419V180a84 84 0 0 1 168 0v239Z" fill="#f2e6d7" />
          <path d="M102 419V181a63 63 0 0 1 126 0v238Z" fill="#694b5c" />
          <path d="M165 123c-6 91-23 122-63 150v-92a63 63 0 0 1 63-58Zm0 0c6 91 23 122 63 150v-92a63 63 0 0 0-63-58Z" fill="#efddc5" />
          <path d="M165 44v42m-10-24h20M48 419h234v12H48Zm-14 12h262v13H34Z" stroke="#a67a58" fill="#d5bdac" />
          <path d="M50 420c-2-47-20-69-21-112m19 80c21-9 24-29 17-40-19 9-23 27-17 40Zm-7-23c-21-3-33-19-30-36 21 3 31 16 30 36Zm239 55c2-47 20-69 21-112m-19 80c-21-9-24-29-17-40 19 9 23 27 17 40Zm7-23c21-3 33-19 30-36-21 3-31 16-30 36Z" fill="#54675a" />
          <path d="M32 413h35l-5 29H37Zm231 0h35l-5 29h-25Z" fill="#9b654f" />
        </svg>
      </div>
    </div>,
    { ...size, fonts: [{ name: "Shagun Display", data: font, weight: 600, style: "normal" }] },
  );
}