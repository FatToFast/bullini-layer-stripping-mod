"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listSavedDecisionRuns,
  loadSavedDecisionRun,
  runDecisionPipelineApi,
  saveDecisionBenchmarkCase,
  saveDecisionRun,
} from "@/lib/decision/api";
import {
  buildDecisionBenchmarkFromExecutionRun,
} from "@/lib/decision/article-benchmark";
import { splitLines } from "@/lib/decision/panel-utils";
import type {
  DecisionBenchmarkCase,
  DecisionExecutionRun,
  DecisionModelSettings,
  DecisionPipelineOptions,
  DecisionRunFileSummary,
  DecisionRunResult,
  DecisionStageName,
} from "@/lib/decision/types";
import {
  compareDecisionExecutionRuns,
  formatDecisionRunDate,
  useDecisionRunHistory,
  type DecisionExecutionComparison,
  type StoredDecisionExecutionRun,
} from "@/hooks/use-decision-run-history";
import { useLazyPanelActivation } from "@/hooks/use-lazy-panel-activation";
import { useLatestRequest } from "@/hooks/use-latest-request";

const STAGE_LABELS: Record<DecisionStageName, string> = {
  task_reframing: "과제 재정의",
  stakeholder_mapping: "관점 수렴",
  option_synthesis: "옵션 압축",
  orchestration_design: "실행 설계",
  persona_rehearsal: "리허설",
  decision_synthesis: "집필 브리프",
};

type Props = {
  decisionModelSettings: DecisionModelSettings;
  stagePolicies?: DecisionPipelineOptions["stagePolicies"];
  defaultTask?: string;
  defaultBackground?: string;
  defaultContext?: string[];
  onApplyInsightHandoff?: (analysisPrompt: string, additionalContext: string[]) => void;
  onBenchmarkCreated?: (benchmark: DecisionBenchmarkCase) => void;
  disabled?: boolean;
  deferInitialLoad?: boolean;
};

function buildExecutionRecord(input: {
  task: string;
  background: string;
  contextText: string;
  stakeholdersText: string;
  successCriteriaText: string;
}, run: DecisionRunResult): DecisionExecutionRun {
  return {
    input: {
      task: input.task.trim(),
      background: input.background.trim() || undefined,
      context: splitLines(input.contextText),
      stakeholders: splitLines(input.stakeholdersText),
      successCriteria: splitLines(input.successCriteriaText),
    },
    run,
    savedAt: new Date().toISOString(),
    label: input.task.trim().slice(0, 80),
  };
}

