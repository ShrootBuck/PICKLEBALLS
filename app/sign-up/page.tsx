import { redirect } from "next/navigation";

export default async function SignUpPage() {
  redirect("/sign-in?invite=required");
}
