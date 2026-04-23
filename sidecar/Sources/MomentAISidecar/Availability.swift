import Foundation

struct AvailabilityResult: Encodable {
    let vision: String
    let speech: String
    let llm: String
}

enum Availability {
    static func probe() -> AvailabilityResult {
        // M2 only probes Vision. Speech and llm are reserved for M3/M4.
        // Vision is universally available on macOS 12.3+; dummy-probe by instantiating a request.
        let vision: String = {
            // Vision framework itself is always linkable on our target; we report "available"
            // unconditionally and let count_faces surface runtime failures per-call.
            return "available"
        }()
        return AvailabilityResult(vision: vision, speech: "unavailable", llm: "unavailable")
    }
}
