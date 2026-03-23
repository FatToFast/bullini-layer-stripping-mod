import { DEFAULT_DECISION_BENCHMARKS, getDecisionBenchmarkById } from "@/lib/decision/benchmarks";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { runDecisionBenchmark } from "@/lib/decision/benchmark-runner";
import { parseDecisionBenchmarkCase } from "@/lib/decision/schemas";
import type {
  DecisionBenchmarkCase,
  DecisionModelSettings,
  DecisionPipelineOptions,
  ModelConfigOverride,
} from "@/lib/decision/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CASES_DIR = join(process.cwd(), "decision-benchmarks");


async function listStoredBenchmarks(): Promise<DecisionBenchmarkCase[]> {
  try {
    const files = await readdir(CASES_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    const results = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const raw = await readFile(join(CASES_DIR, file), "utf-8");
          return parseDecisionBenchmarkCase(JSON.parse(raw) as unknown);
        } catch {
          return null;
        }
      }),
    );
    return results.filter((item): item is DecisionBenchmarkCase => item !== null);
  } catch {
    return [];
  }
}

async function resolveBenchmark(body: RequestBody): Promise<DecisionBenchmarkCase | null> {
  if (body.benchmark) return parseDecisionBenchmarkCase(body.benchmark);
  if (!body.benchmarkId) return null;
  const defaultBenchmark = getDecisionBenchmarkById(body.benchmarkId);
  if (defaultBenchmark) return defaultBenchmark;
  const stored = await listStoredBenchmarks();
  return stored.find((benchmark) => benchmark.id === body.benchmarkId) ?? null;
}

type RequestBody = {
  benchmarkId?: string;
  benchmark?: DecisionBenchmarkCase;
  pipelineModelSettings?: DecisionModelSettings;
  evaluationModelSettings?: Omit<ModelConfigOverride, "prompt">;
  systemPrompt?: string;
  stagePolicies?: DecisionPipelineOptions["stagePolicies"];
};

export async function GET() {
  const stored = await listStoredBenchmarks();
  return Response.json({ benchmarks: [...DEFAULT_DECISION_BENCHMARKS, ...stored] }, { status: 200 });
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const benchmark = await resolveBenchmark(body);

  if (!benchmark) {
    return Response.json({ error: "benchmark or benchmarkId is required" }, { status: 400 });
  }

  try {
    const result = await runDecisionBenchmark(benchmark, {
      pipelineModelSettings: body.pipelineModelSettings,
      evaluationModelSettings: body.evaluationModelSettings,
      systemPrompt: body.systemPrompt,
      stagePolicies: body.stagePolicies,
    });
    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Decision benchmark failed" },
      { status: 500 },
    );
  }
}
