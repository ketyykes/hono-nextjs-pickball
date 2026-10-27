import { describe, it, expect } from "vitest";
import {
  HISTORY_RANGES,
  computeRangeCutoffs,
  rangeBounds,
  rangeOfTime,
} from "../../src/matchmaker/history-range";

// 一律以本地時間建構 now，使測試在任何執行機器的時區皆成立。
// 涵蓋：跨月週（2026-08-01，本月為空區間）、一般月中（2026-08-15）、
// 月初週二（2026-09-01）、週日（2026-08-09）、週一（2026-08-10，本週為空區間）、跨年（2027-01-05）。
const NOW_SAMPLES: Date[] = [
  new Date(2026, 7, 1, 10, 30),
  new Date(2026, 7, 15, 12, 0),
  new Date(2026, 8, 1, 8, 0),
  new Date(2026, 7, 9, 23, 59, 59, 999),
  new Date(2026, 7, 10, 0, 0, 0, 0),
  new Date(2027, 0, 5, 23, 59, 59, 999),
];

/** 時間 t 是否落在 [from, to)；null 代表該端無界。 */
function isInBounds(time: number, bounds: { from: number | null; to: number | null }): boolean {
  const aboveFrom = bounds.from === null || time >= bounds.from;
  const belowTo = bounds.to === null || time < bounds.to;
  return aboveFrom && belowTo;
}

/** 每個切點本身與前後 1 毫秒，加上極端值與「現在」前後，構成時間樣本。 */
function buildTimeSamples(now: Date): number[] {
  const { c0, c1, c2, c3 } = computeRangeCutoffs(now);
  const samples: number[] = [
    new Date(1970, 0, 1).getTime(),
    new Date(2100, 0, 1).getTime(),
    now.getTime(),
    now.getTime() + 1,
    now.getTime() + 24 * 60 * 60 * 1000,
  ];
  for (const cutoff of [c0, c1, c2, c3]) {
    samples.push(cutoff - 1, cutoff, cutoff + 1);
  }
  // 各切點之間的中點，確保每個非空區間內部也有樣本。
  samples.push(Math.floor((c0 + c1) / 2), Math.floor((c1 + c2) / 2), Math.floor((c2 + c3) / 2));
  return samples;
}

describe("rangeBounds", () => {
  it("rangeBounds 與 rangeOfTime 對任意時間判定一致", () => {
    for (const now of NOW_SAMPLES) {
      for (const time of buildTimeSamples(now)) {
        for (const range of HISTORY_RANGES) {
          const byRangeOfTime = rangeOfTime(time, now) === range;
          const byBounds = isInBounds(time, rangeBounds(range, now));
          expect(byBounds, `now=${now.toISOString()} t=${time} range=${range}`).toBe(byRangeOfTime);
        }
      }
    }
  });

  it("五個區間的 rangeBounds 首尾相接且兩端無界", () => {
    for (const now of NOW_SAMPLES) {
      const today = rangeBounds("today", now);
      const thisWeek = rangeBounds("thisWeek", now);
      const thisMonth = rangeBounds("thisMonth", now);
      const lastMonth = rangeBounds("lastMonth", now);
      const earlier = rangeBounds("earlier", now);

      expect(today.from).toBe(thisWeek.to);
      expect(thisWeek.from).toBe(thisMonth.to);
      expect(thisMonth.from).toBe(lastMonth.to);
      expect(lastMonth.from).toBe(earlier.to);
      expect(today.to).toBeNull();
      expect(earlier.from).toBeNull();
    }
  });
});
