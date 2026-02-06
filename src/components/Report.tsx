import React, { useState, useRef, forwardRef } from "react";
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
  RefreshCw,
  HelpCircle,
  Download,
} from "lucide-react";
import type { ScanResult, Category, Check as CheckType, Grade } from "../types";
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

export function Report({ result, onReset, onRescan, previousResult, isRescanning }: ReportProps) {
  const domain = result.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [copied, setCopied] = useState(false);
  const [howWeScoreOpen, setHowWeScoreOpen] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  function scrollToCategory(categoryId: string) {
    const el = categoryRefs.current[categoryId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Calculate score change for re-scan comparison
  const scoreChange = previousResult ? result.overallScore - previousResult.overallScore : null;
  const gradeChanged = previousResult && result.overallGrade !== previousResult.overallGrade;

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

        {/* Re-scan comparison */}
        {previousResult && (
          <div className={styles.comparison}>
            {scoreChange !== null && scoreChange !== 0 ? (
              <span className={scoreChange > 0 ? styles.improved : styles.declined}>
                Score {scoreChange > 0 ? "improved" : "declined"}: {previousResult.overallScore} → {result.overallScore} ({scoreChange > 0 ? "+" : ""}{scoreChange})
              </span>
            ) : gradeChanged ? (
              <span className={styles.gradeChange}>
                Grade changed: {previousResult.overallGrade} → {result.overallGrade}
              </span>
            ) : (
              <span className={styles.noChange}>No change</span>
            )}
          </div>
        )}

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
            <button 
              key={cat.id} 
              className={styles.summaryItem}
              onClick={() => scrollToCategory(cat.id)}
              style={{ "--summary-color": gradeColor(cat.grade) } as React.CSSProperties}
            >
              <span className={styles.summaryDot} />
              <span className={styles.summaryGrade}>
                {cat.grade}
              </span>
              <span className={styles.summaryLabel}>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* How we score - collapsible */}
        <div className={styles.howWeScore}>
          <button 
            className={styles.howWeScoreToggle}
            onClick={() => setHowWeScoreOpen(!howWeScoreOpen)}
          >
            <HelpCircle size={14} strokeWidth={2} />
            <span>How we score</span>
            <ChevronRight 
              size={14} 
              strokeWidth={2} 
              className={`${styles.howWeScoreArrow} ${howWeScoreOpen ? styles.howWeScoreArrowOpen : ""}`} 
            />
          </button>
          {howWeScoreOpen && (
            <div className={styles.howWeScoreContent}>
              <div className={styles.howWeScoreSection}>
                <h4>Severity levels</h4>
                <ul>
                  <li><span className={`${styles.severityBadge} ${styles.critical}`}>critical</span> Must fix — security risks or major issues</li>
                  <li><span className={`${styles.severityBadge} ${styles.warning}`}>warning</span> Should fix — impacts user experience</li>
                  <li><span className={`${styles.severityBadge} ${styles.info}`}>info</span> Nice to have — best practice suggestions</li>
                </ul>
              </div>
              <div className={styles.howWeScoreSection}>
                <h4>Category scores</h4>
                <p>Each category scores 0-100 based on checks passed, weighted by severity. Critical issues have the biggest impact.</p>
              </div>
              <div className={styles.howWeScoreSection}>
                <h4>Grade thresholds</h4>
                <p>
                  <span className={styles.gradeKey} style={{ color: gradeColor("A") }}>A</span> 90+ &nbsp;
                  <span className={styles.gradeKey} style={{ color: gradeColor("B") }}>B</span> 80-89 &nbsp;
                  <span className={styles.gradeKey} style={{ color: gradeColor("C") }}>C</span> 70-79 &nbsp;
                  <span className={styles.gradeKey} style={{ color: gradeColor("D") }}>D</span> 60-69 &nbsp;
                  <span className={styles.gradeKey} style={{ color: gradeColor("F") }}>F</span> &lt;60
                </p>
              </div>
              <div className={styles.howWeScoreSection}>
                <h4>Overall score</h4>
                <p>Weighted average of all category scores.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Categories */}
      <section className={styles.categories}>
        {result.categories.map((category, i) => (
          <CategorySection
            key={category.id}
            category={category}
            index={i}
            ref={(el) => { categoryRefs.current[category.id] = el; }}
          />
        ))}
      </section>

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

const CategorySection = forwardRef<
  HTMLDivElement,
  { category: Category; index: number }
>(function CategorySection({ category, index }, ref) {
  const [open, setOpen] = useState(category.grade !== "A");
  const failed = category.checks.filter((c) => !c.passed);
  const passed = category.checks.filter((c) => c.passed);
  const Icon = CATEGORY_ICONS[category.id];

  return (
    <div
      ref={ref}
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
});

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
