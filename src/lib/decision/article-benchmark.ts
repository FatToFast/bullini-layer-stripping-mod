import { parseInsightDataset } from "@/lib/insight/schemas";
import type { InsightDataset } from "@/lib/insight/types";
import type { DecisionBenchmarkCase, DecisionExecutionRun } from "./types";

type CurrentArticleSource = {
  analysisPrompt?: string;
  newsUrl?: string;
  rawJson?: string;
  userNotes?: string;
};

type EventRule = {
  angle: string;
  taskTemplate: (title: string) => string;
  stakeholders: string[];
  successCriteria: string[];
  expectedCriteria: string[];
  extraContext: (dataset: InsightDataset) => string[];
};

type IndustryRule = {
  industry: string;
  stakeholders: string[];
  successCriteria: string[];
  expectedCriteria: string[];
  extraContext: (dataset: InsightDataset) => string[];
};

const INDUSTRY_HINT_MAP: Record<string, string[]> = {
  semiconductor: [
    "nvda", "nvidia", "amd", "intel", "tsmc", "삼성전자", "sk하이닉스", "sk hynix", "마이크론", "micron", "broadcom", "arm", "asml", "lam research", "amat", "applied materials", "adis", "qualcomm", "qcom", "avgo", "mu", "tsm", "intc", "000660", "005930",
  ],
  automotive_battery: [
    "tesla", "tsla", "byd", "현대차", "기아", "hyundai", "kia", "rivian", "nio", "li auto", "gm", "ford", "lg에너지솔루션", "lg energy solution", "삼성sdi", "samsung sdi", "sk온", "포스코퓨처엠", "에코프로비엠", "에코프로", "005380", "000270", "373220", "006400",
  ],
  energy_utilities: [
    "exxon", "chevron", "shell", "bp", "totalenergies", "엔브리지", "eqt", "next era", "nextera", "enphase", "first solar", "한전", "한국전력", "kepco", "s-oil", "gs", "xom", "cvx", "fslr", "enph", "015760",
  ],
  platform_software: [
    "google", "alphabet", "meta", "amazon", "apple", "microsoft", "netflix", "uber", "doordash", "coupang", "네이버", "카카오", "아마존", "알파벳", "메타", "마이크로소프트", "crm", "msft", "amzn", "googl", "meta", "aapl", "nflx", "cpng", "035420", "035720",
  ],
  financials: [
    "jpmorgan", "jp morgan", "bank of america", "wells fargo", "goldman sachs", "morgan stanley", "citigroup", "kb금융", "신한지주", "하나금융", "우리금융", "메리츠", "삼성화재", "삼성생명", "jpm", "bac", "wfc", "gs", "ms", "c", "105560", "055550", "086790",
  ],
  healthcare_biotech: [
    "eli lilly", "lilly", "novo nordisk", "pfizer", "moderna", "regeneron", "gilead", "삼성바이오로직스", "셀트리온", "유한양행", "알테오젠", "한미약품", "lly", "nvo", "pfe", "mrna", "regn", "gild", "207940", "068270", "000100", "196170",
  ],
};

