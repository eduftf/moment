import Foundation
import Vision

struct CountFacesResult: Encodable {
    let faces: Int
}

enum VisionOps {
    static func countFaces(imagePath: String) throws -> CountFacesResult {
        let url = URL(fileURLWithPath: imagePath)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw VisionOpError.imageNotFound(imagePath)
        }
        let handler = VNImageRequestHandler(url: url, options: [:])
        let request = VNDetectFaceRectanglesRequest()
        // Pin revision to avoid silent drift across macOS updates.
        request.revision = VNDetectFaceRectanglesRequestRevision3
        do {
            try handler.perform([request])
        } catch {
            throw VisionOpError.visionFailed(error.localizedDescription)
        }
        let count = request.results?.count ?? 0
        return CountFacesResult(faces: count)
    }
}

enum VisionOpError: Error {
    case imageNotFound(String)
    case visionFailed(String)

    var code: String {
        switch self {
        case .imageNotFound: return "image_not_found"
        case .visionFailed:  return "vision_failed"
        }
    }
    var message: String {
        switch self {
        case .imageNotFound(let p): return "image not found at \(p)"
        case .visionFailed(let m):  return m
        }
    }
}
