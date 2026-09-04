import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");

function ballSvg(size: number, padding: number) {
  const bg = "#23412e";
  const lime = "#d7ff4d";
  const cream = "#f6f7f2";
  const s = size;
  const c = s / 2;
  const r = s / 2 - padding;
  const ring = Math.max(4, s * 0.028);
  const seam = Math.max(3, s * 0.02);
  // Two curved seams to suggest a tennis ball.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="${bg}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="${lime}" stroke="${cream}" stroke-width="${ring}"/>
  <path d="M ${c - r * 0.72} ${c - r * 0.62} Q ${c + r * 0.28} ${c - r * 0.08} ${c - r * 0.72} ${c + r * 0.62}" fill="none" stroke="${cream}" stroke-width="${seam}" stroke-linecap="round"/>
  <path d="M ${c + r * 0.72} ${c - r * 0.62} Q ${c - r * 0.28} ${c - r * 0.08} ${c + r * 0.72} ${c + r * 0.62}" fill="none" stroke="${cream}" stroke-width="${seam}" stroke-linecap="round"/>
</svg>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const jobs = [
    { file: "icon-192.png", size: 192, padding: 8 },
    { file: "icon-512.png", size: 512, padding: 20 },
    // Maskable: extra padding so foreground survives the OS mask crop.
    { file: "maskable-512.png", size: 512, padding: 92 },
  ];
  for (const job of jobs) {
    const out = path.join(OUT, job.file);
    await sharp(Buffer.from(ballSvg(job.size, job.padding)))
      .png()
      .toFile(out);
    console.log(`wrote ${out}`);
  }
}

await main();
