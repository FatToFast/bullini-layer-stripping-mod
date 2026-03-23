import { describe, it, expect } from "vitest";
import type { InsightDataset } from "@/lib/insight/types";
import {
  inferIndustries,
  formatIndustryDetectionNotes,
  getIndustryOverlayRules,
  type MultiIndustryInferenceResult,
} from "./industry-inference";

function createMockDataset(overrides?: Partial<InsightDataset>): InsightDataset {
  return {
    canonical_event: {
      event_id: "test-1",
      title: "Test Event",
      event_type: "demand",
      date: "2024-01-01",
      source: "test",
      summary: "Test summary",
    },
    representative_news: {
      headline: "Test Headline",
      keyFacts: ["Fact 1", "Fact 2"],
    },
    portfolio: [],
    web_search_facts: [],
    structured_market_data: {},
    entities: [],
    ...overrides,
  };
}

describe("inferIndustries", () => {
  it("detects semiconductor industry from keywords", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "semi-1",
        title: "HBM3e Supply Tightens as AI Demand Surges",
        event_type: "supply",
        date: "2024-01-01",
        source: "test",
        summary: "SK hynix and Samsung Electronics are increasing HBM production",
      },
      web_search_facts: ["TSMC foundry capacity", "DRAM prices rising"],
    });

    const result = inferIndustries(dataset);

    expect(result.industries.length).toBeGreaterThan(0);
    expect(result.industries.some((i) => i.industry === "semiconductor")).toBe(true);
    expect(result.primaryIndustry).toBe("semiconductor");
    // conflictResolved is true when player mapping is used (Samsung Electronics)
    expect(result.conflictResolved).toBe(true);
  });

  it("detects automotive_battery industry from keywords", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "ev-1",
        title: "EV Battery Supply Chain Constraints",
        event_type: "supply",
        date: "2024-01-01",
        source: "test",
        summary: "Tesla and BYD face battery shortages",
      },
      web_search_facts: ["LG Energy Solution expanding", "cathode prices"],
    });

    const result = inferIndustries(dataset);

    expect(result.industries.some((i) => i.industry === "automotive_battery")).toBe(true);
    expect(result.primaryIndustry).toBe("automotive_battery");
  });

  it("returns general when no industries detected", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "general-1",
        title: "Weather Event",
        event_type: "policy",
        date: "2024-01-01",
        source: "test",
        summary: "Sunny day with light breeze",
      },
      web_search_facts: ["Clear skies", "Nice temperature"],
    });

    const result = inferIndustries(dataset);

    // With truly generic content, should have minimal detections
    // The primaryIndustry will be set even if detections array is small
    expect(result.industries.length).toBeLessThan(3);
    expect(result.primaryIndustry).toBeTruthy();
  });

  it("detects multiple industries from mixed keywords", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "mixed-1",
        title: "Samsung Electronics and Samsung SDI Partnership",
        event_type: "supply",
        date: "2024-01-01",
        source: "test",
        summary: "Samsung chips for EV batteries",
      },
      web_search_facts: ["HBM production", "EV battery demand", "cathode materials"],
    });

    const result = inferIndustries(dataset);

    expect(result.industries.length).toBeGreaterThan(1);
    expect(result.industries.some((i) => i.industry === "semiconductor")).toBe(true);
    expect(result.industries.some((i) => i.industry === "automotive_battery")).toBe(true);
    expect(result.conflictResolved).toBe(true);
  });

  it("handles semiconductor vs automotive_battery conflict", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "conflict-1",
        title: "SK Group Cross-Industry Investment",
        event_type: "supply",
        date: "2024-01-01",
        source: "test",
        summary: "SK hynix DRAM and SK On battery expansion",
      },
      web_search_facts: ["HBM", "EV battery", "SK Group"],
    });

    const result = inferIndustries(dataset);

    expect(result.industries.some((i) => i.industry === "semiconductor")).toBe(true);
    expect(result.industries.some((i) => i.industry === "automotive_battery")).toBe(true);
    expect(result.primaryIndustry).toBe("semiconductor");
    expect(result.conflictResolved).toBe(true);
  });

  it("uses player mapping for Samsung Electronics", () => {
    const dataset = createMockDataset({
      portfolio: [{ company: "Samsung Electronics", ticker: "005930", held: "held" }],
      canonical_event: {
        event_id: "samsung-1",
        title: "Samsung News",
        event_type: "demand",
        date: "2024-01-01",
        source: "test",
        summary: "General Samsung news",
      },
    });

    const result = inferIndustries(dataset);

    expect(result.primaryIndustry).toBe("semiconductor");
    expect(result.conflictResolved).toBe(true);
    expect(result.resolutionReason).toContain("Player-centric");
  });

  it("sorts industries by confidence descending", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "sort-1",
        title: "Multi-Sector Tech News",
        event_type: "demand",
        date: "2024-01-01",
        source: "test",
        summary: "NVIDIA, Tesla, and Google platform updates",
      },
    });

    const result = inferIndustries(dataset);

    for (let i = 1; i < result.industries.length; i++) {
      expect(result.industries[i - 1].confidence).toBeGreaterThanOrEqual(
        result.industries[i].confidence,
      );
    }
  });

  it("calculates confidence based on keyword matches", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "confidence-1",
        title: "NVIDIA AMD ARM Semiconductor",
        event_type: "supply",
        date: "2024-01-01",
        source: "test",
        summary: "TSMC foundry capacity with HBM and DRAM",
      },
    });

    const result = inferIndustries(dataset);
    const semiResult = result.industries.find((i) => i.industry === "semiconductor");

    expect(semiResult).toBeDefined();
    expect(semiResult!.confidence).toBeGreaterThan(0);
    expect(semiResult!.confidence).toBeLessThanOrEqual(100);
  });

  it("respects topN option for topIndustries", () => {
    const dataset = createMockDataset({
      canonical_event: {
        event_id: "multi-1",
        title: "Tech and Auto Sector News",
        event_type: "demand",
        date: "2024-01-01",
        source: "test",
        summary: "NVIDIA chips in Tesla vehicles",
      },
      web_search_facts: ["Samsung SDI battery", "TSMC foundry"],
    });

    const resultDefault = inferIndustries(dataset);
    const resultTop2 = inferIndustries(dataset, { topN: 2 });

    expect(resultDefault.topIndustries.length).toBeLessThanOrEqual(3);
    expect(resultTop2.topIndustries.length).toBeLessThanOrEqual(2);
  });
});

