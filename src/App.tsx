import { useState, useEffect, useRef, useCallback } from "react";
import { Hero } from "./components/Hero";
import { Report } from "./components/Report";
import type { ScanResult } from "./types";
import styles from "./App.module.css";

// Update OG meta tags for sharing
function updateOGTags(result: ScanResult | null) {
  // Remove existing OG tags
  const existingTags = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]');
  existingTags.forEach(tag => tag.remove());

  if (!result) {
    // Reset to defaults
    document.title = "Ship Score – Is your site ready to ship?";
    return;
  }

  const domain = result.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  document.title = `${result.overallGrade} (${result.overallScore}/100) – ${domain} | Ship Score`;

  // Build OG image URL with params
  const categories = result.categories.map(c => ({
    name: c.name,
    grade: c.grade,
    emoji: c.emoji,
  }));
  
  const ogImageUrl = new URL("/api/og", window.location.origin);
  ogImageUrl.searchParams.set("url", result.url);
  ogImageUrl.searchParams.set("score", String(result.overallScore));
  ogImageUrl.searchParams.set("grade", result.overallGrade);
  ogImageUrl.searchParams.set("categories", JSON.stringify(categories));

  const description = `${domain} scored ${result.overallGrade} (${result.overallScore}/100) on Ship Score. Check security, performance, SEO, and accessibility in one scan.`;

  // Add OG tags
  const ogTags = [
    { property: "og:title", content: `${result.overallGrade} – ${domain} | Ship Score` },
    { property: "og:description", content: description },
    { property: "og:image", content: ogImageUrl.toString() },
    { property: "og:url", content: window.location.href },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Ship Score" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: `${result.overallGrade} – ${domain} | Ship Score` },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImageUrl.toString() },
  ];

  const head = document.head;
  for (const tag of ogTags) {
    const meta = document.createElement("meta");
    if (tag.property) meta.setAttribute("property", tag.property);
    if (tag.name) meta.setAttribute("name", tag.name);
    meta.setAttribute("content", tag.content);
    head.appendChild(meta);
  }
}

export function App() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [previousResult, setPreviousResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialScanDone = useRef(false);
  const currentUrl = useRef<string | null>(null);

  // Update OG tags when result changes
  useEffect(() => {
    updateOGTags(result);
  }, [result]);

  // Check for URL param on mount and auto-scan
  useEffect(() => {
    if (initialScanDone.current) return;
    
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    
    if (urlParam) {
      initialScanDone.current = true;
      handleScan(urlParam);
    }
  }, []);

  async function handleScan(url: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    setPreviousResult(null);
    currentUrl.current = url;

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Scan failed");
        return;
      }

      setResult(data);
      
      // Update URL with scanned domain (without reload)
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set("url", data.url);
      window.history.replaceState({}, "", shareUrl.toString());
    } catch {
      setError("Couldn't reach the scanner. Make sure the API is running.");
    } finally {
      setLoading(false);
    }
  }

  const handleRescan = useCallback(async (): Promise<ScanResult | null> => {
    if (!currentUrl.current) return null;
    
    setRescanning(true);
    setPreviousResult(result);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: currentUrl.current }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Scan failed");
        return null;
      }

      setResult(data);
      return data;
    } catch {
      setError("Couldn't reach the scanner. Make sure the API is running.");
      return null;
    } finally {
      setRescanning(false);
    }
  }, [result]);

  function handleReset() {
    setResult(null);
    setPreviousResult(null);
    setError(null);
    currentUrl.current = null;
    
    // Clear URL param
    const url = new URL(window.location.href);
    url.searchParams.delete("url");
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <div className={styles.app}>
      {!result ? (
        <Hero onScan={handleScan} loading={loading} error={error} />
      ) : (
        <Report 
          result={result} 
          onReset={handleReset}
          onRescan={handleRescan}
          previousResult={previousResult}
          isRescanning={rescanning}
        />
      )}
    </div>
  );
}
