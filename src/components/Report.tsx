import { useState } from "react";
import type { ScanResult, Category, Check, Grade } from "../types";
import styles from "./Report.module.css";

interface ReportProps {
  result: ScanResult;
  onReset: () => void;
}

const gradeColors: Record<Grade, string> = {
  A: "var(--color-grade-a)",
  B: "var(--color-grade-b)",
  C: "var(--color-grade-c)",
  D: "var(--color-grade-d)",
  F: "var(--color-grade-f)",
};

const gradeBgColors: Record<Grade, string> = {
  A: "var(--color-grade-a-bg)",
  B: "var(--color-grade-b-bg)",
  C: "var(--color-grade-c-bg)",
  D: "var(--color-grade-d-bg)",
  F: "var(--color-grade-f-bg)",
};

export function Report({ result, onReset }: ReportProps) {
  return (
    <div className={styles.report}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={onReset}>
          ← Scan another
        </button>
        <div className={styles.url}>
          <span className={styles.urlLabel}>Scanned</span>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.urlLink}
          >
            {result.url.replace(/^https?:\/\//, "")}
          </a>
        </div>
      </header>

      <div className={styles.scoreSection}>
        <div
          className={styles.scoreCircle}
          style={
            {
              "--grade-color": gradeColors[result.overallGrade],
              "--grade-bg": gradeBgColors[result.overallGrade],
            } as React.CSSProperties
          }
        >
          <div className={styles.scoreRing}>
            <svg viewBox="0 0 120 120" className={styles.scoreSvg}>
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="var(--color-border)"
                strokeWidth="6"
              />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="var(--grade-color)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(result.overallScore / 100) * 339.3} 339.3`}
                transform="rotate(-90 60 60)"
                className={styles.scoreArc}
              />
            </svg>
            <div className={styles.scoreInner}>
              <span className={styles.scoreNumber}>{result.overallScore}</span>
              <span className={styles.scoreGrade}>{result.overallGrade}</span>
            </div>
          </div>
        </div>

        <div className={styles.scoreMeta}>
          <p className={styles.scoreLabel}>Overall ship score</p>
          <p className={styles.scoreTime}>
            Scanned in {(result.scanTimeMs / 1000).toFixed(1)}s
          </p>
        </div>
      </div>

      <div className={styles.categories}>
        {result.categories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>

      <footer className={styles.footer}>
        <p>
          Ship Score is a quick external scan. It catches common issues but
          can't replace a thorough security audit or accessibility review.
        </p>
      </footer>
    </div>
  );
}

function CategoryCard({ category }: { category: Category }) {
  const [expanded, setExpanded] = useState(category.grade !== "A");

  const passedCount = category.checks.filter((c) => c.passed).length;
  const totalCount = category.checks.length;

  return (
    <div
      className={styles.category}
      style={
        {
          "--cat-color": gradeColors[category.grade],
          "--cat-bg": gradeBgColors[category.grade],
        } as React.CSSProperties
      }
    >
      <button
        className={styles.categoryHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={styles.categoryLeft}>
          <span className={styles.categoryEmoji}>{category.emoji}</span>
          <div>
            <span className={styles.categoryName}>{category.name}</span>
            <span className={styles.categoryCount}>
              {passedCount}/{totalCount} passed
            </span>
          </div>
        </div>
        <div className={styles.categoryRight}>
          <span className={styles.categoryGrade}>{category.grade}</span>
          <span className={styles.categoryScore}>{category.score}</span>
          <span
            className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
          >
            ▾
          </span>
        </div>
      </button>

      {expanded && (
        <div className={styles.checks}>
          {category.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: Check }) {
  const [showDetail, setShowDetail] = useState(false);

  const severityLabel = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
  };

  return (
    <div
      className={`${styles.check} ${check.passed ? styles.checkPassed : styles.checkFailed}`}
      onClick={() => setShowDetail(!showDetail)}
    >
      <div className={styles.checkHeader}>
        <span className={styles.checkIcon}>{check.passed ? "✓" : "✗"}</span>
        <span className={styles.checkName}>{check.name}</span>
        {!check.passed && (
          <span
            className={`${styles.severityBadge} ${styles[`severity-${check.severity}`]}`}
          >
            {severityLabel[check.severity]}
          </span>
        )}
      </div>
      {showDetail && check.detail && (
        <p className={styles.checkDetail}>{check.detail}</p>
      )}
      {!showDetail && !check.passed && (
        <p className={styles.checkDesc}>{check.description}</p>
      )}
    </div>
  );
}
