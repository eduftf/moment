# M3 Transcript — Research Brief

**Date:** 2026-04-24
**Purpose:** Inform M3 (transcript) brainstorm + spec. No implementation yet.

---

## 1. System audio capture on macOS 26

**Recommended:** ScreenCaptureKit with `SCStreamConfiguration.captureMicrophone = true` (mic + system audio in one stream, macOS 15+). The only sanctioned path for simultaneous system-output + mic without virtual drivers (BlackHole/Loopback). No extra permission prompts beyond M1's Screen Recording + `NSMicrophoneUsageDescription` in Info.plist.

- Rust binding: `screencapturekit` crate (v0.4+, supports macOS 13+ audio, 15+ mic). Ergonomic.
- `cidre` is a lower-level alternative.
- **Tahoe caveat:** `SCStreamErrorDomain -3805` / silent audio callbacks when host isn't bundled as a proper `.app`. Tauri's `.app` bundle satisfies this; add a smoke test.
- **AAC writing:** `AVAudioFile` with compressed `.m4a` historically flaky (moov-atom placement). Use `AVAssetWriter` + `AVAssetWriterInput` with AAC output settings. Write PCM to disk first, encode on finalize.

## 2. `SFSpeechRecognizer` vs `SpeechAnalyzer` + Ukrainian

**Critical:** macOS 26's new `SpeechTranscriber` (via `SpeechAnalyzer`) is 55% faster than Whisper and Apple-recommended going forward — but `supportedLocales` does **NOT include Ukrainian**. Confirmed list: `ar, da, de, en, es, fi, fr, he, it, ja, ko, ms, nb, nl, pt, ru, sv, th, tr, vi, yue, zh`.

Legacy `SFSpeechRecognizer` **does support `uk-UA`** (server mode), but `supportsOnDeviceRecognition` typically returns `false` for Ukrainian. **Verify at runtime** — if false, M3 must either:
- (a) require network for `uk-UA` (privacy regression — avoid), or
- (b) ship `DictationTranscriber` fallback (Apple's documented fallback for unsupported `SpeechTranscriber` locales), or
- (c) degrade gracefully: no transcript for unsupported locales, manual capture keeps working.

Streaming shape: `SFSpeechAudioBufferRecognitionRequest` + `shouldReportPartialResults = true` + `appendAudioPCMBuffer(_:)` in a tap. New API uses `AsyncStream<SpeechTranscriber.Result>` with `.isFinal` flag.

## 3. Audio handoff: file vs stream

**Recommended architectural shift:** put ScreenCaptureKit **inside the Swift sidecar** (it already has Vision/Speech frameworks). Rust orchestrates lifecycle via existing JSON-lines IPC; sidecar emits `partial`/`final` events on the M2-reserved `stream_id` envelope; sidecar writes audio + srt + txt directly to `~/Moment/<meeting>/`. Simpler than cross-process audio handoff.

Alternative considered: Rust captures audio, writes rotating files, sidecar tails them. Eliminated — filesystem jitter, re-open cost, format negotiation overhead.

## 4. SRT generation

Trivial — ~20 lines of string concat over `(index, start, end, text)` tuples. Timestamp format: `HH:MM:SS,mmm` (comma, not period). Crate `srtlib` exists if typed structure is desired, but adds a dependency for a formatting problem.

`.vtt` is slightly simpler (period instead of comma, `WEBVTT` header) and browser-native — useful for future preview UI rendering transcripts in `<video>`. **Write both** (`transcript.srt` + `transcript.vtt` + `transcript.txt`) — the cost is negligible, the flexibility is real.

## 5. Finalization (avoiding AVAudioEngine ↔ SFSpeechRecognitionTask race)

Documented correct order across Apple forums:

1. `inputNode.removeTap(onBus: 0)` — stop feeding buffers first
2. `recognitionRequest.endAudio()` — signal EOS (NOT `task.cancel()`, which discards the final result)
3. `audioEngine.stop()`
4. Await final callback where `result.isFinal == true` before flushing SRT/TXT

**Known race:** calling `task.cancel()` or `audioEngine.stop()` before `endAudio()` loses the final recognition chunk — you get only partials. Gate the "Meeting saved" notification on the `isFinal` callback with a 2-3 s timeout fallback.

---

## Top recommendation for spec

Put ScreenCaptureKit **inside the Swift sidecar**; Rust orchestrates via existing JSON-lines IPC; sidecar emits `partial`/`final` events on M2-reserved `stream_id` envelope; sidecar writes audio + srt + txt + vtt directly to `~/Moment/<meeting>/`. For `uk-UA` specifically, plan for `DictationTranscriber` fallback since `SpeechTranscriber` doesn't cover it.

## Sources

- [WWDC25 — Advanced speech-to-text with SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/)
- [SpeechTranscriber documentation](https://developer.apple.com/documentation/speech/speechtranscriber)
- [iOS 26 SpeechAnalyzer Guide — supportedLocales list](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide)
- [ScreenCaptureKit captureMicrophone](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturemicrophone)
- [screencapturekit Rust crate](https://crates.io/crates/screencapturekit)
- [SFSpeechAudioBufferRecognitionRequest](https://developer.apple.com/documentation/speech/sfspeechaudiobufferrecognitionrequest)
- [Tahoe ScreenCaptureKit audio regression #647](https://github.com/ronaldoussoren/pyobjc/issues/647)
- [Spokestack clean-shutdown reference](https://github.com/spokestack/spokestack-ios/blob/master/Spokestack/AppleSpeechRecognizer.swift)
- [MacStories — Apple speech APIs vs Whisper benchmarks](https://www.macstories.net/stories/hands-on-how-apples-new-speech-apis-outpace-whisper-for-lightning-fast-transcription/)
- [srtlib Rust crate](https://crates.io/crates/srtlib)
- [AAC/m4a priming via AVAssetWriter](https://medium.com/fandom-engineering/priming-cmsamplebuffer-containing-aac-encoded-data-using-apples-core-media-api-c5b2bf0e62a1)
