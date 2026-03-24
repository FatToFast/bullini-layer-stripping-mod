import type { InsightDataset } from "@/lib/insight/types";

// ============================================================
// industry-inference.ts — Multi-industry detection & confidence scoring
// ============================================================

export type Industry =
  | "semiconductor"
  | "automotive_battery"
  | "energy_utilities"
  | "platform_software"
  | "financials"
  | "healthcare_biotech"
  | "general";

export type IndustryDetectionResult = {
  industry: Industry;
  confidence: number; // 0-100
  matchedKeywords: string[];
  totalKeywords: number;
};

export type MultiIndustryInferenceResult = {
  industries: IndustryDetectionResult[];
  topIndustries: IndustryDetectionResult[];
  primaryIndustry: Industry;
  conflictResolved?: boolean;
  resolutionReason?: string;
};

type SearchIndex = {
  normalizedText: string;
  tokenSet: Set<string>;
};

type KeywordIndex = {
  singleTokenKeywords: string[];
  phraseKeywords: string[];
  totalKeywords: number;
};

// Industry keyword definitions
const INDUSTRY_KEYWORDS: Record<Industry, string[]> = {
  semiconductor: [
    "nvda", "nvidia", "amd", "intel", "tsmc", "삼성전자", "sk하이닉스", "sk hynix",
    "마이크론", "micron", "broadcom", "arm", "asml", "lam research", "amat",
    "applied materials", "adis", "qualcomm", "qcom", "avgo", "mu", "tsm", "intc",
    "000660", "005930", "반도체", "dram", "nand", "hbm", "foundry", "fabless",
    "패키징", "wafer", "시스템반도체", "파운드리",
  ],
  automotive_battery: [
    "tesla", "tsla", "byd", "현대차", "기아", "hyundai", "kia", "rivian", "nio",
    "li auto", "gm", "ford", "lg에너지솔루션", "lg energy solution", "삼성sdi",
    "samsung sdi", "sk온", "포스코퓨처엠", "에코프로비엠", "에코프로",
    "005380", "000270", "373220", "006400", "ev", "자동차", "vehicle", "battery",
    "배터리", "2차전지", "cathode", "anode", "음극", "양극", "separator", "전해액",
  ],
  energy_utilities: [
    "exxon", "chevron", "shell", "bp", "totalenergies", "엔브리지", "eqt",
    "next era", "nextera", "enphase", "first solar", "한전", "한국전력", "kepco",
    "s-oil", "gs", "xom", "cvx", "fslr", "enph", "015760", "oil", "gas", "lng",
    "renewable", "태양광", "풍력", "유틸리티", "전력", "grid", "원전", "원자력",
    "발전", "송전", "배전",
  ],
  platform_software: [
    "google", "alphabet", "meta", "amazon", "apple", "microsoft", "netflix", "uber",
    "doordash", "coupang", "네이버", "카카오", "아마존", "알파벳", "메타", "마이크로소프트",
    "crm", "msft", "amzn", "googl", "meta", "aapl", "nflx", "cpng", "035420",
    "035720", "platform", "ad", "광고", "e-commerce", "이커머스", "app", "subscription",
    "cloud", "saas", "search", "streaming", "social", "플랫폼",
  ],
  financials: [
    "jpmorgan", "jp morgan", "bank of america", "wells fargo", "goldman sachs",
    "morgan stanley", "citigroup", "kb금융", "신한지주", "하나금융", "우리금융",
    "메리츠", "삼성화재", "삼성생명", "jpm", "bac", "wfc", "gs", "ms", "c",
    "105560", "055550", "086790", "bank", "은행", "insurer", "보험", "brokerage",
    "증권", "asset management", "카드", "대출", "금융",
  ],
  healthcare_biotech: [
    "eli lilly", "lilly", "novo nordisk", "pfizer", "moderna", "regeneron",
    "gilead", "삼성바이오로직스", "셀트리온", "유한양행", "알테오젠", "한미약품",
    "lly", "nvo", "pfe", "mrna", "regn", "gild", "207940", "068270", "000100",
    "196170", "pharma", "바이오", "drug", "임상", "fda", "medtech", "의료기기",
    "임상시험", "허가",
  ],
  general: [],
};

// Player-specific mapping for conflict resolution
const PLAYER_INDUSTRY_MAP: Record<string, Industry> = {
  "삼성전자": "semiconductor",
  "samsung electronics": "semiconductor",
  "005930": "semiconductor",
  "삼성sdi": "automotive_battery",
  "samsung sdi": "automotive_battery",
  "006400": "automotive_battery",
  "sk하이닉스": "semiconductor",
  "sk hynix": "semiconductor",
  "000660": "semiconductor",
  "sk온": "automotive_battery",
  "lg에너지솔루션": "automotive_battery",
  "lg energy solution": "automotive_battery",
  "삼성바이오로직스": "healthcare_biotech",
};

