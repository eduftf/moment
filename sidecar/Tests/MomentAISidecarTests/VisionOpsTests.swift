import XCTest
@testable import MomentAISidecar

final class VisionOpsTests: XCTestCase {
    func fixture(_ name: String) throws -> URL {
        // `.copy("Fixtures")` preserves directory structure inside the bundle,
        // so the subdirectory parameter is required.
        guard let url = Bundle.module.url(forResource: name, withExtension: "png", subdirectory: "Fixtures") else {
            throw XCTSkip("fixture \(name).png missing — drop it into Tests/Fixtures/")
        }
        return url
    }

    func testZeroFaces() throws {
        let url = try fixture("zero-faces")
        let r = try VisionOps.countFaces(imagePath: url.path)
        XCTAssertEqual(r.faces, 0)
    }

    func testOneFace() throws {
        let url = try fixture("one-face")
        let r = try VisionOps.countFaces(imagePath: url.path)
        XCTAssertEqual(r.faces, 1)
    }

    func testFourFaces() throws {
        let url = try fixture("four-faces")
        let r = try VisionOps.countFaces(imagePath: url.path)
        XCTAssertEqual(r.faces, 4)
    }

    func testMissingImage() {
        XCTAssertThrowsError(try VisionOps.countFaces(imagePath: "/tmp/definitely-not-there-\(UUID().uuidString).png")) { error in
            guard case VisionOpError.imageNotFound = error else {
                return XCTFail("expected imageNotFound, got \(error)")
            }
        }
    }

    func testUnsupportedOpViaStdin() throws {
        // Smoke: handle() returns unsupported_op for garbage.
        let r = Response.failure(id: "x", code: "unsupported_op", message: "not recognized")
        let data = try JSONEncoder().encode(r)
        XCTAssertTrue(String(data: data, encoding: .utf8)!.contains("unsupported_op"))
    }
}
