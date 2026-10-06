import { ArrowUpRight, List, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { PageHeader } from "@/components/layout/page-header";
import { MoodBadge } from "@/components/mood/mood-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { memberHref } from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { getSocialMembers } from "@/lib/social-data";
import { resolveLegacyFocus } from "@/lib/social-routing";
import { formatReplyTime } from "@/lib/time";

export const metadata: Metadata = { title: "Squad" };
export default async function SquadPage({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string; focus?: string; view?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const params = await searchParams;
  const focus =
    typeof params.focus === "string" && params.focus.length <= 100
      ? params.focus
      : undefined;
  if (
    typeof params.circle === "string" &&
    params.circle !== membership.circleId
  ) {
    const allowed = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: params.circle },
      },
    });
    if (!allowed) notFound();
    return <CircleDestination circleId={params.circle} focusId={focus} />;
  }
  const circleId = membership.circleId;
  if (focus) {
    const destination = await resolveLegacyFocus(circleId, focus);
    if (!destination) notFound();
    redirect(destination);
  }
  const view = params.view === "log" ? "log" : "members";
  const [members, memberCount, events] = await Promise.all([
    view === "members" ? getSocialMembers(circleId) : [],
    getPrisma().membership.count({ where: { circleId } }),
    view === "log"
      ? getPrisma().activityEvent.findMany({
          where: { circleId },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { actor: { select: { name: true } } },
        })
      : [],
  ]);
  return (
    <>
      <PageHeader
        title="Squad"
        description={`${memberCount} ${memberCount === 1 ? "member" : "members"} in this circle. See who showed up today.`}
        actions={
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href="/squad?view=log" />}
            aria-current={view === "log" ? "page" : undefined}
          >
            <List data-icon="inline-start" />
            Activity log
          </Button>
        }
      />
      <nav className="line-tabs" aria-label="Squad sections">
        <Link
          href="/squad"
          className="line-tab"
          aria-current={view === "members" ? "page" : undefined}
        >
          <Users className="size-4" />
          Members
        </Link>
      </nav>
      {view === "members" && (
        <div className="flex flex-col">
          {members.map((member) => {
            const done = member.tasks.filter(
              (task) => task.status === "DONE",
            ).length;
            const valence = member.valence;
            return (
              <Link
                key={member.id}
                href={memberHref(circleId, member.id, "tasks")}
                className="flex items-start gap-3 border-b py-5"
              >
                <Avatar className="size-12">
                  <AvatarImage src={member.image ?? undefined} alt="" />
                  <AvatarFallback>{member.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {member.name}
                    {member.id === session.user.id ? " (you)" : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {member.tasks.length
                      ? `${done}/${member.tasks.length} tasks done`
                      : "No tasks today"}
                  </p>
                  {member.note && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {member.note}
                    </p>
                  )}
                  {member.signal &&
                    (valence == null ? (
                      <Badge className="mt-2" variant="secondary">
                        Checked in
                      </Badge>
                    ) : (
                      <MoodBadge className="mt-2" valence={valence} />
                    ))}
                </div>
                <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
      {view === "log" && (
        <section>
          <h2 className="mb-4 font-semibold">Activity log</h2>
          {events.length ? (
            events.map((event) => (
              <div key={event.id} className="border-b py-4">
                <p className="text-sm leading-relaxed">
                  <strong>{event.actor.name}</strong> {event.summary}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatReplyTime(event.createdAt)}
                </p>
              </div>
            ))
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              Your circle’s activity will appear here.
            </p>
          )}
        </section>
      )}
    </>
  );
}
