import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  AdminSearch,
  circleHref,
  formatNumber,
  Pagination,
  RelativeTime,
  userHref,
} from "@/components/super-admin/admin-ui";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  adminPage,
  adminQuery,
  listAdminCircles,
} from "@/lib/super-admin-data";

export const metadata: Metadata = { title: "Circles" };

export default async function SuperAdminCirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const query = adminQuery(params.q);
  const page = adminPage(params.page);
  const { total, circles } = await listAdminCircles(query, page);
  return (
    <>
      <PageHeader
        title="Circles"
        description={
          query
            ? `${formatNumber(total)} ${total === 1 ? "circle matches" : "circles match"} “${query}”.`
            : `${formatNumber(total)} ${total === 1 ? "circle exists" : "circles exist"} across the app.`
        }
        actions={
          <AdminSearch
            action="/superadmin/circles"
            query={query}
            placeholder="Name, slug, or ID"
          />
        }
      />
      <Card className="py-0">
        <CardContent className="px-0">
          {circles.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Circle</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Tasks</TableHead>
                  <TableHead className="text-right">Proofs</TableHead>
                  <TableHead className="text-right">Check-ins</TableHead>
                  <TableHead className="text-right">Bucket list</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead className="pr-5">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circles.map((circle) => (
                  <TableRow key={circle.id}>
                    <TableCell className="max-w-64 pl-5">
                      <Link
                        href={circleHref(circle.id)}
                        className="flex min-w-0 flex-col hover:underline"
                      >
                        <span className="truncate font-medium">
                          {circle.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {circle.slug}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-48">
                      {circle.memberships.length ? (
                        <span className="flex min-w-0 flex-wrap gap-x-1.5">
                          {circle.memberships.map(({ user }, index) => (
                            <Link
                              key={user.id}
                              href={userHref(user.id)}
                              className="truncate hover:underline"
                            >
                              {user.name}
                              {index < circle.memberships.length - 1 ? "," : ""}
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {circle._count.memberships}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(circle._count.commitments)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(circle._count.proofs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(circle._count.checkInUpdates)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(circle._count.bucketItems)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <RelativeTime date={circle.activities[0]?.createdAt} />
                    </TableCell>
                    <TableCell className="pr-5 text-muted-foreground">
                      <RelativeTime date={circle.createdAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              No circles found.
            </p>
          )}
        </CardContent>
      </Card>
      <Pagination
        basePath="/superadmin/circles"
        query={query}
        page={page}
        total={total}
      />
    </>
  );
}
