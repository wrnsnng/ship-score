import { Hono } from "hono";
import { cors } from "hono/cors";
import { scan, type Grade } from "../lib/scanner";

const app = new Hono();

app.use("/*", cors());

// Grade colors (matching the design system)
const GRADE_COLORS: Record<Grade, string> = {
  A: "#4ade80",
  B: "#a3e635",
  C: "#facc15",
  D: "#fb923c",
  F: "#f87171",
};

function generateBadgeSvg(grade: Grade, style: "flat" | "plastic" = "flat"): string {
  const gradeColor = GRADE_COLORS[grade];
  const labelWidth = 70;
  const gradeWidth = 30;
  const totalWidth = labelWidth + gradeWidth;
  const height = 20;
  const fontSize = 11;
  const fontFamily = "Verdana,Geneva,DejaVu Sans,sans-serif";

  if (style === "plastic") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="Ship Score: ${grade}">
  <title>Ship Score: ${grade}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
    <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
    <stop offset=".9" stop-color="#000" stop-opacity=".3"/>
    <stop offset="1" stop-color="#000" stop-opacity=".5"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="#555"/>
    <rect x="${labelWidth}" width="${gradeWidth}" height="${height}" fill="${gradeColor}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${fontFamily}" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">ship score</text>
    <text x="${labelWidth / 2}" y="13" fill="#fff">ship score</text>
    <text x="${labelWidth + gradeWidth / 2}" y="14" fill="#010101" fill-opacity=".3" font-weight="bold">${grade}</text>
    <text x="${labelWidth + gradeWidth / 2}" y="13" fill="#fff" font-weight="bold">${grade}</text>
  </g>
</svg>`;
  }

  // Flat style (default)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="Ship Score: ${grade}">
  <title>Ship Score: ${grade}</title>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="#555"/>
    <rect x="${labelWidth}" width="${gradeWidth}" height="${height}" fill="${gradeColor}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${fontFamily}" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="14">ship score</text>
    <text x="${labelWidth + gradeWidth / 2}" y="14" font-weight="bold">${grade}</text>
  </g>
</svg>`;
}

app.post("/api/scan", async (c) => {
  const { url } = await c.req.json<{ url: string }>();

  if (!url) {
    return c.json({ error: "URL is required" }, 400);
  }

  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  try {
    const result = await scan(normalizedUrl);
    return c.json(result);
  } catch (err) {
    console.error("Scan failed:", err);
    return c.json(
      { error: "Scan failed. Make sure the URL is accessible." },
      500
    );
  }
});

app.get("/api/badge", async (c) => {
  const url = c.req.query("url");
  const style = (c.req.query("style") as "flat" | "plastic") || "flat";

  if (!url) {
    // Return a placeholder badge if no URL provided
    const svg = generateBadgeSvg("A", style);
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20" role="img">
        <rect width="100" height="20" rx="3" fill="#555"/>
        <text x="50" y="14" fill="#fff" text-anchor="middle" font-family="Verdana" font-size="11">invalid url</text>
      </svg>`,
      {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    const result = await scan(normalizedUrl);
    const svg = generateBadgeSvg(result.overallGrade, style);
    
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("Badge scan failed:", err);
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20" role="img">
        <rect width="100" height="20" rx="3" fill="#555"/>
        <text x="50" y="14" fill="#fff" text-anchor="middle" font-family="Verdana" font-size="11">scan failed</text>
      </svg>`,
      {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  }
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default {
  port: 3180,
  fetch: app.fetch,
};
