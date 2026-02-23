import { useEffect, useRef, useCallback } from "react";
import zoomSdk from "@zoom/appssdk";

const THUMBS_UP_UNICODE = "U+1F44D";
const DEBOUNCE_MS = 5000;

interface UseReactionTriggerOptions {
  enabled: boolean;
  onTrigger: () => void;
}

export function useReactionTrigger({ enabled, onTrigger }: UseReactionTriggerOptions) {
  const lastTriggerRef = useRef<number>(0);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const handler = useCallback((event: { unicode?: string; reaction?: { unicode?: string } }) => {
    // Support both onReaction (event.unicode) and onEmojiReaction (event.reaction.unicode)
    const unicode = event.unicode ?? event.reaction?.unicode;
    if (unicode !== THUMBS_UP_UNICODE) return;

    const now = Date.now();
    if (now - lastTriggerRef.current < DEBOUNCE_MS) return;

    lastTriggerRef.current = now;
    onTriggerRef.current();
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
