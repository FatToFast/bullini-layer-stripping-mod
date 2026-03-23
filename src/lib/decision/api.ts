import type {
  DecisionBenchmarkCase,
  DecisionBenchmarkFileSummary,
  DecisionBenchmarkRun,
  DecisionExecutionRun,
  DecisionModelSettings,
  DecisionRunFileSummary,
  DecisionPipelineOptions,
  DecisionRunResult,
  DecisionInput,
  ModelConfigOverride,
} from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function postApi<T>(url: string, body: unknown, label: string, signal?: AbortSignal): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      signal,
    });
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return { error: (payload?.error as string) ?? `${label} failed: ${res.status}` };
    return payload as T;
  } catch (error) {
    return { error: error instanceof Error ? error.message : `Network error: ${label}` };
  }
}

async function getApi<T>(url: string, label: string, signal?: AbortSignal): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { signal });
    const payload = await res.json().catch(() => null);
    if (!res.ok) return { error: (payload as { error?: string } | null)?.error ?? `${label} failed: ${res.status}` };
    return payload as T;
  } catch (error) {
    return { error: error instanceof Error ? error.message : `Network error: ${label}` };
  }
}

export function runDecisionPipelineApi(
  input: DecisionInput,
  options?: {
    modelSettings?: DecisionModelSettings;
    stagePolicies?: DecisionPipelineOptions["stagePolicies"];
    systemPrompt?: string;
  },
  signal?: AbortSignal,
): Promise<DecisionRunResult | { error: string }> {
  return postApi<DecisionRunResult>(
    "/api/decision/run",
    {
      input,
      modelSettings: options?.modelSettings,
      stagePolicies: options?.stagePolicies,
      systemPrompt: options?.systemPrompt,
    },
    "Run decision pipeline",
    signal,
  );
}

export async function listDecisionBenchmarks(signal?: AbortSignal): Promise<DecisionBenchmarkCase[] | { error: string }> {
  const result = await getApi<{ benchmarks: DecisionBenchmarkCase[] }>("/api/decision/benchmark", "List decision benchmarks", signal);
  if ("error" in result) return result;
  return result.benchmarks ?? [];
}

export function runDecisionBenchmarkApi(
  benchmarkIdOrCase: string | DecisionBenchmarkCase,
  options?: {
    pipelineModelSettings?: DecisionModelSettings;
    evaluationModelSettings?: Omit<ModelConfigOverride, "prompt">;
    stagePolicies?: DecisionPipelineOptions["stagePolicies"];
    systemPrompt?: string;
  },
  signal?: AbortSignal,
): Promise<DecisionBenchmarkRun | { error: string }> {
  return postApi<DecisionBenchmarkRun>(
    "/api/decision/benchmark",
    {
      ...(typeof benchmarkIdOrCase === "string"
        ? { benchmarkId: benchmarkIdOrCase }
        : { benchmark: benchmarkIdOrCase }),
      pipelineModelSettings: options?.pipelineModelSettings,
      evaluationModelSettings: options?.evaluationModelSettings,
      stagePolicies: options?.stagePolicies,
      systemPrompt: options?.systemPrompt,
    },
    "Run decision benchmark",
    signal,
  );
}


export function saveDecisionBenchmarkCase(
  benchmark: DecisionBenchmarkCase,
  signal?: AbortSignal,
): Promise<{ saved: boolean; filename: string; path: string } | { error: string }> {
  return postApi<{ saved: boolean; filename: string; path: string }>(
    "/api/decision/save-case",
    benchmark,
    "Save decision benchmark case",
    signal,
  );
}

export function saveDecisionBenchmarkRun(
  run: DecisionBenchmarkRun,
  signal?: AbortSignal,
): Promise<{ saved: boolean; filename: string; path: string } | { error: string }> {
  return postApi<{ saved: boolean; filename: string; path: string }>(
    "/api/decision/save-benchmark",
    run,
    "Save decision benchmark run",
    signal,
  );
}

export async function listSavedDecisionBenchmarkRuns(
  signal?: AbortSignal,
): Promise<DecisionBenchmarkFileSummary[] | { error: string }> {
  const result = await getApi<{ runs: DecisionBenchmarkFileSummary[] }>(
    "/api/decision/list-benchmark-runs",
    "List saved decision benchmark runs",
    signal,
  );
  if ("error" in result) return result;
  return result.runs ?? [];
}

export function loadSavedDecisionBenchmarkRun(
  filename: string,
  signal?: AbortSignal,
): Promise<DecisionBenchmarkRun | { error: string }> {
  return getApi<DecisionBenchmarkRun>(
    `/api/decision/load-benchmark-run?filename=${encodeURIComponent(filename)}`,
    "Load decision benchmark run",
    signal,
  );
}

export function saveDecisionRun(
  record: DecisionExecutionRun,
  signal?: AbortSignal,
): Promise<{ saved: boolean; filename: string; path: string } | { error: string }> {
  return postApi<{ saved: boolean; filename: string; path: string }>(
    "/api/decision/save-run",
    record,
    "Save decision run",
    signal,
  );
}

export async function listSavedDecisionRuns(
  signal?: AbortSignal,
): Promise<DecisionRunFileSummary[] | { error: string }> {
  const result = await getApi<{ runs: DecisionRunFileSummary[] }>(
    "/api/decision/list-runs",
    "List saved decision runs",
    signal,
  );
  if ("error" in result) return result;
  return result.runs ?? [];
}

export function loadSavedDecisionRun(
  filename: string,
  signal?: AbortSignal,
): Promise<DecisionExecutionRun | { error: string }> {
  return getApi<DecisionExecutionRun>(
    `/api/decision/load-run?filename=${encodeURIComponent(filename)}`,
    "Load decision run",
    signal,
  );
}
