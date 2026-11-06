import { redirect } from "next/navigation";
import { getServerWorkspaceContext } from "@/lib/workspace";

export default async function HomePage() {
  const ctx = await getServerWorkspaceContext();
  if (ctx) {
    redirect("/dashboard");
  }
  redirect("/login");
}
