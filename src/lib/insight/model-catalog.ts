import type { InsightStageName } from "./types";

export type ModelOption = {
  value: string;
  label: string;
  note: string;
};

export type ModelGroup = {
  label: string;
  options: ModelOption[];
};

export const CUSTOM_MODEL_VALUE = "__custom__";

export const MODEL_GROUPS: ModelGroup[] = [
  {
    label: "OpenRouter Popular",
    options: [
      {
        value: "openrouter/auto",
        label: "Auto Router",
        note: "OpenRouter가 프롬프트에 맞춰 상위 모델을 자동 선택",
      },
      {
        value: "x-ai/grok-4.1-fast",
        label: "Grok 4.1 Fast",
        note: "빠른 범용 분석과 긴 컨텍스트에 적합",
      },
      {
        value: "openai/gpt-4.1-mini",
        label: "GPT-4.1 Mini",
        note: "속도와 비용 균형형",
      },
      {
        value: "openai/gpt-4.1",
        label: "GPT-4.1",
        note: "정확도 중심의 강한 범용 모델",
      },
      {
        value: "anthropic/claude-sonnet-4",
        label: "Claude Sonnet 4",
        note: "안정적인 고성능 범용 모델",
      },
      {
        value: "google/gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        note: "고난도 reasoning과 긴 문맥 작업용",
      },
      {
        value: "google/gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        note: "응답 속도와 reasoning 균형형",
      },
    ],
  },
  {
    label: "Reasoning / Heavy",
    options: [
      {
        value: "openai/o3",
        label: "OpenAI o3",
        note: "깊은 reasoning과 복잡한 판단에 적합",
      },
      {
        value: "anthropic/claude-sonnet-4.5",
        label: "Claude Sonnet 4.5",
        note: "코드와 장문 reasoning에 강한 Sonnet 계열",
      },
    ],
  },
  {
    label: "Fast / Cheap",
    options: [
      {
        value: "deepseek/deepseek-chat-v3-0324",
        label: "DeepSeek V3",
        note: "비용 효율이 좋은 작업형 모델 ($0.20/M)",
      },
      {
        value: "deepseek/deepseek-v3.2",
        label: "DeepSeek V3.2",
        note: "최신 DeepSeek, 효율적",
      },
      {
        value: "openai/gpt-4.1-nano",
        label: "GPT-4.1 Nano",
        note: "짧은 구조화 응답에 적합한 경량 모델",
      },
      {
        value: "google/gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        note: "가장 저렴한 Gemini ($0.10/M)",
      },
      {
        value: "google/gemini-3-flash-preview",
        label: "Gemini 3 Flash (preview)",
        note: "차세대 Gemini Flash 프리뷰",
      },
      {
        value: "google/gemini-3.1-flash-lite-preview",
        label: "Gemini 3.1 Flash-Lite (preview)",
        note: "최신 경량 Gemini 프리뷰",
      },
    ],
  },
  {
    label: "Search / Grounded",
    options: [
      {
        value: "perplexity/sonar",
        label: "Perplexity Sonar",
        note: "웹 검색 내장 ($1/M + $5/1K req). 검색 쿼리 생성에 최적",
      },
      {
        value: "perplexity/sonar-pro",
        label: "Perplexity Sonar Pro",
        note: "고품질 검색 내장 ($3/M). 200K 컨텍스트",
      },
      {
        value: "perplexity/sonar-pro-search",
        label: "Sonar Pro Search (OR-exclusive)",
        note: "OpenRouter 전용 고급 검색 모드",
      },
      {
        value: "perplexity/sonar-deep-research",
        label: "Sonar Deep Research",
        note: "다단계 심층 리서치 ($2/M)",
      },
    ],
  },
];

export const TUNABLE_STAGES: InsightStageName[] = [
  "layer0_layer1",
  "event_classification",
  "layer2_reverse_paths",
  "layer3_adjacent_spillover",
  "portfolio_impact",
  "layer4_time_horizon",
  "layer5_structural_premortem",
  "evidence_consolidation",
  "output_formatting",
];
