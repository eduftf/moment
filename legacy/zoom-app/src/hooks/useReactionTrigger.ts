import { useEffect, useRef, useCallback } from "react";
import zoomSdk from "@zoom/appssdk";

const DEBOUNCE_MS = 5000;

interface UseReactionTriggerOptions {
  enabled: boolean;
  onTrigger: (emoji: string, unicode: string) => void;
  /** If set and non-empty, only these unicode values trigger. If undefined or empty, ALL reactions trigger. */
  allowedReactions?: string[];
}

export function useReactionTrigger({ enabled, onTrigger, allowedReactions }: UseReactionTriggerOptions) {
  const lastTriggerRef = useRef<number>(0);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const allowedRef = useRef(allowedReactions);
  allowedRef.current = allowedReactions;

  const handler = useCallback((event: { emoji?: string; unicode?: string; reaction?: { emoji?: string; unicode?: string } }) => {
    // Support both onReaction (event.unicode) and onEmojiReaction (event.reaction.unicode)
    const unicode = event.unicode ?? event.reaction?.unicode;
    if (!unicode) return;

    const emoji = event.emoji ?? event.reaction?.emoji ?? unicode;

    // Filter by allowedReactions if configured
    const allowed = allowedRef.current;
    if (allowed && allowed.length > 0 && !allowed.includes(unicode)) return;

    const now = Date.now();
    if (now - lastTriggerRef.current < DEBOUNCE_MS) return;

    lastTriggerRef.current = now;
    onTriggerRef.current(emoji, unicode);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Try newer API first, fall back to older
    try {
      zoomSdk.addEventListener("onEmojiReaction", handler);
    } catch {
      // fallback
    }
    try {
      zoomSdk.addEventListener("onReaction", handler);
    } catch {
      // fallback
    }

    return () => {
      try { zoomSdk.removeEventListener("onEmojiReaction", handler); } catch {}
      try { zoomSdk.removeEventListener("onReaction", handler); } catch {}
    };
  }, [enabled, handler]);
}
