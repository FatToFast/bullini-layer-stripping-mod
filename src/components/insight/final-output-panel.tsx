import type { FinalOutput } from "@/lib/insight/types";

type FinalOutputPanelProps = {
  finalOutput: FinalOutput;
  mode: string;
};

export function FinalOutputPanel({ finalOutput, mode }: FinalOutputPanelProps) {
  return (
    <>
      <div className="summaryBlock">
        <span className="summaryLabel">One Line Take</span>
        <div>{finalOutput.oneLineTake}</div>
        <span className={`summaryPill ${finalOutput.mode === "personalized" ? "summaryPillAccent" : ""}`}>
          {finalOutput.mode === "personalized" ? "Personalized" : "General"}
        </span>
      </div>

      <div className="summaryBlock">
        <span className="summaryLabel">Structural Read</span>
        <div>{finalOutput.structuralRead}</div>
      </div>

      <div className="summaryBlock">
        <span className="summaryLabel">{mode === "personalized" ? "Portfolio Impact" : "Affected Entities"}</span>
        <div className="triggerList">
          {finalOutput.portfolioImpactTable.map((row) => (
            <details key={`${row.company}-${row.held}`} className="listCard" open>
              <summary>
                <strong>{row.company}</strong>
                <span className="summaryPill">{row.exposureType}</span>
                <span className="summaryPill">{row.held}</span>
                <span className="summaryPill">{row.confidence}</span>
              </summary>
              <div className="metaRow">
                <span>{row.whatChangesToday}</span>
              </div>
              <div className="metaRow">
                <span>다음 확인: {row.whatToMonitor}</span>
              </div>
              {(() => {
                const raw = row as unknown as Record<string, unknown>;
                const indicators = (row.monitoringIndicators ?? raw.monitoring_indicators ?? []) as Array<Record<string, string>>;
                return indicators.length > 0 ? (
                  <details style={{ marginTop: 4 }}>
                    <summary className="metaRow" style={{ cursor: "pointer" }}>
                      <span>모니터링 지표 ({indicators.length})</span>
                    </summary>
                    {indicators.map((indicator, index) => (
                      <div key={`ind-${index}`} className="metaRow" style={{ paddingLeft: 12 }}>
                        <span>
                          {indicator.indicator}: {indicator.threshold}
                          {indicator.data_source || indicator.dataSource ? ` - ${indicator.data_source ?? indicator.dataSource}` : ""}
                          {indicator.linked_hypothesis || indicator.linkedHypothesis ? ` [${indicator.linked_hypothesis ?? indicator.linkedHypothesis}]` : ""}
                        </span>
                      </div>
                    ))}
                  </details>
                ) : null;
              })()}
            </details>
          ))}
        </div>
      </div>

      <details className="summaryBlock" open>
        <summary className="summaryLabel">
          <span>Watch Triggers ({finalOutput.watchTriggers.length})</span>
          {finalOutput.watchTriggers.length > 0 ? <span className="summaryPill">Next: {finalOutput.watchTriggers[0].date}</span> : null}
        </summary>
        <div className="triggerList">
          {finalOutput.watchTriggers.map((trigger) => (
            <div key={`${trigger.date}-${trigger.event}`} className="listCard">
              <strong>{trigger.date} · {trigger.event}</strong>
              <div>if confirmed: {trigger.ifConfirmed}</div>
              <div>if not: {trigger.ifNot}</div>
              <div>trigger: {trigger.thesisTrigger}</div>
            </div>
          ))}
        </div>
      </details>

      {finalOutput.competingHypotheses.length > 0 ? (
        <details className="summaryBlock" open>
          <summary className="summaryLabel">
            <span>Competing Hypotheses ({finalOutput.competingHypotheses.length})</span>
            <span className="summaryPill">
              {finalOutput.competingHypotheses.find(
                (hypothesis) =>
                  (hypothesis as unknown as Record<string, unknown>).current_weight === "strongest" ||
                  hypothesis.currentWeight === "strongest"
              )?.label ?? ""}
            </span>
          </summary>
          <div className="triggerList">
            {finalOutput.competingHypotheses.map((hypothesis, index) => {
              const raw = hypothesis as unknown as Record<string, unknown>;
              const evidenceFor = hypothesis.evidenceFor ?? (raw.evidence_for as string[]) ?? [];
              const evidenceAgainst = hypothesis.evidenceAgainst ?? (raw.evidence_against as string[]) ?? [];
              const weight = hypothesis.currentWeight ?? (raw.current_weight as string) ?? "";

              return (
                <div key={`hyp-${index}-${hypothesis.label}`} className="listCard">
                  <strong>{hypothesis.label}</strong>
                  <span className={`summaryPill ${weight === "strongest" ? "summaryPillAccent" : ""}`}>{weight}</span>
                  <div>{hypothesis.logic}</div>
                  <div className="metaRow">
                    <span>For: {evidenceFor.join(", ")}</span>
                  </div>
                  <div className="metaRow">
                    <span>Against: {evidenceAgainst.join(", ")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {finalOutput.historicalPrecedents.length > 0 ? (
        <details className="summaryBlock" open>
          <summary className="summaryLabel">
            <span>Historical Precedents (Base Rate) ({finalOutput.historicalPrecedents.length})</span>
          </summary>
          <div className="triggerList">
            {finalOutput.historicalPrecedents.map((precedent, index) => (
              <div key={`prec-${index}-${precedent.pattern}`} className="listCard">
                <strong>{precedent.pattern}</strong>
                <div>{precedent.frequency} - {precedent.source}</div>
                <div>{precedent.relevance}</div>
                <div className="metaRow"><span>{precedent.confidence}</span></div>
                {precedent.caveat ? <div className="metaRow"><span>{precedent.caveat}</span></div> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <details className="summaryBlock" open>
        <summary className="summaryLabel">
          <span>Why Sections ({finalOutput.whySections.length})</span>
        </summary>
        <div className="whyList">
          {finalOutput.whySections.map((section) => (
            <div key={section.label} className="listCard">
              <strong>{section.label}</strong>
              <div>{section.content}</div>
              <div className="metaRow">
                <span>{section.confidence}</span>
              </div>
            </div>
          ))}
        </div>
      </details>

      {finalOutput.inconsistencies?.length > 0 ? (
        <details className="summaryBlock" open>
          <summary className="summaryLabel">
            <span>뭐가 이상해? ({finalOutput.inconsistencies.length})</span>
          </summary>
          <div className="triggerList">
            {finalOutput.inconsistencies.map((item, index) => {
              const raw = item as unknown as Record<string, unknown>;
              return (
                <div key={`inc-${index}`} className="listCard">
                  <div className="metaRow"><span>A: {item.claimA ?? (raw.claim_a as string) ?? ""}</span></div>
                  <div className="metaRow"><span>B: {item.claimB ?? (raw.claim_b as string) ?? ""}</span></div>
                  <div><strong>{item.tension ?? (raw.tension as string) ?? ""}</strong></div>
                  <div className="metaRow"><span>해소 조건: {item.whatResolvesIt ?? (raw.what_resolves_it as string) ?? ""}</span></div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {finalOutput.narrativeParallels?.length > 0 ? (
        <details className="summaryBlock" open>
          <summary className="summaryLabel">
            <span>이건 뭐랑 비슷해? ({finalOutput.narrativeParallels.length})</span>
          </summary>
          <div className="triggerList">
            {finalOutput.narrativeParallels.map((parallel, index) => {
              const raw = parallel as unknown as Record<string, unknown>;
              return (
                <div key={`np-${index}`} className="listCard">
                  <strong>{parallel.episode ?? (raw.episode as string) ?? ""}</strong>
                  <div className="metaRow"><span>공통: {parallel.commonStructure ?? (raw.common_structure as string) ?? ""}</span></div>
                  <div className="metaRow"><span>차이: {parallel.keyDifference ?? (raw.key_difference as string) ?? ""}</span></div>
                  <div>{parallel.howItPlayedOut ?? (raw.how_it_played_out as string) ?? ""}</div>
                  <div className="metaRow"><span>이번에 다를 수 있는 이유: {parallel.whyThisTimeMayDiffer ?? (raw.why_this_time_may_differ as string) ?? ""}</span></div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {finalOutput.metaAssumptions?.length > 0 ? (
        <details className="summaryBlock" open>
          <summary className="summaryLabel">
            <span>이 분석의 숨은 전제 ({finalOutput.metaAssumptions.length})</span>
          </summary>
          <div className="triggerList">
            {finalOutput.metaAssumptions.map((assumption, index) => {
              const raw = assumption as unknown as Record<string, unknown>;
              return (
                <div key={`ma-${index}`} className="listCard">
                  <strong>{assumption.assumption ?? (raw.assumption as string) ?? ""}</strong>
                  <div className="metaRow"><span>틀리면: {assumption.ifWrong ?? (raw.if_wrong as string) ?? ""}</span></div>
                  <div className="metaRow"><span>확인: {assumption.check ?? (raw.check as string) ?? ""}</span></div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      <details className="summaryBlock" open>
        <summary className="summaryLabel">
          <span>Premortem</span>
          {finalOutput.premortem.coreThesis ? <span className="summaryPill">{finalOutput.premortem.coreThesis}</span> : null}
        </summary>
        <div>{finalOutput.premortem.primaryFailure}</div>
        <div>{finalOutput.premortem.earlyWarning}</div>
        <div>{finalOutput.premortem.ifWrong}</div>
      </details>
    </>
  );
}
