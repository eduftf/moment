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
