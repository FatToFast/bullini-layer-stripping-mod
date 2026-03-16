# bullini-v2 → Layer-Stripping Framework 마이그레이션 가이드

## 개요

bullini-v2의 파이프라인을 Layer-Stripping Analysis Framework에 맞게 수정했습니다.
기존 인프라(Next.js, OpenAI API, SSE 스트리밍, UI 컴포넌트)는 거의 그대로 사용하고,
분석 로직(프롬프트, 스테이지 정의, 입력 스키마)만 교체합니다.

### v2 변경 사항 (Bayesian + ACH)

기존 Layer-Stripping 파이프라인에 3가지 변경을 추가:

1. **Competing Hypotheses (ACH Light)** — Step 1에서 경쟁 가설 2~4개를 찬반 근거와 함께 나열
2. **Historical Precedents (Base Rate)** — Step 8에서 과거 유사 사례 빈도를 출처와 함께 제시
3. **action → what_to_monitor** — Step 5/9에서 투자 행동 제안을 "다음 확인할 데이터"로 전환

## 파이프라인 변경 매핑

| 단계 | bullini 원본 | Layer-Stripping 수정본 | v2 변경 |
|------|-------------|---------------------|---------|
| 0 | input_validation | input_validation (동일) | — |
| 1 | event_understanding | **layer0_layer1** (전제 제거 + 컨센서스 + 불완전성) | + `competing_hypotheses` |
| 2 | top_down_mapping | **event_classification** (유형 분류 + phase) | — |
| 3 | transmission_path_analysis | **layer2_reverse_paths** (반대 방향 경로) | — |
| 4 | asset_linking | **layer3_adjacent_spillover** (인접 시장 전이) | — |
| 5 | pricing_check | **portfolio_impact** (종목별 D/I/B/NI 매핑) | `action` → `what_to_monitor` |
| 6 | idea_generation | **layer4_time_horizon** (시간축 전환) | — |
| 7 | critique | **layer5_structural_premortem** (구조 판정 + Premortem) | — |
| 8 | fact_citation_consolidation | **evidence_consolidation** (팩트 검증) | + `historical_precedents` |
| 9 | final_formatting | **output_formatting** (Product-first 출력) | 신규 필드 2개 + 필드명 변경 |

## 교체할 파일

아래 파일들을 `src/lib/insight/` 에 덮어씁니다:

```
교체 (완전 새 내용):
  prompts.ts          ← 핵심. 9개 프롬프트 전체 교체
  types.ts            ← 스테이지명, 출력 타입 변경
  schemas.ts          ← portfolio 필드 추가
  pipeline.ts         ← 새 스테이지명으로 파이프라인 재연결
  search-queries.ts   ← portfolio 기반 검색 쿼리

새로 추가:
  stage-labels.ts     ← UI에서 쓸 한국어 스테이지 이름

교체 (샘플 데이터):
  samples/evt-301-tariff.json   ← 301조 관세 이벤트
  samples/evt-hbm-export.json   ← HBM 수출규제 이벤트

변경 없음 (그대로 사용):
  api.ts
  stage-runner.ts
  normalizers.ts
  formatter.ts
```

## 입력 스키마 변경점

### 추가된 필드

```json
{
  "portfolio": [
    { "company": "SK hynix", "ticker": "000660.KS", "held": "held" },
    { "company": "Samsung Electronics", "ticker": "005930.KS", "held": "watchlist" }
  ],
  "additional_context": [
    "관련 선행 이벤트, 업계 상황 등 추가 맥락"
  ]
}
```

### 변경된 필드

```
canonical_event:
  - event_type: 6종으로 고정 (policy/supply/demand/commodity/financial/competitor)
  - primary_layer, secondary_layers → 삭제 (event_classification 단계에서 자동 분류)
  - date, source, summary 추가

representative_news:
  - summary → keyFacts (배열)

expected_insight_themes → 삭제 (파이프라인이 자동 생성)
```

## 적용 방법

```bash
# 1. 원본 포크
# GitHub에서 bullini-v2를 본인 계정으로 Fork

# 2. 클론
git clone https://github.com/[your-username]/bullini-v2.git
cd bullini-v2

# 3. 수정 파일 덮어쓰기
# bullini-mod-files.zip을 풀어서 src/lib/insight/ 에 덮어씀
unzip bullini-mod-files.zip -d .

# 4. 기존 샘플 파일 삭제 (선택)
rm src/lib/insight/samples/evt-001.json
rm src/lib/insight/samples/evt-002.json
rm src/lib/insight/samples/evt-003.json

# 5. 환경변수 설정
echo "OPENAI_API_KEY=sk-..." > .env.local

# 6. 의존성 설치 & 실행
npm install
npm run dev
# → localhost:3000
```

