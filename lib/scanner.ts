import * as cheerio from "cheerio";

// --- Types ---

export interface ScanResult {
  url: string;
  scannedAt: string;
  overallScore: number;
  overallGrade: Grade;
  categories: Category[];
  scanTimeMs: number;
  jsFrameworkDetected?: boolean;
  jsFrameworkNotice?: string;
  ogData?: OGData;
}

export interface OGData {
  title?: string;
  description?: string;
  image?: string;
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
  language: "html" | "json" | "htaccess" | "text" | "nginx";
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

  // Detect JS framework rendering
  const jsFrameworkInfo = detectJsFramework($, html);

  // Collect OG data for social preview
  const ogData: OGData = {
    title: $('meta[property="og:title"]').attr("content"),
    description: $('meta[property="og:description"]').attr("content"),
    image: $('meta[property="og:image"]').attr("content"),
  };

  // Fetch robots.txt, sitemap.xml, and vibe-code checks in parallel
  const base = new URL(finalUrl);
  const [robotsResult, sitemapResult, vibeCodeResult] = await Promise.all([
    fetchRobotsTxt(base.origin),
    fetchSitemap(base.origin),
    runVibeCodeChecksAsync(base.origin),
  ]);

  // Run all category checks
  const categories: Category[] = [
    runSecurityChecks(headers, finalUrl, html, $, vibeCodeResult),
    runPerformanceChecks(headers, html, $),
    runSEOChecks($, finalUrl, robotsResult, sitemapResult),
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

  const result: ScanResult = {
    url: finalUrl,
    scannedAt: new Date().toISOString(),
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    categories,
    scanTimeMs: Date.now() - start,
    ogData,
  };

  // Add JS framework notice if detected
  if (jsFrameworkInfo.detected) {
    result.jsFrameworkDetected = true;
    result.jsFrameworkNotice = jsFrameworkInfo.notice;
  }

  return result;
}

// --- JS Framework Detection ---

interface JsFrameworkDetection {
  detected: boolean;
  frameworks: string[];
  notice: string;
}

function detectJsFramework($: cheerio.CheerioAPI, html: string): JsFrameworkDetection {
  const frameworks: string[] = [];

  // Check for Next.js
  if ($("#__next").length > 0 || html.includes("window.__NEXT_DATA__") || html.includes("_next/static")) {
    frameworks.push("Next.js");
  }

  // Check for Nuxt
  if ($("#__nuxt").length > 0 || html.includes("window.__NUXT__") || html.includes("_nuxt/")) {
    frameworks.push("Nuxt");
  }

  // Check for React (create-react-app style)
  const rootDiv = $("#root");
  if (rootDiv.length > 0) {
    const rootContent = rootDiv.html()?.trim() || "";
    // Empty or near-empty root div suggests client-side rendering
    if (rootContent.length < 100 || rootContent === "" || rootContent.includes("noscript")) {
      frameworks.push("React");
    }
  }

  // Check for Vue (generic)
  const appDiv = $("#app");
  if (appDiv.length > 0) {
    const appContent = appDiv.html()?.trim() || "";
    if (appContent.length < 100 || appContent === "") {
      frameworks.push("Vue");
    }
  }

  // Check for Angular
  if ($("[ng-app], [data-ng-app], app-root").length > 0 || html.includes("ng-version")) {
    frameworks.push("Angular");
  }

  // Check for large script bundles (>500KB total suggests heavy SPA)
  const inlineScriptSize = $("script:not([src])")
    .toArray()
    .reduce((sum, el) => sum + ($(el).html()?.length || 0), 0);

  if (inlineScriptSize > 500_000) {
    if (frameworks.length === 0) {
      frameworks.push("SPA");
    }
  }

  const detected = frameworks.length > 0;
  const frameworkList = frameworks.length > 0 ? frameworks.join("/") : "";

  return {
    detected,
    frameworks,
    notice: detected
      ? `This site appears to use client-side rendering (${frameworkList}). Some checks like heading structure, alt text, and form labels may not reflect the actual rendered page — we're only seeing what the server sends before JavaScript runs.`
      : "",
  };
}

// --- Fetch helpers for robots.txt and sitemap ---

interface RobotsResult {
  exists: boolean;
  valid: boolean;
  content?: string;
  error?: string;
}

interface SitemapResult {
  exists: boolean;
  error?: string;
}

async function fetchRobotsTxt(origin: string): Promise<RobotsResult> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShipScore/1.0; +https://shipscore.dev)" },
    });

    if (res.status === 200) {
      const content = await res.text();
      // Basic validation: should contain User-agent or Allow/Disallow
      const isValid = /user-agent|allow|disallow|sitemap/i.test(content);
      return { exists: true, valid: isValid, content };
    }
    return { exists: false, valid: false };
  } catch (e) {
    return { exists: false, valid: false, error: String(e) };
  }
}

async function fetchSitemap(origin: string): Promise<SitemapResult> {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShipScore/1.0; +https://shipscore.dev)" },
    });

    if (res.status === 200) {
      const content = await res.text();
      // Basic validation: should be XML with urlset or sitemapindex
      const isValid = content.includes("<urlset") || content.includes("<sitemapindex");
      return { exists: isValid };
    }
    return { exists: false };
  } catch (e) {
    return { exists: false, error: String(e) };
  }
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

// --- Vibe Code Checks (async probes) ---

interface VibeCodeResult {
  envExposed: boolean;
  envContent?: string;
  sourceMapExposed: boolean;
  sourceMapUrl?: string;
  debugMode: boolean;
  debugEvidence?: string;
  adminExposed: boolean;
  adminPath?: string;
}

