import { useState, type FormEvent } from "react";
import {
  Shield,
  Zap,
  Search,
  Accessibility,
  ShieldAlert,
  Star,
} from "lucide-react";
import styles from "./Hero.module.css";

interface HeroProps {
  onScan: (url: string) => void;
  loading: boolean;
  error: string | null;
}

export function Hero({ onScan, loading, error }: HeroProps) {
  const [url, setUrl] = useState("");
  const [focused, setFocused] = useState(false);

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
      </div>

      <footer className={styles.footer}>
        <p>
          Built for the millions of new builders shipping apps with AI.
          <br />
          Because "it works on my machine" isn't a deployment strategy.
        </p>
        <p className={styles.attribution}>
          A <a href="https://common-tools.co" target="_blank" rel="noopener noreferrer">Common Tools</a> project
        </p>
      </footer>
    </div>
  );
}
