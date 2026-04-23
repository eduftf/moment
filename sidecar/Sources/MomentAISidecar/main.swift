import Foundation

let stdin = FileHandle.standardInput
let stdout = FileHandle.standardOutput
let stderr = FileHandle.standardError

func writeLine(_ response: Response) {
    do {
        let data = try JSONEncoder().encode(response)
        stdout.write(data)
        stdout.write("\n".data(using: .utf8)!)
    } catch {
        FileHandle.standardError.write("encode failed: \(error)\n".data(using: .utf8)!)
    }
}

func handle(_ request: Request) -> Response {
    switch request.op {
    case "availability":
        return .success(id: request.id, result: AnyEncodable(value: Availability.probe()))
    case "count_faces":
        guard let path = request.args?["image_path"]?.value as? String else {
            return .failure(id: request.id, code: "image_not_found", message: "args.image_path missing")
        }
        do {
            let result = try VisionOps.countFaces(imagePath: path)
            return .success(id: request.id, result: AnyEncodable(value: result))
        } catch let e as VisionOpError {
            return .failure(id: request.id, code: e.code, message: e.message)
        } catch {
            return .failure(id: request.id, code: "vision_failed", message: error.localizedDescription)
        }
    default:
        return .failure(id: request.id, code: "unsupported_op", message: "op \"\(request.op)\" not recognized")
    }
}

// Line-by-line stdin reader.
var buffer = Data()
while let data = try? stdin.read(upToCount: 4096), !data.isEmpty {
    buffer.append(data)
    while let newlineIndex = buffer.firstIndex(of: 0x0A) {
        let line = buffer.prefix(upTo: newlineIndex)
        buffer.removeSubrange(0...newlineIndex)
        if line.isEmpty { continue }
        do {
            let req = try JSONDecoder().decode(Request.self, from: line)
            writeLine(handle(req))
        } catch {
            stderr.write("malformed request: \(error)\n".data(using: .utf8)!)
        }
    }
}
