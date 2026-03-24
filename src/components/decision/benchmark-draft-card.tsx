"use client";

import type { DecisionBenchmarkCase } from "@/lib/decision/types";
import {
  getRunStageProgress,
  type BenchmarkRunStage,
  type ValidationResult,
} from "@/lib/decision/benchmark-panel-utils";
import { splitLines } from "@/lib/decision/panel-utils";

type Props = {
  benchmarkDraft: DecisionBenchmarkCase;
  isEditingDraft: boolean;
  validation: ValidationResult;
  selectedBenchmarkNotes: string[];
  isSavingDraft: boolean;
  isFormValid: boolean;
  isRunning: boolean;
  isRunningAndApplying: boolean;
  runStage: BenchmarkRunStage;
  onUpdateDraft: (updater: (current: DecisionBenchmarkCase) => DecisionBenchmarkCase) => void;
  onFieldBlur: (fieldName: string) => void;
  onCancelEdit: () => void;
  onSaveEditedBenchmark: () => void;
  onRunAndApply: () => void;
};

export function BenchmarkDraftCard({
  benchmarkDraft,
  isEditingDraft,
  validation,
  selectedBenchmarkNotes,
  isSavingDraft,
  isFormValid,
  isRunning,
  isRunningAndApplying,
  runStage,
  onUpdateDraft,
  onFieldBlur,
  onCancelEdit,
  onSaveEditedBenchmark,
  onRunAndApply,
}: Props) {
  return (
    <div className="decisionBenchmarkCard benchmarkPreviewCard">
      <div className="metaRow">
        <span className="metaLabel">Selected scenario preview</span>
        <span className="summaryPill">stakeholders {benchmarkDraft.input.stakeholders?.length ?? 0}</span>
        <span className="summaryPill">criteria {benchmarkDraft.expectedCriteria.length}</span>
        {isEditingDraft ? <span className="summaryPill summaryPillAccent">editing</span> : null}
      </div>
      <div className="benchmarkPreviewGrid">
        <label className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
          <strong>Title</strong>
          {isEditingDraft ? (
            <input
              className="textInput"
              value={benchmarkDraft.title}
              onChange={(event) => onUpdateDraft((current) => ({ ...current, title: event.target.value }))}
            />
          ) : (
            <p className="benchmarkComment">{benchmarkDraft.title}</p>
          )}
        </label>
        <label className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
          <strong>Task</strong>
          {isEditingDraft ? (
            <>
              <textarea
                className={`promptInput ${!validation.task.isValid && validation.task.touched ? "field-error" : ""}`}
                rows={4}
                value={benchmarkDraft.input.task}
                onChange={(event) => onUpdateDraft((current) => ({ ...current, input: { ...current.input, task: event.target.value } }))}
                onBlur={() => onFieldBlur("task")}
              />
              {!validation.task.isValid && validation.task.touched && validation.task.message ? (
                <p className="field-warning validation-animated">{validation.task.message}</p>
              ) : null}
            </>
          ) : (
            <p className="benchmarkComment">{benchmarkDraft.input.task}</p>
          )}
        </label>
        <label className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
          <strong>Background</strong>
          {isEditingDraft ? (
            <textarea
              className="promptInput"
              rows={4}
              value={benchmarkDraft.input.background ?? ""}
              onChange={(event) =>
                onUpdateDraft((current) => ({
                  ...current,
                  input: { ...current.input, background: event.target.value || undefined },
                }))
              }
            />
          ) : (
            <p className="benchmarkComment">{benchmarkDraft.input.background ?? "-"}</p>
          )}
        </label>
        <div className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
          <strong>Metadata</strong>
          {isEditingDraft ? (
            <textarea
              className="promptInput"
              rows={3}
              value={selectedBenchmarkNotes.join("\n")}
              onChange={(event) =>
                onUpdateDraft((current) => ({
                  ...current,
                  notes: splitLines(event.target.value).join(" | ") || undefined,
                }))
              }
            />
          ) : (
            <div className="benchmarkTagList">
              {selectedBenchmarkNotes.map((note) => (
                <span key={note} className="summaryPill">
                  {note}
                </span>
              ))}
            </div>
          )}
        </div>
        <label className="benchmarkPreviewBlock">
          <strong>Stakeholders</strong>
          {isEditingDraft ? (
            <>
              <textarea
                className={`promptInput ${!validation.stakeholders.isValid && validation.stakeholders.touched ? "field-error" : ""}`}
                rows={8}
                value={(benchmarkDraft.input.stakeholders ?? []).join("\n")}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    input: { ...current.input, stakeholders: splitLines(event.target.value) },
                  }))
                }
                onBlur={() => onFieldBlur("stakeholders")}
              />
              {!validation.stakeholders.isValid && validation.stakeholders.touched && validation.stakeholders.message ? (
                <p className="field-warning validation-animated">{validation.stakeholders.message}</p>
              ) : null}
            </>
          ) : (
            <ul className="benchmarkList benchmarkCompactList">
              {(benchmarkDraft.input.stakeholders ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </label>
        <label className="benchmarkPreviewBlock">
          <strong>Context</strong>
          {isEditingDraft ? (
            <textarea
              className="promptInput"
              rows={8}
              value={(benchmarkDraft.input.context ?? []).join("\n")}
              onChange={(event) =>
                onUpdateDraft((current) => ({
                  ...current,
                  input: { ...current.input, context: splitLines(event.target.value) },
                }))
              }
            />
          ) : (
            <ul className="benchmarkList benchmarkCompactList">
              {(benchmarkDraft.input.context ?? []).slice(0, 8).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </label>
        <label className="benchmarkPreviewBlock">
          <strong>Success criteria</strong>
          {isEditingDraft ? (
            <>
              <textarea
                className={`promptInput ${!validation.successCriteria.isValid && validation.successCriteria.touched ? "field-error" : ""}`}
                rows={8}
                value={(benchmarkDraft.input.successCriteria ?? []).join("\n")}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    input: { ...current.input, successCriteria: splitLines(event.target.value) },
                  }))
                }
                onBlur={() => onFieldBlur("successCriteria")}
              />
              {!validation.successCriteria.isValid && validation.successCriteria.touched && validation.successCriteria.message ? (
                <p className="field-warning validation-animated">{validation.successCriteria.message}</p>
              ) : null}
            </>
          ) : (
            <ul className="benchmarkList benchmarkCompactList">
              {(benchmarkDraft.input.successCriteria ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </label>
        <label className="benchmarkPreviewBlock">
          <strong>Expected criteria</strong>
          {isEditingDraft ? (
            <>
              <textarea
                className={`promptInput ${!validation.expectedCriteria.isValid && validation.expectedCriteria.touched ? "field-error" : ""}`}
                rows={8}
                value={benchmarkDraft.expectedCriteria.join("\n")}
                onChange={(event) => onUpdateDraft((current) => ({ ...current, expectedCriteria: splitLines(event.target.value) }))}
                onBlur={() => onFieldBlur("expectedCriteria")}
              />
              {!validation.expectedCriteria.isValid && validation.expectedCriteria.touched && validation.expectedCriteria.message ? (
                <p className="field-warning validation-animated">{validation.expectedCriteria.message}</p>
              ) : null}
            </>
          ) : (
            <ul className="benchmarkList benchmarkCompactList">
              {benchmarkDraft.expectedCriteria.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </label>
      </div>
      {isEditingDraft ? (
        <div className="inlineActions benchmarkActions benchmarkActionsWrap">
          <button type="button" className="secondaryButton" onClick={onCancelEdit}>
            편집 취소
          </button>
          <button type="button" className="secondaryButton" onClick={onSaveEditedBenchmark} disabled={isSavingDraft || !isFormValid}>
            {isSavingDraft ? "benchmark 저장 중..." : "편집본 저장"}
          </button>
          <button type="button" className="run-apply-btn" onClick={onRunAndApply} disabled={isRunningAndApplying || isRunning || !isFormValid}>
            {isRunningAndApplying || isRunning ? (
              <span className="run-apply-content">
                <span className="run-spinner"></span>
                <span className="run-text">
                  {runStage === "validating" ? "Validating..." : null}
                  {runStage === "running" ? "Running benchmark..." : null}
                  {runStage === "applying" ? "Applying settings..." : null}
                  {runStage === "complete" ? "✓ Complete!" : null}
                </span>
              </span>
            ) : (
              "▶ Run & Apply"
            )}
            {isRunningAndApplying || isRunning ? (
              <div className="run-progress-bar">
                <div className="run-progress-fill" style={{ width: getRunStageProgress(runStage) }}></div>
              </div>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
