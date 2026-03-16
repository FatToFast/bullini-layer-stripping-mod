import type { InsightStageName, StageRecord } from "@/lib/insight/types";
import type { SearchRoundState, TabId } from "@/hooks/use-pipeline-state";

type DiagramNode = {
  id: string;
  label: string;
  short: string;
  kind: "stage" | "search";
  stage?: InsightStageName;
  searchRound?: 1 | 2;
};

const NODES: DiagramNode[] = [
  { id: "n0", label: "입력 검증", short: "0", kind: "stage", stage: "input_validation" },
  { id: "s1", label: "Search R1", short: "🔍", kind: "search", searchRound: 1 },
  { id: "n1", label: "전제 제거", short: "1", kind: "stage", stage: "layer0_layer1" },
  { id: "n2", label: "분류", short: "2", kind: "stage", stage: "event_classification" },
  { id: "n3", label: "반대 경로", short: "3", kind: "stage", stage: "layer2_reverse_paths" },
  { id: "n4", label: "인접 전이", short: "4", kind: "stage", stage: "layer3_adjacent_spillover" },
  { id: "n5", label: "포트폴리오", short: "5", kind: "stage", stage: "portfolio_impact" },
  { id: "n6", label: "시간축", short: "6", kind: "stage", stage: "layer4_time_horizon" },
  { id: "n7", label: "Premortem", short: "7", kind: "stage", stage: "layer5_structural_premortem" },
  { id: "s2", label: "Search R2", short: "🔍", kind: "search", searchRound: 2 },
  { id: "n8", label: "팩트 검증", short: "8", kind: "stage", stage: "evidence_consolidation" },
  { id: "n9", label: "최종 출력", short: "9", kind: "stage", stage: "output_formatting" },
];

type PipelineDiagramProps = {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  searchRounds: SearchRoundState[];
  stageRecords: StageRecord[];
};

export function PipelineDiagram({ activeTab, setActiveTab, searchRounds, stageRecords }: PipelineDiagramProps) {
  function getNodeStatus(node: DiagramNode): "idle" | "running" | "done" | "error" {
    if (node.kind === "search") {
      const searchRound = searchRounds.find((item) => item.round === node.searchRound);
      if (!searchRound) return "idle";
      if (searchRound.error) return "error";
      if (searchRound.results.length > 0) return "done";
      return "running";
    }

    if (!node.stage) return "idle";
    const record = stageRecords.find((item) => item.stage === node.stage);
    if (!record) return "idle";
    if (record.status === "running") return "running";
    if (record.status === "success") return "done";
    if (record.status === "error") return "error";
    return "idle";
  }

  return (
    <div className="pipelineDiagram">
      {NODES.map((node, index) => (
        <div key={node.id} className="diagramNodeWrap">
          <button
            type="button"
            className={`diagramNode diagramNode-${node.kind} diagramNode-${getNodeStatus(node)} ${
              (node.stage && activeTab === node.stage) ||
              (node.kind === "search" && activeTab === (node.searchRound === 1 ? "searchR1" : "searchR2"))
                ? "diagramNodeActive"
                : ""
            }`}
            onClick={() => {
              if (node.stage && node.stage !== "input_validation") {
                setActiveTab(node.stage);
              } else if (node.kind === "search") {
                setActiveTab(node.searchRound === 1 ? "searchR1" : "searchR2");
              }
            }}
            disabled={node.stage === "input_validation"}
          >
            <span className="diagramNodeShort">{node.short}</span>
            <span className="diagramNodeLabel">{node.label}</span>
          </button>
          {index < NODES.length - 1 ? <span className="diagramArrow">→</span> : null}
        </div>
      ))}
    </div>
  );
}
