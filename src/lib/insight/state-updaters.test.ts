import { describe, expect, it } from "vitest";

import {
  appendStageRecordIfMissing,
  markStageRecordStatus,
  upsertSearchRound,
  upsertStageRecord,
} from "@/lib/insight/state-updaters";
import type { StageRecord } from "@/lib/insight/types";

describe("insight state updaters", () => {
  it("appends a running stage record only when missing", () => {
    const records = appendStageRecordIfMissing([], "layer0_layer1");
    expect(records).toEqual([{ stage: "layer0_layer1", status: "running", input: null }]);
    expect(appendStageRecordIfMissing(records, "layer0_layer1")).toBe(records);
  });

  it("marks an existing stage record running without changing order", () => {
    const records: StageRecord[] = [
      { stage: "layer0_layer1", status: "success", input: null },
      { stage: "event_classification", status: "idle", input: null },
    ];

    expect(markStageRecordStatus(records, "event_classification", "running")).toEqual([
      { stage: "layer0_layer1", status: "success", input: null },
      { stage: "event_classification", status: "running", input: null },
    ]);
  });

  it("upserts stage records by stage key", () => {
    const records: StageRecord[] = [{ stage: "layer0_layer1", status: "running", input: null }];
    expect(
      upsertStageRecord(records, { stage: "layer0_layer1", status: "success", input: null, output: { done: true } }),
    ).toEqual([{ stage: "layer0_layer1", status: "success", input: null, output: { done: true } }]);
  });

  it("upserts search rounds by round key", () => {
    const rounds = [{ round: 1 as const, queries: ["q1"], results: [] }];
    expect(
      upsertSearchRound(rounds, { round: 1, queries: ["q1"], results: [{ id: 1 }], error: undefined }),
    ).toEqual([{ round: 1, queries: ["q1"], results: [{ id: 1 }], error: undefined }]);
  });
});
