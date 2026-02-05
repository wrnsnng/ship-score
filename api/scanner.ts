import * as cheerio from "cheerio";

// --- Types ---

export interface ScanResult {
  url: string;
  scannedAt: string;
  overallScore: number;
  overallGrade: Grade;
  categories: Category[];
  scanTimeMs: number;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Category {
  id: string;
  name: string;
  emoji: string;
  score: number;
  grade: Grade;
  checks: Check[];
}

export interface Check {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  severity: "critical" | "warning" | "info";
  detail?: string;
}

// --- Scanner ---

export async function scan(url: string): Promise<ScanResult> {
  const start = Date.now();

  // Fetch the page + headers
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShipScore/1.0; +https://shipscore.dev)",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const html = await response.text();
  const headers = Object.fromEntries(response.headers.entries());
  const $ = cheerio.load(html);
  const finalUrl = response.url;

  // Run all category checks
  const categories: Category[] = [
    runSecurityChecks(headers, finalUrl, html),
    runPerformanceChecks(headers, html, $),
    runSEOChecks($, finalUrl),
    runAccessibilityChecks($),
    runErrorHandlingChecks(url),
    runBestPracticesChecks(headers, $, finalUrl),
  ];

  // Also check 404 page asynchronously
  const errorCategory = await runErrorHandlingChecksAsync(url);
  const errorIdx = categories.findIndex((c) => c.id === "error-handling");
  if (errorIdx !== -1) categories[errorIdx] = errorCategory;

  // Calculate overall score
  const overallScore = Math.round(
    categories.reduce((sum, c) => sum + c.score, 0) / categories.length
  );

  return {
    url: finalUrl,
    scannedAt: new Date().toISOString(),
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    categories,
    scanTimeMs: Date.now() - start,
  };
}

// --- Helpers ---

function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function categoryScore(checks: Check[]): number {
  if (checks.length === 0) return 100;
  const weights = { critical: 3, warning: 2, info: 1 };
  const totalWeight = checks.reduce((sum, c) => sum + weights[c.severity], 0);
  const passedWeight = checks
    .filter((c) => c.passed)
    .reduce((sum, c) => sum + weights[c.severity], 0);
  return Math.round((passedWeight / totalWeight) * 100);
}

function makeCategory(
  id: string,
  name: string,
  emoji: string,
  checks: Check[]
): Category {
  const score = categoryScore(checks);
  return { id, name, emoji, score, grade: scoreToGrade(score), checks };
}

// --- Security ---

function runSecurityChecks(
  headers: Record<string, string>,
  url: string,
  html: string
): Category {
  const checks: Check[] = [
    {
      id: "https",
      name: "HTTPS",
      description: "Site is served over HTTPS",
      passed: url.startsWith("https://"),
      severity: "critical",
      detail: url.startsWith("https://")
        ? "Your site uses HTTPS. Good."
        : "Your site is served over plain HTTP. Anyone on the same network can see and modify your traffic.",
    },
    {
      id: "hsts",
      name: "Strict Transport Security",
      description: "HSTS header forces browsers to use HTTPS",
      passed: !!headers["strict-transport-security"],
      severity: "critical",
      detail: headers["strict-transport-security"]
        ? `HSTS is set: ${headers["strict-transport-security"]}`
        : "No HSTS header. Browsers can be tricked into using HTTP even if HTTPS is available.",
    },
    {
      id: "csp",
      name: "Content Security Policy",
      description: "CSP header prevents XSS and injection attacks",
      passed: !!(
        headers["content-security-policy"] ||
        headers["content-security-policy-report-only"]
      ),
      severity: "warning",
      detail: headers["content-security-policy"]
        ? "CSP is configured."
        : "No Content Security Policy. Your site is more vulnerable to cross-site scripting (XSS) attacks.",
    },
    {
      id: "x-frame",
      name: "Clickjacking protection",
      description: "X-Frame-Options or CSP frame-ancestors prevents clickjacking",
      passed: !!(
        headers["x-frame-options"] ||
        (headers["content-security-policy"] &&
          headers["content-security-policy"].includes("frame-ancestors"))
      ),
      severity: "warning",
      detail: headers["x-frame-options"]
        ? `X-Frame-Options: ${headers["x-frame-options"]}`
        : "No clickjacking protection. Your site could be embedded in a malicious iframe.",
    },
    {
      id: "x-content-type",
      name: "Content type sniffing protection",
      description: "X-Content-Type-Options prevents MIME-type sniffing",
      passed: headers["x-content-type-options"] === "nosniff",
      severity: "info",
      detail: headers["x-content-type-options"]
        ? "nosniff is set."
        : "Missing X-Content-Type-Options: nosniff. Browsers might interpret files as a different type than intended.",
    },
    {
      id: "exposed-secrets",
      name: "No exposed secrets in HTML",
      description: "Page source doesn't contain obvious API keys or tokens",
      passed: !hasExposedSecrets(html),
      severity: "critical",
      detail: hasExposedSecrets(html)
        ? "⚠️ Found patterns that look like exposed API keys or secrets in your page source!"
        : "No obvious API keys or secrets found in page source.",
    },
  ];

  return makeCategory("security", "Security", "🔒", checks);
}

function hasExposedSecrets(html: string): boolean {
  const patterns = [
    /sk[-_]live[-_][a-zA-Z0-9]{20,}/i, // Stripe live key
    /sk[-_]test[-_][a-zA-Z0-9]{20,}/i, // Stripe test key
    /AKIA[0-9A-Z]{16}/i, // AWS access key
    /AIza[0-9A-Za-z\-_]{35}/i, // Google API key
    /ghp_[a-zA-Z0-9]{36}/, // GitHub personal token
    /xox[bpras]-[a-zA-Z0-9-]{10,}/, // Slack token
  ];
  return patterns.some((p) => p.test(html));
}

// --- Performance ---

function runPerformanceChecks(
  headers: Record<string, string>,
  html: string,
  $: cheerio.CheerioAPI
): Category {
  const htmlSize = new Blob([html]).size;
  const scripts = $("script[src]").length;
  const stylesheets = $('link[rel="stylesheet"]').length;
  const images = $("img").length;
  const inlineScriptSize = $("script:not([src])")
    .toArray()
    .reduce((sum, el) => sum + ($(el).html()?.length || 0), 0);

  const checks: Check[] = [
    {
      id: "html-size",
      name: "HTML document size",
      description: "Initial HTML should be under 100KB for fast loading",
      passed: htmlSize < 100_000,
      severity: "warning",
      detail: `HTML is ${(htmlSize / 1024).toFixed(1)}KB. ${htmlSize >= 100_000 ? "That's large — consider reducing inline content or deferring data loading." : "Good size."}`,
    },
    {
      id: "script-count",
      name: "External script count",
      description: "Too many scripts slow down page load",
      passed: scripts <= 10,
      severity: "warning",
      detail: `${scripts} external script(s). ${scripts > 10 ? "Consider bundling or lazy-loading some scripts." : "Reasonable count."}`,
    },
    {
      id: "stylesheet-count",
      name: "Stylesheet count",
      description: "Multiple stylesheets cause render-blocking",
      passed: stylesheets <= 5,
      severity: "info",
      detail: `${stylesheets} external stylesheet(s). ${stylesheets > 5 ? "Consider combining stylesheets to reduce render-blocking." : "Fine."}`,
    },
    {
      id: "compression",
      name: "Response compression",
      description: "Server should use gzip or brotli compression",
      passed: !!(
        headers["content-encoding"] &&
        (headers["content-encoding"].includes("gzip") ||
          headers["content-encoding"].includes("br"))
      ),
      severity: "warning",
      detail: headers["content-encoding"]
        ? `Compression: ${headers["content-encoding"]}`
        : "No compression detected. Enabling gzip/brotli can reduce transfer size by 60-80%.",
    },
    {
      id: "inline-js-size",
      name: "Inline JavaScript size",
      description: "Large inline scripts block rendering",
      passed: inlineScriptSize < 50_000,
      severity: "info",
      detail: `${(inlineScriptSize / 1024).toFixed(1)}KB of inline JavaScript. ${inlineScriptSize >= 50_000 ? "Consider moving to external files for better caching." : "Acceptable."}`,
    },
    {
      id: "image-count",
      name: "Image count",
      description: "Many images without lazy loading impact initial load",
      passed: images <= 20 || $("img[loading='lazy']").length > images * 0.5,
      severity: "info",
      detail: `${images} image(s), ${$("img[loading='lazy']").length} with lazy loading. ${images > 20 && $("img[loading='lazy']").length < images * 0.5 ? "Consider adding loading='lazy' to below-the-fold images." : "OK."}`,
    },
    {
      id: "caching",
      name: "Cache control",
      description: "Proper caching headers improve repeat visits",
      passed: !!(headers["cache-control"] || headers["etag"]),
      severity: "info",
      detail: headers["cache-control"]
        ? `Cache-Control: ${headers["cache-control"]}`
        : "No cache headers. Repeat visitors re-download everything.",
    },
  ];

  return makeCategory("performance", "Performance", "⚡", checks);
}

// --- SEO ---

function runSEOChecks(
  $: cheerio.CheerioAPI,
  url: string
): Category {
  const title = $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content")?.trim() || "";
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const canonical = $('link[rel="canonical"]').attr("href");
  const h1Count = $("h1").length;

  const checks: Check[] = [
    {
      id: "title",
      name: "Page title",
      description: "Every page needs a descriptive title tag",
      passed: title.length > 0 && title.length <= 70,
      severity: "critical",
      detail: title
        ? `Title: "${title}" (${title.length} chars). ${title.length > 70 ? "Consider shortening — search engines truncate after ~60 chars." : "Good length."}`
        : "No title tag found. This is the most important SEO element.",
    },
    {
      id: "meta-description",
      name: "Meta description",
      description: "A compelling meta description improves click-through from search",
      passed: metaDesc.length > 0 && metaDesc.length <= 160,
      severity: "warning",
      detail: metaDesc
        ? `Description: "${metaDesc.slice(0, 80)}${metaDesc.length > 80 ? "..." : ""}" (${metaDesc.length} chars). ${metaDesc.length > 160 ? "Too long — will be truncated in search results." : "Good."}`
        : "No meta description. Search engines will pick a random snippet from your page.",
    },
    {
      id: "og-tags",
      name: "Open Graph tags",
      description: "OG tags control how your page looks when shared on social media",
      passed: !!(ogTitle && ogDesc && ogImage),
      severity: "warning",
      detail: [
        ogTitle ? "✓ og:title" : "✗ og:title",
        ogDesc ? "✓ og:description" : "✗ og:description",
        ogImage ? "✓ og:image" : "✗ og:image",
      ].join(", "),
    },
    {
      id: "h1",
      name: "H1 heading",
      description: "Each page should have exactly one H1",
      passed: h1Count === 1,
      severity: "warning",
      detail:
        h1Count === 0
          ? "No H1 heading found. Search engines use this to understand your page's main topic."
          : h1Count === 1
            ? `H1: "${$("h1").first().text().trim().slice(0, 60)}"`
            : `${h1Count} H1 headings found. Use only one to avoid confusing search engines.`,
    },
    {
      id: "canonical",
      name: "Canonical URL",
      description: "Canonical tag prevents duplicate content issues",
      passed: !!canonical,
      severity: "info",
      detail: canonical
        ? `Canonical: ${canonical}`
        : "No canonical URL set. If this page is accessible at multiple URLs, search engines might see duplicates.",
    },
  ];

  return makeCategory("seo", "SEO", "🔍", checks);
}

// --- Accessibility ---

function runAccessibilityChecks($: cheerio.CheerioAPI): Category {
  const images = $("img");
  const imagesWithAlt = $("img[alt]");
  const emptyAlts = $('img[alt=""]');
  const lang = $("html").attr("lang");
  const viewport = $('meta[name="viewport"]').attr("content");

  // Check heading hierarchy
  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((el) => parseInt(el.tagName[1]));
  let hasSkippedLevel = false;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) {
      hasSkippedLevel = true;
      break;
    }
  }

  const buttons = $("button, [role='button']");
  const emptyButtons = buttons.filter(
    (_, el) => !$(el).text().trim() && !$(el).attr("aria-label")
  );

  const inputs = $("input:not([type='hidden']), textarea, select");
  const inputsWithLabels = inputs.filter((_, el) => {
    const id = $(el).attr("id");
    return !!(
      $(el).attr("aria-label") ||
      $(el).attr("aria-labelledby") ||
      (id && $(`label[for="${id}"]`).length)
    );
  });

  const checks: Check[] = [
    {
      id: "img-alt",
      name: "Image alt text",
      description: "Images should have descriptive alt text for screen readers",
      passed:
        images.length === 0 ||
        imagesWithAlt.length - emptyAlts.length >= images.length * 0.8,
      severity: "critical",
      detail:
        images.length === 0
          ? "No images on page."
          : `${imagesWithAlt.length}/${images.length} images have alt text. ${emptyAlts.length} have empty alt (decorative).`,
    },
    {
      id: "lang",
      name: "Language attribute",
      description: "HTML lang attribute helps screen readers pronounce content correctly",
      passed: !!lang,
      severity: "warning",
      detail: lang
        ? `Language: ${lang}`
        : "No lang attribute on <html>. Screen readers won't know what language to use.",
    },
    {
      id: "heading-hierarchy",
      name: "Heading hierarchy",
      description: "Headings should follow a logical order (H1 → H2 → H3, no skipping)",
      passed: !hasSkippedLevel,
      severity: "warning",
      detail: hasSkippedLevel
        ? "Heading levels are skipped (e.g., H1 → H3). This confuses screen reader navigation."
        : `${headings.length} headings in logical order.`,
    },
    {
      id: "viewport",
      name: "Viewport meta tag",
      description: "Viewport meta ensures the page is readable on mobile devices",
      passed: !!viewport,
      severity: "critical",
      detail: viewport
        ? `Viewport: ${viewport}`
        : "No viewport meta tag. Your page won't render properly on mobile devices.",
    },
    {
      id: "button-labels",
      name: "Button labels",
      description: "Buttons should have visible text or aria-label",
      passed: emptyButtons.length === 0,
      severity: "warning",
      detail:
        emptyButtons.length === 0
          ? `All ${buttons.length} buttons have labels.`
          : `${emptyButtons.length} button(s) have no text or aria-label. Screen reader users won't know what they do.`,
    },
    {
      id: "form-labels",
      name: "Form input labels",
      description: "Form inputs should have associated labels",
      passed:
        inputs.length === 0 || inputsWithLabels.length >= inputs.length * 0.8,
      severity: "warning",
      detail:
        inputs.length === 0
          ? "No form inputs on page."
          : `${inputsWithLabels.length}/${inputs.length} inputs have labels.`,
    },
  ];

  return makeCategory("accessibility", "Accessibility", "♿", checks);
}