// Priority rules for conflict resolution
const CONFLICT_RESOLUTION_PRIORITY: Industry[] = [
  "semiconductor",
  "automotive_battery",
  "energy_utilities",
  "platform_software",
  "financials",
  "healthcare_biotech",
];

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

function extractCorpus(dataset: InsightDataset): string {
  const parts = [
    dataset.canonical_event.title,
    dataset.canonical_event.summary,
    ...dataset.representative_news.keyFacts,
    ...dataset.web_search_facts,
    ...(dataset.additional_context ?? []),
    ...dataset.entities.map((entity) => entity.name),
    ...dataset.portfolio.flatMap((item) => [item.company, item.ticker ?? ""]),
  ];
  return normalizeText(parts.join(" "));
}

function buildSearchIndex(text: string): SearchIndex {
  const normalizedText = normalizeText(text);
  const tokenSet = new Set(normalizedText.match(/[a-z0-9가-힣-]+/g) ?? []);
  return { normalizedText, tokenSet };
}

function buildKeywordIndex(keywords: string[]): KeywordIndex {
  const normalizedKeywords = keywords.map(normalizeText);
  return {
    singleTokenKeywords: normalizedKeywords.filter((keyword) => !keyword.includes(" ")),
    phraseKeywords: normalizedKeywords.filter((keyword) => keyword.includes(" ")),
    totalKeywords: keywords.length,
  };
}

const INDUSTRY_SEARCH_INDEX = Object.fromEntries(
  (Object.keys(INDUSTRY_KEYWORDS) as Industry[]).map((industry) => [
    industry,
    buildKeywordIndex(INDUSTRY_KEYWORDS[industry]),
  ]),
) as Record<Industry, KeywordIndex>;

const PLAYER_PATTERN_ENTRIES = Object.entries(PLAYER_INDUSTRY_MAP).map(
  ([pattern, industry]) => ({
    pattern: normalizeText(pattern),
    industry,
    isPhrase: pattern.includes(" "),
  }),
);

function collectMatchedKeywords(
  searchIndex: SearchIndex,
  keywordIndex: KeywordIndex,
): string[] {
  const matchedKeywords = keywordIndex.singleTokenKeywords.filter((keyword) =>
    searchIndex.tokenSet.has(keyword),
  );

  for (const phraseKeyword of keywordIndex.phraseKeywords) {
    if (searchIndex.normalizedText.includes(phraseKeyword)) {
      matchedKeywords.push(phraseKeyword);
    }
  }

  return matchedKeywords;
}

function detectIndustryInText(
  searchIndex: SearchIndex,
  industry: Industry,
): IndustryDetectionResult | null {
  if (industry === "general") return null;

  const keywordIndex = INDUSTRY_SEARCH_INDEX[industry];
  const matchedKeywords = collectMatchedKeywords(searchIndex, keywordIndex);

  if (matchedKeywords.length === 0) return null;

  const confidence = Math.min(
    100,
    Math.round((matchedKeywords.length / keywordIndex.totalKeywords) * 100),
  );

  return {
    industry,
    confidence,
    matchedKeywords,
    totalKeywords: keywordIndex.totalKeywords,
  };
}

function detectAllIndustries(
  dataset: InsightDataset,
): IndustryDetectionResult[] {
  const searchIndex = buildSearchIndex(extractCorpus(dataset));
  const detections: IndustryDetectionResult[] = [];

  for (const industry of Object.keys(INDUSTRY_KEYWORDS) as Industry[]) {
    if (industry === "general") continue;
    const result = detectIndustryInText(searchIndex, industry);
    if (result) detections.push(result);
  }

  return detections.sort((a, b) => b.confidence - a.confidence);
}

function identifyPlayerCentricIndustry(
  dataset: InsightDataset,
): Industry | null {
  const allPlayers = [
    dataset.canonical_event.title.toLowerCase(),
    dataset.canonical_event.summary.toLowerCase(),
    ...dataset.representative_news.keyFacts.map((fact) => fact.toLowerCase()),
    ...dataset.web_search_facts.map((fact) => fact.toLowerCase()),
    ...dataset.portfolio.map((item) => [
      item.company.toLowerCase(),
      item.ticker?.toLowerCase() ?? "",
    ]),
    ...dataset.entities.map((entity) => entity.name.toLowerCase()),
  ].flat();
  const playerSearchIndex = buildSearchIndex(allPlayers.join(" "));

  for (const { pattern, industry, isPhrase } of PLAYER_PATTERN_ENTRIES) {
    if (isPhrase && playerSearchIndex.normalizedText.includes(pattern)) {
      return industry;
    }
    if (playerSearchIndex.tokenSet.has(pattern)) {
      return industry;
    }
    if (allPlayers.some((player) => player.includes(pattern))) {
      return industry;
    }
  }

  return null;
}

