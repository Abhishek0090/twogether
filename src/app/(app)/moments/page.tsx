import type { Metadata } from "next";
import { MomentsView } from "@/components/moments/MomentsView";

export const metadata: Metadata = { title: "Moments - Twogether" };

export default async function MomentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <MomentsView initialTab={tab === "starred" || tab === "files" || tab === "links" ? tab : "media"} />;
}
