import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { timeblockPdfSchema } from "@/lib/schemas";
import { parsePhoenixLocalDateTime } from "@/lib/time";
import { createTimeblockPdf } from "@/lib/timeblock-pdf";
import { isMondayDateKey, timeblockWeek } from "@/lib/timeblocks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const parsed = timeblockPdfSchema.safeParse(await readJson(request));
    if (!parsed.success || !isMondayDateKey(parsed.data?.dueMonday ?? "")) {
      throw new DomainError("Fix the timeblock fields.");
    }
    const week = timeblockWeek(parsed.data.dueMonday);
    const tasks = parsed.data.tasks.map((task) => {
      const startedAt = parsePhoenixLocalDateTime(task.startedAt);
      const completedAt = parsePhoenixLocalDateTime(task.completedAt);
      if (!startedAt || !completedAt || startedAt >= completedAt) {
        throw new DomainError(`Fix the schedule for “${task.title}”.`);
      }
      if (
        completedAt <= week.startAt ||
        startedAt >= week.endAtExclusive ||
        completedAt.getTime() - startedAt.getTime() > 24 * 60 * 60 * 1000
      ) {
        throw new DomainError(
          `“${task.title}” must overlap this week and stay under 24 hours.`,
        );
      }
      return { ...task, startedAt, completedAt };
    });
    const pdf = await createTimeblockPdf({
      studentName: auth.session.user.name,
      dueMonday: parsed.data.dueMonday,
      tasks,
    });
    return new Response(Uint8Array.from(pdf).buffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="timeblock-${parsed.data.dueMonday}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