// --- Error Handling (sync placeholder, replaced by async) ---

function runErrorHandlingChecks(_url: string): Category {
  return makeCategory("error-handling", "Error handling", "🛡️", []);
}

async function runErrorHandlingChecksAsync(url: string): Promise<Category> {
  const checks: Check[] = [];

  // Check if 404 page exists
  try {
    const base = new URL(url);
    const notFoundUrl = `${base.origin}/this-page-definitely-does-not-exist-${Date.now()}`;
    const res = await fetch(notFoundUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShipScore/1.0; +https://shipscore.dev)",
      },
    });
    const body = await res.text();
    const has404 = res.status === 404;
    const hasCustom404 =
      has404 && body.length > 500 && !body.includes("Cannot GET");

    checks.push({
      id: "404-status",
      name: "404 status code",
      description: "Missing pages should return HTTP 404, not 200",
      passed: has404,
      severity: "critical",
      detail: has404
        ? "Correctly returns 404 for missing pages."
        : `Returns ${res.status} for missing pages. This confuses search engines and users.`,
    });

    checks.push({
      id: "custom-404",
      name: "Custom 404 page",
      description: "A helpful 404 page guides lost users back to your site",
      passed: hasCustom404,
      severity: "info",
      detail: hasCustom404
        ? "Has a custom 404 page."
        : 'Using a default or minimal error page. A friendly "page not found" helps users find what they\'re looking for.',
    });
  } catch {
    checks.push({
      id: "404-check",
      name: "Error page check",
      description: "Could not check error pages",
      passed: false,
      severity: "info",
      detail: "Couldn't reach the 404 test URL. The server may block unusual paths.",
    });
  }

  return makeCategory("error-handling", "Error handling", "🛡️", checks);
}

