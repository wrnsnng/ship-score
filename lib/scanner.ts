import * as cheerio from "cheerio";

// --- Types ---

export interface ScanResult {
  url: string;
  scannedAt: string;
  overallScore: number;
  overallGrade: Grade;
  categories: Category[];
  scanTimeMs: number;
  ogData?: OGData;
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
  fix?: FixSnippet;
}

export interface FixSnippet {
  title: string;
  code: string;
  language: "html" | "json" | "htaccess" | "text";
  note?: string;
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
        "Accept-Encoding": "gzip, deflate, br",
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
  const hasHttps = url.startsWith("https://");
  const hasHsts = !!headers["strict-transport-security"];
  const hasCsp = !!(
    headers["content-security-policy"] ||
    headers["content-security-policy-report-only"]
  );
  const hasXFrame = !!(
    headers["x-frame-options"] ||
    (headers["content-security-policy"] &&
      headers["content-security-policy"].includes("frame-ancestors"))
  );
  const hasNoSniff = headers["x-content-type-options"] === "nosniff";
  const hasSecrets = hasExposedSecrets(html);

  const checks: Check[] = [
    {
      id: "https",
      name: "HTTPS",
      description: "Site is served over HTTPS",
      passed: hasHttps,
      severity: "critical",
      detail: hasHttps
        ? "Your site uses HTTPS. Good."
        : "Your site is served over plain HTTP. Anyone on the same network can see and modify your traffic.",
      ...(!hasHttps && {
        fix: {
          title: "Enable HTTPS on your hosting provider",
          code: `Most hosts provide free SSL certificates. Check your hosting dashboard for:
• Vercel: Automatic HTTPS on all deployments
• Netlify: Enable HTTPS in Site settings > Domain management
• Cloudflare: Enable "Always Use HTTPS" in SSL/TLS settings`,
          language: "text" as const,
          note: "After enabling, update all internal links to use https://",
        },
      }),
    },
    {
      id: "hsts",
      name: "Strict Transport Security",
      description: "HSTS header forces browsers to use HTTPS",
      passed: hasHsts,
      severity: "critical",
      detail: hasHsts
        ? `HSTS is set: ${headers["strict-transport-security"]}`
        : "No HSTS header. Browsers can be tricked into using HTTP even if HTTPS is available.",
      ...(!hasHsts && {
        fix: {
          title: "Add HSTS header (vercel.json)",
          code: `{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains"
        }
      ]
    }
  ]
}`,
          language: "json" as const,
          note: "Start with a short max-age (86400 = 1 day) to test, then increase to 31536000 (1 year)",
        },
      }),
    },
    {
      id: "csp",
      name: "Content Security Policy",
      description: "CSP header prevents XSS and injection attacks",
      passed: hasCsp,
      severity: "warning",
      detail: hasCsp
        ? "CSP is configured."
        : "No Content Security Policy. Your site is more vulnerable to cross-site scripting (XSS) attacks.",
      ...(!hasCsp && {
        fix: {
          title: "Add Content Security Policy header (vercel.json)",
          code: `{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'"
        }
      ]
    }
  ]
}`,
          language: "json" as const,
          note: "This is a starter policy. Test thoroughly and adjust based on your site's needs.",
        },
      }),
    },
    {
      id: "x-frame",
      name: "Clickjacking protection",
      description: "X-Frame-Options or CSP frame-ancestors prevents clickjacking",
      passed: hasXFrame,
      severity: "warning",
      detail: hasXFrame
        ? `X-Frame-Options: ${headers["x-frame-options"] || "via CSP frame-ancestors"}`
        : "No clickjacking protection. Your site could be embedded in a malicious iframe.",
      ...(!hasXFrame && {
        fix: {
          title: "Add X-Frame-Options header (vercel.json)",
          code: `{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ]
}`,
          language: "json" as const,
          note: "Use SAMEORIGIN instead of DENY if you need to embed your site in your own iframes",
        },
      }),
    },
    {
      id: "x-content-type",
      name: "Content type sniffing protection",
      description: "X-Content-Type-Options prevents MIME-type sniffing",
      passed: hasNoSniff,
      severity: "info",
      detail: hasNoSniff
        ? "nosniff is set."
        : "Missing X-Content-Type-Options: nosniff. Browsers might interpret files as a different type than intended.",
      ...(!hasNoSniff && {
        fix: {
          title: "Add X-Content-Type-Options header (vercel.json)",
          code: `{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}`,
          language: "json" as const,
        },
      }),
    },
    {
      id: "exposed-secrets",
      name: "No exposed secrets in HTML",
      description: "Page source doesn't contain obvious API keys or tokens",
      passed: !hasSecrets,
      severity: "critical",
      detail: hasSecrets
        ? "⚠️ Found patterns that look like exposed API keys or secrets in your page source!"
        : "No obvious API keys or secrets found in page source.",
      ...(hasSecrets && {
        fix: {
          title: "Remove secrets from client-side code",
          code: `1. Move API keys to server-side environment variables
2. Use server-side API routes instead of client-side fetch
3. Rotate any exposed keys immediately
4. Add .env to .gitignore if not already

Example: Instead of fetch('https://api.example.com?key=SECRET')
Use: fetch('/api/proxy') → server calls external API`,
          language: "text" as const,
          note: "⚠️ If you've exposed production keys, rotate them immediately!",
        },
      }),
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
  const lazyImages = $("img[loading='lazy']").length;
  const inlineScriptSize = $("script:not([src])")
    .toArray()
    .reduce((sum, el) => sum + ($(el).html()?.length || 0), 0);

  const htmlSizeOk = htmlSize < 100_000;
  const scriptsOk = scripts <= 10;
  const stylesheetsOk = stylesheets <= 5;
  const hasCompression = !!(
    headers["content-encoding"] &&
    (headers["content-encoding"].includes("gzip") ||
      headers["content-encoding"].includes("br"))
  );
  const inlineJsOk = inlineScriptSize < 50_000;
  const imagesOk = images <= 20 || lazyImages > images * 0.5;
  const hasCaching = !!(headers["cache-control"] || headers["etag"]);

  const checks: Check[] = [
    {
      id: "html-size",
      name: "HTML document size",
      description: "Initial HTML should be under 100KB for fast loading",
      passed: htmlSizeOk,
      severity: "warning",
      detail: `HTML is ${(htmlSize / 1024).toFixed(1)}KB. ${!htmlSizeOk ? "That's large — consider reducing inline content or deferring data loading." : "Good size."}`,
      ...(!htmlSizeOk && {
        fix: {
          title: "Reduce HTML document size",
          code: `Common causes and fixes:
1. Inline JSON data: Move to separate API endpoint
2. Inline SVGs: Move to external files or sprite
3. Inline styles: Extract to CSS files
4. Duplicated content: Use template partials

For React/Next.js - avoid getServerSideProps with large data.
Consider pagination or lazy loading for data-heavy pages.`,
          language: "text" as const,
        },
      }),
    },
    {
      id: "script-count",
      name: "External script count",
      description: "Too many scripts slow down page load",
      passed: scriptsOk,
      severity: "warning",
      detail: `${scripts} external script(s). ${!scriptsOk ? "Consider bundling or lazy-loading some scripts." : "Reasonable count."}`,
      ...(!scriptsOk && {
        fix: {
          title: "Reduce script count",
          code: `<!-- Defer non-critical scripts -->
<script src="/analytics.js" defer></script>

<!-- Lazy load with dynamic import -->
<script type="module">
  // Load heavy libraries on interaction
  button.addEventListener('click', async () => {
    const { heavyLib } = await import('./heavy-lib.js');
    heavyLib.init();
  });
</script>`,
          language: "html" as const,
          note: "Use a bundler (Vite, Webpack) to combine scripts. Add defer to non-critical scripts.",
        },
      }),
    },
    {
      id: "stylesheet-count",
      name: "Stylesheet count",
      description: "Multiple stylesheets cause render-blocking",
      passed: stylesheetsOk,
      severity: "info",
      detail: `${stylesheets} external stylesheet(s). ${!stylesheetsOk ? "Consider combining stylesheets to reduce render-blocking." : "Fine."}`,
      ...(!stylesheetsOk && {
        fix: {
          title: "Combine and optimize stylesheets",
          code: `<!-- Preload critical CSS -->
<link rel="preload" href="/critical.css" as="style">
<link rel="stylesheet" href="/critical.css">

<!-- Load non-critical CSS asynchronously -->
<link rel="preload" href="/non-critical.css" as="style" 
      onload="this.onload=null;this.rel='stylesheet'">`,
          language: "html" as const,
          note: "Use a CSS bundler to combine files. Inline critical CSS for above-the-fold content.",
        },
      }),
    },
    {
      id: "compression",
      name: "Response compression",
      description: "Server should use gzip or brotli compression",
      passed: hasCompression,
      severity: "warning",
      detail: hasCompression
        ? `Compression: ${headers["content-encoding"]}`
        : "No compression detected. Enabling gzip/brotli can reduce transfer size by 60-80%.",
      ...(!hasCompression && {
        fix: {
          title: "Enable compression (vercel.json - automatic on Vercel)",
          code: `// Vercel enables compression by default.
// For other hosts, configure in server or CDN:

// nginx.conf
gzip on;
gzip_types text/html text/css application/javascript;

// Express.js
const compression = require('compression');
app.use(compression());`,
          language: "text" as const,
          note: "Most modern hosts (Vercel, Netlify, Cloudflare) enable compression automatically.",
        },
      }),
    },
    {
      id: "inline-js-size",
      name: "Inline JavaScript size",
      description: "Large inline scripts block rendering",
      passed: inlineJsOk,
      severity: "info",
      detail: `${(inlineScriptSize / 1024).toFixed(1)}KB of inline JavaScript. ${!inlineJsOk ? "Consider moving to external files for better caching." : "Acceptable."}`,
      ...(!inlineJsOk && {
        fix: {
          title: "Move inline scripts to external files",
          code: `<!-- Before: inline script blocking render -->
<script>
  // 50KB+ of JavaScript here...
</script>

<!-- After: external file with defer -->
<script src="/app.js" defer></script>`,
          language: "html" as const,
          note: "External scripts can be cached. Use defer for non-blocking loading.",
        },
      }),
    },
    {
      id: "image-count",
      name: "Image count",
      description: "Many images without lazy loading impact initial load",
      passed: imagesOk,
      severity: "info",
      detail: `${images} image(s), ${lazyImages} with lazy loading. ${!imagesOk ? "Consider adding loading='lazy' to below-the-fold images." : "OK."}`,
      ...(!imagesOk && {
        fix: {
          title: "Add lazy loading to images",
          code: `<!-- Add loading="lazy" to below-the-fold images -->
<img src="/photo.jpg" alt="Description" loading="lazy">

<!-- Keep above-the-fold images eager (default) -->
<img src="/hero.jpg" alt="Hero" loading="eager">

<!-- Use width/height to prevent layout shift -->
<img src="/photo.jpg" alt="Description" 
     loading="lazy" width="800" height="600">`,
          language: "html" as const,
          note: "Native lazy loading is supported by all modern browsers.",
        },
      }),
    },
    {
      id: "caching",
      name: "Cache control",
      description: "Proper caching headers improve repeat visits",
      passed: hasCaching,
      severity: "info",
      detail: hasCaching
        ? `Cache-Control: ${headers["cache-control"] || "ETag present"}`
        : "No cache headers. Repeat visitors re-download everything.",
      ...(!hasCaching && {
        fix: {
          title: "Add cache headers (vercel.json)",
          code: `{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    }
  ]
}`,
          language: "json" as const,
          note: "Cache static assets aggressively. Use cache-busting filenames (app.abc123.js).",
        },
      }),
    },
  ];

  return makeCategory("performance", "Performance", "⚡", checks);
}

// --- SEO ---

// OG data exported for social preview component
export interface OGData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  siteName?: string;
}

function runSEOChecks(
  $: cheerio.CheerioAPI,
  url: string
): Category & { ogData: OGData } {
  const title = $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content")?.trim() || "";
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogSiteName = $('meta[property="og:site_name"]').attr("content");
  const canonical = $('link[rel="canonical"]').attr("href");
  const h1Count = $("h1").length;

  const titleOk = title.length > 0 && title.length <= 70;
  const descOk = metaDesc.length > 0 && metaDesc.length <= 160;
  const ogComplete = !!(ogTitle && ogDesc && ogImage);
  const h1Ok = h1Count === 1;

  // Extract domain for examples
  let domain = "example.com";
  try {
    domain = new URL(url).hostname;
  } catch {}

  const checks: Check[] = [
    {
      id: "title",
      name: "Page title",
      description: "Every page needs a descriptive title tag",
      passed: titleOk,
      severity: "critical",
      detail: title
        ? `Title: "${title}" (${title.length} chars). ${title.length > 70 ? "Consider shortening — search engines truncate after ~60 chars." : "Good length."}`
        : "No title tag found. This is the most important SEO element.",
      ...(!titleOk && {
        fix: {
          title: "Add a title tag",
          code: `<title>Your Page Title | ${domain}</title>`,
          language: "html" as const,
          note: "Keep it under 60 characters. Include your brand name.",
        },
      }),
    },
    {
      id: "meta-description",
      name: "Meta description",
      description: "A compelling meta description improves click-through from search",
      passed: descOk,
      severity: "warning",
      detail: metaDesc
        ? `Description: "${metaDesc.slice(0, 80)}${metaDesc.length > 80 ? "..." : ""}" (${metaDesc.length} chars). ${metaDesc.length > 160 ? "Too long — will be truncated in search results." : "Good."}`
        : "No meta description. Search engines will pick a random snippet from your page.",
      ...(!descOk && {
        fix: {
          title: "Add meta description",
          code: `<meta name="description" content="A compelling description of your page in 150-160 characters. Include keywords naturally and a call to action.">`,
          language: "html" as const,
          note: "Make it compelling — this is your ad copy in search results.",
        },
      }),
    },
    {
      id: "og-tags",
      name: "Open Graph tags",
      description: "OG tags control how your page looks when shared on social media",
      passed: ogComplete,
      severity: "warning",
      detail: [
        ogTitle ? "✓ og:title" : "✗ og:title",
        ogDesc ? "✓ og:description" : "✗ og:description",
        ogImage ? "✓ og:image" : "✗ og:image",
      ].join(", "),
      ...(!ogComplete && {
        fix: {
          title: "Add Open Graph meta tags",
          code: `<!-- Essential OG tags for social sharing -->
<meta property="og:title" content="${title || "Your Page Title"}">
<meta property="og:description" content="${metaDesc || "A brief description of your page"}">
<meta property="og:image" content="https://${domain}/og-image.png">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${ogSiteName || domain}">

<!-- Twitter Card tags (optional but recommended) -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title || "Your Page Title"}">
<meta name="twitter:description" content="${metaDesc || "A brief description"}">
<meta name="twitter:image" content="https://${domain}/og-image.png">`,
          language: "html" as const,
          note: "Image should be 1200x630px for best results. Test with Twitter Card Validator.",
        },
      }),
    },
    {
      id: "h1",
      name: "H1 heading",
      description: "Each page should have exactly one H1",
      passed: h1Ok,
      severity: "warning",
      detail:
        h1Count === 0
          ? "No H1 heading found. Search engines use this to understand your page's main topic."
          : h1Count === 1
            ? `H1: "${$("h1").first().text().trim().slice(0, 60)}"`
            : `${h1Count} H1 headings found. Use only one to avoid confusing search engines.`,
      ...(!h1Ok && {
        fix: {
          title: h1Count === 0 ? "Add an H1 heading" : "Use only one H1",
          code: h1Count === 0
            ? `<h1>Your Main Page Heading</h1>`
            : `<!-- Keep one H1, change others to H2 or lower -->
<h1>Main Page Title</h1>
<h2>Section Heading</h2>
<h2>Another Section</h2>`,
          language: "html" as const,
          note: "H1 should describe the page's main topic. Other headings should be H2-H6.",
        },
      }),
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
      ...(!canonical && {
        fix: {
          title: "Add canonical link",
          code: `<link rel="canonical" href="${url}">`,
          language: "html" as const,
          note: "Use the preferred URL (with or without www, with or without trailing slash).",
        },
      }),
    },
  ];

  const category = makeCategory("seo", "SEO", "🔍", checks);
  return {
    ...category,
    ogData: {
      title: ogTitle || title || undefined,
      description: ogDesc || metaDesc || undefined,
      image: ogImage || undefined,
      url,
      siteName: ogSiteName || undefined,
    },
  };
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

  const imgAltOk =
    images.length === 0 ||
    imagesWithAlt.length - emptyAlts.length >= images.length * 0.8;
  const buttonsOk = emptyButtons.length === 0;
  const labelsOk =
    inputs.length === 0 || inputsWithLabels.length >= inputs.length * 0.8;

  const checks: Check[] = [
    {
      id: "img-alt",
      name: "Image alt text",
      description: "Images should have descriptive alt text for screen readers",
      passed: imgAltOk,
      severity: "critical",
      detail:
        images.length === 0
          ? "No images on page."
          : `${imagesWithAlt.length}/${images.length} images have alt text. ${emptyAlts.length} have empty alt (decorative).`,
      ...(!imgAltOk && {
        fix: {
          title: "Add alt text to images",
          code: `<!-- Descriptive alt for meaningful images -->
<img src="/photo.jpg" alt="A golden retriever playing fetch in the park">

<!-- Empty alt for decorative images -->
<img src="/divider.svg" alt="">

<!-- Role=presentation for complex decorative elements -->
<img src="/pattern.png" alt="" role="presentation">`,
          language: "html" as const,
          note: "Describe what the image shows, not 'image of...' Be concise but informative.",
        },
      }),
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
      ...(!lang && {
        fix: {
          title: "Add language attribute",
          code: `<html lang="en">`,
          language: "html" as const,
          note: "Use ISO 639-1 codes: en, es, fr, de, zh, ja, etc.",
        },
      }),
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
      ...(hasSkippedLevel && {
        fix: {
          title: "Fix heading hierarchy",
          code: `<!-- ✗ Wrong: Skipping levels -->
<h1>Page Title</h1>
<h3>Subsection</h3>  <!-- Should be h2 -->

<!-- ✓ Correct: Sequential levels -->
<h1>Page Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>
<h2>Another Section</h2>`,
          language: "html" as const,
          note: "Headings create an outline. Never skip levels (H1→H3). You can skip back (H3→H2).",
        },
      }),
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
      ...(!viewport && {
        fix: {
          title: "Add viewport meta tag",
          code: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
          language: "html" as const,
          note: "Add this in your <head>. Avoid user-scalable=no as it harms accessibility.",
        },
      }),
    },
    {
      id: "button-labels",
      name: "Button labels",
      description: "Buttons should have visible text or aria-label",
      passed: buttonsOk,
      severity: "warning",
      detail: buttonsOk
        ? `All ${buttons.length} buttons have labels.`
        : `${emptyButtons.length} button(s) have no text or aria-label. Screen reader users won't know what they do.`,
      ...(!buttonsOk && {
        fix: {
          title: "Add labels to buttons",
          code: `<!-- Text content is best -->
<button>Submit Form</button>

<!-- For icon-only buttons, use aria-label -->
<button aria-label="Close menu">
  <svg><!-- X icon --></svg>
</button>

<!-- Or use visually-hidden text -->
<button>
  <svg><!-- Search icon --></svg>
  <span class="sr-only">Search</span>
</button>`,
          language: "html" as const,
          note: "Icon-only buttons must have aria-label or visually hidden text.",
        },
      }),
    },
    {
      id: "form-labels",
      name: "Form input labels",
      description: "Form inputs should have associated labels",
      passed: labelsOk,
      severity: "warning",
      detail:
        inputs.length === 0
          ? "No form inputs on page."
          : `${inputsWithLabels.length}/${inputs.length} inputs have labels.`,
      ...(!labelsOk && {
        fix: {
          title: "Associate labels with form inputs",
          code: `<!-- Method 1: for/id association (recommended) -->
<label for="email">Email address</label>
<input type="email" id="email" name="email">

<!-- Method 2: Wrapping label -->
<label>
  Email address
  <input type="email" name="email">
</label>

<!-- Method 3: aria-label for visual labels elsewhere -->
<input type="search" aria-label="Search products">`,
          language: "html" as const,
          note: "Every input needs a label. Placeholder text is NOT a label.",
        },
      }),
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
      ...(!has404 && {
        fix: {
          title: "Return proper 404 status codes",
          code: `// Next.js: pages/404.js or app/not-found.tsx
export default function NotFound() {
  return <h1>Page not found</h1>;
}

// Vercel: vercel.json (for static sites)
{
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "status": 404, "dest": "/404.html" }
  ]
}`,
          language: "json" as const,
          note: "Make sure your server returns HTTP 404, not 200 with error content.",
        },
      }),
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
      ...(!hasCustom404 && {
        fix: {
          title: "Create a custom 404 page",
          code: `<!-- 404.html - Make it helpful! -->
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Page not found | Your Site</title>
</head>
<body>
  <h1>Page not found</h1>
  <p>Sorry, we couldn't find what you're looking for.</p>
  <ul>
    <li><a href="/">Go to homepage</a></li>
    <li><a href="/search">Search our site</a></li>
    <li><a href="/contact">Contact us</a></li>
  </ul>
</body>
</html>`,
          language: "html" as const,
          note: "Include navigation, search, or popular links to help users find what they need.",
        },
      }),
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
  const hasFavicon =
    $('link[rel="icon"]').length > 0 ||
    $('link[rel="shortcut icon"]').length > 0;
  const hasCharset = $('meta[charset]').length > 0 || html_has_charset($);
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
      passed: hasFavicon,
      severity: "info",
      detail: hasFavicon
        ? "Favicon found."
        : "No favicon link tag. Your site shows a generic icon in browser tabs.",
      ...(!hasFavicon && {
        fix: {
          title: "Add favicon",
          code: `<!-- Add in <head> - multiple sizes for different contexts -->
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">

<!-- Or just the basics -->
<link rel="icon" href="/favicon.ico">`,
          language: "html" as const,
          note: "Create a 32x32 favicon.ico. For modern browsers, SVG works too.",
        },
      }),
    },
    {
      id: "charset",
      name: "Character encoding",
      description: "Declaring UTF-8 charset prevents rendering issues",
      passed: hasCharset,
      severity: "warning",
      detail: hasCharset
        ? "Character encoding declared."
        : "No charset declaration. Special characters might display incorrectly.",
      ...(!hasCharset && {
        fix: {
          title: "Add charset declaration",
          code: `<!-- Add as first item in <head> -->
<meta charset="utf-8">`,
          language: "html" as const,
          note: "Must be within the first 1024 bytes of the document.",
        },
      }),
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
      ...(!hasDoctype && {
        fix: {
          title: "Add HTML5 doctype",
          code: `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- your head content -->
</head>
<body>
  <!-- your body content -->
</body>
</html>`,
          language: "html" as const,
          note: "Must be the very first line of your HTML file. No whitespace before it.",
        },
      }),
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
      ...(!isHttps && {
        fix: {
          title: "Enable HTTPS",
          code: `# Most platforms provide free SSL:
# - Vercel: Automatic on all deployments
# - Netlify: Enable in Domain settings
# - Cloudflare: Free Universal SSL

# After enabling, redirect HTTP to HTTPS
# vercel.json:
{
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "header", "key": "x-forwarded-proto", "value": "http" }],
      "destination": "https://yourdomain.com/$1",
      "permanent": true
    }
  ]
}`,
          language: "json" as const,
          note: "Get a free certificate from Let's Encrypt if your host doesn't provide one.",
        },
      }),
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
      ...(!modernJs && {
        fix: {
          title: "Use ES modules",
          code: `<!-- Modern: type="module" enables ES modules -->
<script type="module" src="/app.js"></script>

<!-- Your app.js can use import/export -->
import { something } from './utils.js';

<!-- Build tools that output ES modules: -->
<!-- - Vite (recommended) -->
<!-- - esbuild -->
<!-- - Rollup -->
<!-- - Webpack 5+ with output.module: true -->`,
          language: "html" as const,
          note: "ES modules enable tree shaking, better caching, and modern syntax.",
        },
      }),
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
