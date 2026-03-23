const decisionSteps = [
  { key: "reframe", label: "과제 재정의", question: "이 요청이 진짜 질문인가?" },
  { key: "stakeholders", label: "관점 수렴", question: "누가 무엇을 중요하게 보는가?" },
  { key: "options", label: "옵션 압축", question: "실제 선택지는 무엇인가?" },
  { key: "orchestrate", label: "실행 설계", question: "AI와 사람을 어떻게 배치할 것인가?" },
  { key: "rehearse", label: "리허설", question: "어떤 반론이 이 구조를 깨는가?" },
  { key: "brief", label: "집필 브리프", question: "그래서 어떤 글을 어떤 순서로 만들 것인가?" },
] as const;

const handoffItems = [
  "recommended question",
  "key assumptions",
  "decision gates",
  "revisit triggers",
  "analysis prompt",
] as const;

type Props = {
  disabled?: boolean;
};

export function ProducerFlowPanel({ disabled = false }: Props) {
  return (
    <section className={`producerFlow panel${disabled ? " disabled" : ""}`}>
      <div className="sectionHeader">
        <div>
          <h2 className="panelTitle">Producer Decision Flow</h2>
          <p className="panelLead">
            최종 독자용 결과물을 꾸미기 전에, 작성자가 따라가는 판단 흐름을 화살표로 먼저 고정합니다.
          </p>
        </div>
        <div className="producerFlowPills">
          <span className="summaryPill summaryPillAccent">producer-first</span>
          <span className="summaryPill">decision → brief → analysis</span>
        </div>
      </div>

      <div className="producerArrowRow" aria-label="decision flow arrows">
        <span className="producerFlowStart">주어진 과제</span>
        {decisionSteps.map((step, index) => (
          <div key={step.key} className="producerArrowSegment">
            <span className="producerArrow" aria-hidden="true">
              →
            </span>
            <article className="producerStepCard">
              <span className="producerStepIndex">{String(index + 1).padStart(2, "0")}</span>
              <strong className="producerStepLabel">{step.label}</strong>
              <p className="producerStepQuestion">{step.question}</p>
            </article>
          </div>
        ))}
        <span className="producerArrow" aria-hidden="true">
          →
        </span>
        <span className="producerFlowEnd">작성 / 분석 실행</span>
      </div>

      <div className="producerFlowGrid">
        <div className="producerFlowBlock">
          <span className="metaLabel">Writing path</span>
          <p className="producerFlowText">
            초안 주제 수신 → 문제 재정의 → 필요한 관점 수집 → 핵심 논지 옵션 정리 → 작성 순서 설계 → 예상 반론 리허설 → 집필 브리프 확정
          </p>
        </div>
        <div className="producerFlowBlock">
          <span className="metaLabel">Insight handoff</span>
          <div className="producerHandoffList">
            {handoffItems.map((item) => (
              <span key={item} className="tokenPill">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
