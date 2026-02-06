import { useState, useMemo } from "react";
import {
  Shield,
  Zap,
  Search,
  Accessibility,
  ShieldAlert,
  Star,
  Check,
  X,
  ArrowLeft,
  ChevronRight,
  Link,
  Copy,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Download,
} from "lucide-react";
import type { ScanResult, Category, Check as CheckType, Grade, OGData } from "../types";
import { BadgeEmbed } from "./BadgeEmbed";
import styles from "./Report.module.css";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  security: Shield,
  performance: Zap,
  seo: Search,
  accessibility: Accessibility,
  "error-handling": ShieldAlert,
  "best-practices": Star,
};

interface ReportProps {
  result: ScanResult;
  onReset: () => void;
  onRescan?: () => Promise<ScanResult | null>;
  previousResult?: ScanResult | null;
  isRescanning?: boolean;
}

function gradeColor(grade: Grade) {
  const map: Record<Grade, string> = {
    A: "var(--color-grade-a)",
    B: "var(--color-grade-b)",
    C: "var(--color-grade-c)",
    D: "var(--color-grade-d)",
    F: "var(--color-grade-f)",
  };
  return map[grade];
}

function gradeDim(grade: Grade) {
  const map: Record<Grade, string> = {
    A: "var(--color-grade-a-dim)",
    B: "var(--color-grade-b-dim)",
    C: "var(--color-grade-c-dim)",
    D: "var(--color-grade-d-dim)",
    F: "var(--color-grade-f-dim)",
  };
  return map[grade];
}

function gradeVerdict(grade: Grade): string {
  const map: Record<Grade, string> = {
    A: "Ship it.",
    B: "Almost there.",
    C: "Needs work.",
    D: "Not ready.",
    F: "Do not ship.",
  };
  return map[grade];
}

type ViewMode = "priority" | "category";

