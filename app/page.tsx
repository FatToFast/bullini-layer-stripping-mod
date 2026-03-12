import { readFile } from "node:fs/promises";
import path from "node:path";
import { InsightWorkbench } from "@/components/insight-workbench";

async function loadSampleFile(filename: string) {
  return readFile(path.join(process.cwd(), "src/lib/insight/samples", filename), "utf8");
}

export default async function Page() {
  const [tariffSample, hbmSample] = await Promise.all([
    loadSampleFile("evt-301-tariff.json"),
    loadSampleFile("evt-hbm-export.json"),
  ]);
  const defaultModel =
    process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "x-ai/grok-4.1-fast";
  const providerLabel = process.env.OPENROUTER_API_KEY ? "OpenRouter" : "OpenAI";

  return (
    <InsightWorkbench
      defaultModel={defaultModel}
      providerLabel={providerLabel}
      samples={[
        { key: "evt-301-tariff", label: "301조 관세 조사", rawJson: tariffSample },
        { key: "evt-hbm-export", label: "HBM 수출 규제", rawJson: hbmSample },
      ]}
    />
  );
}
