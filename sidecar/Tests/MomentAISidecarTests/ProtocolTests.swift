import XCTest
@testable import MomentAISidecar

final class ProtocolTests: XCTestCase {
    func testResponseSuccessEncodes() throws {
        let r = Response.success(id: "a", result: AnyEncodable(value: AvailabilityResult(vision: "available", speech: "unavailable", llm: "unavailable")))
        let data = try JSONEncoder().encode(r)
        let json = String(data: data, encoding: .utf8)!
        XCTAssertTrue(json.contains("\"id\":\"a\""))
        XCTAssertTrue(json.contains("\"ok\":true"))
        XCTAssertTrue(json.contains("\"vision\":\"available\""))
    }

    func testResponseFailureEncodes() throws {
        let r = Response.failure(id: "b", code: "vision_failed", message: "x")
        let data = try JSONEncoder().encode(r)
        let json = String(data: data, encoding: .utf8)!
        XCTAssertTrue(json.contains("\"ok\":false"))
        XCTAssertTrue(json.contains("\"code\":\"vision_failed\""))
    }
}
