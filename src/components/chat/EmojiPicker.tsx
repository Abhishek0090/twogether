"use client";

import Picker, { EmojiStyle, SuggestionMode, Theme } from "emoji-picker-react";

/**
 * Full emoji picker (search, categories, skin tones, recents) from emoji-picker-react.
 * Native emoji style keeps it offline: no images are fetched from a CDN.
 */
export function EmojiPicker({ onPick, height = 320 }: { onPick: (emoji: string) => void; height?: number }) {
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return (
    <Picker
      onEmojiClick={(e) => onPick(e.emoji)}
      emojiStyle={EmojiStyle.NATIVE}
      theme={dark ? Theme.DARK : Theme.LIGHT}
      suggestedEmojisMode={SuggestionMode.RECENT}
      lazyLoadEmojis
      autoFocusSearch={false}
      previewConfig={{ showPreview: false }}
      width="100%"
      height={height}
      style={{ border: "none", borderRadius: 0, background: "transparent", "--epr-emoji-size": "28px" } as React.CSSProperties}
    />
  );
}