// --- Best Practices ---

function runBestPracticesChecks(
  headers: Record<string, string>,
  $: cheerio.CheerioAPI,
  url: string
): Category {
  const favicon =
    $('link[rel="icon"]').length > 0 ||
    $('link[rel="shortcut icon"]').length > 0;
  const charset = $('meta[charset]').length > 0 || html_has_charset($);
  const isHttps = url.startsWith("https://");
  const hasDoctype =
    $.html().trim().toLowerCase().startsWith("<!doctype html");
  const modernJs =
    $('script[type="module"]').length > 0 ||
    $("script[src]")
      .toArray()
      .some((el) => {
        const src = $(el).attr("src") || "";
        return src.includes(".mjs") || src.includes("/esm/");
      });

  const checks: Check[] = [
    {
      id: "favicon",
      name: "Favicon",
      description: "A favicon helps users identify your site in browser tabs",
      passed: favicon,
      severity: "info",
      detail: favicon
        ? "Favicon found."
        : "No favicon link tag. Your site shows a generic icon in browser tabs.",
    },
    {
      id: "charset",
      name: "Character encoding",
      description: "Declaring UTF-8 charset prevents rendering issues",
      passed: charset,
      severity: "warning",
      detail: charset
        ? "Character encoding declared."
        : "No charset declaration. Special characters might display incorrectly.",
    },
    {
      id: "doctype",
      name: "HTML doctype",
      description: "DOCTYPE ensures consistent rendering across browsers",
      passed: hasDoctype,
      severity: "info",
      detail: hasDoctype
        ? "HTML5 doctype present."
        : "No DOCTYPE declaration. Browser may render in quirks mode.",
    },
    {
      id: "https-redirect",
      name: "HTTPS",
      description: "Site should be served over HTTPS",
      passed: isHttps,
      severity: "critical",
      detail: isHttps
        ? "Site served over HTTPS."
        : "Not using HTTPS. User data is sent in plain text.",
    },
    {
      id: "modern-js",
      name: "Modern JavaScript",
      description: "Using ES modules indicates a modern build setup",
      passed: modernJs,
      severity: "info",
      detail: modernJs
        ? "Uses ES modules (modern build)."
        : "No ES module scripts detected. Consider a modern build tool for better performance.",
    },
  ];

  return makeCategory("best-practices", "Best practices", "📱", checks);
}

function html_has_charset($: cheerio.CheerioAPI): boolean {
  return (
    $('meta[http-equiv="Content-Type"]')
      .attr("content")
      ?.includes("charset") || false
  );
}
