# M4 AI Summary — Research Brief

**Date:** 2026-04-24
**Purpose:** Inform M4 (AI summary + action items) brainstorm + spec. No implementation yet.

---

## 1. `SystemLanguageModel.default` API shape

Minimal Swift M4 invocation on macOS 26:

```swift
import FoundationModels

switch SystemLanguageModel.default.availability {
case .available:
    let session = LanguageModelSession(instructions: "…")
    let response = try await session.respond(to: prompt)
    // response.content : String
case .unavailable(let reason):
    // reason: .appleIntelligenceNotEnabled | .deviceNotEligible | .modelNotReady
    // set meeting.ai.summaryGenerated = false
}
```

`SystemLanguageModel.default.availability` returns a `SystemLanguageModel.Availability` enum with `.available` and `.unavailable(UnavailableReason)` — three reason cases. Exactly the gate the spec needs.

## 2. Structured output for action items

**Recommended:** `@Generable` macro + `session.respond(to:, generating: [ActionItem].self)`. The macro emits a compile-time `generationSchema` and initializer, so the runtime uses **constrained decoding** — the model is forced onto the schema path instead of producing free-form JSON. Significantly more reliable than free-prompt-then-`JSONDecoder`, which fails on truncation and punctuation drift.

For Moment:

```swift
@Generable
struct ActionItem {
    let text: String
    @Guide(description: "assignee name or nil if unspecified")
    let assignee: String?
    @Guide(description: "due date in ISO 8601 or nil")
    let due: String?
}
```

Request `[ActionItem].self`. Markdown summary stays as plain `String`.

## 3. Prompt engineering for meeting summaries

`LanguageModelSession(instructions:)` plays the system-role slot — put persona + output constraints there:

> "You are a concise meeting note-taker. Output 5–10 bullet points summarizing key decisions and topics, then 3–5 action items with assignees where mentioned."

Per-call `respond(to:)` carries the transcript + metadata.

**Hard constraint:** the on-device `foundation-small` model has a **~4,096-token total budget** covering instructions + prompt + response combined — not per message. Apple exposes no public tokenizer; monitor via heuristic (4 chars/token) and trigger at ~70% (Apple TN3193 pattern).

## 4. Ukrainian / multilingual handling

**Ukrainian is not supported.** `SystemLanguageModel.supportedLanguages` on macOS 26 ships 23 locales — English, German, Spanish, French, Italian, Portuguese, Japanese, Korean, Chinese (TW/HK/CN), Dutch, Swedish, Turkish, Danish, Norwegian, Vietnamese. **No `uk`, no `uk-UA`**. Calling `respond(to:)` with Ukrainian input throws `LanguageModelSession.GenerationError.unsupportedLanguageOrLocale`.

**Recommended UX for Moment:** **skip summary with honest reason**:

```json
"ai": {
  "summaryGenerated": false,
  "reason": "unsupportedLanguage",
  "transcriptLocale": "uk-UA"
}
```

Do **not** silently translate to English — matches the user's Ukrainian-first principle. Surface "AI summary unavailable for Ukrainian — Apple Foundation Models 23 locales only" in the M5 dashboard. Re-enable when Apple adds `uk` in future macOS releases.

## 5. Failure modes + timeout

A 30-min meeting (~10k words ≈ 12–15k tokens) **will not fit** in the 4,096-token window → `GenerationError.exceededContextWindowSize` is thrown (Apple returns an error, does not auto-trim).

**Required pattern: summarize-of-summaries.** Chunk transcript into ~2,500-token segments (leaves ~1,500 for instructions + output), summarize each in isolated `LanguageModelSession`s, then summarize the summaries. Action-items extraction runs once on the final concatenated summary.

**Timeout & cancellation:** FoundationModels has no built-in timeout. Wrap each call in `Task` + `Task.withTimeout` / `Task.cancel()`; in streaming mode use `for try await chunk in session.streamResponse(to:) { guard !Task.isCancelled else { break } }`.

Recommended budget: **30 s per chunk, 180 s total** (5–8 chunks + rollup for a 30-min meeting). On timeout or cancellation, write `ai.summaryGenerated = false, reason = "timeout"` and keep `transcript.txt` intact.

---

## Key design implications for M4 brainstorm

1. **Two-session architecture inside sidecar** — summary session + action-items session; isolated so a schema failure in one doesn't poison the other. Both use `@Generable` where structure is needed.
2. **Transcript length triage at entry** — count chars, estimate tokens (~4 chars/token), if >2,500 go chunked-then-rollup; else one-shot. Expose `ai.strategy = "oneshot" | "chunked"` in `meeting.json`.
3. **UA-first product → M4 is opt-in for UA users** — meetings in `uk` finalize without AI, same IPC/UX path as `deviceNotEligible`. Don't block the feature on UA coverage; ship English/EU-language summaries day-one.
4. **Timeout budget matches M2's exponential-backoff supervisor** — sidecar request IDs already support cancellation; M4 piggy-backs on the existing `tokio::select!` cancel path. No new supervisor surface needed.
5. **Availability must be checked before session start, not before IPC** — check `SystemLanguageModel.default.availability` on sidecar boot, publish state via existing `availability` op, Rust caches it and short-circuits M4 requests to `unavailable` without round-trip cost.

## Sources

- [Apple — SystemLanguageModel](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel)
- [Artem Novichkov — Getting Started](https://artemnovichkov.com/blog/getting-started-with-apple-foundation-models)
- [Ottorino Bruni guide](https://www.ottorinobruni.com/getting-started-with-apple-foundation-models-for-local-ai-in-swiftui/)
- [Apple — Generable](https://developer.apple.com/documentation/foundationmodels/generable)
- [WWDC25 — Deep dive into Foundation Models](https://developer.apple.com/videos/play/wwdc2025/301/)
- [Livsy — @Generable and @Guide](https://livsycode.com/swiftui/exploring-the-generable-and-guide-macros-in-foundationmodels/)
- [Majid — Structured Content](https://swiftwithmajid.com/2025/08/26/building-ai-features-using-foundation-models-structured-content/)
- [Apple TN3193 — Managing context window](https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window)
- [zats.io — making the most of the context window](https://zats.io/blog/making-the-most-of-apple-foundation-models-context-window/)
- [Apple — Supporting languages and locales](https://developer.apple.com/documentation/foundationmodels/supporting-languages-and-locales-with-foundation-models)
- [Apple — unsupportedLanguageOrLocale](https://developer.apple.com/documentation/foundationmodels/languagemodelsession/generationerror/unsupportedlanguageorlocale(_:)/)
- [Apple — exceededContextWindowSize](https://developer.apple.com/documentation/foundationmodels/languagemodelsession/generationerror/exceededcontextwindowsize(_:)/)
- [swiftyplace — chatbot + streaming patterns](https://www.swiftyplace.com/blog/foundation-models-framework)
