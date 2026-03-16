# 아키텍처: 워크벤치 vs 소비자 앱

## 현재 상태

```
bullini-layer-stripping-mod/
└── src/
    ├── lib/insight/          ← 파이프라인 엔진 (재사용 가능)
    │   ├── prompts.ts
    │   ├── pipeline.ts
    │   ├── types.ts
    │   └── ...
    └── components/
        └── insight-workbench.tsx  ← 개발자 도구 (소비자 아님)
```

`insight-workbench.tsx`는 1,900줄짜리 단일 컴포넌트로:
- 스테이지별 모델/온도/토큰 설정
- Raw JSON 입력/편집
- 프롬프트 실시간 편집
- 스테이지별 개별 실행 + 캐시
- 평가 체크리스트

이건 소비자가 볼 화면이 아닙니다.

## 목표 구조

```
bullini-layer-stripping-mod/
└── src/
    ├── lib/insight/              ← 공유 엔진 (변경 없음)
    │   ├── prompts.ts
    │   ├── pipeline.ts
    │   ├── types.ts
    │   └── ...
    │
    ├── app/
    │   ├── workbench/            ← 개발자 도구 (기존)
    │   │   └── page.tsx          ← InsightWorkbench 마운트
    │   │
    │   └── stress-test/          ← 소비자 앱 (신규)
    │       └── page.tsx          ← StressTestApp 마운트
    │
    └── components/
        ├── insight-workbench.tsx  ← 개발자 도구 (기존 유지)
        │
        └── stress-test/           ← 소비자 컴포넌트 (신규)
            ├── news-input.tsx     ← URL 입력 + 로딩
            ├── impact-card.tsx    ← 종목별 영향 카드
            ├── hypothesis-panel.tsx ← 경쟁 가설 뷰
            ├── trigger-timeline.tsx ← Watch Trigger 타임라인
            └── comparison-view.tsx  ← 이전 분석 비교
```

## 분리 원칙

### 공유하는 것 (lib/insight/)

| 모듈 | 이유 |
|---|---|
| `pipeline.ts` | 파이프라인 실행 로직. 양쪽 동일. |
| `prompts.ts` | 프롬프트. 양쪽 동일. |
| `types.ts` | 타입. 양쪽 동일. |
| `search-queries.ts` | 검색 쿼리 생성. 양쪽 동일. |

### 분리하는 것

| 워크벤치 (개발자) | 소비자 앱 |
|---|---|
| Raw JSON 편집 | URL 입력만 |
| 스테이지별 설정/실행 | 전체 파이프라인 자동 실행 |
| 프롬프트 실시간 편집 | 프롬프트 노출 안 함 |
| 평가 체크리스트 | 없음 |
| 모든 스테이지 출력 표시 | FinalOutput만 표시 |
| General/Personalized 토글 | 포트폴리오 유무로 자동 전환 |

## 소비자 앱 UX 플로우

```
[화면 1: 입력]
┌─────────────────────────────┐
│  📰 뉴스 URL 붙여넣기       │
│  ┌───────────────────────┐  │
│  │ https://...           │  │
│  └───────────────────────┘  │
│         [Stress Test]       │
└─────────────────────────────┘

[화면 2: 분석 중]
┌─────────────────────────────┐
│  분석 중...                  │
│  ████████░░░░░  Step 5/9    │
└─────────────────────────────┘

[화면 3: 결과 — General Mode]
┌─────────────────────────────┐
│  IEEPA 무효화 빈자리를 301  │
│  조가 대체. 법적 근거 강화. │
│                             │
│  영향받는 기업               │
│  ┌─────────────────────┐   │
│  │ 삼성전자  direct  ▼ │ [+ 보유 중] │
│  │ SK하이닉스 direct ▼ │ [+ 보유 중] │
│  │ 현대차    direct  ▼ │ [+ 보유 중] │
│  └─────────────────────┘   │
│                             │
│  ▶ 경쟁 해석 (3)           │
│  ▶ 핵심 불확실성 (2)       │
│  ▶ Premortem               │
│                             │
│  ┌─ 2개 종목 추가됨 ──────┐ │
│  │ [맞춤 Stress Test 재실행] │ │
│  └────────────────────────┘ │
└─────────────────────────────┘

[화면 4: 결과 — Personalized Mode]
┌─────────────────────────────┐
│  [삼성전자] 보유 중 — direct │
│  오늘: 301조 직접 대상       │
│  다음 확인: 4/15 의견접수    │
│  ├─ 확인되면 → 25% 관세     │
│  └─ 아니면 → 15% 유지       │
│                             │
│  [SK하이닉스] 보유 중 — direct │
│  ...                        │
│                             │
│  ▶ 경쟁 해석 (3)           │
│  ▶ 과거 사례 (2)           │
│  ▶ Premortem               │
└─────────────────────────────┘
```

## 소비자 앱 구현 계획

### Phase 1: 최소 소비자 앱 (현재 가능)

기존 `lib/insight/` 엔진을 그대로 사용하되, 소비자용 컴포넌트만 새로 만듦.

```typescript
// stress-test/page.tsx (간략)
import { runInsightPipeline } from "@/lib/insight/pipeline";

// 1. URL → extract → rawJson 생성 (기존 extract-prompt.ts 사용)
// 2. runInsightPipeline(rawJson) 호출
// 3. FinalOutput을 소비자 컴포넌트로 렌더링
```

필요한 신규 컴포넌트:
- `news-input.tsx`: URL 입력 + 로딩 상태 (50줄)
- `impact-card.tsx`: 종목별 카드 + 보유 토글 (100줄)
- `hypothesis-panel.tsx`: 경쟁 가설 accordion (60줄)
- `trigger-timeline.tsx`: Watch Trigger 타임라인 (80줄)

예상 작업량: 300~400줄 신규 코드. 파이프라인 변경 없음.

### Phase 2: 서버 + 인증 (나중)

- 사용자 계정 + 포트폴리오 저장
- Watch Trigger 알림 (이메일/푸시)
- 분석 이력 DB 저장
- API rate limiting

### Phase 3: 모바일 최적화 (나중)

- 카드 기반 스와이프 UI
- 푸시 알림 연동
- 오프라인 캐시

## 개발자 도구 vs 소비자 앱 동시 운영

```
npm run dev
  → localhost:3000/workbench    ← 개발자 (기존)
  → localhost:3000/stress-test  ← 소비자 (신규)
```

프롬프트 변경 → 워크벤치에서 테스트 → 소비자 앱에 자동 반영 (같은 prompts.ts 공유).
