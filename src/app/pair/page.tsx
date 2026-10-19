import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PairView } from "@/components/auth/PairView";
import { currentUser } from "@/server/api";
import { getCouple, getPartner } from "@/server/users";

export const metadata: Metadata = { title: "Connect with your partner - Twogether" };

export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/register?next=${encodeURIComponent(code ? `/pair?code=${code}` : "/pair")}`);
  if (getPartner(user)) redirect("/");
  const couple = user.couple_id ? getCouple(user.couple_id) : undefined;
  return <PairView name={user.name} existingCode={couple?.invite_code ?? null} joinCode={code?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) ?? ""} />;
}
