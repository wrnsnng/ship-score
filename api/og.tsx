import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

type Grade = "A" | "B" | "C" | "D" | "F";

interface CategoryData {
  name: string;
  grade: Grade;
  emoji: string;
}

function getGradeColor(grade: Grade): string {
  const colors: Record<Grade, string> = {
    A: "#4ade80",
    B: "#a3e635",
    C: "#facc15",
    D: "#fb923c",
    F: "#f87171",
  };
  return colors[grade];
}

function getGradeVerdict(grade: Grade): string {
  const verdicts: Record<Grade, string> = {
    A: "Ship it.",
    B: "Almost there.",
    C: "Needs work.",
    D: "Not ready.",
    F: "Do not ship.",
  };
  return verdicts[grade];
}

export default async function handler(request: Request) {
  const { searchParams } = new URL(request.url);

  // Parse params
  const url = searchParams.get("url") || "example.com";
  const score = parseInt(searchParams.get("score") || "0", 10);
  const grade = (searchParams.get("grade") || "F") as Grade;

  // Parse categories (JSON array)
  let categories: CategoryData[] = [];
  const categoriesParam = searchParams.get("categories");
  if (categoriesParam) {
    try {
      categories = JSON.parse(decodeURIComponent(categoriesParam));
    } catch {
      // Fallback to empty
    }
  }

  // Extract domain from URL
  const domain = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#111110",
          padding: "60px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#e2b96f",
                letterSpacing: "-0.02em",
              }}
            >
              Ship Score
            </div>
          </div>
          <div
            style={{
              fontSize: "18px",
              color: "#8a8a82",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            shipscore.dev
          </div>
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flex: 1,
            gap: "60px",
          }}
        >
          {/* Left: Score */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "180px",
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  color: getGradeColor(grade),
                }}
              >
                {grade}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: "48px",
                    fontWeight: 600,
                    color: getGradeColor(grade),
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {score}
                  <span style={{ color: "#8a8a82", fontWeight: 400 }}>/100</span>
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 500,
                    color: getGradeColor(grade),
                  }}
                >
                  {getGradeVerdict(grade)}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Categories */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
              }}
            >
              {categories.map((cat, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: "#191918",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "10px",
                    padding: "14px 20px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{cat.emoji}</span>
                  <span
                    style={{
                      fontSize: "18px",
                      color: "#b0b0a8",
                    }}
                  >
                    {cat.name}
                  </span>
                  <span
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: getGradeColor(cat.grade),
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {cat.grade}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer: Domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "40px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              fontSize: "20px",
              color: "#b0b0a8",
              fontFamily: "ui-monospace, monospace",
              background: "#191918",
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {domain}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
