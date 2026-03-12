// ============================================================
// types.ts — Layer-Stripping Framework aligned
// ============================================================

export type InsightStageName =
  | "input_validation"
  | "layer0_layer1"              // 전제 제거 + 컨센서스 + 불완전성
  | "event_classification"       // 이벤트 유형 + playbook hint
  | "layer2_reverse_paths"       // 반대 방향 경로
  | "layer3_adjacent_spillover"  // 인접 시장 전이
  | "portfolio_impact"           // 종목별 Direct/Indirect/Beneficiary/No Impact
  | "layer4_time_horizon"        // 시간축 전환 (단기/중기/장기)
  | "layer5_structural_premortem"// 구조 판정 + Premortem
  | "evidence_consolidation"     // 팩트 검증 + Confidence
  | "output_formatting";         // Product-first 최종 output

export type StageStatus = "idle" | "running" | "success" | "error" | "insufficient_evidence";

export type StageRecord = {
  stage: InsightStageName;
  status: StageStatus;
  input: unknown;
  searchResults?: unknown[];
  prompt?: string;
  output?: unknown;
  elapsedMs?: number;
  error?: string;
};

// --- Final Output (Product-first) ---
export type FinalOutput = {
  portfolioImpactTable: PortfolioImpactRow[];
  watchTriggers: WatchTriggerRow[];
  whySections: WhySection[];
  structuralRead: string;
  premortem: PremortermBasic;
  oneLineTake: string;
  markdownOutput: string;
};

export type PortfolioImpactRow = {
  company: string;
  held: "held" | "watchlist" | "neither";
  exposureType: "direct" | "indirect" | "beneficiary" | "no_material_impact";
  whatChangesToday: string;
  action: string;
  confidence: "confirmed" | "estimated" | "scenario";
};

export type WatchTriggerRow = {
  date: string;
  event: string;
  ifConfirmed: string;
  ifNot: string;
  thesisTrigger: string;
};

export type WhySection = {
  label: string;
  content: string;
  confidence: "confirmed" | "estimated" | "scenario";
};

export type PremortermBasic = {
  coreThesis: string;
  primaryFailure: string;
  earlyWarning: string;
  ifWrong: string;
};

export type FactEntry = {
  statement: string;
  source: string;
  asOf: string;
  status: "verified" | "needs_verification";
};

// --- Input Schema ---
export type CanonicalEvent = {
  event_id: string;
  title: string;
  event_type: "policy" | "supply" | "demand" | "commodity" | "financial" | "competitor";
  date: string;
  source: string;
  summary: string;
};

export type RepresentativeNews = {
  headline: string;
  keyFacts: string[];
};

export type PortfolioItem = {
  company: string;
  ticker?: string;
  held: "held" | "watchlist";
};

export type EntityItem = {
  type: string;
  name: string;
};

export type InsightDataset = {
  canonical_event: CanonicalEvent;
  representative_news: RepresentativeNews;
  portfolio: PortfolioItem[];
  web_search_facts: string[];
  structured_market_data: Record<string, number>;
  entities: EntityItem[];
  additional_context?: string[];
};

export type InsightRunResult = {
  runId: string;
  stages: StageRecord[];
  finalOutput: FinalOutput | null;
};

export type ModelConfig = {
  model: string;
  temperature: number;
  maxTokens: number;
};

export type ModelConfigOverride = Partial<ModelConfig>;

export type StageModelOverrides = Partial<Record<InsightStageName, ModelConfigOverride>>;

export type PipelineModelSettings = {
  defaults?: ModelConfigOverride;
  stages?: StageModelOverrides;
};

export type SearchEvent = {
  type: "search_start" | "search_complete";
  round: 1 | 2;
  queries?: string[];
  results?: unknown[];
  error?: string;
};

export type PipelineEvent =
  | { type: "stage_start"; stage: InsightStageName }
  | { type: "stage_complete"; record: StageRecord }
  | { type: "search_start"; round: 1 | 2; queries: string[] }
  | { type: "search_complete"; round: 1 | 2; results: unknown[]; error?: string }
  | { type: "pipeline_complete"; result: InsightRunResult };
