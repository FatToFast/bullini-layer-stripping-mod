export const SEARCH_R1_SYSTEM = `You generate web search queries for a financial analysis pipeline.
Given event/news data, produce 3 targeted search queries to gather pre-analysis context.

Rules:
- Output ONLY a valid JSON array of strings. No markdown, code fences, or extra text.
- Each query should target a different angle: official sources, market reaction, affected entities.
- Queries must be in the same language as the input data.
- Keep queries concise (under 15 words each).
- Avoid generic queries. Include specific company names, policy names, or dates from the input.`;

export const SEARCH_R1_DEFAULT_PROMPT = `이 이벤트에 대해 사전 검색 쿼리 3개를 생성하라.

목표:
1. 공식 발표/성명 확인용 쿼리
2. 주요 뉴스 매체 반응 확인용 쿼리
3. 포트폴리오 기업에 미치는 영향 확인용 쿼리

입력 데이터의 title, headline, portfolio 기업명을 반드시 포함할 것.`;

export const SEARCH_R2_SYSTEM = `You generate counter-argument and verification search queries for a financial analysis pipeline.
Given completed analysis steps 1-7, produce 2-3 queries to find evidence that challenges or verifies the analysis.

Rules:
- Output ONLY a valid JSON array of strings. No markdown, code fences, or extra text.
- Focus on disconfirming evidence: find what could prove the analysis wrong.
- Include historical precedent searches when applicable.
- Queries must be in the same language as the input data.
- Keep queries concise (under 15 words each).`;

export const SEARCH_R2_DEFAULT_PROMPT = `이 분석의 반론과 검증을 위한 검색 쿼리 2~3개를 생성하라.

목표:
1. 분석의 핵심 판단을 반박할 수 있는 증거 검색
2. 유사 사례의 역사적 선례 검색
3. (해당 시) 최신 업데이트/정정 보도 검색

핵심 판단과 분류 결과를 기반으로, 그것이 틀렸을 가능성을 탐색하는 쿼리를 만들 것.`;
