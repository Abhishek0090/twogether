import type { Bootstrap, Couple, Me, PublicUser } from "@/lib/types";
import { one } from "./db";
import { coupleTopic, userTopic } from "./realtime";

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  avatar_media_id: number | null;
  partner_nickname: string | null;
  mood_emoji: string | null;
  mood_text: string | null;
  mood_at: number | null;
  couple_id: number | null;
  last_seen: number | null;
  active_until: number;
  channel_key: string;
  created_at: number;
}

export interface CoupleRow {
  id: number;
  invite_code: string | null;
  anniversary: string | null;
  wallpaper: string;
  channel_key: string;
  created_at: number;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_media_id ? `/api/media/${row.avatar_media_id}` : null,
    moodEmoji: row.mood_emoji,
    moodText: row.mood_text,
    moodAt: row.mood_at,
    lastSeen: row.last_seen,
  };
}

export function toMe(row: UserRow): Me {
  return { ...toPublicUser(row), email: row.email, partnerNickname: row.partner_nickname };
}

export function toCouple(row: CoupleRow): Couple {
  return { id: row.id, anniversary: row.anniversary, wallpaper: row.wallpaper, createdAt: row.created_at };
}

/** Everything the signed-in app needs on first load, including this user's secret Realtime channel names. */
export function toBootstrap(user: UserRow, partner: UserRow, couple: CoupleRow): Bootstrap {
  return {
    me: toMe(user),
    partner: toPublicUser(partner),
    couple: toCouple(couple),
    realtime: { userTopic: userTopic(user.channel_key), coupleTopic: coupleTopic(couple.channel_key) },
  };
}

export function getUser(id: number) {
  return one<UserRow>("SELECT * FROM users WHERE id = ?", id);
}

export function getCouple(id: number) {
  return one<CoupleRow>("SELECT * FROM couples WHERE id = ?", id);
}

/** The other member of the user's couple, if they have joined. */
export async function getPartner(user: Pick<UserRow, "id" | "couple_id">) {
  if (!user.couple_id) return undefined;
  return one<UserRow>("SELECT * FROM users WHERE couple_id = ? AND id != ?", user.couple_id, user.id);
}