function collectIndustryHints(dataset: InsightDataset) {
  const normalized = [
    ...dataset.portfolio.flatMap((item) => [item.company, item.ticker ?? ""]),
    ...dataset.entities.map((entity) => entity.name),
  ]
    .join(" ")
    .toLowerCase();

  const matched: string[] = [];
  for (const [industry, hints] of Object.entries(INDUSTRY_HINT_MAP)) {
    if (hints.some((hint) => normalized.includes(hint.toLowerCase()))) {
      matched.push(industry, ...hints.slice(0, 2));
    }
  }
  return matched;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function collectCorpus(dataset: InsightDataset) {
  return [
    dataset.canonical_event.title,
    dataset.canonical_event.summary,
    ...dataset.representative_news.keyFacts,
    ...dataset.web_search_facts,
    ...(dataset.additional_context ?? []),
    ...dataset.entities.map((entity) => entity.name),
    ...dataset.portfolio.flatMap((item) => [item.company, item.ticker ?? ""]),
    ...collectIndustryHints(dataset),
  ].join(" ").toLowerCase();
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferPolicyAngle(text: string) {
  if (hasAny(text, ["tariff", "관세", "301", "232", "덤핑", "상계관세"])) return "tariff_trade";
  if (hasAny(text, ["export control", "수출 통제", "제재", "entity list", "허가", "ban"])) return "export_control";
  if (hasAny(text, ["subsid", "보조금", "세액공제", "지원금"])) return "subsidy";
  if (hasAny(text, ["antitrust", "반독점", "독점", "규제 조사", "probe"])) return "antitrust";
  return "general_policy";
}

function inferSupplyAngle(text: string) {
  if (hasAny(text, ["shortage", "부족", "scarcity", "수급 차질"])) return "shortage";
  if (hasAny(text, ["capacity", "증설", "생산능력", "fab", "라인", "공장"])) return "capacity";
  if (hasAny(text, ["shutdown", "가동 중단", "파업", "화재", "earthquake", "물류", "port"])) return "disruption";
  return "general_supply";
}

function inferDemandAngle(text: string) {
  if (hasAny(text, ["order", "주문", "booking", "backlog"])) return "orders";
  if (hasAny(text, ["consumer", "소비", "sell-through", "traffic", "shipment"])) return "consumption";
  if (hasAny(text, ["recession", "둔화", "slowdown", "침체", "weak demand"])) return "slowdown";
  return "general_demand";
}

function inferCommodityAngle(text: string) {
  if (hasAny(text, ["oil", "원유", "gas", "lng", "전력", "electricity"])) return "energy";
  if (hasAny(text, ["copper", "리튬", "nickel", "니켈", "steel", "철강", "aluminum", "알루미늄"])) return "materials";
  if (hasAny(text, ["price", "가격", "spot", "재고", "inventory"])) return "pricing";
  return "general_commodity";
}

function inferFinancialAngle(text: string) {
  if (hasAny(text, ["earnings", "실적", "guidance", "어닝", "컨센서스"])) return "earnings";
  if (hasAny(text, ["funding", "증자", "차입", "debt", "liquidity", "유동성"])) return "financing";
  if (hasAny(text, ["buyback", "배당", "자사주", "capital return"])) return "capital_return";
  return "general_financial";
}

function inferCompetitorAngle(text: string) {
  if (hasAny(text, ["price cut", "가격 인하", "discount", "프로모션"])) return "pricing";
  if (hasAny(text, ["launch", "출시", "product", "신제품", "roadmap"])) return "product";
  if (hasAny(text, ["acquisition", "m&a", "merger", "인수", "합병"])) return "mna";
  return "general_competitor";
}

function inferIndustry(text: string) {
  if (hasAny(text, ["semiconductor", "반도체", "dram", "nand", "hbm", "foundry", "fabless", "tsmc", "sk hynix", "삼성전자", "micron", "패키징"])) {
    return "semiconductor";
  }
  if (hasAny(text, ["ev", "자동차", "vehicle", "battery", "배터리", "2차전지", "cathode", "anode", "테슬라", "byd", "현대차", "기아"])) {
    return "automotive_battery";
  }
  if (hasAny(text, ["oil", "gas", "lng", "renewable", "태양광", "풍력", "유틸리티", "전력", "grid", "원전", "원자력"])) {
    return "energy_utilities";
  }
  if (hasAny(text, ["platform", "ad", "광고", "e-commerce", "이커머스", "app", "subscription", "cloud", "saas", "search", "streaming", "social"])) {
    return "platform_software";
  }
  if (hasAny(text, ["bank", "은행", "insurer", "보험", "brokerage", "증권", "asset management", "카드", "대출"])) {
    return "financials";
  }
  if (hasAny(text, ["pharma", "바이오", "drug", "임상", "fda", "medtech", "의료기기"])) {
    return "healthcare_biotech";
  }
  return "general";
}

function buildEventRule(dataset: InsightDataset): EventRule {
  const text = collectCorpus(dataset);

  const baseRules: Record<InsightDataset["canonical_event"]["event_type"], EventRule> = {
    policy: {
      angle: inferPolicyAngle(text),
      taskTemplate: (title) => `정책 이벤트 \"${title}\"를 요약하지 말고, 실제로 무엇을 확인하고 어떤 순서로 판단해야 하는지 설계하라.`,
      stakeholders: ["정책분석", "리서치", "운용", "리스크관리", "법무/컴플라이언스"],
      successCriteria: [
        "정책 발표 사실을 반복하지 말고 실제 판단 질문으로 재정의할 것",
        "직접 영향과 2차 전이 경로를 구분할 것",
        "확인 전에는 확정하면 안 되는 decision gate를 명시할 것",
      ],
      expectedCriteria: [
        "정책 이벤트를 실제 투자/사업 판단 질문으로 재정의해야 한다",
        "직접 영향과 전이 경로 또는 확인 지표가 드러나야 한다",
        "법무/정책/운용 관점의 서로 다른 체크포인트가 반영되어야 한다",
      ],
      extraContext: () => {
        const policyAngle = inferPolicyAngle(text);
        if (policyAngle === "tariff_trade") {
          return ["무역장벽의 직접 대상과 우회 수혜 경로를 분리해 볼 것", "발효 시점과 실제 집행 가능성 사이의 간극을 확인할 것"];
        }
        if (policyAngle === "export_control") {
          return ["허가/예외/우회조달 가능성을 별도 질문으로 둘 것", "규제 대상 품목과 매출 민감도를 연결할 것"];
        }
        if (policyAngle === "subsidy") {
          return ["지원 대상 조건과 실제 수혜 가능 기업을 분리할 것", "정책 발표와 실제 수주/투자 집행 사이의 시차를 볼 것"];
        }
        return ["정책 문구와 실제 집행 가능성을 구분할 것"];
      },
    },
    supply: {
      angle: inferSupplyAngle(text),
      taskTemplate: (title) => `공급망 이벤트 \"${title}\"에 대해, 병목이 어디서 발생하고 누가 먼저 영향을 받는지 판단 구조를 설계하라.`,
      stakeholders: ["산업분석", "리서치", "운용", "리스크관리", "조달/공급망"],
      successCriteria: [
        "병목 지점과 전이 경로를 분리할 것",
        "단기 차질과 구조적 공급 재편을 구분할 것",
        "누가 먼저 피해/수혜를 받는지 우선순위를 제시할 것",
      ],
      expectedCriteria: [
        "공급 차질의 병목이 어디인지 드러나야 한다",
        "단기 이벤트와 구조 변화가 구분되어야 한다",
        "확인해야 할 운영 지표나 공급 지표가 포함되어야 한다",
      ],
      extraContext: () => {
        const supplyAngle = inferSupplyAngle(text);
        if (supplyAngle === "shortage") return ["재고 쿠션이 있는 플레이어와 없는 플레이어를 구분할 것"];
        if (supplyAngle === "capacity") return ["증설 발표와 실제 램프업 타이밍을 구분할 것"];
        if (supplyAngle === "disruption") return ["단발성 사고와 장기적인 공급망 재배치를 분리할 것"];
        return ["공급 병목이 어느 레이어에서 생기는지 구분할 것"];
      },
    },
    demand: {
      angle: inferDemandAngle(text),
      taskTemplate: (title) => `수요 이벤트 \"${title}\"가 실제 수요 전환인지 단기 노이즈인지 판단하기 위한 질문 구조를 설계하라.`,
      stakeholders: ["리서치", "운용", "영업/채널", "리스크관리"],
      successCriteria: [
        "단기 반응과 구조적 수요 변화를 구분할 것",
        "수요 강도 확인에 필요한 leading indicator를 제시할 것",
        "누가 수요 둔화/회복의 first derivative를 먼저 받는지 설명할 것",
      ],
      expectedCriteria: [
        "수요 이벤트를 확인 가능한 지표 질문으로 바꿔야 한다",
        "재고, 주문, 소비 같은 확인 지표가 포함되어야 한다",
        "수혜/피해 기업군의 구분이 드러나야 한다",
      ],
      extraContext: () => {
        const demandAngle = inferDemandAngle(text);
        if (demandAngle === "orders") return ["수주 증가와 매출 인식 타이밍을 분리할 것"];
        if (demandAngle === "consumption") return ["소비 지표와 채널 재고를 함께 볼 것"];
        if (demandAngle === "slowdown") return ["일시적 역기저인지 구조적 둔화인지 구분할 것"];
        return ["수요의 지속성 판단 지표를 둘 것"];
      },
    },
    commodity: {
      angle: inferCommodityAngle(text),
      taskTemplate: (title) => `원자재/가격 이벤트 \"${title}\"를 비용, 스프레드, 재고 관점으로 재구성해 무엇을 먼저 확인할지 설계하라.`,
      stakeholders: ["매크로", "산업분석", "운용", "리스크관리"],
      successCriteria: [
        "가격 방향 자체보다 마진/전가/재고의 영향을 질문화할 것",
        "spot move와 실적 반영 타이밍을 구분할 것",
        "누가 가격 수혜/피해를 받는지 범주화할 것",
      ],
      expectedCriteria: [
        "가격 변화가 어떤 경로로 실적이나 valuation에 연결되는지 드러나야 한다",
        "재고/스프레드/전가력 같은 핵심 지표가 포함되어야 한다",
        "수혜/피해 주체 구분이 있어야 한다",
      ],
      extraContext: () => {
        const commodityAngle = inferCommodityAngle(text);
        if (commodityAngle === "energy") return ["에너지 가격과 전력비/운임 등 2차 비용 항목을 함께 볼 것"];
        if (commodityAngle === "materials") return ["원재료 가격과 제품 ASP 전가력의 시차를 볼 것"];
        return ["spot 가격과 기업별 계약가격 반영 시차를 구분할 것"];
      },
    },
    financial: {
      angle: inferFinancialAngle(text),
      taskTemplate: (title) => `금융/실적 이벤트 \"${title}\"가 펀더멘털 변화인지 자본배치 변화인지 나눠서 판단 구조를 설계하라.`,
      stakeholders: ["운용", "리서치", "재무", "리스크관리"],
      successCriteria: [
        "headline 숫자보다 해석해야 할 질문을 재정의할 것",
        "실적/현금흐름/자본배치 중 무엇이 핵심인지 분리할 것",
        "다음 분기 확인 포인트와 즉시 반응 포인트를 구분할 것",
      ],
      expectedCriteria: [
        "금융 이벤트를 해석 질문으로 재정의해야 한다",
        "숫자 자체가 아니라 의미 있는 확인 지표가 들어가야 한다",
        "운용과 재무 관점이 함께 반영되어야 한다",
      ],
      extraContext: () => {
        const financialAngle = inferFinancialAngle(text);
        if (financialAngle === "earnings") return ["일회성 요인과 구조적 개선/악화를 분리할 것"];
        if (financialAngle === "financing") return ["자금조달 필요성과 조건 악화 여부를 별도 질문으로 둘 것"];
        if (financialAngle === "capital_return") return ["주주환원 발표가 성장 투자 여력과 충돌하는지 볼 것"];
        return ["회계 숫자와 실제 현금흐름의 차이를 볼 것"];
      },
    },
    competitor: {
      angle: inferCompetitorAngle(text),
      taskTemplate: (title) => `경쟁사 이벤트 \"${title}\"가 시장 구조를 바꾸는지 일회성 행동인지 판단하기 위한 benchmark scenario를 설계하라.`,
      stakeholders: ["리서치", "운용", "제품/전략", "영업"],
      successCriteria: [
        "경쟁사 행동의 의도를 추정할 질문을 둘 것",
        "우리 포트폴리오/커버리지에 중요한 1차·2차 영향을 분리할 것",
        "시장 구조 변화 여부를 판단할 확인 지표를 제시할 것",
      ],
      expectedCriteria: [
        "경쟁사 이벤트를 구조 변화 질문으로 재정의해야 한다",
        "가격/제품/점유율/채널 같은 확인 포인트가 포함되어야 한다",
        "수혜/피해 또는 방어 전략 옵션이 드러나야 한다",
      ],
      extraContext: () => {
        const competitorAngle = inferCompetitorAngle(text);
        if (competitorAngle === "pricing") return ["가격 인하의 지속 가능성과 경쟁사의 체력 가정을 따로 볼 것"];
        if (competitorAngle === "product") return ["신제품 발표와 실제 채널 침투 속도를 분리할 것"];
        if (competitorAngle === "mna") return ["M&A 발표와 시너지 실현 가능성을 별도 질문으로 둘 것"];
        return ["경쟁사 행동이 업계 전반의 규칙을 바꾸는지 확인할 것"];
      },
    },
  };

  return baseRules[dataset.canonical_event.event_type];
}

function buildIndustryRule(dataset: InsightDataset): IndustryRule | null {
  const text = collectCorpus(dataset);
  const industry = inferIndustry(text);

  const rules: Record<string, IndustryRule> = {
    semiconductor: {
      industry,
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
      extraContext: () => [
        "HBM/DDR/NAND/파운드리/패키징 중 핵심 병목 레이어를 먼저 특정할 것",
        "고객 capex와 서버/AI 수요의 연동 여부를 별도 질문으로 둘 것",
      ],
    },
    automotive_battery: {
      industry,
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
      extraContext: () => [
        "EV 수요와 배터리 체인 실적 사이의 시차를 볼 것",
        "보조금 정책 변화와 가격 인하 압력을 별개 질문으로 둘 것",
      ],
    },
    energy_utilities: {
      industry,
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
      extraContext: () => [
        "연료가격 변화가 전력요금·정산단가에 반영되는 시차를 볼 것",
        "에너지 가격 방향과 설비 가동률 영향을 분리할 것",
      ],
    },
    platform_software: {
      industry,
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
      extraContext: () => [
        "유저 행동 변화와 매출 인식 사이의 시차를 구분할 것",
        "제품 업데이트가 engagement 개선인지 monetization 개선인지 분리할 것",
      ],
    },
    financials: {
      industry,
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
      extraContext: () => [
        "headline 실적보다 대손비용과 자본여력 변화를 먼저 볼 것",
        "규제 변화가 비즈니스 모델에 미치는 영향을 별도 질문으로 둘 것",
      ],
    },
    healthcare_biotech: {
      industry,
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
      extraContext: () => [
        "헤드라인 결과와 통계적/상업적 유의미성을 분리할 것",
        "다음 임상 마일스톤 전까지 확인 가능한 데이터가 무엇인지 적을 것",
      ],
    },
    general: {
      industry,
      stakeholders: [],
      successCriteria: [],
      expectedCriteria: [],
      extraContext: () => [],
    },
  };

  const rule = rules[industry];
  return rule.industry === "general" ? null : rule;
}

function buildTaskFromDataset(dataset: InsightDataset, prompt: string) {
  const rule = buildEventRule(dataset);
  if (prompt) return prompt;
  return rule.taskTemplate(dataset.canonical_event.title);
}

export function buildDecisionBenchmarkFromCurrentArticle(source: CurrentArticleSource): DecisionBenchmarkCase | null {
  const prompt = source.analysisPrompt?.trim() ?? "";
  const raw = source.rawJson?.trim() ?? "";
  const notes = source.userNotes?.trim() ?? "";
  const url = source.newsUrl?.trim() ?? "";

  let title = prompt || "현재 기사 의사결정 설계";
  let background = url ? `기사 URL: ${url}` : undefined;
  let context: string[] = [];
  let stakeholders: string[] = ["리서치", "운용", "리스크관리"];
  let successCriteria = [
    "단순 요약이 아니라 실제 분석 질문으로 재정의할 것",
    "이해관계자별 관점과 확인 지표를 드러낼 것",
    "downstream insight pipeline으로 넘길 handoff를 만들 것",
  ];
  let expectedCriteria = [
    "단순 요약 대신 어떤 질문으로 분석할지 재정의해야 한다",
    "이해관계자별 관점 또는 확인 지표가 드러나야 한다",
    "최종 output에 insight handoff가 포함되어야 한다",
  ];
  let task = prompt;
  let notesParts: string[] = [];

  if (raw) {
    try {
      const dataset = parseInsightDataset(JSON.parse(raw) as unknown);
      const eventRule = buildEventRule(dataset);
      const industryRule = buildIndustryRule(dataset);
      title = dataset.canonical_event.title || title;
      task = buildTaskFromDataset(dataset, prompt);
      background = unique([
        dataset.canonical_event.summary,
        url ? `기사 URL: ${url}` : "",
        `이벤트 유형: ${dataset.canonical_event.event_type}`,
        `세부 각도: ${eventRule.angle}`,
        industryRule ? `산업 분류: ${industryRule.industry}` : "",
        `이벤트 날짜: ${dataset.canonical_event.date}`,
      ].filter(Boolean)).join(" | ");
      context = unique([
        ...dataset.representative_news.keyFacts.slice(0, 4),
        ...dataset.web_search_facts.slice(0, 2),
        ...(dataset.additional_context?.slice(0, 3) ?? []),
        ...eventRule.extraContext(dataset),
        ...(industryRule?.extraContext(dataset) ?? []),
        ...dataset.entities.slice(0, 5).map((entity) => `${entity.type}: ${entity.name}`),
        ...dataset.portfolio.slice(0, 4).map((item) => `포트폴리오 ${item.held}: ${item.company}${item.ticker ? ` (${item.ticker})` : ""}`),
      ]);
      stakeholders = unique([
        ...eventRule.stakeholders,
        ...(industryRule?.stakeholders ?? []),
        dataset.portfolio.length > 0 ? "운용" : "",
      ].filter(Boolean));
      successCriteria = unique([
        ...eventRule.successCriteria,
        ...(industryRule?.successCriteria ?? []),
        "downstream insight pipeline으로 넘길 handoff를 만들 것",
        dataset.portfolio.length > 0 ? "포트폴리오 영향 관점의 질문과 검증 포인트를 포함할 것" : "",
      ].filter(Boolean));
      expectedCriteria = unique([
        ...eventRule.expectedCriteria,
        ...(industryRule?.expectedCriteria ?? []),
        "최종 output에 insight handoff가 포함되어야 한다",
        dataset.portfolio.length > 0 ? "포트폴리오 또는 수혜/피해 범주가 반영되어야 한다" : "",
      ].filter(Boolean));
      notesParts = unique([
        "source: rawJson",
        `event_type: ${dataset.canonical_event.event_type}`,
        `event_angle: ${eventRule.angle}`,
        industryRule ? `industry: ${industryRule.industry}` : "",
        url ? `article_url: ${url}` : "",
      ].filter(Boolean));
    } catch {
      // fallback to prompt/notes based draft
    }
  }

  if (context.length === 0 && notes) {
    context = notes.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 6);
  }

  if (!task.trim()) {
    task = `다음 기사 이벤트를 바탕으로 무엇을 먼저 판단해야 하는지 설계하라: ${title}`;
  }
  if (!task.trim()) return null;

  const base = `${title}-${background ?? task}`;
  const id = `article-${slugify(base) || "current"}`;

  return {
    id,
    title: `${title} — current article`,
    input: {
      task,
      background,
      context,
      stakeholders,
      successCriteria,
    },
    expectedCriteria,
    notes: unique([
      ...notesParts,
      notes ? "derived_from: userNotes" : "",
      !raw && url ? `article_url: ${url}` : "",
    ].filter(Boolean)).join(" | "),
  };
}

function buildExecutionRunId(value: string) {
  return `decision-run-${slugify(value) || "current"}`;
}

export function buildDecisionBenchmarkFromExecutionRun(record: DecisionExecutionRun): DecisionBenchmarkCase {
  const title = record.run.finalOutput?.recommendedQuestion || record.label || record.input.task;
  const recommendedOption = record.run.finalOutput?.options.find(
    (option) => option.id === record.run.finalOutput?.recommendedOptionId,
  );
  const stakeholderContext = record.run.finalOutput?.stakeholderBriefs.slice(0, 4).map(
    (item) => `${item.stakeholder}: ${item.coreConcern}`,
  ) ?? [];
  const rehearsalContext = record.run.finalOutput?.rehearsalFindings.slice(0, 3).map(
    (item) => `${item.persona}: ${item.strongestObjection}`,
  ) ?? [];
  const successCriteria = unique([
    ...(record.input.successCriteria ?? []),
    "주어진 task를 그대로 반복하지 말고 recommended question으로 재정의할 것",
    "선택지 또는 recommended option의 이유를 드러낼 것",
    "최종 output에 insight handoff를 포함할 것",
  ]);
  const expectedCriteria = unique([
    "recommended question이 원래 task와 구분되어야 한다",
    recommendedOption ? `추천 옵션(${recommendedOption.label})의 이유가 설명되어야 한다` : "선택 가능한 옵션 구조가 드러나야 한다",
    ...(record.run.finalOutput?.stakeholderBriefs.length ? ["stakeholder 관점 충돌 또는 정렬이 반영되어야 한다"] : []),
    ...(record.run.finalOutput?.insightHandoff ? ["최종 output에 insight handoff가 포함되어야 한다"] : []),
  ]);

  return {
    id: buildExecutionRunId(`${record.run.runId}-${title}`),
    title: `${title} — decision run`,
    input: {
      ...record.input,
      context: unique([
        ...(record.input.context ?? []),
        ...stakeholderContext,
        ...rehearsalContext,
        ...(record.run.finalOutput?.insightHandoff.additionalContext.slice(0, 4) ?? []),
      ]),
      successCriteria,
    },
    expectedCriteria,
    notes: unique([
      `source: decision_run`,
      `run_id: ${record.run.runId}`,
      record.run.finalOutput?.recommendedOptionId ? `recommended_option: ${record.run.finalOutput.recommendedOptionId}` : "",
      record.run.finalOutput?.insightHandoff ? "contains: insight_handoff" : "",
    ].filter(Boolean)).join(" | "),
  };
}
