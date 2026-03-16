import { useMemo } from "react";

import { DEFAULT_STAGE_PROMPTS } from "@/lib/insight/prompts";
import { STAGE_LABELS } from "@/lib/insight/stage-labels";
import type { InsightRunResult, InsightStageName } from "@/lib/insight/types";
import type { StageUiConfig } from "@/hooks/use-pipeline-state";

function getMarkdownSections(markdown: string) {
  return Array.from(markdown.matchAll(/^#{1,6}\s+(.+)$/gm), (match) => match[1].trim());
}

function getSectionDifference(source: string[], target: string[]) {
  const targetSet = new Set(target);
  return source.filter((section) => !targetSet.has(section));
}

function renderComparedMarkdown(primary: string, secondary: string, variant: "a" | "b") {
  const primaryLines = primary.replace(/\r\n/g, "\n").split("\n");
  const secondaryLines = secondary.replace(/\r\n/g, "\n").split("\n");

  return (
    <pre className="codeBlock" style={{ whiteSpace: "pre-wrap" }}>
      {primaryLines.map((line, index) => {
        const changed = line !== (secondaryLines[index] ?? "");
        return (
          <span
            key={`${variant}-${index}`}
            style={{
              display: "block",
              backgroundColor: changed
                ? variant === "a"
                  ? "rgba(239, 68, 68, 0.12)"
                  : "rgba(34, 197, 94, 0.12)"
                : "transparent",
            }}
          >
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

type ABComparisonProps = {
  abMode: boolean;
  setAbMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  abStage: InsightStageName | null;
  setAbStage: (value: InsightStageName | null) => void;
  abPromptOverride: string;
  setAbPromptOverride: (value: string) => void;
  stageConfigs: Record<InsightStageName, StageUiConfig>;
  tunedStages: InsightStageName[];
  finalResult: InsightRunResult | null;
  abResult: InsightRunResult | null;
};

export function ABComparison({
  abMode,
  setAbMode,
  abStage,
  setAbStage,
  abPromptOverride,
  setAbPromptOverride,
  stageConfigs,
  tunedStages,
  finalResult,
  abResult,
}: ABComparisonProps) {
  const abComparison = useMemo(() => {
    if (!finalResult?.finalOutput || !abResult?.finalOutput) return null;

    const markdownA = finalResult.finalOutput.markdownOutput;
    const markdownB = abResult.finalOutput.markdownOutput;
    const sectionsA = getMarkdownSections(markdownA);
    const sectionsB = getMarkdownSections(markdownB);

    return {
      markdownA,
      markdownB,
      charCountA: markdownA.length,
      charCountB: markdownB.length,
      onlyInA: getSectionDifference(sectionsA, sectionsB),
      onlyInB: getSectionDifference(sectionsB, sectionsA),
      oneLineTakeA: finalResult.finalOutput.oneLineTake,
      oneLineTakeB: abResult.finalOutput.oneLineTake,
    };
  }, [abResult, finalResult]);

  return (
    <>
      <button type="button" className="secondaryButton" onClick={() => setAbMode((prev) => !prev)}>
        {`A/B Compare: ${abMode ? "ON" : "OFF"}`}
      </button>

      {abMode ? (
        <div className="configCard" style={{ marginTop: 16 }}>
          <div className="profileGrid">
            <label className="fieldShell">
              <span className="fieldLabel">B Variant Stage</span>
              <select
                className="selectInput"
                value={abStage ?? ""}
                onChange={(event) => setAbStage((event.target.value || null) as InsightStageName | null)}
              >
                <option value="">Select stage...</option>
                {tunedStages.map((stage) => (
                  <option key={`ab-${stage}`} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </label>
            {abStage ? (
              <div className="profileSummary">
                <span className="summaryPill">A = current config</span>
                <span className="summaryPill summaryPillAccent">B = prompt override only</span>
                <span className="summaryPill">{STAGE_LABELS[abStage]}</span>
              </div>
            ) : null}
          </div>

          {abStage ? (
            <label className="fieldShell promptFieldShell">
              <div className="promptLabelRow">
                <span className="fieldLabel">B Prompt Override</span>
                <button
                  type="button"
                  className="miniButton"
                  onClick={() => setAbPromptOverride(stageConfigs[abStage].prompt || DEFAULT_STAGE_PROMPTS[abStage])}
                >
                  Reset to Current
                </button>
              </div>
              <textarea
                className="promptInput"
                value={abPromptOverride}
                spellCheck={false}
                rows={10}
                onChange={(event) => setAbPromptOverride(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {abComparison && abStage ? (
        <div className="summaryBlock markdownBlock">
          <span className="summaryLabel">A/B Comparison</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <span className="summaryLabel">A (Current)</span>
              {renderComparedMarkdown(abComparison.markdownA, abComparison.markdownB, "a")}
            </div>
            <div>
              <span className="summaryLabel">B (Modified: {STAGE_LABELS[abStage]})</span>
              {renderComparedMarkdown(abComparison.markdownB, abComparison.markdownA, "b")}
            </div>
          </div>
          <div className="triggerList" style={{ marginTop: 16 }}>
            <div className="listCard">
              <div className="metaRow">
                <strong>Character Count</strong>
              </div>
              <div>{`A: ${abComparison.charCountA.toLocaleString()} / B: ${abComparison.charCountB.toLocaleString()}`}</div>
            </div>
            <div className="listCard">
              <div className="metaRow">
                <strong>Sections only in A</strong>
              </div>
              <div>{abComparison.onlyInA.length > 0 ? abComparison.onlyInA.join(", ") : "None"}</div>
            </div>
            <div className="listCard">
              <div className="metaRow">
                <strong>Sections only in B</strong>
              </div>
              <div>{abComparison.onlyInB.length > 0 ? abComparison.onlyInB.join(", ") : "None"}</div>
            </div>
            <div className="listCard">
              <div className="metaRow">
                <strong>oneLineTake</strong>
              </div>
              <div>{`A: ${abComparison.oneLineTakeA}`}</div>
              <div>{`B: ${abComparison.oneLineTakeB}`}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
