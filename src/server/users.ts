import type { Couple, Me, PublicUser } from "@/lib/types";
import { one } from "./db";

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
  created_at: number;
}

export interface CoupleRow {
  id: number;
  invite_code: string | null;
  anniversary: string | null;
  wallpaper: string;
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

export function getUser(id: number) {
  return one<UserRow>("SELECT * FROM users WHERE id = ?", id);
}

export function getCouple(id: number) {
  return one<CoupleRow>("SELECT * FROM couples WHERE id = ?", id);
}

/** The other member of the user's couple, if they have joined. */
export function getPartner(user: Pick<UserRow, "id" | "couple_id">) {
  if (!user.couple_id) return undefined;
  return one<UserRow>("SELECT * FROM users WHERE couple_id = ? AND id != ?", user.couple_id, user.id);
}

/** Display name of `user` as seen by their partner (the partner's nickname wins). */
export function nameForPartner(user: UserRow) {
  const partner = getPartner(user);
  return partner?.partner_nickname || user.name;
}
