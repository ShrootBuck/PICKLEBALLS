import { describe, expect, test } from "bun:test";
import {
  parseTimeblockDraft,
  type TimeblockDraftRow,
} from "@/lib/timeblock-draft";
import {
  applyBlockEdit,
  blockIssue,
  draftFingerprint,
  overlappingIds,
} from "@/lib/timeblock-editor";

const proof: TimeblockDraftRow = {
  id: "proof-1",
  title: "Physics",
  startedAt: "2026-09-08T16:00",
  completedAt: "2026-09-08T17:00",
  included: true,
  status: "VERIFIED",
};
const manual: TimeblockDraftRow = {
  ...proof,
  id: "manual-1",
  title: "Reading",
  status: null,
  startedAt: "2026-09-08T17:00",
  completedAt: "2026-09-08T18:00",
};
const due = "2026-09-14";

describe("timeblock editing", () => {
  test("batch edits preserve proof status and unrelated blocks", () => {
    const rows = [proof, manual];
    const result = applyBlockEdit(
      rows,
      {
        summary: "Rename physics",
        upserts: [{ ...proof, title: "Physics problem set" }],
        removeIds: [],
      },
      due,
    );
    expect(result[0].status).toBe("VERIFIED");
    expect(result[0].title).toBe("Physics problem set");
    expect(result[1]).toEqual(manual);
    expect(rows[0]).toEqual(proof);
  });
  test("removing proof excludes it; removing manual work deletes it", () => {
    expect(
      applyBlockEdit(
        [proof, manual],
        {
          summary: "Remove both",
          upserts: [],
          removeIds: [proof.id, manual.id],
        },
        due,
      ),
    ).toEqual([{ ...proof, included: false }]);
  });
  test("invalid batch fails atomically", () => {
    const rows = [proof];
    expect(() =>
      applyBlockEdit(
        rows,
        {
          summary: "Invalid",
          upserts: [
            { ...proof, title: "Changed" },
            { ...manual, completedAt: manual.startedAt },
          ],
          removeIds: [],
        },
        due,
      ),
    ).toThrow();
    expect(rows).toEqual([proof]);
  });
  test("rejects nonexistent removals, duplicate edits and forged IDs", () => {
    expect(() =>
      applyBlockEdit(
        [proof],
        { summary: "Remove", upserts: [], removeIds: ["unknown"] },
        due,
      ),
    ).toThrow();
    expect(() =>
      applyBlockEdit(
        [proof],
        { summary: "Duplicate", upserts: [proof], removeIds: [proof.id] },
        due,
      ),
    ).toThrow();
    expect(() =>
      applyBlockEdit(
        [],
        { summary: "New", upserts: [proof], removeIds: [] },
        due,
      ),
    ).toThrow();
  });
  test("enforces 56 blocks, permits replacing a removed block at capacity", () => {
    const rows = Array.from({ length: 56 }, (_, i) => ({
      ...manual,
      id: `manual-${i}`,
    }));
    const edit = {
      summary: "Add",
      upserts: [{ ...manual, id: "manual-new" }],
      removeIds: [] as string[],
    };
    expect(() => applyBlockEdit(rows, edit, due)).toThrow("56");
    expect(
      applyBlockEdit(rows, { ...edit, removeIds: ["manual-0"] }, due),
    ).toHaveLength(56);
  });
  test("matches PDF timing constraints including overnight week boundaries", () => {
    expect(
      blockIssue(
        {
          ...manual,
          startedAt: "2026-09-06T23:30",
          completedAt: "2026-09-07T00:30",
        },
        due,
      ),
    ).toBeNull();
    expect(
      blockIssue(
        {
          ...manual,
          startedAt: "2026-09-13T23:30",
          completedAt: "2026-09-14T00:30",
        },
        due,
      ),
    ).toBeNull();
    expect(
      blockIssue(
        {
          ...manual,
          startedAt: "2026-09-14T00:00",
          completedAt: "2026-09-14T01:00",
        },
        due,
      ),
    ).not.toBeNull();
    expect(
      blockIssue(
        {
          ...manual,
          startedAt: "2026-09-08T12:00",
          completedAt: "2026-09-09T12:01",
        },
        due,
      ),
    ).not.toBeNull();
    expect(
      blockIssue({ ...manual, startedAt: "2026-09-08T24:00" }, due),
    ).not.toBeNull();
    expect(blockIssue({ ...manual, title: "  " }, due)).not.toBeNull();
  });
  test("overlaps ignore adjacent and excluded blocks, include overnight work", () => {
    expect([...overlappingIds([proof, manual])]).toEqual([]);
    expect([
      ...overlappingIds([proof, { ...manual, startedAt: "2026-09-08T16:30" }]),
    ]).toEqual([proof.id, manual.id]);
    expect([
      ...overlappingIds([
        proof,
        { ...manual, startedAt: "2026-09-08T16:30", included: false },
      ]),
    ]).toEqual([]);
    expect([
      ...overlappingIds([
        {
          ...proof,
          startedAt: "2026-09-07T23:00",
          completedAt: "2026-09-08T01:00",
        },
        {
          ...manual,
          startedAt: "2026-09-08T00:30",
          completedAt: "2026-09-08T02:00",
        },
      ]),
    ]).toHaveLength(2);
  });
  test("fingerprint is stable across serialization but detects intervening edits", () => {
    const rows = [proof, manual];
    const restored = parseTimeblockDraft(JSON.stringify({ version: 1, rows }));
    expect(restored).not.toBeNull();
    expect(draftFingerprint(restored ?? [])).toBe(draftFingerprint(rows));
    expect(draftFingerprint([{ ...proof, included: false }, manual])).not.toBe(
      draftFingerprint(rows),
    );
  });
});