function resolveIndustryConflict(
  detections: IndustryDetectionResult[],
  playerCentricIndustry: Industry | null,
): { primary: Industry; resolved: boolean; reason: string } {
  if (detections.length === 0) {
    return { primary: "general", resolved: false, reason: "No industries detected" };
  }

  const detectionByIndustry = new Map(
    detections.map((detection) => [detection.industry, detection] as const),
  );

  // Player-centric resolution
  if (playerCentricIndustry) {
    const playerCentricDetection = detectionByIndustry.get(playerCentricIndustry);
    if (playerCentricDetection) {
      return {
        primary: playerCentricIndustry,
        resolved: true,
        reason: `Player-centric resolution (${playerCentricIndustry})`,
      };
    }
  }

  if (detections.length === 1) {
    return {
      primary: detections[0].industry,
      resolved: false,
      reason: "Single industry detected",
    };
  }

  // Semiconductor vs automotive_battery conflict
  const semiconductor = detectionByIndustry.get("semiconductor");
  const autoBattery = detectionByIndustry.get("automotive_battery");

  if (semiconductor && autoBattery && semiconductor.confidence >= autoBattery.confidence * 0.7) {
    return {
      primary: "semiconductor",
      resolved: true,
      reason: `Conflict: semiconductor (${semiconductor.confidence}%) vs automotive_battery (${autoBattery.confidence}%)`,
    };
  }

  // Priority rules
  for (const priorityIndustry of CONFLICT_RESOLUTION_PRIORITY) {
    const detection = detectionByIndustry.get(priorityIndustry);
    if (detection && detection.confidence >= 30) {
      return {
        primary: priorityIndustry,
        resolved: true,
        reason: `Priority: ${priorityIndustry} (confidence: ${detection.confidence}%)`,
      };
    }
  }

  return {
    primary: detections[0].industry,
    resolved: true,
    reason: `Highest confidence: ${detections[0].industry} (${detections[0].confidence}%)`,
  };
}

export function inferIndustries(
  dataset: InsightDataset,
  options: { topN?: number } = {},
): MultiIndustryInferenceResult {
  const { topN = 3 } = options;
  const detections = detectAllIndustries(dataset);
  const playerCentricIndustry = identifyPlayerCentricIndustry(dataset);
  const resolution = resolveIndustryConflict(detections, playerCentricIndustry);

  return {
    industries: detections,
    topIndustries: detections.slice(0, topN),
    primaryIndustry: resolution.primary,
    conflictResolved: resolution.resolved,
    resolutionReason: resolution.reason,
  };
}

export function formatIndustryDetectionNotes(
  result: MultiIndustryInferenceResult,
): string {
  const parts: string[] = [`primary_industry: ${result.primaryIndustry}`];

  if (result.industries.length > 0) {
    const industryList = result.industries
      .map((d) => `${d.industry}(${d.confidence}%)`)
      .join(", ");
    parts.push(`detected_industries: ${industryList}`);
  }

  if (result.topIndustries.length > 0) {
    const topList = result.topIndustries
      .map((d) => `${d.industry}:${d.confidence}%`)
      .join(", ");
    parts.push(`top_industries: ${topList}`);
  }

  if (result.conflictResolved && result.resolutionReason) {
    parts.push(`conflict_resolved: true (${result.resolutionReason})`);
  }

  return parts.join(" | ");
}

export type IndustryOverlayRule = {
  industry: Industry;
  confidence: number;
  stakeholders: string[];
  successCriteria: string[];
  expectedCriteria: string[];
  extraContext: string[];
};

const INDUSTRY_RULES: Record<
  Industry,
  {
    stakeholders: string[];
    successCriteria: string[];
    expectedCriteria: string[];
    extraContext: string[];
  }