## UI 수정 필요 사항

### model-selector.tsx
스테이지 이름이 바뀌었으므로, 새 `stage-labels.ts`의 STAGE_LABELS를 import해서 사용:

```tsx
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/insight/stage-labels";
// STAGE_ORDER.map(stage => ({ value: stage, label: STAGE_LABELS[stage] }))
```

### stage-panel.tsx
스테이지 표시 이름을 한국어로 바꾸려면 동일하게 STAGE_LABELS 사용.

### final-output-panel.tsx
출력 구조가 바뀜 (oneLineTake + analystNote → portfolioImpactTable + watchTriggers + whySections).
이 컴포넌트는 새 FinalOutput 타입에 맞게 재작성 필요.

v2에서 추가된 섹션:
- `competingHypotheses` — Watch Triggers 뒤에 배치. weight별 스타일링 (strongest 강조).
- `historicalPrecedents` — Why Sections 뒤에 배치. 빈 배열이면 섹션 숨김.
- portfolio_impact_table의 `action` 컬럼 → `what_to_monitor` (헤더: "What to Monitor")

### mock-json-input.tsx
기본 샘플 JSON을 새 스키마에 맞게 업데이트 필요.
samples/evt-301-tariff.json 내용을 기본값으로 설정하면 됨.

## 테스트 순서

1. `npm run dev`로 실행
2. evt-301-tariff.json 내용을 Mock JSON Input에 붙여넣기
3. Run 클릭
4. 각 단계의 입력/프롬프트/출력을 확인
5. 특히 확인할 것:
   - Step 1 (layer0_layer1): `competing_hypotheses`가 2~4개 나오는가? 각 가설에 찬반 근거가 있는가?
   - Step 3 (layer2_reverse_paths): 반대 경로가 현실적인가?
   - Step 5 (portfolio_impact): 모든 종목이 4종 분류에 포함됐는가? `what_to_monitor`가 행동 제안이 아닌 데이터 포인트인가?
   - Step 7 (premortem): 리스크 나열이 아니라 구체적 실패 시나리오인가?
   - Step 8 (evidence_consolidation): `historical_precedents`가 데이터 없으면 빈 배열인가? 빈도를 지어내지 않았는가?
   - Step 9 (output): portfolio_impact_table이 최상단에 오는가? competing_hypotheses/historical_precedents 섹션이 포함되는가?

## v2 출력 스키마 변경점

### Step 1 output에 추가

```json
{
  "competing_hypotheses": [
    {
      "label": "H1: 단기 충격 후 적응",
      "logic": "이미 15% 환경 경험, 미국 내 공장 가동 중",
      "evidence_for": ["현대 조지아 공장", "LG엔솔 미시간 공장"],
      "evidence_against": ["추가 301조 조사 예고"],
      "current_weight": "strongest"
    }
  ]
}
```

### Step 5 output 변경

```diff
- "action": "사용자 행동 제안 1줄"
+ "what_to_monitor": "다음에 확인할 데이터 포인트 1줄"
```

### Step 8 output에 추가

```json
{
  "historical_precedents": [
    {
      "pattern": "301조 관세 발동 후 한국 수출 변화",
      "frequency": "3건 중 2건에서 6개월 내 대체 경로 확보",
      "source": "KITA 무역통계 2018-2025",
      "relevance": "이번 사례에 직접 적용 가능",
      "confidence": "estimated",
      "caveat": "HBM/AI 관련 품목은 전례 없음"
    }
  ]
}
```

### Step 9 (최종 출력) 구조

```
1. one_line_take
2. portfolio_impact_table (what_to_monitor 사용)
3. watch_triggers
4. competing_hypotheses      ← 신규
5. why_sections
6. historical_precedents     ← 신규 (빈 배열이면 생략)
7. structural_read
8. premortem
9. markdown_output
```

### TypeScript 타입 변경

```typescript
// 신규 타입
CompetingHypothesis { label, logic, evidenceFor, evidenceAgainst, currentWeight }
HistoricalPrecedent { pattern, frequency, source, relevance, confidence, caveat }

// 변경된 타입
PortfolioImpactRow.action → PortfolioImpactRow.whatToMonitor

// FinalOutput에 추가
competingHypotheses: CompetingHypothesis[]
historicalPrecedents: HistoricalPrecedent[]
```

## 프롬프트 수정 시

prompts.ts만 수정하면 됩니다. 다른 파일은 건드릴 필요 없습니다.
각 STEP_PROMPT를 수정한 후 새로고침하면 바로 반영됩니다.

단, 출력 스키마 필드를 추가/변경할 경우 types.ts와 pipeline.ts의 매핑도 함께 수정해야 합니다.
