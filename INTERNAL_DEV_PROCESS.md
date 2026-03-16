# 내부 개발 프로세스

## 1. 워크벤치 사용 가이드

### 워크벤치란?

`insight-workbench.tsx`는 **개발자용 도구**입니다. 소비자 제품이 아닙니다.

용도:
- 프롬프트 수정 후 즉시 테스트
- 스테이지별 입출력 확인
- 모델/온도/토큰 설정 비교
- 평가 체크리스트로 품질 측정

### 실행

```bash
npm install
npm run dev
# → localhost:3000
```

### 기본 워크플로우

1. 샘플 이벤트 선택 (evt-301-tariff 또는 evt-hbm-export)
2. 또는 뉴스 URL 입력 → 자동 구조화
3. "Stress Test 실행" 클릭 → 전체 파이프라인 실행
4. 각 스테이지 탭에서 입력/프롬프트/출력 확인
5. 스테이지별 "Evaluate" 버튼으로 품질 체크리스트 생성

### 스테이지별 개별 실행

특정 스테이지만 수정 후 테스트할 때:
1. 해당 스테이지 탭 선택
2. "▶ Run Stage" 클릭
3. 이전 스테이지 결과는 캐시에서 재사용됨

### 모델 설정

- Common Model: 전체 스테이지의 기본 모델
- Per-stage Override: 특정 스테이지만 다른 모델/온도 사용
- "Apply Common To All": 현재 공통 설정을 전 스테이지에 적용

---

## 2. 프롬프트 개발 워크플로우

### 수정 대상 파일

```
src/lib/insight/prompts.ts    ← 프롬프트만 여기서 수정
```

다른 파일은 출력 스키마 필드를 추가/변경할 때만 수정:
- `types.ts` — TypeScript 타입 정의
- `pipeline.ts` — LLM 출력 파싱 매핑
- `schemas.ts` — 입력 Zod 스키마

### 변경 사이클

```
1. 프롬프트 수정 (prompts.ts)
   ↓
2. 워크벤치에서 샘플 2개로 테스트
   - evt-301-tariff.json (정책 이벤트, 포트폴리오 있음)
   - evt-hbm-export.json (공급 이벤트, 포트폴리오 있음)
   ↓
3. 스테이지별 Evaluate 실행 → 체크리스트 점수 확인
   - 80점 미만 → 프롬프트 재수정
   - 80점 이상 → 다음 단계
   ↓
4. General Mode 테스트 (portfolio를 빈 배열로 변경)
   - Step 5가 영향 기업을 자동 추출하는지 확인
   - Step 9가 General Mode markdown을 생성하는지 확인
   ↓
5. PR 생성 → CI 평가 통과 → 머지
```

### 프롬프트 수정 규칙

| 규칙 | 이유 |
|---|---|
| 출력 스키마의 필드명은 snake_case | LLM이 일관되게 생성하도록 |
| 규칙은 금지 표현("~하지 마라")과 필수 표현("반드시 ~하라")으로 | 모호한 지시 방지 |
| 예시는 O/X 쌍으로 | LLM이 경계를 명확히 인식 |
| confidence 3단계는 모든 스테이지에 일관되게 | confirmed/estimated/scenario |
| 새 필드 추가 시 types.ts + pipeline.ts 동시 수정 | 타입 불일치 방지 |

### 프롬프트 품질 기준

| 기준 | 통과 | 미달 |
|---|---|---|
| 스테이지 평가 점수 | ≥80 | <80 |
| 출력 스키마 준수 | JSON 파싱 성공 + 필수 필드 존재 | 파싱 실패 또는 필드 누락 |
| 중국어 미포함 | CJK 0% | CJK >0% |
| 투자 조언 미포함 | what_to_monitor에 행동 동사 없음 | "매수", "축소", "관리" 등 포함 |
| competing_hypotheses 개수 | 2~4개 | 1개 또는 5개 이상 |
| historical_precedents 출처 | source 필드 비어있지 않음 (또는 빈 배열) | 출처 없는 빈도 수치 |

---

## 3. 평가 시스템

### 스테이지별 평가 (자동)

워크벤치의 "Evaluate" 버튼은 `evaluate-stage-prompt.ts`를 사용합니다:
1. 해당 스테이지의 프롬프트에서 규칙/목표/스키마를 자동 추출
2. 실제 출력을 각 기준에 대해 점수화
3. overall_score + 기준별 pass/partial/fail 반환

### 전체 파이프라인 평가 (수동)

`evaluate-prompt.ts`를 사용한 종합 평가:
- 최종 출력(Step 9)을 기대 기준과 비교
- 기대 기준은 자유 텍스트로 작성

### 평가 샘플 관리

```
src/lib/insight/samples/
├── evt-301-tariff.json       ← 정책 이벤트 (portfolio 있음)
├── evt-hbm-export.json       ← 공급 이벤트 (portfolio 있음)
└── (추가 필요)
    ├── evt-*-no-portfolio.json  ← General Mode 테스트용
    └── evt-*-earnings.json      ← 실적 이벤트
```

새 프롬프트 변경 시 최소 2개 샘플에서 80점 이상이어야 합니다.

---

## 4. 디렉토리 구조 규칙

```
src/lib/insight/
├── prompts.ts           ← 프롬프트 (가장 자주 수정)
├── types.ts             ← 타입 정의 (스키마 변경 시)
├── pipeline.ts          ← 파이프라인 흐름 (거의 안 건드림)
├── schemas.ts           ← 입력 Zod 스키마
├── stage-runner.ts      ← 스테이지 실행기 (건드리지 않음)
├── normalizers.ts       ← 입력 정규화 (건드리지 않음)
├── formatter.ts         ← 출력 포매터 (필드 추가 시)
├── stage-labels.ts      ← UI 스테이지 이름 (건드리지 않음)
├── search-queries.ts    ← 검색 쿼리 생성
├── evaluate-prompt.ts   ← 종합 평가 프롬프트
├── evaluate-stage-prompt.ts ← 스테이지별 평가 프롬프트
├── extract-prompt.ts    ← URL → 구조화 프롬프트
└── samples/             ← 테스트 샘플 JSON
```

### 수정 빈도별 분류

| 빈도 | 파일 | 용도 |
|---|---|---|
| 매일 | `prompts.ts` | 프롬프트 개선 |
| 주 1~2회 | `types.ts`, `pipeline.ts`, `formatter.ts` | 스키마 변경 |
| 월 1회 | `search-queries.ts`, `samples/` | 검색 개선, 샘플 추가 |
| 거의 안 함 | 나머지 | 인프라 변경 시만 |
