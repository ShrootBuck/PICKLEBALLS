import type { Metadata } from "next";
import { AdminNav } from "@/components/super-admin/admin-nav";
import { getPageSession } from "@/lib/request";
import { isSuperAdmin, requireSuperAdmin } from "@/lib/super-admin";

// Metadata resolves even when the layout 404s, so only admins get the real title.
export async function generateMetadata(): Promise<Metadata> {
  const session = await getPageSession();
  const robots = { index: false, follow: false };
  if (!session || !(await isSuperAdmin(session.user.id)))
    return { title: "Page not found", robots };
  return {
    title: { template: "%s · Admin console", default: "Admin console" },
    robots,
  };
}

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminNav />
      {children}
    </div>
  );
}
