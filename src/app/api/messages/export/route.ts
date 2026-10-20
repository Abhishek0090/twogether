import { handler, requireCouple } from "@/server/api";
import { all } from "@/server/db";
import { previewText, type MediaRow, type MessageRow } from "@/server/messages";

/** Downloads the whole chat as a plain-text file, like WhatsApp's "Export chat". */
export const GET = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const tz = new URL(req.url).searchParams.get("tz") || "UTC";
  const rows = await all<MessageRow & { media_name: string | null }>(
    `SELECT m.*, md.name AS media_name FROM messages m LEFT JOIN media md ON md.id = m.media_id
     WHERE m.couple_id = ? AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
     ORDER BY m.id`,
    coupleId,
    user.id,
  );
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: tz });
  } catch {
    fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
  }
  const names: Record<number, string> = { [user.id]: user.name, [partner.id]: user.partner_nickname || partner.name };
  const lines = rows.map((r) => {
    const who = r.type === "system" ? "" : `${names[r.sender_id] ?? "?"}: `;
    const what = r.deleted_at ? "This message was deleted" : previewText(r, { name: r.media_name } as MediaRow);
    return `${fmt.format(r.created_at)} - ${who}${what}${r.edited_at ? " (edited)" : ""}`;
  });
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="twogether-chat-${new Date().toISOString().slice(0, 10)}.txt"`,
    },
  });
});
