import { beforeEach, expect, mock, test } from "bun:test";
import { Prisma } from "@/generated/prisma/client";

mock.module("server-only", () => ({}));
const transaction = mock(async () => "saved");
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({ $transaction: transaction }),
}));
const { serializable } = await import("@/lib/transaction");
const adapterConflict = () =>
  Object.assign(
    new Error("TransactionWriteConflict", {
      cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
    }),
    { name: "DriverAdapterError" },
  );
const work = async () => "saved";
beforeEach(() => {
  transaction.mockReset();
  transaction.mockResolvedValue("saved");
});

test("retries Prisma and direct adapter commit conflicts", async () => {
  transaction.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError("conflict", {
      code: "P2034",
      clientVersion: "7.10.0",
    }),
  );
  transaction.mockRejectedValueOnce(adapterConflict());
  expect(await serializable(work)).toBe("saved");
  expect(transaction).toHaveBeenCalledTimes(3);
});

test("stops retrying after three conflicts with a usable 409", async () => {
  transaction.mockRejectedValue(adapterConflict());
  await expect(serializable(work)).rejects.toMatchObject({ status: 409 });
  expect(transaction).toHaveBeenCalledTimes(3);
});

test("unrelated database and application errors are preserved without retry", async () => {
  for (const error of [
    new Error("disconnected"),
    Object.assign(
      new Error("constraint", { cause: { kind: "UniqueConstraintViolation" } }),
      { name: "DriverAdapterError" },
    ),
  ]) {
    transaction.mockClear();
    transaction.mockRejectedValue(error);
    await expect(serializable(work)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  }
});
