type OutputEditorProps = {
  editableMarkdown: string;
  setEditableMarkdown: (value: string) => void;
  userNotes: string;
  setUserNotes: (value: string) => void;
  outputTemplate: "full" | "summary" | "social";
  setOutputTemplate: (value: "full" | "summary" | "social") => void;
  handleCopy: () => void;
  copyFeedback: string | null;
};

export function OutputEditor({
  editableMarkdown,
  setEditableMarkdown,
  userNotes,
  setUserNotes,
  outputTemplate,
  setOutputTemplate,
  handleCopy,
  copyFeedback,
}: OutputEditorProps) {
  return (
    <div className="summaryBlock markdownBlock">
      <span className="summaryLabel">Markdown Output</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <label>
          <span className="fieldLabel" style={{ marginRight: 4 }}>템플릿:</span>
          <select
            className="selectInput"
            value={outputTemplate}
            onChange={(event) => setOutputTemplate(event.target.value as "full" | "summary" | "social")}
            style={{ width: "auto" }}
          >
            <option value="full">Full Report</option>
            <option value="summary">Executive Summary</option>
            <option value="social">Social Post</option>
          </select>
        </label>
        <span className="hintText">
          현재 템플릿: {outputTemplate === "full" ? "Full Report" : outputTemplate === "summary" ? "Executive Summary" : "Social Post"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button type="button" className="miniButton" onClick={handleCopy}>
          📋 현재 템플릿 복사
        </button>
        {copyFeedback ? <span style={{ marginLeft: 8, color: "var(--text-color-light)" }}>{copyFeedback}</span> : null}
      </div>
      <textarea
        className="codeBlock"
        value={editableMarkdown}
        onChange={(event) => setEditableMarkdown(event.target.value)}
        rows={20}
        style={{ width: "100%", fontFamily: "monospace" }}
      />
      <div style={{ marginTop: 16 }}>
        <span className="summaryLabel">내 메모</span>
        <textarea
          placeholder="이 분석에 대한 메모를 남겨보세요..."
          className="codeBlock"
          value={userNotes}
          onChange={(event) => setUserNotes(event.target.value)}
          rows={4}
          style={{ width: "100%", fontFamily: "monospace" }}
        />
      </div>
    </div>
  );
}
