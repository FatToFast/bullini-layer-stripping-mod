"use client";

import { useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    mermaid?: {
      initialize: (config: Record<string, unknown>) => void;
      render: (id: string, code: string) => Promise<{ svg: string }>;
    };
  }
}

type DiagramDef = {
  id: string;
  title: string;
  description: string;
  code: string;
};

const diagrams: DiagramDef[] = [
  {
    id: "producer-end-to-end",
    title: "End-to-end producer workflow",
    description: "과제에서 집필 브리프와 insight handoff까지 이어지는 전체 구조입니다.",
    code: `flowchart TD
    A[주어진 과제 / 초안 주제] --> B[task_reframing<br/>이 요청이 진짜 질문인가?]
    B --> C[stakeholder_mapping<br/>누가 무엇을 중요하게 보는가?]
    C --> D[option_synthesis<br/>실제 선택지는 무엇인가?]
    D --> E[orchestration_design<br/>AI / Human / Collab 역할 배치]
    E --> F[persona_rehearsal<br/>누가 이 계획을 어떻게 공격하는가?]
    F --> G[decision_synthesis<br/>집필 브리프 / analysis handoff 확정]
    G --> H[집필 브리프]
    G --> I[insight handoff]
    H --> J[기사 / 보고서 / 메모 작성]
    I --> K[Insight Pipeline]
    K --> L[layer stripping analysis]
    L --> M[evidence consolidation]
    M --> N[output formatting]`,
  },
  {
    id: "autoresearch-loop",
    title: "AUTORESEARCH-style improvement loop",
    description: "benchmark → evaluation → suggested settings → rerun의 프로토콜 개선 루프입니다.",
    code: `flowchart TD
    A[Benchmark Scenario 선택] --> B[Decision Pipeline 실행]
    B --> C[Evaluation<br/>score / verdict / notes]
    C --> D{verdict}
    D -->|keep| E[현재 protocol 유지]
    D -->|iterate| F[suggestedModelSettings 생성]
    D -->|discard| G[기존 설정으로 되돌림]
    F --> H[Suggested settings 적용]
    H --> B
    C --> I[local history 저장]
    C --> J[file save]
    I --> K[이전 run diff 비교]
    J --> K`,
  },
  {
    id: "writer-summary",
    title: "Writer-facing simplified flow",
    description: "작성자에게 가장 짧고 직관적으로 보이는 요약 흐름입니다.",
    code: `flowchart LR
    A[과제 수신] --> B[문제 재정의]
    B --> C[관점 수렴]
    C --> D[옵션 압축]
    D --> E[실행 설계]
    E --> F[반론 리허설]
    F --> G[집필 브리프]
    G --> H[작성 시작]`,
  },
];

function loadMermaidScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("window is undefined"));
      return;
    }

    if (window.mermaid) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-mermaid-loader="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load mermaid")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
    script.async = true;
    script.dataset.mermaidLoader = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load mermaid"));
    document.head.appendChild(script);
  });
}

type Props = {
  disabled?: boolean;
};

export function WorkflowMermaidPanel({ disabled = false }: Props) {
  const [isMermaidReady, setIsMermaidReady] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [svgMap, setSvgMap] = useState<Record<string, string>>({});

  const diagramList = useMemo(() => diagrams, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadMermaidScript();
        if (cancelled || !window.mermaid) return;
        window.mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          flowchart: {
            curve: "basis",
            htmlLabels: true,
          },
        });
        setIsMermaidReady(true);
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : "Mermaid load failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isMermaidReady || !window.mermaid) return;

    void (async () => {
      const nextMap: Record<string, string> = {};
      const mermaid = window.mermaid;
      if (!mermaid) return;
      for (const diagram of diagramList) {
        try {
          const { svg } = await mermaid.render(`mermaid-${diagram.id}-${Date.now()}`, diagram.code);
          nextMap[diagram.id] = svg;
        } catch (error) {
          nextMap[diagram.id] = "";
          if (!cancelled) {
            setRenderError(error instanceof Error ? error.message : `Failed to render ${diagram.title}`);
          }
        }
      }
      if (!cancelled) {
        setSvgMap(nextMap);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [diagramList, isMermaidReady]);

  return (
    <section className="workflowMermaid panel">
      <div className="sectionHeader">
        <div>
          <h2 className="panelTitle">Workflow Mermaid View</h2>
          <p className="panelLead">
            문서에 적어둔 producer workflow를 워크벤치 안에서도 그대로 확인할 수 있게 렌더링합니다.
          </p>
        </div>
        <div className="producerFlowPills">
          <span className="summaryPill">docs ↔ workbench sync</span>
          <span className="summaryPill summaryPillAccent">mermaid render</span>
        </div>
      </div>

      {renderError ? <p className="errorText">Mermaid render fallback: {renderError}</p> : null}

      <div className="workflowMermaidGrid">
        {diagramList.map((diagram) => {
          const svg = svgMap[diagram.id];
          return (
            <article key={diagram.id} className="workflowMermaidCard">
              <div className="metaRow">
                <strong>{diagram.title}</strong>
                <span className="summaryPill">{svg ? "rendered" : "code fallback"}</span>
              </div>
              <p className="benchmarkComment">{diagram.description}</p>
              {svg ? (
                <div className="workflowMermaidCanvas" dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <pre className="workflowMermaidFallback">
                  <code>{diagram.code}</code>
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
