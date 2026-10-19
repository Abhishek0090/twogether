/* eslint-disable @next/next/no-img-element -- avatars come from our authenticated media API */

const GRADIENTS = [
  "from-rose-400 to-pink-500",
  "from-violet-400 to-fuchsia-500",
  "from-amber-400 to-orange-500",
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
];

export function Avatar({
  src,
  name,
  size = 40,
  online,
  className = "",
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const gradient = GRADIENTS[(name.charCodeAt(0) || 0) % GRADIENTS.length];
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt="" className="size-full rounded-full object-cover" draggable={false} />
      ) : (
        <span
          className={`flex size-full items-center justify-center rounded-full bg-linear-to-br ${gradient} font-semibold text-white`}
          style={{ fontSize: size * 0.38 }}
          aria-hidden
        >
          {initials || "?"}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute right-0 bottom-0 block rounded-full ring-2 ring-white dark:ring-night-2 ${online ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
          style={{ width: Math.max(10, size * 0.26), height: Math.max(10, size * 0.26) }}
          aria-label={online ? "online" : "offline"}
        />
      )}
    </span>
  );
}
