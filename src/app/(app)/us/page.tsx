import type { Metadata } from "next";
import { UsView } from "@/components/us/UsView";

export const metadata: Metadata = { title: "Us - Twogether" };

export default function UsPage() {
  return <UsView />;
}
