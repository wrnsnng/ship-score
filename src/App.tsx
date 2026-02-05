import { useState } from "react";
import { Hero } from "./components/Hero";
import { Report } from "./components/Report";
import type { ScanResult } from "./types";
import styles from "./App.module.css";

export function App() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan(url: string) {
    setLoading(true);
    setError(null);
    setResult(null);

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
    } catch {
      setError("Couldn't reach the scanner. Make sure the API is running.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
  }

  return (
    <div className={styles.app}>
      {!result ? (
        <Hero onScan={handleScan} loading={loading} error={error} />
      ) : (
        <Report result={result} onReset={handleReset} />
      )}
    </div>
  );
}
