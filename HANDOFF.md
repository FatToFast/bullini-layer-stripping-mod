# Handoff

## Current status
- Producer-first decision workflow is integrated into the localhost workbench.
- `Decision Benchmark Loop` supports:
  - fixed benchmark scenarios
  - current-article benchmark generation
  - inline benchmark editing
  - saving edited benchmarks locally
  - running evaluator loops
  - history and diff views
- `Decision Pipeline Run` supports:
  - direct execution
  - insight handoff apply
  - saving a decision run
  - converting a decision run into a benchmark case

## Verified localhost
- Verified dev URL: `http://localhost:3001`
- Main page and `/api/decision/benchmark` both respond.

## Important files
- `src/components/decision/benchmark-panel.tsx`
- `src/components/decision/execution-panel.tsx`
- `src/components/decision/workflow-mermaid-panel.tsx`
- `src/components/decision/producer-flow-panel.tsx`
- `src/components/insight-workbench.tsx`
- `src/lib/decision/article-benchmark.ts`
- `src/lib/decision/pipeline.ts`
- `src/lib/decision/benchmark-runner.ts`
- `src/lib/decision/api.ts`
- `app/api/decision/*`
- `DECISION_PIPELINE.md`
- `ARCHITECTURE.md`

## Benchmark generation logic
Current-article benchmark generation now combines:
1. event-type rules
   - policy / supply / demand / commodity / financial / competitor
2. event-angle rules
   - e.g. tariff, export control, shortage, pricing, earnings
3. industry overlays
   - semiconductor
   - automotive_battery
   - energy_utilities
   - platform_software
   - financials
   - healthcare_biotech
4. company/ticker/entity alias hints

This affects generated:
- task
- stakeholders
- context
- success criteria
- expected criteria
- metadata notes

## Local persistence
These are intentionally local-only and now gitignored:
- `decision-runs/`
- `decision-execution-runs/`
- `decision-benchmarks/`

## Useful commands
```bash
npm install
npm run dev -- --port 3001
npm run typecheck
npm run build
```

## Remaining risks
- Industry inference is still heuristic/rule-based.
- Multi-industry articles may collapse into one dominant industry overlay.
- Benchmark editing has no field-level validation UI yet.
- Benchmark runs can take significant time because evaluator calls are real LLM calls.

## Recommended next steps
1. Add field-level validation/warnings in the benchmark editor.
2. Add explicit version diff between saved benchmark drafts.
3. Add richer multi-industry inference and confidence scoring.
4. Add a one-click “run edited benchmark and apply suggested settings” flow.
