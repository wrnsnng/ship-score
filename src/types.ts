export type Grade = "A" | "B" | "C" | "D" | "F";

export interface OGData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  siteName?: string;
}

export interface ScanResult {
  url: string;
  scannedAt: string;
  overallScore: number;
  overallGrade: Grade;
  categories: Category[];
  scanTimeMs: number;
  ogData?: OGData;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  score: number;
  grade: Grade;
  checks: Check[];
}

export interface Check {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  severity: "critical" | "warning" | "info";
  detail?: string;
  fix?: FixSnippet;
}

export interface FixSnippet {
  title: string;
  code: string;
  language: "html" | "json" | "htaccess" | "text";
  note?: string;
}
