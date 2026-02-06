import { useState, type FormEvent } from "react";
import {
  Shield,
  Zap,
  Search,
  Accessibility,
  ShieldAlert,
  Star,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Github,
} from "lucide-react";
import styles from "./Hero.module.css";

interface HeroProps {
  onScan: (url: string) => void;
  loading: boolean;
  error: string | null;
}

// Example sites with typical grades (these will be scanned live)
const EXAMPLE_SITES = [
  { domain: "github.com", name: "GitHub" },
  { domain: "stripe.com", name: "Stripe" },
  { domain: "vercel.com", name: "Vercel" },
];

// All 30 checks organized by category
const CHECKS_BY_CATEGORY = {
  security: {
    icon: Shield,
    name: "Security",
    checks: [
      "HTTPS enabled",
      "Strict Transport Security (HSTS)",
      "Content Security Policy",
      "Clickjacking protection",
      "Content type sniffing protection",
      "No exposed secrets in HTML",
    ],
  },
  performance: {
    icon: Zap,
    name: "Performance",
    checks: [
      "HTML document size",
      "External script count",
      "Stylesheet count",
      "Response compression",
      "Inline JavaScript size",
      "Image count & lazy loading",
      "Cache control headers",
    ],
  },
  seo: {
    icon: Search,
    name: "SEO",
    checks: [
      "Page title",
      "Meta description",
      "Open Graph tags",
      "H1 heading",
      "Canonical URL",
    ],
  },
  accessibility: {
    icon: Accessibility,
    name: "Accessibility",
    checks: [
      "Image alt text",
      "Language attribute",
      "Heading hierarchy",
      "Viewport meta tag",
      "Button labels",
      "Form input labels",
    ],
  },
  errors: {
    icon: ShieldAlert,
    name: "Error handling",
    checks: [
      "404 status code",
      "Custom 404 page",
    ],
  },
  bestPractices: {
    icon: Star,
    name: "Best practices",
    checks: [
      "Favicon",
      "Character encoding",
      "HTML doctype",
      "HTTPS",
      "Modern JavaScript",
    ],
  },
};

export function Hero({ onScan, loading, error }: HeroProps) {
  const [url, setUrl] = useState("");
  const [focused, setFocused] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (url.trim() && !loading) {
      onScan(url.trim());
    }
  }

  return (
    <div className={styles.hero}>
      <div className={styles.content}>
        <p className={styles.tagline}>ship score</p>

        <h1 className={styles.title}>
          Know before you&nbsp;launch.
        </h1>

        <p className={styles.description}>
          30 checks across security, performance, SEO, accessibility and more.
          <br />
          Plain English. No account needed.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={`${styles.inputShell} ${focused ? styles.inputFocused : ""}`}>
            <span className={styles.prompt}>$</span>
            <input
              type="text"
              className={styles.input}
              placeholder="paste any url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={loading}
              spellCheck={false}
              autoFocus
            />
            <button
              type="submit"
              className={styles.submit}
              disabled={loading || !url.trim()}
            >
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <span className={styles.submitLabel}>
                  scan<span className={styles.submitKey}>↵</span>
                </span>
              )}
            </button>
          </div>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.checks}>
          <span className={styles.checkTag}><Shield size={13} strokeWidth={2} /> security</span>
          <span className={styles.dot} />
          <span className={styles.checkTag}><Zap size={13} strokeWidth={2} /> performance</span>
          <span className={styles.dot} />
          <span className={styles.checkTag}><Search size={13} strokeWidth={2} /> seo</span>
          <span className={styles.dot} />
          <span className={styles.checkTag}><Accessibility size={13} strokeWidth={2} /> accessibility</span>
          <span className={styles.dot} />
          <span className={styles.checkTag}><ShieldAlert size={13} strokeWidth={2} /> errors</span>
          <span className={styles.dot} />
          <span className={styles.checkTag}><Star size={13} strokeWidth={2} /> best practices</span>
        </div>

        {/* Example Reports */}
        <div className={styles.examples}>
          <p className={styles.examplesLabel}>See example reports</p>
          <div className={styles.exampleCards}>
            {EXAMPLE_SITES.map((site) => (
              <button
                key={site.domain}
                className={styles.exampleCard}
                onClick={() => onScan(site.domain)}
                disabled={loading}
              >
                <span className={styles.exampleName}>{site.name}</span>
                <span className={styles.exampleDomain}>{site.domain}</span>
                <ArrowRight size={14} className={styles.exampleArrow} />
              </button>
            ))}
          </div>
        </div>

        {/* Checklist Preview */}
        <div className={styles.checklistSection}>
          <button
            className={styles.checklistToggle}
            onClick={() => setShowChecklist(!showChecklist)}
          >
            <span>What we check</span>
            {showChecklist ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          {showChecklist && (
            <div className={styles.checklist}>
              {Object.entries(CHECKS_BY_CATEGORY).map(([key, category]) => {
                const Icon = category.icon;
                return (
                  <div key={key} className={styles.checklistCategory}>
                    <div className={styles.checklistCategoryHeader}>
                      <Icon size={14} strokeWidth={2} />
                      <span>{category.name}</span>
                      <span className={styles.checklistCount}>{category.checks.length}</span>
                    </div>
                    <ul className={styles.checklistItems}>
                      {category.checks.map((check) => (
                        <li key={check}>{check}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <p>
          Built for the millions of new builders shipping apps with AI.
          <br />
          Because "it works on my machine" isn't a deployment strategy.
        </p>
        <div className={styles.attribution}>
          <span>A <a href="https://common-tools.co" target="_blank" rel="noopener noreferrer">Common Tools</a> project</span>
          <span className={styles.footerDot}>·</span>
          <a href="https://github.com/wrnsnng/ship-score" target="_blank" rel="noopener noreferrer" className={styles.githubLink}>
            <Github size={12} />
            <span>Source</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