> = {
  semiconductor: {
    stakeholders: ["반도체 애널리스트", "공급망/서버 밸류체인 분석", "운용"],
    successCriteria: [
      "메모리/비메모리/장비/패키징 중 어느 레이어의 변화인지 구분할 것",
      "단가, 물량, 믹스 중 무엇이 핵심인지 분리할 것",
      "고객사 capex·재고·리드타임 확인 포인트를 포함할 것",
    ],
    expectedCriteria: [
      "반도체 밸류체인 레이어 구분이 있어야 한다",
      "ASP/가동률/재고/리드타임 같은 확인 지표가 포함되어야 한다",
    ],
    extraContext: [
      "HBM/DDR/NAND/파운드리/패키징 중 핵심 병목 레이어를 먼저 특정할 것",
      "고객 capex와 서버/AI 수요의 연동 여부를 별도 질문으로 둘 것",
    ],
  },
  automotive_battery: {
    stakeholders: ["자동차/배터리 애널리스트", "원재료 분석", "운용"],
    successCriteria: [
      "완성차와 배터리 셀/소재 레이어를 구분할 것",
      "보조금·가격경쟁·재고조정 중 무엇이 핵심인지 분리할 것",
      "판매량, 인센티브, 소재가격 확인 포인트를 포함할 것",
    ],
    expectedCriteria: [
      "완성차/배터리/소재 레이어 구분이 드러나야 한다",
      "판매량/인센티브/원재료 가격 지표가 포함되어야 한다",
    ],
    extraContext: [
      "EV 수요와 배터리 체인 실적 사이의 시차를 볼 것",
      "보조금 정책 변화와 가격 인하 압력을 별개 질문으로 둘 것",
    ],
  },
  energy_utilities: {
    stakeholders: ["에너지 애널리스트", "매크로", "운용"],
    successCriteria: [
      "연료가격, 발전단가, 규제요금 중 어느 축이 핵심인지 구분할 것",
      "spot 가격과 계약가격 반영 시차를 구분할 것",
      "업스트림/미드스트림/유틸리티/재생에너지 중 수혜 주체를 구분할 것",
    ],
    expectedCriteria: [
      "에너지 체인 내 어느 레이어가 영향받는지 드러나야 한다",
      "가격/스프레드/가동률/규제요금 지표가 포함되어야 한다",
    ],
    extraContext: [
      "연료가격 변화가 전력요금·정산단가에 반영되는 시차를 볼 것",
      "에너지 가격 방향과 설비 가동률 영향을 분리할 것",
    ],
  },
  platform_software: {
    stakeholders: ["인터넷/소프트웨어 애널리스트", "제품/성장", "운용"],
    successCriteria: [
      "트래픽/광고단가/전환율/ARPU 중 핵심 지표를 특정할 것",
      "제품 변화와 수익화 변화의 구분을 명확히 할 것",
      "유저 성장과 마진 개선 중 무엇이 본질인지 가를 것",
    ],
    expectedCriteria: [
      "플랫폼 KPI 중심의 확인 질문이 있어야 한다",
      "트래픽/광고/구독/클라우드 지표 중 적절한 지표가 포함되어야 한다",
    ],
    extraContext: [
      "유저 행동 변화와 매출 인식 사이의 시차를 구분할 것",
      "제품 업데이트가 engagement 개선인지 monetization 개선인지 분리할 것",
    ],
  },
  financials: {
    stakeholders: ["금융 애널리스트", "재무", "운용"],
    successCriteria: [
      "금리/대손/자본비율/수수료 중 핵심 민감도를 특정할 것",
      "회계 숫자와 실제 건전성 변화의 차이를 구분할 것",
      "규제비율 또는 조달비용 확인 포인트를 포함할 것",
    ],
    expectedCriteria: [
      "NIM/대손/자본비율/조달비용 등 금융업 핵심 지표가 포함되어야 한다",
      "건전성과 이익 해석이 분리되어야 한다",
    ],
    extraContext: [
      "headline 실적보다 대손비용과 자본여력 변화를 먼저 볼 것",
      "규제 변화가 비즈니스 모델에 미치는 영향을 별도 질문으로 둘 것",
    ],
  },
  healthcare_biotech: {
    stakeholders: ["헬스케어/바이오 애널리스트", "리스크관리", "운용"],
    successCriteria: [
      "임상/허가/상업화 단계 중 어디의 이벤트인지 구분할 것",
      "확률 변화와 가치 반영을 분리할 것",
      "다음 마일스톤과 실패 시 downside를 명시할 것",
    ],
    expectedCriteria: [
      "임상 단계 또는 허가 단계에 맞는 확인 질문이 있어야 한다",
      "마일스톤, 확률, 상업화 지표가 포함되어야 한다",
    ],
    extraContext: [
      "헤드라인 결과와 통계적/상업적 유의미성을 분리할 것",
      "다음 임상 마일스톤 전까지 확인 가능한 데이터가 무엇인지 적을 것",
    ],
  },
  general: {
    stakeholders: [],
    successCriteria: [],
    expectedCriteria: [],
    extraContext: [],
  },
};

export function getIndustryOverlayRules(
  result: MultiIndustryInferenceResult,
): IndustryOverlayRule[] {
  const overlays: IndustryOverlayRule[] = [];

  for (const detection of result.topIndustries) {
    const rules = INDUSTRY_RULES[detection.industry];
    overlays.push({
      industry: detection.industry,
      confidence: detection.confidence,
      ...rules,
    });
  }

  return overlays;
}
