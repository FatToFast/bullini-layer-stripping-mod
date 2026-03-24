import type { SearchRoundState } from "@/hooks/use-pipeline-state";
import type { InsightStageName, StageRecord, StageStatus } from "@/lib/insight/types";

function replaceByIndex<T>(items: T[], index: number, nextItem: T): T[] {
  const nextItems = items.slice();
  nextItems[index] = nextItem;
  return nextItems;
}

export function appendStageRecordIfMissing(
  records: StageRecord[],
  stage: InsightStageName,
): StageRecord[] {
  for (const record of records) {
    if (record.stage === stage) {
      return records;
    }
  }

  return [...records, { stage, status: "running", input: null }];
}

export function markStageRecordStatus(
  records: StageRecord[],
  stage: InsightStageName,
  status: StageStatus,
): StageRecord[] {
  const index = records.findIndex((record) => record.stage === stage);
  if (index === -1) {
    return [...records, { stage, status, input: null }];
  }

  if (records[index].status === status) {
    return records;
  }

  return replaceByIndex(records, index, { ...records[index], status });
}

export function upsertStageRecord(
  records: StageRecord[],
  nextRecord: StageRecord,
): StageRecord[] {
  const index = records.findIndex((record) => record.stage === nextRecord.stage);
  if (index === -1) {
    return [...records, nextRecord];
  }

  return replaceByIndex(records, index, nextRecord);
}

export function upsertSearchRound(
  rounds: SearchRoundState[],
  nextRound: SearchRoundState,
): SearchRoundState[] {
  const index = rounds.findIndex((round) => round.round === nextRound.round);
  if (index === -1) {
    return [...rounds, nextRound];
  }

  return replaceByIndex(rounds, index, nextRound);
}
