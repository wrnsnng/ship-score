import { useState, type FormEvent } from "react";
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
          <span>🔒 security</span>
          <span className={styles.dot} />
          <span>⚡ performance</span>
          <span className={styles.dot} />
          <span>🔍 seo</span>
          <span className={styles.dot} />
          <span>♿ accessibility</span>
          <span className={styles.dot} />
          <span>🛡️ errors</span>
          <span className={styles.dot} />
          <span>📱 best practices</span>
        </div>
      </div>

      <footer className={styles.footer}>
        <p>
          Built for the millions of new builders shipping apps with AI.
          <br />
          Because "it works on my machine" isn't a deployment strategy.
        </p>
      </footer>
    </div>
  );
}
