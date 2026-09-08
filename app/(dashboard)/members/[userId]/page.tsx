import type { Metadata } from "next";
import {
  MemberProfile,
  type ProfileParams,
} from "@/components/social/member-profile";
export const metadata: Metadata = { title: "Member profile" };
export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<ProfileParams>;
}) {
  return (
    <MemberProfile userId={(await params).userId} params={await searchParams} />
  );
}
