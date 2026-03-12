import type { InsightStageName } from "./types";

// Stage display labels for UI
export const STAGE_LABELS: Record<InsightStageName, string> = {
  input_validation: "0. 입력 검증",
  layer0_layer1: "1. 전제 제거 + 컨센서스",
  event_classification: "2. 이벤트 유형 분류",
  layer2_reverse_paths: "3. 반대 방향 경로",
  layer3_adjacent_spillover: "4. 인접 시장 전이",
  portfolio_impact: "5. 포트폴리오 영향 매핑",
  layer4_time_horizon: "6. 시간축 전환",
  layer5_structural_premortem: "7. 구조 판정 + Premortem",
  evidence_consolidation: "8. 팩트 검증",
  output_formatting: "9. 최종 출력 (Product-first)",
};

// Stage descriptions for tooltips
export const STAGE_DESCRIPTIONS: Record<InsightStageName, string> = {
  input_validation: "입력 JSON의 유효성을 검증합니다",
  layer0_layer1: "이미 알려진 사실을 치우고, 시장의 1차 해석과 그 한계를 지적합니다",
  event_classification: "이벤트 유형(정책/공급/수요/원자재/금융/경쟁)과 phase를 분류합니다",
  layer2_reverse_paths: "같은 이벤트의 반대 방향 수혜/상쇄 경로를 찾습니다",
  layer3_adjacent_spillover: "공유 자원을 통한 인접 시장으로의 2차 전이를 분석합니다",
  portfolio_impact: "포트폴리오 모든 종목을 Direct/Indirect/Beneficiary/No Impact로 분류합니다",
  layer4_time_horizon: "단기/중기/장기 해석을 분리하고 binding constraint 이동을 추적합니다",
  layer5_structural_premortem: "일회성/지속적/구조적 전환을 판정하고, 분석이 틀릴 시나리오를 점검합니다",
  evidence_consolidation: "전체 분석에서 사용된 팩트의 출처와 검증 상태를 정리합니다",
  output_formatting: "포트폴리오 영향을 최상단에, 해설을 근거로 후행하는 Product-first 출력을 생성합니다",
};

// Ordered stage list for rendering
export const STAGE_ORDER: InsightStageName[] = [
  "input_validation",
  "layer0_layer1",
  "event_classification",
  "layer2_reverse_paths",
  "layer3_adjacent_spillover",
  "portfolio_impact",
  "layer4_time_horizon",
  "layer5_structural_premortem",
  "evidence_consolidation",
  "output_formatting",
];
