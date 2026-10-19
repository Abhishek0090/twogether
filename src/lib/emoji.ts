/** The six one-tap reactions in the message menu. The full picker comes from emoji-picker-react. */
export const QUICK_REACTIONS = ["❤️", "😂", "😍", "😮", "😢", "🙏"];

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:\u{FE0F}|\u{200D}|\p{Emoji_Modifier}|\p{Extended_Pictographic})*|\s)+$/u;

/** 1-3 emoji and nothing else: shown large, like WhatsApp. */
export function isBigEmoji(text: string | null) {
  if (!text || text.length > 24 || !EMOJI_ONLY.test(text)) return false;
  const count = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim())].filter((s) => s.segment.trim()).length;
  return count <= 3;
}