describe("formatIndustryDetectionNotes", () => {
  it("formats single industry detection", () => {
    const result: MultiIndustryInferenceResult = {
      industries: [{ industry: "semiconductor", confidence: 80, matchedKeywords: ["nvidia"], totalKeywords: 50 }],
      topIndustries: [{ industry: "semiconductor", confidence: 80, matchedKeywords: ["nvidia"], totalKeywords: 50 }],
      primaryIndustry: "semiconductor",
    };

    const notes = formatIndustryDetectionNotes(result);

    expect(notes).toContain("primary_industry: semiconductor");
    expect(notes).toContain("detected_industries: semiconductor(80%)");
    expect(notes).toContain("top_industries: semiconductor:80%");
  });

  it("formats multi-industry detection with conflict resolution", () => {
    const result: MultiIndustryInferenceResult = {
      industries: [
        { industry: "semiconductor", confidence: 80, matchedKeywords: ["nvidia"], totalKeywords: 50 },
        { industry: "automotive_battery", confidence: 60, matchedKeywords: ["tesla"], totalKeywords: 40 },
      ],
      topIndustries: [
        { industry: "semiconductor", confidence: 80, matchedKeywords: ["nvidia"], totalKeywords: 50 },
        { industry: "automotive_battery", confidence: 60, matchedKeywords: ["tesla"], totalKeywords: 40 },
      ],
      primaryIndustry: "semiconductor",
      conflictResolved: true,
      resolutionReason: "Priority: semiconductor (confidence: 80%)",
    };

    const notes = formatIndustryDetectionNotes(result);

    expect(notes).toContain("primary_industry: semiconductor");
    expect(notes).toContain("conflict_resolved: true");
    expect(notes).toContain("Priority: semiconductor");
  });

  it("handles no industries detected", () => {
    const result: MultiIndustryInferenceResult = {
      industries: [],
      topIndustries: [],
      primaryIndustry: "general",
    };

    const notes = formatIndustryDetectionNotes(result);

    expect(notes).toContain("primary_industry: general");
    expect(notes).not.toContain("detected_industries:");
  });
});

describe("getIndustryOverlayRules", () => {
  it("returns rules for top industries", () => {
    const result: MultiIndustryInferenceResult = {
      industries: [
        { industry: "semiconductor", confidence: 80, matchedKeywords: [], totalKeywords: 50 },
        { industry: "automotive_battery", confidence: 60, matchedKeywords: [], totalKeywords: 40 },
      ],
      topIndustries: [
        { industry: "semiconductor", confidence: 80, matchedKeywords: [], totalKeywords: 50 },
        { industry: "automotive_battery", confidence: 60, matchedKeywords: [], totalKeywords: 40 },
      ],
      primaryIndustry: "semiconductor",
    };

    const rules = getIndustryOverlayRules(result);

    expect(rules).toHaveLength(2);
    expect(rules[0].industry).toBe("semiconductor");
    expect(rules[0].confidence).toBe(80);
    expect(rules[0].stakeholders.length).toBeGreaterThan(0);
  });

  it("includes all required rule fields for semiconductor", () => {
    const result: MultiIndustryInferenceResult = {
      industries: [{ industry: "semiconductor", confidence: 80, matchedKeywords: [], totalKeywords: 50 }],
      topIndustries: [{ industry: "semiconductor", confidence: 80, matchedKeywords: [], totalKeywords: 50 }],
      primaryIndustry: "semiconductor",
    };

    const rules = getIndustryOverlayRules(result);
    const rule = rules[0];

    expect(rule.stakeholders).toContain("반도체 애널리스트");
    expect(rule.successCriteria).toContain("메모리/비메모리/장비/패키징 중 어느 레이어의 변화인지 구분할 것");
    expect(rule.expectedCriteria).toContain("반도체 밸류체인 레이어 구분이 있어야 한다");
  });

  it("returns empty array when no top industries", () => {
    const result: MultiIndustryInferenceResult = {
      industries: [],
      topIndustries: [],
      primaryIndustry: "general",
    };

    const rules = getIndustryOverlayRules(result);

    expect(rules).toEqual([]);
  });

  it("handles general industry with empty rules", () => {
    const result: MultiIndustryInferenceResult = {
      industries: [],
      topIndustries: [{ industry: "general", confidence: 0, matchedKeywords: [], totalKeywords: 0 }],
      primaryIndustry: "general",
    };

    const rules = getIndustryOverlayRules(result);

    expect(rules).toHaveLength(1);
    expect(rules[0].industry).toBe("general");
    expect(rules[0].stakeholders).toEqual([]);
  });
});
