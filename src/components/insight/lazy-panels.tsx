"use client";

import dynamic from "next/dynamic";

export const DecisionBenchmarkPanel = dynamic(
  () => import("@/components/decision/benchmark-panel").then((module) => module.DecisionBenchmarkPanel),
);

export const DecisionExecutionPanel = dynamic(
  () => import("@/components/decision/execution-panel").then((module) => module.DecisionExecutionPanel),
);

export const WorkflowMermaidPanel = dynamic(
  () => import("@/components/decision/workflow-mermaid-panel").then((module) => module.WorkflowMermaidPanel),
);

export const AnalysisHistory = dynamic(
  () => import("@/components/insight/analysis-history").then((module) => module.AnalysisHistory),
);

export const FinalOutputPanel = dynamic(
  () => import("@/components/insight/final-output-panel").then((module) => module.FinalOutputPanel),
);

export const OutputEditor = dynamic(
  () => import("@/components/insight/output-editor").then((module) => module.OutputEditor),
);

export const QualityDashboard = dynamic(
  () => import("@/components/insight/quality-dashboard").then((module) => module.QualityDashboard),
);

export const SearchRoundsLog = dynamic(
  () => import("@/components/insight/search-rounds-log").then((module) => module.SearchRoundsLog),
);

export const StageWorkbench = dynamic(
  () => import("@/components/insight/stage-workbench").then((module) => module.StageWorkbench),
);
