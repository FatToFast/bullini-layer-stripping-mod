import type { DecisionBenchmarkCase } from "./types";

export const DEFAULT_DECISION_BENCHMARKS: DecisionBenchmarkCase[] = [
  {
    id: "china-market-review",
    title: "중국 시장 검토 지시를 진짜 문제로 재정의하기",
    input: {
      task: "경영진이 '중국 시장을 검토하라'고 지시했다. 전략기획 관점에서 무엇을 먼저 정의해야 하는지 정리하라.",
      background: "기존 핵심 시장의 성장률이 둔화되고 있으며, 중국 진출은 내부적으로 오래 거론되던 카드다.",
      context: [
        "R&D는 현지 기술 규격 대응을 걱정한다.",
        "영업은 유통 파트너 확보가 핵심이라고 본다.",
        "재무는 투자 회수 기간과 철수 비용을 우려한다.",
        "법무는 인허가와 데이터 규제를 우려한다.",
      ],
      stakeholders: ["CEO", "전략기획", "R&D", "영업", "재무", "법무"],
      successCriteria: [
        "주어진 과제와 실제 의사결정을 분리할 것",
        "선택 가능한 진출 경로를 명시할 것",
        "사람이 판단해야 할 gate를 명시할 것",
      ],
    },
    expectedCriteria: [
      "stated task를 그대로 수용하지 않고 actual decision으로 재정의해야 한다",
      "R&D/영업/재무/법무의 관점 충돌을 옵션 구조로 수렴해야 한다",
      "추천 경로와 그 이유가 명확해야 한다",
      "실행을 시작하기 전에 확인해야 할 decision gate가 있어야 한다",
    ],
  },
  {
    id: "key-account-retention",
    title: "최대 고객 이탈 위기 대응",
    input: {
      task: "최대 고객이 다음 분기 계약을 재검토하겠다고 통보했다. 2주 안에 대응안을 만들어야 한다.",
      background: "회사 매출의 40%가 이 고객에서 나오며, 맞춤 개발 비중이 높아 다른 고객 요청이 많이 밀려 있다.",
      context: [
        "영업은 가격 양보안을 선호한다.",
        "제품팀은 커스텀 기능 추가를 요구받고 있다.",
        "재무는 적자 계약의 장기화를 우려한다.",
      ],
      stakeholders: ["CEO", "전략기획", "영업", "제품", "재무"],
      successCriteria: [
        "정말 붙잡아야 하는 고객인지부터 재정의할 것",
        "옵션별 실패 경로를 비교할 것",
      ],
    },
    expectedCriteria: [
      "문제를 단순한 고객 유지가 아니라 포트폴리오 선택 문제로 재해석해야 한다",
      "가격 양보/선별 유지/이탈 수용 같은 옵션이 구분되어야 한다",
      "CFO나 CEO 관점의 강한 objection이 rehearsal에 반영되어야 한다",
    ],
  },
  {
    id: "tariff-response",
    title: "관세 이벤트 대응 분석을 위한 의사결정 설계",
    input: {
      task: "새로운 관세 조치가 발표되었다. 우리 포트폴리오 대응 분석을 설계하라.",
      background: "단기 뉴스 요약은 이미 충분하지만, 실제로 무엇을 확인하고 어떤 분석 순서로 갈지 합의가 없다.",
      context: [
        "운용팀은 보유 종목 영향부터 알고 싶다.",
        "리서치는 공급망 전이와 수혜주 가능성을 보고 싶다.",
        "리스크팀은 오판 가능성과 확인 지표를 우선한다.",
      ],
      stakeholders: ["운용", "리서치", "리스크관리"],
      successCriteria: [
        "분석 질문을 재정의할 것",
        "downstream insight pipeline으로 넘길 handoff를 만들 것",
      ],
    },
    expectedCriteria: [
      "단순 요약 대신 어떤 질문으로 분석할지 재정의해야 한다",
      "이해관계자별 확인 지표가 드러나야 한다",
      "최종 output에 insight handoff가 포함되어야 한다",
    ],
  },
];

export function getDecisionBenchmarkById(id: string): DecisionBenchmarkCase | null {
  return DEFAULT_DECISION_BENCHMARKS.find((benchmark) => benchmark.id === id) ?? null;
}