async function runVibeCodeChecksAsync(origin: string): Promise<VibeCodeResult> {
  const result: VibeCodeResult = {
    envExposed: false,
    sourceMapExposed: false,
    debugMode: false,
    adminExposed: false,
  };

  const fetchQuiet = async (url: string): Promise<Response | null> => {
    try {
      return await fetch(url, {
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ShipScore/1.0; +https://shipscore.dev)" },
      });
    } catch {
      return null;
    }
  };

  // Check for exposed .env file
  const envPaths = ["/.env", "/.env.local", "/.env.production"];
  const adminPaths = ["/admin", "/dashboard", "/_admin", "/wp-admin"];

  const [envResults, adminResults] = await Promise.all([
    Promise.all(envPaths.map(async (p) => {
      const res = await fetchQuiet(`${origin}${p}`);
      if (res && res.status === 200) {
        const text = await res.text();
        // .env files typically have KEY=VALUE patterns
        if (/^[A-Z_]+=.+/m.test(text) && !text.includes("<!DOCTYPE") && !text.includes("<html")) {
          return { path: p, content: text.slice(0, 200) };
        }
      }
      return null;
    })),
    Promise.all(adminPaths.map(async (p) => {
      const res = await fetchQuiet(`${origin}${p}`);
      if (res && res.status === 200) {
        const text = await res.text();
        // Check if it's an actual admin page (not a 404 styled as 200)
        if (text.includes("login") || text.includes("password") || text.includes("admin") || text.includes("dashboard")) {
          return p;
        }
      }
      return null;
    })),
  ]);

  const exposedEnv = envResults.find((r) => r !== null);
  if (exposedEnv) {
    result.envExposed = true;
    result.envContent = exposedEnv.path;
  }

  const exposedAdmin = adminResults.find((r) => r !== null);
  if (exposedAdmin) {
    result.adminExposed = true;
    result.adminPath = exposedAdmin;
  }

  return result;
}

// --- Security ---

