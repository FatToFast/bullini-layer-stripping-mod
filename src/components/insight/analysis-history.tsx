import { formatStoredDate, type StoredAnalysis } from "@/hooks/use-analysis-storage";

type AnalysisHistoryProps = {
  history: StoredAnalysis[];
  historySearch: string;
  setHistorySearch: (value: string) => void;
  onLoad: (analysis: StoredAnalysis) => void;
  title?: string;
  open?: boolean;
  compact?: boolean;
};

export function AnalysisHistory({
  history,
  historySearch,
  setHistorySearch,
  onLoad,
  title = "분석 이력",
  open = false,
  compact = false,
}: AnalysisHistoryProps) {
  const filteredHistory = history.filter((analysis) => {
    const searchTerm = historySearch.toLowerCase();
    return (
      analysis.eventId.toLowerCase().includes(searchTerm) ||
      analysis.output.oneLineTake.toLowerCase().includes(searchTerm) ||
      analysis.output.markdownOutput.toLowerCase().includes(searchTerm)
    );
  });

  return (
    <details className="summaryBlock" open={open}>
      <summary className="summaryLabel">
        <span>{title} ({history.length})</span>
      </summary>
      <input
        type="text"
        className="textInput"
        placeholder="키워드로 검색... (이벤트 제목, 종목명)"
        value={historySearch}
        onChange={(event) => setHistorySearch(event.target.value)}
        style={{ marginBottom: 10 }}
      />
      <div className="triggerList">
        {filteredHistory.length === 0 ? (
          <p className="panelLead">저장된 분석이 없습니다.</p>
        ) : (
          filteredHistory.map((analysis) => (
            <div key={analysis.eventId} className="listCard">
              <div className="metaRow">
                <strong>{compact ? analysis.eventId : formatStoredDate(analysis.timestamp)}</strong>
                <span>{compact ? formatStoredDate(analysis.timestamp) : analysis.eventId}</span>
                <span className={`statusBadge ${analysis.output.mode === "personalized" ? "status-running" : "status-success"}`}>
                  {analysis.output.mode === "personalized" ? "Personalized" : "General"}
                </span>
                <button type="button" className="miniButton" onClick={() => onLoad(analysis)}>
                  {compact ? "Load" : "불러오기"}
                </button>
              </div>
              <div>{analysis.output.oneLineTake}</div>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