export function Report({ result, onReset, onRescan, previousResult, isRescanning }: ReportProps) {
  const domain = result.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("priority");

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Collect all checks with category info for priority view
  const allChecks = useMemo(() => {
    const checks: Array<{
      check: CheckType;
      categoryId: string;
      categoryName: string;
      categoryEmoji: string;
    }> = [];
    for (const cat of result.categories) {
      for (const check of cat.checks) {
        checks.push({
          check,
          categoryId: cat.id,
          categoryName: cat.name,
          categoryEmoji: cat.emoji,
        });
      }
    }
    return checks;
  }, [result.categories]);

  // Group checks by severity for priority view
  const priorityGroups = useMemo(() => {
    const failed = allChecks.filter((c) => !c.check.passed);
    const passed = allChecks.filter((c) => c.check.passed);
    
    return {
      critical: failed.filter((c) => c.check.severity === "critical"),
      warning: failed.filter((c) => c.check.severity === "warning"),
      info: failed.filter((c) => c.check.severity === "info"),
      passed,
    };
  }, [allChecks]);

  // Check if OG tags are missing
  const ogTagsCheck = result.categories
    .find((c) => c.id === "seo")
    ?.checks.find((c) => c.id === "og-tags");
  const showOgPreview = ogTagsCheck && !ogTagsCheck.passed;

  return (
    <div className={styles.report}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.back} onClick={onReset}>
          <ArrowLeft size={14} strokeWidth={2} /> new scan
        </button>
        <div className={styles.headerRight}>
          {onRescan && (
            <button 
              className={`${styles.rescanBtn} ${isRescanning ? styles.rescanning : ""}`}
              onClick={onRescan}
              disabled={isRescanning}
            >
              <RefreshCw size={14} strokeWidth={2} className={isRescanning ? styles.spinning : ""} />
              {isRescanning ? "scanning..." : "re-scan"}
            </button>
          )}
          <button className={styles.shareBtn} onClick={handleCopyLink}>
            <Link size={14} strokeWidth={2} />
            {copied ? "copied!" : "share"}
          </button>
          <button className={styles.downloadBtn} onClick={() => window.print()}>
            <Download size={14} strokeWidth={2} />
            <span className={styles.downloadLabel}>PDF</span>
          </button>
          <span className={styles.meta}>
            {(result.scanTimeMs / 1000).toFixed(1)}s
          </span>
        </div>
      </header>

      {/* Score hero */}
      <section className={styles.scoreHero}>
        <div className={styles.domain}>
          <code>{domain}</code>
        </div>

        <div className={styles.scoreRow}>
          <div
            className={styles.grade}
            style={{ color: gradeColor(result.overallGrade) }}
          >
            {result.overallGrade}
          </div>
          <div className={styles.scoreInfo}>
            <div className={styles.scoreNumber}>
              <span style={{ color: gradeColor(result.overallGrade) }}>
                {result.overallScore}
              </span>
              <span className={styles.scoreOf}>/100</span>
            </div>
            <p
              className={styles.verdict}
              style={{ color: gradeColor(result.overallGrade) }}
            >
              {gradeVerdict(result.overallGrade)}
            </p>
          </div>
        </div>

        {/* Score bar */}
        <div className={styles.scoreBar}>
          <div
            className={styles.scoreBarFill}
            style={{
              width: `${result.overallScore}%`,
              background: gradeColor(result.overallGrade),
            }}
          />
        </div>

        {/* Category summary strip */}
        <div className={styles.summaryStrip}>
          {result.categories.map((cat) => (
            <div key={cat.id} className={styles.summaryItem}>
              <span className={styles.summaryGrade} style={{ color: gradeColor(cat.grade) }}>
                {cat.grade}
              </span>
              <span className={styles.summaryLabel}>{cat.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* JS Framework Notice */}
      {result.jsFrameworkDetected && result.jsFrameworkNotice && (
        <div className={styles.jsFrameworkNotice}>
          <AlertTriangle size={18} strokeWidth={2} />
          <div className={styles.jsFrameworkNoticeText}>
            <strong>Client-side rendering detected</strong>
            <p>{result.jsFrameworkNotice}</p>
          </div>
        </div>
      )}

      {/* OG Preview (if tags missing) */}
      {showOgPreview && (
        <SocialCardPreview 
          ogData={result.ogData} 
          url={result.url} 
        />
      )}

      {/* View toggle */}
      <div className={styles.viewToggle}>
        <button
          className={`${styles.toggleBtn} ${viewMode === "priority" ? styles.toggleActive : ""}`}
          onClick={() => setViewMode("priority")}
        >
          Priority
        </button>
        <button
          className={`${styles.toggleBtn} ${viewMode === "category" ? styles.toggleActive : ""}`}
          onClick={() => setViewMode("category")}
        >
          Category
        </button>
      </div>

      {/* Results */}
      {viewMode === "category" ? (
        <section className={styles.categories}>
          {result.categories.map((category, i) => (
            <CategorySection
              key={category.id}
              category={category}
              index={i}
            />
          ))}
        </section>
      ) : (
        <section className={styles.priorityView}>
          {priorityGroups.critical.length > 0 && (
            <PriorityGroup
              title="Blockers"
              emoji="🔴"
              severity="critical"
              items={priorityGroups.critical}
            />
          )}
          {priorityGroups.warning.length > 0 && (
            <PriorityGroup
              title="Should fix"
              emoji="🟡"
              severity="warning"
              items={priorityGroups.warning}
            />
          )}
          {priorityGroups.info.length > 0 && (
            <PriorityGroup
              title="Nice to have"
              emoji="🔵"
              severity="info"
              items={priorityGroups.info}
            />
          )}
          {priorityGroups.passed.length > 0 && (
            <PriorityGroup
              title="Passing"
              emoji="✅"
              severity="passed"
              items={priorityGroups.passed}
              collapsed
            />
          )}
        </section>
      )}

      {/* Badge embed */}
      <BadgeEmbed url={result.url} grade={result.overallGrade} />

      <footer className={styles.footer}>
        <p>
          External scan only — can't replace a thorough security audit. Use as a starting checklist, not a seal of approval.
        </p>
      </footer>
    </div>
  );
}

// Social Card Preview Component
function SocialCardPreview({ ogData, url }: { ogData?: OGData; url: string }) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  
  return (
    <section className={styles.ogPreview}>
      <h3 className={styles.ogPreviewTitle}>
        How your site looks when shared
      </h3>
      <p className={styles.ogPreviewSubtitle}>
        Missing OG tags means your site won't look great on social media
      </p>
      
      <div className={styles.ogCards}>
        {/* Current (broken) state */}
        <div className={styles.ogCard}>
          <div className={styles.ogCardLabel}>Current</div>
          <div className={styles.ogCardContent}>
            <div className={styles.ogCardPlatform}>Twitter / X</div>
            <div className={styles.ogCardMock}>
              {ogData?.image ? (
                <img 
                  src={ogData.image} 
                  alt="OG preview" 
                  className={styles.ogCardImage}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove(styles.hidden);
                  }}
                />
              ) : null}
              <div className={`${styles.ogCardNoImage} ${ogData?.image ? styles.hidden : ""}`}>
                <span>No preview image</span>
              </div>
              <div className={styles.ogCardText}>
                <div className={styles.ogCardDomain}>{domain}</div>
                <div className={styles.ogCardTitle}>
                  {ogData?.title || "No title set"}
                </div>
                {ogData?.description ? (
                  <div className={styles.ogCardDesc}>
                    {ogData.description.slice(0, 100)}...
                  </div>
                ) : (
                  <div className={styles.ogCardDescMissing}>
                    No description
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* With proper tags */}
        <div className={styles.ogCard}>
          <div className={`${styles.ogCardLabel} ${styles.ogCardLabelGood}`}>With OG tags</div>
          <div className={styles.ogCardContent}>
            <div className={styles.ogCardPlatform}>Twitter / X</div>
            <div className={`${styles.ogCardMock} ${styles.ogCardMockGood}`}>
              <div className={styles.ogCardImageIdeal}>
                <span>1200 × 630</span>
                <span>og:image</span>
              </div>
              <div className={styles.ogCardText}>
                <div className={styles.ogCardDomain}>{domain}</div>
                <div className={styles.ogCardTitle}>
                  Your compelling page title
                </div>
                <div className={styles.ogCardDesc}>
                  A clear, engaging description that makes people want to click...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Priority group component
function PriorityGroup({
  title,
  emoji,
  severity,
  items,
  collapsed = false,
}: {
  title: string;
  emoji: string;
  severity: "critical" | "warning" | "info" | "passed";
  items: Array<{
    check: CheckType;
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
  }>;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);

  return (
    <div className={styles.priorityGroup} data-severity={severity}>
      <button 
        className={styles.priorityHeader}
        onClick={() => setOpen(!open)}
      >
        <div className={styles.priorityLeft}>
          <span className={styles.priorityEmoji}>{emoji}</span>
          <span className={styles.priorityTitle}>{title}</span>
          <span className={styles.priorityCount}>{items.length}</span>
        </div>
        <span className={`${styles.arrow} ${open ? styles.arrowOpen : ""}`}>
          <ChevronRight size={16} strokeWidth={2} />
        </span>
      </button>

      {open && (
        <div className={styles.priorityList}>
          {items.map((item) => (
            <PriorityCheckItem
              key={`${item.categoryId}-${item.check.id}`}
              check={item.check}
              categoryName={item.categoryName}
              categoryEmoji={item.categoryEmoji}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityCheckItem({
  check,
  categoryName,
  categoryEmoji,
}: {
  check: CheckType;
  categoryName: string;
  categoryEmoji: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`${styles.check} ${check.passed ? styles.checkPass : styles.checkFail}`}
    >
      <div 
        className={styles.checkRow}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.checkStatus}>
          {check.passed ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
        </span>
        <span className={styles.checkName}>{check.name}</span>
        <span className={styles.checkCategory}>
          {categoryEmoji} {categoryName}
        </span>
      </div>
      
      {expanded && (
        <div className={styles.checkExpanded}>
          {check.detail && <p className={styles.detail}>{check.detail}</p>}
          {check.fix && <FixSnippet fix={check.fix} />}
        </div>
      )}
      
      {!expanded && !check.passed && (
        <p className={styles.desc}>{check.description}</p>
      )}
    </div>
  );
}

function CategorySection({
  category,
  index,
}: {
  category: Category;
  index: number;
}) {
  const [open, setOpen] = useState(category.grade !== "A");
  const failed = category.checks.filter((c) => !c.passed);
  const passed = category.checks.filter((c) => c.passed);
  const Icon = CATEGORY_ICONS[category.id];

  return (
    <div
      className={styles.category}
      style={
        {
          animationDelay: `${index * 60}ms`,
          "--cat-color": gradeColor(category.grade),
          "--cat-dim": gradeDim(category.grade),
        } as React.CSSProperties
      }
    >
      <button className={styles.categoryHeader} onClick={() => setOpen(!open)}>
        <div className={styles.categoryLeft}>
          <span className={styles.categoryIcon}>
            {Icon && <Icon size={18} strokeWidth={2} />}
          </span>
          <span className={styles.categoryName}>{category.name}</span>
          <span className={styles.categoryRatio}>
            {passed.length}/{category.checks.length}
          </span>
        </div>
        <div className={styles.categoryRight}>
          <span className={styles.categoryGrade}>{category.grade}</span>
          <span className={`${styles.arrow} ${open ? styles.arrowOpen : ""}`}>
            <ChevronRight size={16} strokeWidth={2} />
          </span>
        </div>
      </button>

      {open && (
        <div className={styles.checkList}>
          {/* Failed first */}
          {failed.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
          {/* Then passed, dimmed */}
          {passed.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckItem({ check }: { check: CheckType }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`${styles.check} ${check.passed ? styles.checkPass : styles.checkFail}`}
    >
      <div 
        className={styles.checkRow}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.checkStatus}>
          {check.passed ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
        </span>
        <span className={styles.checkName}>{check.name}</span>
        {!check.passed && (
          <span className={`${styles.severity} ${styles[check.severity]}`}>
            {check.severity}
          </span>
        )}
      </div>
      
      {expanded && (
        <div className={styles.checkExpanded}>
          {check.detail && <p className={styles.detail}>{check.detail}</p>}
          {check.fix && <FixSnippet fix={check.fix} />}
        </div>
      )}
      
      {!expanded && !check.passed && (
        <p className={styles.desc}>{check.description}</p>
      )}
    </div>
  );
}

// Fix Snippet Component with Copy Button
function FixSnippet({ fix }: { fix: NonNullable<CheckType["fix"]> }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fix.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = fix.code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className={styles.fixSnippet}>
      <div className={styles.fixHeader}>
        <span className={styles.fixTitle}>{fix.title}</span>
        <button 
          className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ""}`}
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <CheckCircle size={12} strokeWidth={2} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={12} strokeWidth={2} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className={styles.fixCode}>
        <code>{fix.code}</code>
      </pre>
      {fix.note && (
        <p className={styles.fixNote}>💡 {fix.note}</p>
      )}
    </div>
  );
}