function runSecurityChecks(
  headers: Record<string, string>,
  url: string,
  html: string,
  $: cheerio.CheerioAPI,
  vibeCode?: VibeCodeResult
): Category {
  // Check for mixed content (HTTP resources on HTTPS page)
  const isHttps = url.startsWith("https://");
  const mixedContentUrls: string[] = [];
  
  if (isHttps) {
    $("[src], [href]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      if (src.startsWith("http://") && !src.includes("localhost")) {
        mixedContentUrls.push(src.slice(0, 60));
      }
    });
  }

  const checks: Check[] = [
    {
      id: "https",
      name: "HTTPS encryption",
      description: "Your site should encrypt all traffic so no one can spy on your visitors.",
      passed: isHttps,
      severity: "critical",
      detail: isHttps
        ? "Your site uses HTTPS — all traffic between visitors and your server is encrypted."
        : "Your site sends data in plain text. Anyone on the same Wi-Fi network (like a coffee shop) can see passwords, form submissions, and everything else your visitors send.",
      fix: !isHttps
        ? {
            title: "Enable HTTPS",
            code: `# Most hosts offer free SSL certificates via Let's Encrypt.
# If you're using a CDN like Cloudflare, enable "Always Use HTTPS"
# For manual setup, install certbot and run:
certbot --nginx -d yourdomain.com`,
            language: "text",
            note: "Contact your hosting provider — most offer one-click SSL now.",
          }
        : undefined,
    },
    {
      id: "hsts",
      name: "Force HTTPS (HSTS)",
      description: "Tell browsers to always use HTTPS, even if someone types http://.",
      passed: !!headers["strict-transport-security"],
      severity: "critical",
      detail: headers["strict-transport-security"]
        ? `Browsers are told to always use HTTPS. Current policy: ${headers["strict-transport-security"]}`
        : "Without HSTS, attackers can intercept the first request before the redirect to HTTPS happens. This 'downgrade attack' can steal cookies and session tokens.",
      fix: !headers["strict-transport-security"]
        ? {
            title: "Add HSTS header",
            code: `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
            language: "text",
            note: "Add this header in your server config or CDN settings. Start with a shorter max-age (like 86400) to test.",
          }
        : undefined,
    },
    {
      id: "csp",
      name: "Content Security Policy",
      description: "Control what scripts and resources can run on your page to prevent hackers from injecting malicious code.",
      passed: !!(
        headers["content-security-policy"] ||
        headers["content-security-policy-report-only"]
      ),
      severity: "warning",
      detail: headers["content-security-policy"]
        ? "Your site has a Content Security Policy that restricts what code can run."
        : "Without CSP, if an attacker finds a way to inject code into your page (XSS), they can steal user data, hijack sessions, and redirect users to malicious sites. CSP limits the damage by only allowing trusted sources.",
      fix: !(headers["content-security-policy"] || headers["content-security-policy-report-only"])
        ? {
            title: "Add basic Content Security Policy",
            code: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'`,
            language: "text",
            note: "This is a starter policy — you'll need to adjust it based on what third-party scripts you use (analytics, fonts, etc).",
          }
        : undefined,
    },
    {
      id: "x-frame",
      name: "Clickjacking protection",
      description: "Prevent your site from being embedded in a hidden iframe on a malicious page.",
      passed: !!(
        headers["x-frame-options"] ||
        (headers["content-security-policy"] &&
          headers["content-security-policy"].includes("frame-ancestors"))
      ),
      severity: "warning",
      detail: headers["x-frame-options"] ||
        (headers["content-security-policy"]?.includes("frame-ancestors"))
        ? `Your page can't be embedded in malicious iframes. Current setting: ${headers["x-frame-options"] || "CSP frame-ancestors"}`
        : "Attackers could overlay your site with invisible elements, tricking users into clicking things they can't see — like a 'Delete Account' button hidden under a 'Play Video' button.",
      fix: !(headers["x-frame-options"] || headers["content-security-policy"]?.includes("frame-ancestors"))
        ? {
            title: "Add X-Frame-Options header",
            code: `X-Frame-Options: DENY`,
            language: "text",
            note: "Use DENY to block all framing, or SAMEORIGIN if you need to embed your own pages.",
          }
        : undefined,
    },
    {
      id: "x-content-type",
      name: "File type protection",
      description: "Stop browsers from guessing file types, which could let attackers disguise malicious files.",
      passed: headers["x-content-type-options"] === "nosniff",
      severity: "info",
      detail: headers["x-content-type-options"]
        ? "Browsers won't try to guess file types — they'll trust what your server says."
        : "Browsers sometimes 'sniff' file contents to guess the type. An attacker could upload a file that looks like an image but contains JavaScript, and the browser might execute it.",
      fix: headers["x-content-type-options"] !== "nosniff"
        ? {
            title: "Add X-Content-Type-Options header",
            code: `X-Content-Type-Options: nosniff`,
            language: "text",
            note: "Add this to your server configuration or CDN headers.",
          }
        : undefined,
    },
    {
      id: "exposed-secrets",
      name: "No exposed API keys",
      description: "Make sure secret keys and tokens aren't accidentally visible in your page source.",
      passed: !hasExposedSecrets(html),
      severity: "critical",
      detail: hasExposedSecrets(html)
        ? "⚠️ Found patterns that look like exposed API keys or secrets in your HTML! Anyone can view your page source and steal these credentials. They could rack up charges on your accounts or access your data."
        : "We scanned for common patterns like Stripe keys, AWS credentials, and GitHub tokens — none found in your page source.",
      fix: hasExposedSecrets(html)
        ? {
            title: "Move secrets to server-side",
            code: `# Never put secret keys in client-side code
# Instead, create a server endpoint:
app.get('/api/data', (req, res) => {
  // Use process.env.API_KEY here — it stays on the server
  const data = await fetch(externalAPI, {
    headers: { 'Authorization': process.env.API_KEY }
  });
  res.json(data);
});`,
            language: "text",
            note: "If you've exposed a key, rotate it immediately — assume it's been compromised.",
          }
        : undefined,
    },
    {
      id: "mixed-content",
      name: "No mixed content",
      description: "All resources should load over HTTPS to maintain the secure connection.",
      passed: mixedContentUrls.length === 0,
      severity: isHttps ? "critical" : "info",
      detail: mixedContentUrls.length === 0
        ? isHttps
          ? "All resources load over HTTPS — your secure connection isn't broken by insecure elements."
          : "N/A — site isn't using HTTPS yet."
        : `Found ${mixedContentUrls.length} resource(s) loading over plain HTTP: ${mixedContentUrls.slice(0, 3).join(", ")}${mixedContentUrls.length > 3 ? "..." : ""}. Modern browsers block some mixed content, and the rest compromises your security.`,
      fix: mixedContentUrls.length > 0
        ? {
            title: "Fix mixed content",
            code: `<!-- Change http:// to https:// in all resource URLs -->
<!-- Before: -->
<script src="http://example.com/script.js"></script>
<img src="http://cdn.example.com/image.jpg">

<!-- After: -->
<script src="https://example.com/script.js"></script>
<img src="https://cdn.example.com/image.jpg">

<!-- Or use protocol-relative URLs (less recommended): -->
<script src="//example.com/script.js"></script>`,
            language: "html",
            note: "Check images, scripts, stylesheets, fonts, and iframes for http:// URLs.",
          }
        : undefined,
    },
  ];

  // --- Vibe Code Security Checks ---

  // Exposed .env file
  checks.push({
    id: "env-exposed",
    name: "No exposed .env files",
    description: "Your .env file contains database passwords, API keys, and secrets — it should never be publicly accessible.",
    passed: !vibeCode?.envExposed,
    severity: "critical",
    detail: vibeCode?.envExposed
      ? `⚠️ Found an exposed environment file at ${vibeCode.envContent}! This is a critical security vulnerability — anyone can read your database credentials, API keys, and secrets by visiting this URL.`
      : "No .env files accessible via HTTP — your secrets aren't publicly exposed.",
    fix: vibeCode?.envExposed
      ? {
          title: "Block .env file access",
          code: `# Nginx — block dotfiles
location ~ /\\. {
    deny all;
    return 404;
}

# Apache (.htaccess)
<FilesMatch "^\\.">
    Order allow,deny
    Deny from all
</FilesMatch>

# Vercel/Netlify: Add to config
# vercel.json:
{ "rewrites": [{ "source": "/.env*", "destination": "/404" }] }`,
          language: "nginx",
          note: "URGENT: If your .env was exposed, assume ALL credentials are compromised. Rotate every key and password immediately.",
        }
      : undefined,
  });

  // Source maps in production
  const hasSourceMaps = html.includes("sourceMappingURL") || 
    $("script[src]").toArray().some((el) => {
      const src = $(el).attr("src") || "";
      return src.endsWith(".map") || src.includes(".map?");
    });
  
  checks.push({
    id: "source-maps",
    name: "No source maps in production",
    description: "Source maps expose your original source code — useful for debugging, dangerous in production.",
    passed: !hasSourceMaps,
    severity: "warning",
    detail: hasSourceMaps
      ? "Found sourceMappingURL references in your page. Anyone can download your original, unminified source code — including comments, variable names, and internal logic."
      : "No source maps detected in production — your code stays minified and harder to reverse-engineer.",
    fix: hasSourceMaps
      ? {
          title: "Remove source maps from production",
          code: `// Vite
export default {
  build: { sourcemap: false }
}

// webpack
module.exports = {
  devtool: false  // or 'hidden-source-map' to keep for error tracking
}

// Next.js (next.config.js)
module.exports = {
  productionBrowserSourceMaps: false
}`,
          language: "text",
          note: "If you need source maps for error tracking (Sentry, etc.), use 'hidden-source-map' — it uploads maps to your error service without exposing them publicly.",
        }
      : undefined,
  });

  // Debug mode / verbose errors
  const debugPatterns = [
    /stack\s*trace/i,
    /NEXT_PUBLIC_DEBUG/i,
    /debug\s*[:=]\s*true/i,
    /node_modules\//,
    /at\s+\w+\s+\(.*:\d+:\d+\)/,  // Stack trace pattern
    /Error:.*at\s+/,
  ];
  const debugEvidence = debugPatterns.find((p) => p.test(html));

  checks.push({
    id: "debug-mode",
    name: "No debug mode in production",
    description: "Debug output and stack traces leak internal details that help attackers understand your system.",
    passed: !debugEvidence,
    severity: "warning",
    detail: debugEvidence
      ? "Found debug output or stack traces in your page HTML. This reveals internal file paths, library versions, and error details that make attacks easier."
      : "No debug output or stack traces found in the page source.",
    fix: debugEvidence
      ? {
          title: "Disable debug mode",
          code: `# Make sure these are set in production:
NODE_ENV=production
DEBUG=

# Next.js — remove NEXT_PUBLIC_DEBUG
# Express — use a proper error handler:
app.use((err, req, res, next) => {
  console.error(err);  // Log server-side only
  res.status(500).json({ error: 'Something went wrong' });
  // Never send err.stack to the client!
});`,
          language: "text",
          note: "Use a logging service (Sentry, LogRocket) to capture errors without exposing them to users.",
        }
      : undefined,
  });

  // Exposed admin panel
  checks.push({
    id: "admin-exposed",
    name: "No unprotected admin panels",
    description: "Admin panels accessible without authentication are an open door for attackers.",
    passed: !vibeCode?.adminExposed,
    severity: "warning",
    detail: vibeCode?.adminExposed
      ? `Found an accessible admin-like page at ${vibeCode.adminPath}. If this isn't behind authentication, anyone can find and access it.`
      : "No common admin panel paths found publicly accessible.",
    fix: vibeCode?.adminExposed
      ? {
          title: "Protect admin routes",
          code: `// Add authentication middleware to all admin routes
app.use('/admin', requireAuth, adminRouter);

// Or use HTTP Basic Auth as a minimum:
# Nginx
location /admin {
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
}

// Better: Use a proper auth provider (Clerk, Auth0, etc.)`,
          language: "text",
          note: "Consider renaming /admin to a non-obvious path, and always require authentication.",
        }
      : undefined,
  });

  // Default credentials / common framework defaults left in place
  const defaultCredsPatterns = [
    /TODO:?\s*(change|update|replace).*password/i,
    /password.*=.*["']password["']/i,
    /secret.*=.*["']secret["']/i,
    /admin.*admin/i,
  ];
  const hasDefaultCreds = defaultCredsPatterns.some((p) => p.test(html));

  checks.push({
    id: "default-credentials",
    name: "No default credentials",
    description: "Default passwords and placeholder secrets left in code are the #1 way vibe-coded apps get hacked.",
    passed: !hasDefaultCreds,
    severity: "critical",
    detail: hasDefaultCreds
      ? "Found patterns suggesting default credentials or TODO comments about changing passwords in your HTML. Automated scanners actively look for these."
      : "No default credential patterns found in the page source.",
    fix: hasDefaultCreds
      ? {
          title: "Replace default credentials",
          code: `# Generate proper secrets:
openssl rand -base64 32  # For session secrets
openssl rand -hex 16     # For API keys

# Store in environment variables, never in code:
SESSION_SECRET=<generated-value>
ADMIN_PASSWORD=<strong-unique-password>

# Use a password manager to generate and store credentials`,
          language: "text",
          note: "Search your entire codebase for 'password', 'secret', 'TODO', and 'admin'. Replace every default.",
        }
      : undefined,
  });

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
  
  const inlineScripts = $("script:not([src])").toArray();
  const inlineScriptSize = inlineScripts.reduce((sum, el) => sum + ($(el).html()?.length || 0), 0);
  const largeInlineJs = inlineScriptSize > 50_000;

  // Check for render-blocking resources
  const renderBlockingScripts = $("head script:not([async]):not([defer]):not([type='module'])[src]").length;
  const renderBlockingStyles = $("head link[rel='stylesheet']:not([media])").length;
  const hasRenderBlocking = renderBlockingScripts > 0 || renderBlockingStyles > 3;

  const checks: Check[] = [
    {
      id: "html-size",
      name: "HTML document size",
      description: "Keep your initial HTML small so the page starts rendering quickly, even on slow connections.",
      passed: htmlSize < 100_000,
      severity: "warning",
      detail: htmlSize < 100_000
        ? `Your HTML is ${(htmlSize / 1024).toFixed(1)}KB — compact enough for quick initial loading.`
        : `Your HTML is ${(htmlSize / 1024).toFixed(1)}KB, which is quite large. On a 3G connection, just downloading the HTML takes over ${(htmlSize / 50000).toFixed(1)} seconds. Move data to API calls or paginate content.`,
      fix: htmlSize >= 100_000
        ? {
            title: "Reduce HTML size",
            code: `<!-- Instead of embedding all data in HTML: -->
<script>
  window.__DATA__ = { /* 80KB of JSON */ };
</script>

<!-- Load it asynchronously: -->
<script>
  fetch('/api/data').then(r => r.json()).then(data => {
    // render with data
  });
</script>`,
            language: "html",
            note: "Consider pagination, infinite scroll, or loading data on demand.",
          }
        : undefined,
    },
    {
      id: "script-count",
      name: "External scripts",
      description: "Each script file requires a separate network request, slowing down page load.",
      passed: scripts <= 10,
      severity: "warning",
      detail: scripts <= 10
        ? `${scripts} external script(s) — each browser can only download a few files at once, so this is manageable.`
        : `${scripts} external scripts means ${scripts} separate network requests. Browsers queue these, and each has latency overhead. Bundle your scripts or use dynamic imports to load features on demand.`,
      fix: scripts > 10
        ? {
            title: "Bundle scripts",
            code: `// Use a bundler like Vite, webpack, or esbuild
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'lodash'], // Third-party code
          // App code auto-bundled
        }
      }
    }
  }
}`,
            language: "text",
            note: "Most modern frameworks bundle automatically. If you're loading many third-party scripts, audit which ones you actually need.",
          }
        : undefined,
    },
    {
      id: "stylesheet-count",
      name: "Stylesheets",
      description: "Browsers wait for stylesheets before showing content — too many slow down first paint.",
      passed: stylesheets <= 5,
      severity: "info",
      detail: stylesheets <= 5
        ? `${stylesheets} stylesheet(s) — the browser can handle this without significant delay.`
        : `${stylesheets} stylesheets means the browser must download and parse all of them before painting anything. Your users see a white screen while waiting. Combine them into one or two files.`,
      fix: stylesheets > 5
        ? {
            title: "Combine stylesheets",
            code: `<!-- Before: multiple stylesheet requests -->
<link rel="stylesheet" href="/css/reset.css">
<link rel="stylesheet" href="/css/typography.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/components.css">

<!-- After: single bundled file -->
<link rel="stylesheet" href="/css/styles.css">

/* Or inline critical CSS: */
<style>
  /* Only styles needed for above-the-fold content */
</style>
<link rel="stylesheet" href="/css/styles.css" media="print" onload="this.media='all'">`,
            language: "html",
            note: "Use a CSS bundler or build tool to combine files automatically.",
          }
        : undefined,
    },
    {
      id: "compression",
      name: "Response compression",
      description: "Compress your files to reduce download times — gzip can cut sizes by 60-80%.",
      passed: !!(
        headers["content-encoding"] &&
        (headers["content-encoding"].includes("gzip") ||
          headers["content-encoding"].includes("br"))
      ),
      severity: "warning",
      detail: headers["content-encoding"]
        ? `Your server compresses responses using ${headers["content-encoding"]} — files are much smaller over the wire.`
        : "Your server sends uncompressed files. A 100KB JavaScript file could be 25KB with gzip. That's 4x faster downloads for free.",
      fix: !headers["content-encoding"]
        ? {
            title: "Enable compression",
            code: `# Nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml;

# Apache (.htaccess)
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>

# Vercel/Netlify/Cloudflare: Enabled by default`,
            language: "nginx",
            note: "Most CDNs and modern hosting platforms enable this automatically.",
          }
        : undefined,
    },
    {
      id: "inline-js-size",
      name: "Inline JavaScript size",
      description: "Large chunks of JavaScript in your HTML can't be cached and block rendering.",
      passed: !largeInlineJs,
      severity: "info",
      detail: !largeInlineJs
        ? `${(inlineScriptSize / 1024).toFixed(1)}KB of inline JavaScript — small enough to not significantly impact loading.`
        : `${(inlineScriptSize / 1024).toFixed(1)}KB of inline JavaScript! This code is downloaded fresh on every page load (can't be cached), and browsers must parse it before rendering. Move it to external files.`,
      fix: largeInlineJs
        ? {
            title: "Move to external files",
            code: `<!-- Before: large inline script -->
<script>
  // 50KB of code here...
</script>

<!-- After: external file (cacheable) -->
<script src="/js/app.js" defer></script>`,
            language: "html",
            note: "Keep only tiny, critical bootstrap code inline. The rest should be in external, cacheable files.",
          }
        : undefined,
    },
    {
      id: "large-inline-js",
      name: "No huge inline scripts",
      description: "Inline scripts over 50KB seriously hurt loading performance and can't be cached.",
      passed: inlineScriptSize < 50_000,
      severity: "warning",
      detail: inlineScriptSize < 50_000
        ? `Total inline JavaScript is ${(inlineScriptSize / 1024).toFixed(1)}KB — within acceptable limits.`
        : `You have ${(inlineScriptSize / 1024).toFixed(1)}KB of inline JavaScript. This can't be cached between page loads, must be re-parsed every time, and blocks the browser from rendering. Split it into external files that browsers can cache.`,
      fix: inlineScriptSize >= 50_000
        ? {
            title: "Extract large inline scripts",
            code: `// Create separate JS files for your code
// Before (in HTML):
<script>
  const hugeConfig = { /* KB of data */ };
  function init() { /* lots of code */ }
</script>

// After:
<script src="/js/config.js" defer></script>
<script src="/js/app.js" defer></script>

// The defer attribute ensures scripts run in order after HTML parsing`,
            language: "html",
            note: "If you're inlining app state/data, fetch it via an API instead.",
          }
        : undefined,
    },
    {
      id: "image-count",
      name: "Lazy loading for images",
      description: "Images below the fold should load lazily so they don't compete with essential content.",
      passed: images <= 20 || $("img[loading='lazy']").length > images * 0.5,
      severity: "info",
      detail:
        images === 0
          ? "No images on this page."
          : images <= 20 || $("img[loading='lazy']").length > images * 0.5
            ? `${$("img[loading='lazy']").length} of ${images} images use lazy loading — below-fold images won't slow down initial load.`
            : `Only ${$("img[loading='lazy']").length} of ${images} images use lazy loading. The rest start downloading immediately, fighting for bandwidth with your CSS and JavaScript.`,
      fix: images > 20 && $("img[loading='lazy']").length < images * 0.5
        ? {
            title: "Add lazy loading to images",
            code: `<!-- Add loading="lazy" to images below the fold -->
<img src="photo.jpg" alt="Photo" loading="lazy">

<!-- Keep the first few images (above the fold) without lazy -->
<img src="hero.jpg" alt="Hero image">`,
            language: "html",
            note: "Don't lazy-load your hero image or LCP element — that should load immediately.",
          }
        : undefined,
    },
    {
      id: "caching",
      name: "Cache headers",
      description: "Let browsers cache your files so returning visitors don't re-download everything.",
      passed: !!(headers["cache-control"] || headers["etag"]),
      severity: "info",
      detail: headers["cache-control"] || headers["etag"]
        ? `Caching enabled: ${headers["cache-control"] || `ETag: ${headers["etag"]}`}. Returning visitors load faster.`
        : "No cache headers set. Every time someone revisits your page, they re-download everything from scratch — even files that haven't changed.",
      fix: !(headers["cache-control"] || headers["etag"])
        ? {
            title: "Add cache headers",
            code: `# Nginx
location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Apache (.htaccess)
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
</IfModule>`,
            language: "nginx",
            note: "Use versioned filenames (app.abc123.js) so you can cache forever and bust cache on changes.",
          }
        : undefined,
    },
    {
      id: "render-blocking",
      name: "Render-blocking resources",
      description: "Scripts and stylesheets in <head> without async/defer block the page from appearing.",
      passed: !hasRenderBlocking,
      severity: "warning",
      detail: !hasRenderBlocking
        ? "Good job — your critical resources are optimized to not block rendering."
        : `Found ${renderBlockingScripts} blocking script(s) and ${renderBlockingStyles} stylesheet(s) in <head>. The browser can't show anything until these finish downloading and executing. Users see a blank screen.`,
      fix: hasRenderBlocking
        ? {
            title: "Remove render-blocking resources",
            code: `<!-- Make scripts non-blocking -->
<script src="app.js" defer></script>  <!-- Runs after HTML parsed -->
<script src="analytics.js" async></script>  <!-- Runs when ready -->

<!-- Make non-critical CSS non-blocking -->
<link rel="stylesheet" href="non-critical.css" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="non-critical.css"></noscript>

<!-- Or inline critical CSS and defer the rest -->
<style>/* Critical above-fold styles */</style>
<link rel="preload" href="styles.css" as="style" onload="this.rel='stylesheet'">`,
            language: "html",
            note: "Keep only critical, above-the-fold styles synchronous. Everything else can load later.",
          }
        : undefined,
    },
  ];

  return makeCategory("performance", "Performance", "⚡", checks);
}

// --- SEO ---

function runSEOChecks(
  $: cheerio.CheerioAPI,
  url: string,
  robotsResult: RobotsResult,
  sitemapResult: SitemapResult
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
      description: "The title tag is your headline in search results — make it count.",
      passed: title.length > 0 && title.length <= 70,
      severity: "critical",
      detail: !title
        ? "No title tag found! This is the single most important SEO element. Search engines won't know what your page is about."
        : title.length > 70
          ? `Your title is ${title.length} characters: "${title.slice(0, 50)}...". Google cuts off around 60 characters, so your message gets truncated in search results.`
          : `Title (${title.length} chars): "${title}" — good length, will display fully in search results.`,
      fix: !title || title.length > 70
        ? {
            title: "Add or fix title tag",
            code: `<head>
  <title>Your Page Title | Brand Name</title>
</head>

<!-- Good title format: -->
<!-- Primary keyword - Secondary info | Brand -->
<!-- Example: "Running Shoes for Women - Free Shipping | Nike" -->`,
            language: "html",
            note: "Aim for 50-60 characters. Put the most important words first.",
          }
        : undefined,
    },
    {
      id: "meta-description",
      name: "Meta description",
      description: "This is your sales pitch in search results — tell people why they should click.",
      passed: metaDesc.length > 0 && metaDesc.length <= 160,
      severity: "warning",
      detail: !metaDesc
        ? "No meta description. Google will grab random text from your page — probably not the message you want to send."
        : metaDesc.length > 160
          ? `Your description is ${metaDesc.length} characters — Google truncates after ~155, so your call-to-action might be cut off.`
          : `Description (${metaDesc.length} chars): "${metaDesc.slice(0, 80)}${metaDesc.length > 80 ? "..." : ""}" — good length.`,
      fix: !metaDesc || metaDesc.length > 160
        ? {
            title: "Add meta description",
            code: `<head>
  <meta name="description" content="A compelling 150-character summary that tells searchers exactly what they'll find and why they should click.">
</head>`,
            language: "html",
            note: "Include your primary keyword naturally. Write for humans, not search engines.",
          }
        : undefined,
    },
    {
      id: "og-tags",
      name: "Social sharing tags",
      description: "Control how your page looks when shared on Twitter, LinkedIn, and Facebook.",
      passed: !!(ogTitle && ogDesc && ogImage),
      severity: "warning",
      detail: ogTitle && ogDesc && ogImage
        ? `Your page will look great when shared: custom title, description, and image all set.`
        : `Missing: ${[!ogTitle && "og:title", !ogDesc && "og:description", !ogImage && "og:image"].filter(Boolean).join(", ")}. When someone shares your link, it'll look bland or grab random content.`,
      fix: !(ogTitle && ogDesc && ogImage)
        ? {
            title: "Add Open Graph tags",
            code: `<head>
  <meta property="og:title" content="Your Page Title">
  <meta property="og:description" content="A compelling description for social sharing">
  <meta property="og:image" content="https://yoursite.com/social-image.png">
  <meta property="og:url" content="https://yoursite.com/page">
  <meta property="og:type" content="website">
  
  <!-- Also add Twitter-specific tags: -->
  <meta name="twitter:card" content="summary_large_image">
</head>`,
            language: "html",
            note: "Image should be at least 1200x630px for best display on most platforms.",
          }
        : undefined,
    },
    {
      id: "h1",
      name: "H1 heading",
      description: "Your main headline tells search engines (and users) what this page is about.",
      passed: h1Count === 1,
      severity: "warning",
      detail:
        h1Count === 0
          ? "No H1 heading found. Without a clear main heading, search engines have to guess your page's topic."
          : h1Count === 1
            ? `Found one H1: "${$("h1").first().text().trim().slice(0, 60)}" — perfect, clear hierarchy.`
            : `Found ${h1Count} H1 headings. Multiple H1s dilute your page's focus — search engines don't know which is the main topic.`,
      fix: h1Count !== 1
        ? {
            title: "Add single H1 heading",
            code: `<!-- Each page should have exactly one H1 -->
<h1>Your Main Page Headline</h1>

<!-- Use H2, H3, etc. for subheadings -->
<h2>Section heading</h2>
<h3>Subsection heading</h3>`,
            language: "html",
            note: "The H1 should match the page's purpose — usually similar to the title tag.",
          }
        : undefined,
    },
    {
      id: "canonical",
      name: "Canonical URL",
      description: "Tell search engines which URL is the 'official' version to avoid duplicate content issues.",
      passed: !!canonical,
      severity: "info",
      detail: canonical
        ? `Canonical URL set to: ${canonical}`
        : "No canonical URL. If your page is accessible at multiple URLs (with/without www, with tracking params, etc.), search engines might see them as duplicates and split your ranking power.",
      fix: !canonical
        ? {
            title: "Add canonical URL",
            code: `<head>
  <link rel="canonical" href="https://yoursite.com/page">
</head>

<!-- Always use the full, absolute URL -->
<!-- Point all variations to the same canonical -->`,
            language: "html",
            note: "Self-referencing canonicals are fine and recommended.",
          }
        : undefined,
    },
    {
      id: "robots-txt",
      name: "robots.txt",
      description: "A robots.txt file tells search engines which parts of your site to crawl.",
      passed: robotsResult.exists && robotsResult.valid,
      severity: "info",
      detail: robotsResult.exists && robotsResult.valid
        ? "Found a valid robots.txt file guiding search engine crawlers."
        : !robotsResult.exists
          ? "No robots.txt found at /robots.txt. While not required, it helps search engines understand your site structure and can point them to your sitemap."
          : "robots.txt exists but may not be valid — couldn't find standard directives like User-agent, Allow, or Disallow.",
      fix: !robotsResult.exists || !robotsResult.valid
        ? {
            title: "Create robots.txt",
            code: `# /robots.txt
User-agent: *
Allow: /

# Block admin or private areas
Disallow: /admin/
Disallow: /private/

# Point to sitemap
Sitemap: https://yoursite.com/sitemap.xml`,
            language: "text",
            note: "Place this file at the root of your domain. Don't block CSS/JS files — search engines need them to render pages.",
          }
        : undefined,
    },
    {
      id: "sitemap",
      name: "XML sitemap",
      description: "A sitemap helps search engines discover all your pages, especially new or deep ones.",
      passed: sitemapResult.exists,
      severity: "info",
      detail: sitemapResult.exists
        ? "Found a valid XML sitemap at /sitemap.xml — search engines can easily discover all your pages."
        : "No sitemap found at /sitemap.xml. For small sites it's optional, but it helps search engines find pages that might not be well-linked internally.",
      fix: !sitemapResult.exists
        ? {
            title: "Create sitemap.xml",
            code: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yoursite.com/</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://yoursite.com/about</loc>
    <lastmod>2024-01-10</lastmod>
    <priority>0.8</priority>
  </url>
</urlset>`,
            language: "text",
            note: "Most frameworks have sitemap generators. Submit your sitemap in Google Search Console for faster indexing.",
          }
        : undefined,
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
      name: "Image descriptions",
      description: "Screen readers announce images by their alt text — without it, blind users miss the content.",
      passed:
        images.length === 0 ||
        imagesWithAlt.length - emptyAlts.length >= images.length * 0.8,
      severity: "critical",
      detail:
        images.length === 0
          ? "No images found on this page."
          : imagesWithAlt.length - emptyAlts.length >= images.length * 0.8
            ? `${imagesWithAlt.length} of ${images.length} images have alt text (${emptyAlts.length} are marked decorative with empty alt). Screen reader users can understand your content.`
            : `Only ${imagesWithAlt.length - emptyAlts.length} of ${images.length} images have descriptive alt text. Blind users will hear 'image' or the filename instead of understanding what's shown.`,
      fix: images.length > 0 && imagesWithAlt.length - emptyAlts.length < images.length * 0.8
        ? {
            title: "Add alt text to images",
            code: `<!-- Describe what's in the image -->
<img src="team.jpg" alt="Five team members standing in front of office building">

<!-- For decorative images, use empty alt (not missing!) -->
<img src="decorative-border.png" alt="">

<!-- Don't say "Image of" or "Picture of" — screen readers already announce it's an image -->`,
            language: "html",
            note: "Good alt text describes the content or function, not just 'logo' or 'photo'.",
          }
        : undefined,
    },
    {
      id: "lang",
      name: "Language declaration",
      description: "Without a language set, screen readers might pronounce your content with the wrong accent.",
      passed: !!lang,
      severity: "warning",
      detail: lang
        ? `Page language is set to "${lang}" — screen readers know how to pronounce the content.`
        : "No language attribute on <html>. A screen reader might try to read English text with French pronunciation (or vice versa), making it incomprehensible.",
      fix: !lang
        ? {
            title: "Add language attribute",
            code: `<!DOCTYPE html>
<html lang="en">

<!-- Use the correct language code: -->
<!-- English: en, Spanish: es, French: fr, German: de, etc. -->

<!-- For specific variants: -->
<html lang="en-US">  <!-- American English -->
<html lang="en-GB">  <!-- British English -->`,
            language: "html",
            note: "Set the language on the <html> tag. Change it on specific elements if needed.",
          }
        : undefined,
    },
    {
      id: "heading-hierarchy",
      name: "Heading order",
      description: "Skipping heading levels (H1 → H3) confuses screen reader users navigating by headings.",
      passed: !hasSkippedLevel,
      severity: "warning",
      detail: !hasSkippedLevel
        ? `Found ${headings.length} headings in proper order — screen reader users can navigate your content structure.`
        : "Heading levels are skipped (e.g., jumping from H1 to H3). Screen reader users rely on headings to navigate — skipped levels make the structure confusing.",
      fix: hasSkippedLevel
        ? {
            title: "Fix heading hierarchy",
            code: `<!-- Headings should follow a logical order -->
<h1>Main Page Title</h1>
  <h2>Major Section</h2>
    <h3>Subsection</h3>
    <h3>Another Subsection</h3>
  <h2>Another Major Section</h2>

<!-- Don't skip levels! -->
<!-- Bad: H1 → H3 (skipped H2) -->
<!-- Good: H1 → H2 → H3 -->`,
            language: "html",
            note: "Use CSS to style headings — don't pick a heading level based on how it looks.",
          }
        : undefined,
    },
    {
      id: "viewport",
      name: "Mobile viewport",
      description: "Without the viewport meta tag, your page appears tiny on phones with users having to zoom.",
      passed: !!viewport,
      severity: "critical",
      detail: viewport
        ? `Viewport configured: ${viewport} — page will scale properly on mobile devices.`
        : "No viewport meta tag. On mobile, your page will render at desktop width (~980px) then shrink to fit, making text unreadably small.",
      fix: !viewport
        ? {
            title: "Add viewport meta tag",
            code: `<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>

<!-- Don't disable zooming! Users with low vision need to zoom: -->
<!-- Bad: user-scalable=no, maximum-scale=1 -->`,
            language: "html",
            note: "This is essential for responsive design and accessibility.",
          }
        : undefined,
    },
    {
      id: "button-labels",
      name: "Button labels",
      description: "Buttons without text or labels are unusable for screen reader users.",
      passed: emptyButtons.length === 0,
      severity: "warning",
      detail:
        emptyButtons.length === 0
          ? `All ${buttons.length} buttons have visible text or aria-label — screen reader users know what they do.`
          : `${emptyButtons.length} button(s) have no text or aria-label. A screen reader will just say 'button' with no indication of what it does.`,
      fix: emptyButtons.length > 0
        ? {
            title: "Add labels to buttons",
            code: `<!-- Option 1: Visible text (best) -->
<button>Save Changes</button>

<!-- Option 2: aria-label for icon buttons -->
<button aria-label="Close dialog">
  <svg><!-- X icon --></svg>
</button>

<!-- Option 3: Visually hidden text -->
<button>
  <svg><!-- Icon --></svg>
  <span class="sr-only">Delete item</span>
</button>`,
            language: "html",
            note: "Visible text is always preferred. Use aria-label only when icons are self-explanatory.",
          }
        : undefined,
    },
    {
      id: "form-labels",
      name: "Form input labels",
      description: "Form fields without labels leave screen reader users guessing what to enter.",
      passed:
        inputs.length === 0 || inputsWithLabels.length >= inputs.length * 0.8,
      severity: "warning",
      detail:
        inputs.length === 0
          ? "No form inputs found on this page."
          : inputsWithLabels.length >= inputs.length * 0.8
            ? `${inputsWithLabels.length} of ${inputs.length} form inputs have proper labels.`
            : `Only ${inputsWithLabels.length} of ${inputs.length} inputs have labels. Screen reader users won't know what information to enter.`,
      fix: inputs.length > 0 && inputsWithLabels.length < inputs.length * 0.8
        ? {
            title: "Add labels to form inputs",
            code: `<!-- Option 1: Explicit label with for attribute (best) -->
<label for="email">Email address</label>
<input type="email" id="email" name="email">

<!-- Option 2: Wrap input in label -->
<label>
  Email address
  <input type="email" name="email">
</label>

<!-- Option 3: aria-label (use when visual label isn't possible) -->
<input type="search" aria-label="Search products">`,
            language: "html",
            note: "Placeholder text is not a substitute for labels — it disappears when typing.",
          }
        : undefined,
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
      name: "404 for missing pages",
      description: "When someone visits a page that doesn't exist, your server should say so — not pretend everything's fine.",
      passed: has404,
      severity: "critical",
      detail: has404
        ? "Your server correctly returns a 404 status code for missing pages."
        : `Your server returns ${res.status} for missing pages. Returning 200 (OK) for non-existent pages creates 'soft 404s' that confuse search engines and waste their crawl budget.`,
      fix: !has404
        ? {
            title: "Return proper 404 status",
            code: `// Express.js
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Next.js - create pages/404.js
export default function Custom404() {
  return <h1>Page not found</h1>
}

// The key is the HTTP status code, not just the message`,
            language: "text",
            note: "The HTTP status must be 404. Don't redirect missing pages to your homepage.",
          }
        : undefined,
    });

    checks.push({
      id: "custom-404",
      name: "Helpful 404 page",
      description: "A friendly error page helps lost visitors find their way instead of bouncing.",
      passed: hasCustom404,
      severity: "info",
      detail: hasCustom404
        ? "You have a custom 404 page that helps lost visitors."
        : "Using a default error page. A friendly 'page not found' page with navigation options, search, or popular links helps visitors recover instead of leaving.",
      fix: !hasCustom404
        ? {
            title: "Create a helpful 404 page",
            code: `<!-- Include on your 404 page: -->
<h1>Page not found</h1>
<p>Sorry, we couldn't find that page. It might have been moved or deleted.</p>

<h2>Try these instead:</h2>
<ul>
  <li><a href="/">Go to homepage</a></li>
  <li><a href="/search">Search our site</a></li>
  <li><a href="/contact">Contact us</a></li>
</ul>

<!-- Or add a search box -->`,
            language: "html",
            note: "Make sure the 404 page matches your site's design so users know they're still on your site.",
          }
        : undefined,
    });
  } catch {
    checks.push({
      id: "404-check",
      name: "Error page check",
      description: "We couldn't check your error pages.",
      passed: false,
      severity: "info",
      detail: "Couldn't reach the 404 test URL. Your server may block unusual paths or have strict rate limiting.",
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
    $('link[rel="shortcut icon"]').length > 0 ||
    $('link[rel*="icon"]').length > 0;
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
      description: "The little icon in browser tabs helps users identify your site among dozens of open tabs.",
      passed: favicon,
      severity: "info",
      detail: favicon
        ? "Favicon found — your site has its own identity in browser tabs and bookmarks."
        : "No favicon detected. Your site shows a generic icon, making it harder to spot in browser tabs and bookmarks.",
      fix: !favicon
        ? {
            title: "Add a favicon",
            code: `<head>
  <!-- Basic favicon -->
  <link rel="icon" href="/favicon.ico">
  
  <!-- Modern formats for better quality -->
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  
  <!-- Apple touch icon for iOS -->
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
</head>`,
            language: "html",
            note: "Use realfavicongenerator.net to create all the variants you need.",
          }
        : undefined,
    },
    {
      id: "charset",
      name: "Character encoding",
      description: "Tell browsers how to read your text — without this, special characters may appear as garbage.",
      passed: charset,
      severity: "warning",
      detail: charset
        ? "Character encoding is declared — special characters, emojis, and international text will display correctly."
        : "No character encoding declared. Characters like é, ñ, €, and 中文 might display as garbled symbols depending on the browser's guess.",
      fix: !charset
        ? {
            title: "Add charset declaration",
            code: `<head>
  <!-- Must be in the first 1024 bytes of the document -->
  <meta charset="UTF-8">
  
  <!-- Rest of head content... -->
</head>`,
            language: "html",
            note: "UTF-8 handles virtually all characters. Always declare it as the first item in <head>.",
          }
        : undefined,
    },
    {
      id: "doctype",
      name: "HTML doctype",
      description: "The doctype declaration prevents browsers from rendering your page in outdated 'quirks mode'.",
      passed: hasDoctype,
      severity: "info",
      detail: hasDoctype
        ? "HTML5 doctype present — browsers will render your page in standards mode."
        : "No DOCTYPE declaration. Without it, browsers enter 'quirks mode' where CSS and layout work differently (and inconsistently across browsers).",
      fix: !hasDoctype
        ? {
            title: "Add DOCTYPE",
            code: `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Must be the very first thing in the document -->
  <!-- No whitespace or comments before it -->`,
            language: "html",
            note: "The HTML5 doctype is simple and works for all HTML versions.",
          }
        : undefined,
    },
    {
      id: "https-redirect",
      name: "Secure connection",
      description: "Serve your site over HTTPS to protect visitor privacy and get better search rankings.",
      passed: isHttps,
      severity: "critical",
      detail: isHttps
        ? "Your site uses HTTPS — connections are encrypted and secure."
        : "Your site isn't using HTTPS. Visitors' data travels in plain text, browsers show security warnings, and Google ranks HTTPS sites higher.",
      fix: !isHttps
        ? {
            title: "Enable HTTPS",
            code: `# Get a free SSL certificate from Let's Encrypt:
# Most hosts offer one-click setup

# Force HTTPS redirect in .htaccess (Apache):
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Nginx:
server {
    listen 80;
    return 301 https://$host$request_uri;
}`,
            language: "htaccess",
            note: "Most modern hosts like Vercel, Netlify, and Cloudflare provide free HTTPS automatically.",
          }
        : undefined,
    },
    {
      id: "modern-js",
      name: "Modern JavaScript",
      description: "Using ES modules indicates a modern build setup that's likely better optimized.",
      passed: modernJs,
      severity: "info",
      detail: modernJs
        ? "Your site uses ES modules — you're likely using a modern build tool that optimizes code."
        : "No ES modules detected. Modern build tools (Vite, webpack, etc.) produce smaller, faster bundles with features like tree-shaking.",
      fix: !modernJs
        ? {
            title: "Use modern JavaScript",
            code: `<!-- Modern ES module syntax -->
<script type="module" src="/js/app.js"></script>

<!-- Build tools like Vite do this automatically: -->
npm create vite@latest my-app

<!-- Benefits: -->
<!-- - Tree-shaking (removes unused code) -->
<!-- - Better code splitting -->
<!-- - Smaller bundles -->`,
            language: "html",
            note: "If you're building a static site, consider a simple setup with Vite or Parcel.",
          }
        : undefined,
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
