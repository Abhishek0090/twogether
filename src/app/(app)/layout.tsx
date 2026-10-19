import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app/AppProvider";
import { AppShell } from "@/components/app/AppShell";
import { currentUser } from "@/server/api";
import { getCouple, getPartner, toCouple, toMe, toPublicUser } from "@/server/users";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const partner = getPartner(user);
  const couple = user.couple_id ? getCouple(user.couple_id) : undefined;
  if (!partner || !couple) redirect("/pair");

  return (
    <AppProvider initial={{ me: toMe(user), partner: toPublicUser(partner), couple: toCouple(couple) }}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
