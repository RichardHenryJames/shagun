import "server-only";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { fixtureMode } from "@/lib/config";
import { fixturePhoto } from "@/lib/testing/fixtures";

const rendered = new Map<string, Buffer>();

/** In-memory diagrams only: no filenames, storage clients, uploads, or network requests. */
export async function renderFixtureImage(id: string, width: 480 | 960 | 1600): Promise<Buffer | null> {
  // Guard BEFORE lookup and BEFORE the cache, including every subsequent request.
  if (!fixtureMode()) return null;
  if (width !== 480 && width !== 960 && width !== 1600) return null;
  const photo = fixturePhoto(id);
  if (!photo) return null;
  const key = `${photo.id}:${width}`;
  const cached = rendered.get(key);
  if (cached) return Buffer.from(cached);

  // Only a fixed allowlisted photo's numeric position influences the SVG. No user text is embedded.
  const card = photo.sort_order + 1;
  const accent = ["#54675a", "#694b5c", "#9b654f", "#385a73", "#685d34", "#655483"][photo.sort_order % 6];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
    <title>Synthetic test image ${card}</title>
    <desc>Original geometric test-card diagram. Not a venue photograph or a depiction of a real place.</desc>
    <rect width="1600" height="1000" fill="#faf7f2"/>
    <rect x="36" y="36" width="1528" height="928" rx="24" fill="none" stroke="${accent}" stroke-width="8" stroke-dasharray="24 16"/>
    <g fill="#241d24" text-anchor="middle" font-family="sans-serif">
      <text x="800" y="165" font-size="66" font-weight="700">SYNTHETIC TEST IMAGE</text>
      <text x="800" y="247" font-size="50">Not a venue photograph</text>
    </g>
    <g fill="none" stroke="${accent}" stroke-width="12">
      <rect x="198" y="347" width="290" height="290" rx="18"/>
      <circle cx="800" cy="492" r="145"/>
      <path d="M1112 637 1257 347 1402 637Z"/>
      <path d="M145 722H1455" stroke-dasharray="16 14"/>
    </g>
    <text x="800" y="826" fill="#241d24" text-anchor="middle" font-family="sans-serif" font-size="52">LOCAL UI TEST CARD ${card} / 6</text>
    <text x="800" y="898" fill="#241d24" text-anchor="middle" font-family="sans-serif" font-size="34">Geometric diagram only. No real venue is shown.</text>
  </svg>`;
  const image = await sharp(Buffer.from(svg), { limitInputPixels: 1600 * 1000 })
    .resize(width, Math.round(width * photo.height / photo.width))
    .webp({ quality: 84, effort: 3 })
    .toBuffer();
  // The allowlist and three widths bound this cache to at most 18 entries.
  rendered.set(key, image);
  return Buffer.from(image);
}