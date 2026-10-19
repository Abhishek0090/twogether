import { Fragment, type ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
// WhatsApp-style formatting: *bold*, _italic_, ~strike~, `code`.
const FORMAT_RE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;

function formatted(text: string, keyPrefix: string): ReactNode[] {
  return text.split(FORMAT_RE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.length > 2) {
      const inner = part.slice(1, -1);
      if (part.startsWith("*") && part.endsWith("*")) return <strong key={key}>{inner}</strong>;
      if (part.startsWith("_") && part.endsWith("_")) return <em key={key}>{inner}</em>;
      if (part.startsWith("~") && part.endsWith("~")) return <s key={key}>{inner}</s>;
      if (part.startsWith("`") && part.endsWith("`"))
        return (
          <code key={key} className="rounded bg-black/5 px-1 font-mono text-[0.9em] dark:bg-white/10">
            {inner}
          </code>
        );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** Message text with clickable links and simple formatting. Never uses innerHTML. */
export function MessageText({ text, highlight }: { text: string; highlight?: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-sky-600 underline underline-offset-2 dark:text-sky-400"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : highlight ? (
          <Highlighted key={i} text={part} term={highlight} />
        ) : (
          <Fragment key={i}>{formatted(part, String(i))}</Fragment>
        ),
      )}
    </>
  );
}

function Highlighted({ text, term }: { text: string; term: string }) {
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(t); at !== -1 && t; at = lower.indexOf(t, from)) {
    out.push(text.slice(from, at));
    out.push(
      <mark key={at} className="rounded bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">
        {text.slice(at, at + t.length)}
      </mark>,
    );
    from = at + t.length;
  }
  out.push(text.slice(from));
  return <>{out}</>;
}
