import { redirect } from "next/navigation";
import { currentUser } from "@/server/api";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await currentUser()) redirect("/");
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-linear-to-br from-rose-50 via-white to-pink-50 px-4 py-10 dark:from-night dark:via-night dark:to-[#1a0d14]">
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-rose-300/30 blur-3xl dark:bg-rose-600/15" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-pink-300/30 blur-3xl dark:bg-pink-600/10" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="mb-4 size-20 rounded-3xl shadow-xl shadow-rose-500/30" />
          <h1 className="text-3xl font-bold tracking-tight">Twogether</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">A private little world for the two of you.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
