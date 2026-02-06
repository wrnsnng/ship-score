import { useState } from "react";
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
} from "lucide-react";
import type { ScanResult, Category, Check as CheckType, Grade } from "../types";
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

export function Report({ result, onReset }: ReportProps) {
  const domain = result.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [copied, setCopied] = useState(false);

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

  return (
    <div className={styles.report}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.back} onClick={onReset}>
          <ArrowLeft size={14} strokeWidth={2} /> new scan
        </button>
        <div className={styles.headerRight}>
          <button className={styles.shareBtn} onClick={handleCopyLink}>
            <Link size={14} strokeWidth={2} />
            {copied ? "copied!" : "share"}
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

      {/* Categories */}
      <section className={styles.categories}>
        {result.categories.map((category, i) => (
          <CategorySection
            key={category.id}
            category={category}
            index={i}
          />
        ))}
      </section>

      <footer className={styles.footer}>
        <p>
          External scan only — can't replace a thorough security audit. Use as a starting checklist, not a seal of approval.
        </p>
      </footer>
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
      onClick={() => setExpanded(!expanded)}
    >
      <div className={styles.checkRow}>
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
      {expanded && check.detail ? (
        <p className={styles.detail}>{check.detail}</p>
      ) : !check.passed && !expanded ? (
        <p className={styles.desc}>{check.description}</p>
      ) : null}
    </div>
  );
}
