"use client";

import { useMemo, type ReactNode } from "react";

import {
  formatDecisionBenchmarkDate,
  type StoredDecisionBenchmarkRun,
} from "@/hooks/use-decision-benchmark-history";
import { deepDiff, filterBenchmarkChanges, formatPath } from "@/lib/utils/diff";

type Props = {
  runs: [StoredDecisionBenchmarkRun, StoredDecisionBenchmarkRun];
  onClose: () => void;
  diffViewMode: "side-by-side" | "unified";
  onToggleDiffMode: () => void;
  diffExpanded: boolean;
  onToggleExpanded: () => void;
};

function renderFieldValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return <span className="diff-null">-</span>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return <pre className="diff-json">{JSON.stringify(parsed, null, 2)}</pre>;
    } catch {
      return <span className="diff-string">{value}</span>;
    }
  }
  if (typeof value === "number") return <span className="diff-number">{value}</span>;
  if (typeof value === "boolean") return <span className="diff-boolean">{String(value)}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="diff-array">
        {value.map((item, index) => (
          <li key={index}>{renderFieldValue(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="diff-object">
        {Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => (
          <div key={key} className="diff-object-entry">
            <span className="diff-object-key">{key}:</span> {renderFieldValue(entryValue)}
          </div>
        ))}
      </div>
    );
  }
  return <span className="diff-string">{String(value)}</span>;
}

function renderField(
  label: string,
  oldValue: unknown,
  newValue: unknown,
  changeType: "added" | "removed" | "changed" | "unchanged",
) {
  const className =
    changeType === "added"
      ? "diff-added"
      : changeType === "removed"
        ? "diff-removed"
        : changeType === "changed"
          ? "diff-changed"
          : "diff-unchanged";

  return (
    <div key={label} className={`diff-field ${className}`}>
      <div className="diff-field-label">{label}</div>
      {changeType !== "added" ? <div className="diff-field-value">{renderFieldValue(oldValue)}</div> : null}
      {changeType !== "removed" ? (
        <div className="diff-field-value">
          {changeType === "changed" ? "→ " : null}
          {renderFieldValue(newValue)}
        </div>
      ) : null}
    </div>
  );
}

export function HistoryDiffModal({
  runs,
  onClose,
  diffViewMode,
  onToggleDiffMode,
  diffExpanded,
  onToggleExpanded,
}: Props) {
  const [previous, current] = runs;

  const changes = useMemo(() => {
    const diffs = deepDiff(previous.result, current.result);
    return filterBenchmarkChanges(diffs);
  }, [current, previous]);

  return (
    <div className="diff-modal-overlay" onClick={onClose}>
      <div className="diff-modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="diff-modal-header">
          <h3 className="diff-modal-title">Benchmark Draft Comparison</h3>
          <div className="diff-modal-actions">
            <button className="diff-view-toggle" onClick={onToggleDiffMode} type="button">
              {diffViewMode === "side-by-side" ? "→ Unified View" : "→ Side-by-Side"}
            </button>
            <button className="diff-modal-close" onClick={onClose} type="button">
              ×
            </button>
          </div>
        </div>

        {diffViewMode === "unified" ? (
          <div className="diff-modal-body-unified">
            <div className="diff-panel-unified">
              <div className="diff-panel-header">
                <button className="diff-expand-toggle" onClick={onToggleExpanded} type="button">
                  {diffExpanded ? "▼ Collapse" : "▶ Expand"}
                </button>
                <span>Unified Diff</span>
              </div>
              {diffExpanded ? (
                <div className="diff-fields-unified">
                  {changes.length === 0 ? (
                    <p className="panelLead">No changes found</p>
                  ) : (
                    changes.map((change, index) => {
                      const changeLabel =
                        change.type === "added"
                          ? "ADDED"
                          : change.type === "removed"
                            ? "REMOVED"
                            : change.type === "array-item-added"
                              ? "ADDED"
                              : change.type === "array-item-removed"
                                ? "REMOVED"
                                : "CHANGED";
                      const changeClass =
                        change.type === "added" || change.type === "array-item-added"
                          ? "diff-added"
                          : change.type === "removed" || change.type === "array-item-removed"
                            ? "diff-removed"
                            : "diff-changed";

                      return (
                        <div key={index} className={`diff-field-unified ${changeClass}`}>
                          <div className="diff-field-label">
                            <span className="diff-change-type">{changeLabel}</span>
                            <span className="diff-field-path">{formatPath(change.path)}</span>
                          </div>
                          <div className="diff-field-value">
                            {change.type === "changed" ? (
                              <>
                                <div className="diff-old-value">
                                  <span className="diff-value-label">Old: </span>
                                  {renderFieldValue(change.oldValue)}
                                </div>
                                <div className="diff-new-value">
                                  <span className="diff-value-label">New: </span>
                                  {renderFieldValue(change.newValue)}
                                </div>
                              </>
                            ) : (
                              renderFieldValue(change.value)
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="diff-modal-body">
            <div className="diff-panel">
              <div className="diff-panel-header">{formatDecisionBenchmarkDate(previous.timestamp)} (Previous)</div>
              <div className="diff-fields">
                {changes.length === 0 ? (
                  <p className="panelLead">No changes found</p>
                ) : (
                  changes.map((change) => {
                    if (change.type === "added") return null;
                    if (change.type === "removed" || change.type === "array-item-removed") {
                      return renderField(formatPath(change.path), change.value, null, "removed");
                    }
                    if (change.type === "changed") {
                      return renderField(formatPath(change.path), change.oldValue, change.newValue, "changed");
                    }
                    return null;
                  })
                )}
              </div>
            </div>
            <div className="diff-panel">
              <div className="diff-panel-header">{formatDecisionBenchmarkDate(current.timestamp)} (Current)</div>
              <div className="diff-fields">
                {changes.length === 0 ? (
                  <p className="panelLead">No changes found</p>
                ) : (
                  changes.map((change) => {
                    if (change.type === "added" || change.type === "array-item-added") {
                      return renderField(formatPath(change.path), null, change.value, "added");
                    }
                    if (change.type === "removed" || change.type === "array-item-removed") return null;
                    if (change.type === "changed") {
                      return renderField(formatPath(change.path), change.oldValue, change.newValue, "changed");
                    }
                    return null;
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
