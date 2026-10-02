import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import {
  AdminSearch,
  formatNumber,
  Pagination,
  Person,
  RelativeTime,
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
  latestDate,
  listAdminUsers,
} from "@/lib/super-admin-data";

export const metadata: Metadata = { title: "Users" };

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const query = adminQuery(params.q);
  const page = adminPage(params.page);
  const { total, users } = await listAdminUsers(query, page);
  return (
    <>
      <PageHeader
        title="Users"
        description={
          query
            ? `${formatNumber(total)} ${total === 1 ? "user matches" : "users match"} “${query}”.`
            : `${formatNumber(total)} ${total === 1 ? "person has" : "people have"} signed up.`
        }
        actions={
          <AdminSearch
            action="/superadmin/users"
            query={query}
            placeholder="Name, email, Discord, or ID"
          />
        }
      />
      <Card className="py-0">
        <CardContent className="px-0">
          {users.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">User</TableHead>
                  <TableHead className="text-right">Circles</TableHead>
                  <TableHead className="text-right">Tasks</TableHead>
                  <TableHead className="text-right">Proofs</TableHead>
                  <TableHead className="text-right">Check-ins</TableHead>
                  <TableHead className="text-right">Comments</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="pr-5">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="max-w-72 pl-5">
                      <Person
                        user={user}
                        detail={
                          user.discordUsername
                            ? `@${user.discordUsername}`
                            : user.email
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user._count.memberships}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(user._count.commitments)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(user._count.proofs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(user._count.checkInUpdates)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(user._count.socialReplies)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <RelativeTime
                        date={latestDate(
                          user.sessions[0]?.updatedAt,
                          user.activities[0]?.createdAt,
                        )}
                      />
                    </TableCell>
                    <TableCell className="pr-5 text-muted-foreground">
                      <RelativeTime date={user.createdAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">No users found.</p>
          )}
        </CardContent>
      </Card>
      <Pagination
        basePath="/superadmin/users"
        query={query}
        page={page}
        total={total}
      />
    </>
  );
}
