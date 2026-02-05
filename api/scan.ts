import { Hono } from "hono";
import { handle } from "hono/vercel";
import { scan } from "../lib/scanner";

export const config = {
  runtime: "edge",
};

const app = new Hono().basePath("/api");

app.post("/scan", async (c) => {
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

app.get("/health", (c) => c.json({ ok: true }));

export default handle(app);
