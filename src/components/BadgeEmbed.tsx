import { useState } from "react";
import { Code, Check, Copy, ChevronDown, ChevronUp } from "lucide-react";
import styles from "./BadgeEmbed.module.css";

interface BadgeEmbedProps {
  url: string;
  grade: string;
}

export function BadgeEmbed({ url, grade }: BadgeEmbedProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Clean domain for display
  const domain = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  
  // Base URLs
  const baseUrl = "https://ship-score.vercel.app";
  const reportUrl = `${baseUrl}?url=${encodeURIComponent(domain)}`;
  const badgeUrl = `${baseUrl}/api/badge?url=${encodeURIComponent(domain)}`;

  const snippets = {
    html: `<a href="${reportUrl}">
  <img src="${badgeUrl}" alt="Ship Score: ${grade}">
</a>`,
    markdown: `[![Ship Score](${badgeUrl})](${reportUrl})`,
    rst: `.. image:: ${badgeUrl}
   :target: ${reportUrl}
   :alt: Ship Score: ${grade}`,
  };

  async function copySnippet(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
      const input = document.createElement("textarea");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  return (
    <div className={styles.badge}>
      <button 
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={styles.headerLeft}>
          <Code size={14} strokeWidth={2} />
          <span>Get badge</span>
        </div>
        <div className={styles.headerRight}>
          <img 
            src={badgeUrl} 
            alt={`Ship Score: ${grade}`}
            className={styles.preview}
          />
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className={styles.content}>
          <p className={styles.description}>
            Show off your score! Add this badge to your README or site footer.
          </p>

          <div className={styles.snippets}>
            <div className={styles.snippet}>
              <div className={styles.snippetHeader}>
                <span className={styles.snippetLabel}>Markdown</span>
                <button
                  className={styles.copyBtn}
                  onClick={() => copySnippet("markdown", snippets.markdown)}
                >
                  {copied === "markdown" ? (
                    <><Check size={12} /> copied</>
                  ) : (
                    <><Copy size={12} /> copy</>
                  )}
                </button>
              </div>
              <pre className={styles.code}>{snippets.markdown}</pre>
            </div>

            <div className={styles.snippet}>
              <div className={styles.snippetHeader}>
                <span className={styles.snippetLabel}>HTML</span>
                <button
                  className={styles.copyBtn}
                  onClick={() => copySnippet("html", snippets.html)}
                >
                  {copied === "html" ? (
                    <><Check size={12} /> copied</>
                  ) : (
                    <><Copy size={12} /> copy</>
                  )}
                </button>
              </div>
              <pre className={styles.code}>{snippets.html}</pre>
            </div>

            <div className={styles.snippet}>
              <div className={styles.snippetHeader}>
                <span className={styles.snippetLabel}>reStructuredText</span>
                <button
                  className={styles.copyBtn}
                  onClick={() => copySnippet("rst", snippets.rst)}
                >
                  {copied === "rst" ? (
                    <><Check size={12} /> copied</>
                  ) : (
                    <><Copy size={12} /> copy</>
                  )}
                </button>
              </div>
              <pre className={styles.code}>{snippets.rst}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
