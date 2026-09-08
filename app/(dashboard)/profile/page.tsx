import type { Metadata } from "next";
import {
  MemberProfile,
  type ProfileParams,
} from "@/components/social/member-profile";
export const metadata: Metadata = { title: "Your profile" };
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<ProfileParams>;
}) {
  return <MemberProfile params={await searchParams} />;
}