export function DecisionExecutionPanel({
  decisionModelSettings,
  stagePolicies,
  defaultTask = "",
  defaultBackground = "",
  defaultContext = [],
  onApplyInsightHandoff,
  onBenchmarkCreated,
  disabled = false,
  deferInitialLoad = false,
}: Props) {
  const [task, setTask] = useState(defaultTask);
  const [background, setBackground] = useState(defaultBackground);
  const [contextText, setContextText] = useState(defaultContext.join("\n"));
  const [stakeholdersText, setStakeholdersText] = useState("CEO\n전략기획\n리서처");
  const [successCriteriaText, setSuccessCriteriaText] = useState("질문을 재정의할 것\n선택 가능한 옵션을 제시할 것\n집필 브리프를 만들 것");
  const [result, setResult] = useState<DecisionRunResult | null>(null);
  const [currentRecord, setCurrentRecord] = useState<DecisionExecutionRun | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<StoredDecisionExecutionRun[]>([]);
  const [savedRuns, setSavedRuns] = useState<DecisionRunFileSummary[]>([]);
  const [selectedCompareKeys, setSelectedCompareKeys] = useState<string[]>([]);
  const [selectedFileCompareRuns, setSelectedFileCompareRuns] = useState<DecisionExecutionRun[] | null>(null);
  const [comparison, setComparison] = useState<DecisionExecutionComparison | null>(null);
  const [selectedFileComparison, setSelectedFileComparison] = useState<DecisionExecutionComparison | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingBenchmark, setIsSavingBenchmark] = useState(false);
  const [isLoadingSavedRuns, setIsLoadingSavedRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const { isActivated, activate, panelRef } = useLazyPanelActivation({ defer: deferInitialLoad });
  const savedRunsRequest = useLatestRequest();
  const decisionRunRequest = useLatestRequest();
  const compareRequest = useLatestRequest();
  const { saveDecisionRun: saveLocalDecisionRun, loadDecisionRun } = useDecisionRunHistory({
    decisionHistory,
    setDecisionHistory,
  });

  useEffect(() => {
    if (!isActivated) return;
    const request = savedRunsRequest.begin();
    void (async () => {
      setIsLoadingSavedRuns(true);
      const runs = await listSavedDecisionRuns(request.signal);
      if (!savedRunsRequest.isCurrent(request.requestId)) return;
      if ("error" in runs) {
        setIsLoadingSavedRuns(false);
        return;
      }
      setSavedRuns(runs);
      setIsLoadingSavedRuns(false);
    })();
    return () => {
      if (!savedRunsRequest.isCurrent(request.requestId)) return;
      savedRunsRequest.cancel();
    };
  }, [isActivated]);

  const activeWarnings = useMemo(
    () => result?.stages.flatMap((stage) => (stage.warnings ?? []).map((warning) => `${STAGE_LABELS[stage.stage]}: ${warning}`)) ?? [],
    [result],
  );

  const previousRun = decisionHistory[0]?.record ?? null;
  const benchmarkDraft = useMemo(() => (currentRecord ? buildDecisionBenchmarkFromExecutionRun(currentRecord) : null), [currentRecord]);

  async function refreshSavedRuns() {
    if (!isActivated) return;
    const request = savedRunsRequest.begin();
    const runs = await listSavedDecisionRuns(request.signal);
    if (!savedRunsRequest.isCurrent(request.requestId)) return;
    if ("error" in runs) return;
    setSavedRuns(runs);
    savedRunsRequest.finish(request.requestId);
  }

  async function handleRunDecision() {
    if (!task.trim()) return;
    const request = decisionRunRequest.begin();
    setIsRunning(true);
    setError(null);
    setApplyFeedback(null);

    const run = await runDecisionPipelineApi(
      {
        task: task.trim(),
        background: background.trim() || undefined,
        context: splitLines(contextText),
        stakeholders: splitLines(stakeholdersText),
        successCriteria: splitLines(successCriteriaText),
      },
      {
        modelSettings: decisionModelSettings,
        stagePolicies,
      },
      request.signal,
    );
    if (!decisionRunRequest.isCurrent(request.requestId)) return;

    if ("error" in run) {
      setError(run.error);
      setResult(null);
      setCurrentRecord(null);
      setIsRunning(false);
      return;
    }

    const record = buildExecutionRecord({ task, background, contextText, stakeholdersText, successCriteriaText }, run);
    setCurrentRecord(record);
    setResult(run);
    setComparison(previousRun ? compareDecisionExecutionRuns(previousRun, record) : null);
    saveLocalDecisionRun(record);

    const saveResult = await saveDecisionRun(record);
    if (!decisionRunRequest.isCurrent(request.requestId)) return;
    if ("error" in saveResult) {
      setError(saveResult.error);
    } else {
      setApplyFeedback(`Decision run 저장 완료: ${saveResult.filename}`);
      await refreshSavedRuns();
      if (!decisionRunRequest.isCurrent(request.requestId)) return;
    }

    setIsRunning(false);
    decisionRunRequest.finish(request.requestId);
  }

  async function handleSaveBenchmarkFromRun() {
    if (!benchmarkDraft) return;
    setIsSavingBenchmark(true);
    setError(null);
    const saveResult = await saveDecisionBenchmarkCase(benchmarkDraft);
    if ("error" in saveResult) {
      setError(saveResult.error);
      setIsSavingBenchmark(false);
      return;
    }
    onBenchmarkCreated?.(benchmarkDraft);
    setApplyFeedback(`Decision run benchmark 저장 완료: ${saveResult.filename}`);
    setIsSavingBenchmark(false);
  }

  function handleApplyHandoff() {
    if (!result?.finalOutput || !onApplyInsightHandoff) return;
    onApplyInsightHandoff(
      result.finalOutput.insightHandoff.analysisPrompt,
      result.finalOutput.insightHandoff.additionalContext,
    );
    setApplyFeedback("decision insight handoff를 현재 insight 입력으로 반영했습니다.");
  }

  function hydrateFromRecord(record: DecisionExecutionRun) {
    setTask(record.input.task);
    setBackground(record.input.background ?? "");
    setContextText((record.input.context ?? []).join("\n"));
    setStakeholdersText((record.input.stakeholders ?? []).join("\n"));
    setSuccessCriteriaText((record.input.successCriteria ?? []).join("\n"));
    setCurrentRecord(record);
    setResult(record.run);
  }

  function handleLoadHistory(record: StoredDecisionExecutionRun) {
    const loaded = loadDecisionRun(record);
    hydrateFromRecord(loaded);
    const previous = decisionHistory.find((item) => item.storageKey !== record.storageKey);
    setComparison(previous ? compareDecisionExecutionRuns(previous.record, loaded) : null);
    setApplyFeedback(null);
    setError(null);
  }

  async function toggleFileCompare(summary: DecisionRunFileSummary) {
    const nextKeys = selectedCompareKeys.includes(summary.filename)
      ? selectedCompareKeys.filter((key) => key !== summary.filename)
      : [...selectedCompareKeys, summary.filename].slice(-2);
    setSelectedCompareKeys(nextKeys);
    compareRequest.cancel();

    if (nextKeys.length !== 2) {
      setSelectedFileCompareRuns(null);
      setSelectedFileComparison(null);
      return;
    }

    const request = compareRequest.begin();
    const loaded = await Promise.all(nextKeys.map((filename) => loadSavedDecisionRun(filename, request.signal)));
    if (!compareRequest.isCurrent(request.requestId)) return;
    if (loaded.some((item) => "error" in item)) {
      setError("선택한 decision run 파일을 불러오지 못했습니다.");
      setSelectedFileCompareRuns(null);
      setSelectedFileComparison(null);
      return;
    }

    const runs = loaded as DecisionExecutionRun[];
    setSelectedFileCompareRuns(runs);
    setSelectedFileComparison(compareDecisionExecutionRuns(runs[1], runs[0]));
    setError(null);
    compareRequest.finish(request.requestId);
  }

  return (
    <section
      ref={panelRef}
      className="decisionExecution panel"
      onPointerEnter={activate}
      onFocusCapture={activate}
    >
      <div className="sectionHeader">
        <div>
          <h2 className="panelTitle">Decision Pipeline Run</h2>
          <p className="panelLead">
            producer 관점의 과제를 직접 입력하고, decision pipeline을 실행해 집필 브리프와 insight handoff를 바로 확인합니다.
          </p>
        </div>
        <div className="producerFlowPills">
          <span className="summaryPill">live run</span>
          {result?.finalOutput ? <span className="summaryPill summaryPillAccent">handoff ready</span> : null}
          {benchmarkDraft ? <span className="summaryPill">benchmark draft ready</span> : null}
        </div>
      </div>

      {!isActivated ? <p className="panelLead">패널이 화면에 들어오면 저장된 decision run 목록을 불러옵니다.</p> : null}

      <div className="decisionExecutionGrid">
        <label className="fieldShell">
          <span className="fieldLabel">Task</span>
          <textarea className="promptInput" rows={4} value={task} onChange={(event) => setTask(event.target.value)} />
        </label>
        <label className="fieldShell">
          <span className="fieldLabel">Background</span>
          <textarea className="promptInput" rows={4} value={background} onChange={(event) => setBackground(event.target.value)} />
        </label>
        <label className="fieldShell">
          <span className="fieldLabel">Context signals</span>
          <textarea className="promptInput" rows={6} value={contextText} onChange={(event) => setContextText(event.target.value)} />
        </label>
        <label className="fieldShell">
          <span className="fieldLabel">Stakeholders</span>
          <textarea className="promptInput" rows={6} value={stakeholdersText} onChange={(event) => setStakeholdersText(event.target.value)} />
        </label>
        <label className="fieldShell decisionExecutionWide">
          <span className="fieldLabel">Success criteria</span>
          <textarea className="promptInput" rows={4} value={successCriteriaText} onChange={(event) => setSuccessCriteriaText(event.target.value)} />
        </label>
      </div>

      <div className="inlineActions benchmarkActions benchmarkActionsWrap">
        <button type="button" className="primaryButton" onClick={handleRunDecision} disabled={disabled || !task.trim() || isRunning}>
          {isRunning ? "Decision 실행 중..." : "Decision 실행"}
        </button>
        <button type="button" className="secondaryButton" onClick={handleApplyHandoff} disabled={disabled || !result?.finalOutput || !onApplyInsightHandoff}>
          Insight handoff 적용
        </button>
        <button type="button" className="secondaryButton" onClick={() => void handleSaveBenchmarkFromRun()} disabled={disabled || !benchmarkDraft || isSavingBenchmark}>
          {isSavingBenchmark ? "benchmark 저장 중..." : "이 decision run을 benchmark로 저장"}
        </button>
      </div>

      {error ? <p className="errorText">{error}</p> : null}
      {applyFeedback ? <p className="successText">{applyFeedback}</p> : null}

      {benchmarkDraft ? (
        <div className="decisionExecutionCard decisionExecutionWideCard benchmarkPreviewCard">
          <div className="metaRow">
            <span className="metaLabel">Benchmark draft from current run</span>
            <span className="summaryPill">{benchmarkDraft.expectedCriteria.length} expected criteria</span>
          </div>
          <p className="benchmarkComment"><strong>Title:</strong> {benchmarkDraft.title}</p>
          <p className="benchmarkComment"><strong>Task:</strong> {benchmarkDraft.input.task}</p>
        </div>
      ) : null}

      {result ? (
        <div className="decisionExecutionResults">
          <div className="decisionExecutionCard">
            <span className="metaLabel">Stage results</span>
            <div className="decisionStageList">
              {result.stages.map((stage) => (
                <article key={stage.stage} className="decisionStageItem">
                  <div className="metaRow">
                    <strong>{STAGE_LABELS[stage.stage]}</strong>
                    <div className="producerFlowPills">
                      <span className="summaryPill">{stage.status}</span>
                      {stage.resolution ? <span className="summaryPill">{stage.resolution}</span> : null}
                    </div>
                  </div>
                  {stage.error ? <p className="benchmarkComment">error: {stage.error}</p> : null}
                  {stage.warnings && stage.warnings.length > 0 ? <p className="benchmarkComment">warnings: {stage.warnings.join(" / ")}</p> : null}
                </article>
              ))}
            </div>
          </div>

          {result.finalOutput ? (
            <>
              <div className="decisionExecutionCard">
                <span className="metaLabel">Decision output</span>
                <div className="benchmarkBreakdownList">
                  <article className="benchmarkBreakdownItem">
                    <div className="metaRow"><strong>Recommended question</strong></div>
                    <p className="benchmarkComment">{result.finalOutput.recommendedQuestion}</p>
                  </article>
                  <article className="benchmarkBreakdownItem">
                    <div className="metaRow"><strong>Decision statement</strong></div>
                    <p className="benchmarkComment">{result.finalOutput.decisionStatement}</p>
                  </article>
                  <article className="benchmarkBreakdownItem">
                    <div className="metaRow"><strong>Revisit triggers</strong></div>
                    <ul className="benchmarkList benchmarkCompactList">
                      {result.finalOutput.revisitTriggers.map((trigger) => <li key={trigger}>{trigger}</li>)}
                    </ul>
                  </article>
                </div>
              </div>

              <div className="decisionExecutionCard">
                <span className="metaLabel">Insight handoff</span>
                <article className="benchmarkBreakdownItem">
                  <div className="metaRow"><strong>Analysis prompt</strong></div>
                  <pre className="workflowMermaidFallback"><code>{result.finalOutput.insightHandoff.analysisPrompt}</code></pre>
                </article>
                <article className="benchmarkBreakdownItem">
                  <div className="metaRow"><strong>Additional context</strong></div>
                  <ul className="benchmarkList benchmarkCompactList">
                    {result.finalOutput.insightHandoff.additionalContext.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </article>
              </div>
            </>
          ) : null}

          {comparison ? (
            <div className="decisionExecutionCard decisionExecutionWideCard">
              <span className="metaLabel">Previous run diff</span>
              <div className="benchmarkDiffStats">
                <span className="summaryPill">task {comparison.taskChanged ? "changed" : "same"}</span>
                <span className="summaryPill">question {comparison.recommendedQuestionChanged ? "changed" : "same"}</span>
                <span className="summaryPill">decision {comparison.decisionStatementChanged ? "changed" : "same"}</span>
                <span className="summaryPill summaryPillAccent">warnings {comparison.warningCountDelta >= 0 ? "+" : ""}{comparison.warningCountDelta}</span>
              </div>
              <ul className="benchmarkList benchmarkCompactList">
                {comparison.stageStatusChanges.slice(0, 6).map((item) => (
                  <li key={item.stage}>{STAGE_LABELS[item.stage as DecisionStageName]}: {item.previousStatus} → {item.currentStatus}</li>
                ))}
                {comparison.addedContext.slice(0, 3).map((item) => <li key={`add-${item}`}>새 context: {item}</li>)}
                {comparison.removedContext.slice(0, 3).map((item) => <li key={`remove-${item}`}>사라진 context: {item}</li>)}
              </ul>
            </div>
          ) : null}

          {activeWarnings.length > 0 ? (
            <div className="decisionExecutionCard decisionExecutionWideCard">
              <span className="metaLabel">Fallback / skipped warnings</span>
              <ul className="benchmarkList benchmarkCompactList">
                {activeWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedFileComparison && selectedFileCompareRuns ? (
        <div className="decisionExecutionCard decisionExecutionWideCard">
          <span className="metaLabel">Selected run diff</span>
          <div className="benchmarkDiffStats">
            <span className="summaryPill">task {selectedFileComparison.taskChanged ? "changed" : "same"}</span>
            <span className="summaryPill">question {selectedFileComparison.recommendedQuestionChanged ? "changed" : "same"}</span>
            <span className="summaryPill summaryPillAccent">warnings {selectedFileComparison.warningCountDelta >= 0 ? "+" : ""}{selectedFileComparison.warningCountDelta}</span>
            <span className="summaryPill">runs 2 selected</span>
          </div>
          <ul className="benchmarkList benchmarkCompactList">
            {selectedFileComparison.stageStatusChanges.slice(0, 6).map((item) => (
              <li key={item.stage}>{STAGE_LABELS[item.stage as DecisionStageName]}: {item.previousStatus} → {item.currentStatus}</li>
            ))}
            {selectedFileComparison.addedContext.slice(0, 3).map((item) => <li key={`selected-add-${item}`}>새 context: {item}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="decisionExecutionCard decisionBenchmarkHistoryCard">
        <div className="metaRow">
          <span className="metaLabel">History</span>
          <span className="summaryPill">{decisionHistory.length} local runs</span>
        </div>
        <div className="benchmarkHistoryList">
          {decisionHistory.length > 0 ? (
            decisionHistory.slice(0, 8).map((record) => (
              <button key={record.storageKey} type="button" className="benchmarkHistoryItem" onClick={() => handleLoadHistory(record)}>
                <div>
                  <strong>{formatDecisionRunDate(record.timestamp)}</strong>
                  <p className="benchmarkHistoryTitle">{record.record.input.task}</p>
                </div>
                <div className="benchmarkHistoryMeta">
                  <span className="summaryPill">{record.record.run.finalOutput ? "ready" : "partial"}</span>
                  <span className="summaryPill">{record.record.run.stages.length} stages</span>
                </div>
              </button>
            ))
          ) : (
            <p className="panelLead">아직 저장된 decision run이 없습니다.</p>
          )}
        </div>
      </div>

      <div className="decisionExecutionCard decisionBenchmarkHistoryCard">
        <div className="metaRow">
          <span className="metaLabel">Saved files</span>
          <span className="summaryPill">{isLoadingSavedRuns ? "loading..." : `${savedRuns.length} files`}</span>
        </div>
        <p className="panelLead">두 개를 선택하면 파일 기준 decision run diff를 바로 비교합니다.</p>
        <div className="benchmarkHistoryList">
          {savedRuns.length > 0 ? (
            savedRuns.slice(0, 10).map((record) => {
              const selected = selectedCompareKeys.includes(record.filename);
              return (
                <button
                  key={record.filename}
                  type="button"
                  className={`benchmarkHistoryItem${selected ? " benchmarkHistoryItemSelected" : ""}`}
                  onClick={() => void toggleFileCompare(record)}
                >
                  <div>
                    <strong>{record.filename}</strong>
                    <p className="benchmarkHistoryTitle">{record.taskPreview}</p>
                  </div>
                  <div className="benchmarkHistoryMeta">
                    {record.recommendedQuestion ? <span className="summaryPill">question</span> : null}
                    <span className="summaryPill">{selected ? "selected" : "compare"}</span>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="panelLead">아직 파일로 저장된 decision run이 없습니다.</p>
          )}
        </div>
      </div>
    </section>
  );
}
