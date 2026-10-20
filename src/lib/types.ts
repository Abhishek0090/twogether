// Shapes shared by the API, the WebSocket server and the browser.

export type MessageType = "text" | "image" | "video" | "audio" | "file" | "nudge" | "call" | "system";

export type NudgeKind = "hug" | "kiss" | "miss" | "thinking" | "love";

export type TypingState = "typing" | "recording" | null;

export interface MediaInfo {
  id: number;
  mime: string;
  name: string | null;
  size: number;
  url: string;
}

export interface MessageMeta {
  w?: number;
  h?: number;
  /** Seconds, for audio, video and calls. */
  duration?: number;
  /** Call messages: true for video calls. */
  video?: boolean;
  /** Call messages. */
  status?: "missed" | "ended" | "declined";
  /** Waveform peaks (0-1) for voice notes. */
  peaks?: number[];
}

export interface ReplyPreview {
  id: number;
  senderId: number;
  type: MessageType;
  body: string | null;
  deleted: boolean;
  mediaUrl: string | null;
}

export interface Reaction {
  userId: number;
  emoji: string;
}

export interface Message {
  id: number;
  clientId: string | null;
  senderId: number;
  type: MessageType;
  body: string | null;
  media: MediaInfo | null;
  meta: MessageMeta | null;
  replyTo: ReplyPreview | null;
  viewOnce: boolean;
  viewedAt: number | null;
  editedAt: number | null;
  deletedAt: number | null;
  createdAt: number;
  deliveredAt: number | null;
  readAt: number | null;
  reactions: Reaction[];
  starred: boolean;
  // Client-only fields for messages that are still uploading or sending.
  pending?: boolean;
  failed?: boolean;
  progress?: number;
  localUrl?: string;
}

export interface PublicUser {
  id: number;
  name: string;
  avatarUrl: string | null;
  moodEmoji: string | null;
  moodText: string | null;
  moodAt: number | null;
  lastSeen: number | null;
}

export interface Me extends PublicUser {
  email: string;
  /** What this user calls their partner. */
  partnerNickname: string | null;
}

export interface Couple {
  id: number;
  anniversary: string | null;
  wallpaper: string;
  createdAt: number;
}

export interface Bootstrap {
  me: Me;
  partner: PublicUser;
  couple: Couple;
  /** Supabase Realtime channel names: your private one, and the one you share with your partner. */
  realtime: { userTopic: string; coupleTopic: string };
}

export interface SpecialDate {
  id: number;
  title: string;
  date: string;
  emoji: string;
  yearly: boolean;
  createdBy: number;
}

export interface BucketItem {
  id: number;
  title: string;
  doneAt: number | null;
  doneBy: number | null;
  createdBy: number;
  createdAt: number;
}

export interface DailyQuestion {
  day: string;
  question: string;
  myAnswer: string | null;
  /** Hidden until the viewer has answered. */
  partnerAnswer: string | null;
  partnerAnswered: boolean;
}

export type CallSignal =
  | { kind: "offer"; callId: string; video: boolean; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; callId: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; callId: string; candidate: RTCIceCandidateInit }
  | { kind: "end" | "reject" | "busy" | "unavailable" | "ringing"; callId: string };

export type RefreshTopic = "couple" | "dates" | "bucket" | "question";

export type ServerEvent =
  | { t: "message"; message: Message }
  | { t: "message:update"; message: Message }
  | { t: "message:hidden"; ids: number[] }
  | { t: "receipt"; kind: "delivered" | "read"; readerId: number; upTo: number; at: number }
  | { t: "presence"; userId: number; online: boolean; lastSeen: number | null }
  | { t: "refresh"; what: RefreshTopic }
  | { t: "unpaired" };

/** Sent browser to browser on the shared couple channel. `from` is the sender's user id. */
export type PeerEvent =
  | { t: "typing"; from: number; state: TypingState }
  | { t: "call"; from: number; data: CallSignal };
