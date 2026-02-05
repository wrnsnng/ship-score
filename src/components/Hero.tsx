import { useState, type FormEvent } from "react";
import styles from "./Hero.module.css";

interface HeroProps {
  onScan: (url: string) => void;
  loading: boolean;
  error: string | null;
}

export function Hero({ onScan, loading, error }: HeroProps) {
  const [url, setUrl] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (url.trim() && !loading) {
      onScan(url.trim());
    }
  }

  return (
    <div className={styles.hero}>
      <div className={styles.content}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          Free & instant
        </div>

        <h1 className={styles.title}>
          Is your app
          <br />
          <span className={styles.gradient}>ready to ship?</span>
        </h1>

        <p className={styles.subtitle}>
          Paste a URL. Get a plain-English report card for security, performance,
          SEO, accessibility, and more. Built for builders, not bureaucrats.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputWrapper}>
            <span className={styles.inputIcon}>🔗</span>
            <input
              type="text"
              className={styles.input}
              placeholder="https://your-app.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>
          <button
            type="submit"
            className={styles.button}
            disabled={loading || !url.trim()}
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              "Scan"
            )}
          </button>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.categories}>
          {["🔒 Security", "⚡ Performance", "🔍 SEO", "♿ Accessibility", "🛡️ Errors", "📱 Best practices"].map(
            (cat) => (
              <span key={cat} className={styles.categoryPill}>
                {cat}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
