import { Hono } from "hono";
import { cors } from "hono/cors";
import { scan } from "../lib/scanner";

const app = new Hono();

app.use("/*", cors());

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

app.get("/api/health", (c) => c.json({ ok: true }));

export default {
  port: 3180,
  fetch: app.fetch,
};
