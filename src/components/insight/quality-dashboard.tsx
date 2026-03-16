import type { CSSProperties } from "react";

import type { QualityMetrics } from "@/hooks/use-quality-metrics";

function getMetricStyle(level: "good" | "bad" | "neutral"): CSSProperties {
  if (level === "good") {
    return { backgroundColor: "#dcfce7", color: "#15803d" };
  }
  if (level === "bad") {
    return { backgroundColor: "#fee2e2", color: "#ef4444" };
  }
  return {};
}

type QualityDashboardProps = {
  metrics: QualityMetrics;
};

export function QualityDashboard({ metrics }: QualityDashboardProps) {
  return (
    <div className="metaRow" style={{ marginTop: 10, marginBottom: 10 }}>
      <span className="summaryPill">{metrics.charCount.toLocaleString()}자</span>
      <span className="summaryPill">섹션 {metrics.sectionCount}개</span>
      <span
        className="summaryPill"
        style={metrics.cjkRatio > 0 ? { backgroundColor: "#fee2e2", color: "#ef4444" } : {}}
      >
        CJK {metrics.cjkRatio.toFixed(1)}% {metrics.cjkRatio === 0 ? "✓" : ""}
      </span>
      <span
        className="summaryPill"
        style={metrics.advisoryCheck === "Fail" ? { backgroundColor: "#fee2e2", color: "#ef4444" } : {}}
      >
        투자조언 {metrics.advisoryCheck === "Pass" ? "없음✓" : "있음"}
      </span>
      <span className="summaryPill">가설 {metrics.hypothesisCount}개</span>
      <span className="summaryPill">지표 {metrics.indicatorCount}개</span>
      <span
        className="summaryPill"
        style={getMetricStyle(metrics.numericDensity >= 4 ? "good" : metrics.numericDensity < 2 ? "bad" : "neutral")}
      >
        수치 {metrics.numericDensity.toFixed(1)}/K
      </span>
      <span
        className="summaryPill"
        style={getMetricStyle(metrics.causalChainDepth >= 3 ? "good" : metrics.causalChainDepth < 2 ? "bad" : "neutral")}
      >
        인과 {metrics.causalChainDepth}단계
      </span>
      <span
        className="summaryPill"
        style={getMetricStyle(metrics.sourceCount >= 5 ? "good" : metrics.sourceCount < 3 ? "bad" : "neutral")}
      >
        출처 {metrics.sourceCount}개
      </span>
      <span
        className="summaryPill"
        style={getMetricStyle(
          metrics.temporalSpecificity >= 5 ? "good" : metrics.temporalSpecificity < 3 ? "bad" : "neutral"
        )}
      >
        날짜 {metrics.temporalSpecificity}개
      </span>
      <span className="summaryPill" style={getMetricStyle(metrics.counterargumentQuality ? "good" : "bad")}>
        반론+수치 {metrics.counterargumentQuality ? "✓" : "✗"}
      </span>
    </div>
  );
}
