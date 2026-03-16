import type { SearchRoundState } from "@/hooks/use-pipeline-state";

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

type SearchRoundsLogProps = {
  searchRounds: SearchRoundState[];
};

export function SearchRoundsLog({ searchRounds }: SearchRoundsLogProps) {
  return (
    <section className="resultCard">
      <div className="resultHeader">
        <h2 className="resultTitle">Search Rounds</h2>
        <span className="statusBadge status-success">{searchRounds.length} active logs</span>
      </div>
      <div className="stack">
        {searchRounds.length === 0 ? (
          <p className="panelLead">아직 검색 라운드가 시작되지 않았습니다.</p>
        ) : (
          [...searchRounds]
            .sort((left, right) => left.round - right.round)
            .map((roundState) => (
              <article key={roundState.round} className="stageCard">
                <div className="stageHeader">
                  <h3 className="stageTitle">Round {roundState.round}</h3>
                  <span className="statusBadge status-success">results {roundState.results.length}</span>
                </div>
                <div className="metaRow">
                  <span>{roundState.queries.length} queries</span>
                  {roundState.error ? <span className="errorText">{roundState.error}</span> : null}
                </div>
                <pre className="codeBlock">{prettyJson(roundState.queries)}</pre>
              </article>
            ))
        )}
      </div>
    </section>
  );
}
