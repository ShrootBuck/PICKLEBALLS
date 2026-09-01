import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/invites";
import PickleBallsApp from "./pickle-balls-app";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <PickleBallsApp
      currentUser={{
        name: session.user.name,
        email: session.user.email,
        initials: session.user.initials ?? initials(session.user.name) ?? "PB",
        isAdmin: isAdminEmail(session.user.email),
      }}
    />
  );
}
