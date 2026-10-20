import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app/AppProvider";
import { AppShell } from "@/components/app/AppShell";
import { currentUser } from "@/server/api";
import { getCouple, getPartner, toBootstrap } from "@/server/users";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const partner = await getPartner(user);
  const couple = user.couple_id ? await getCouple(user.couple_id) : undefined;
  if (!partner || !couple) redirect("/pair");

  return (
    <AppProvider initial={toBootstrap(user, partner, couple)}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
