import Foundation
#if canImport(Darwin)
import Darwin
#endif

// Disable stdio block-buffering at the libc layer. When stdout is a pipe
// (as it is under the Tauri Supervisor), libc defaults to full-buffer
// mode, so small JSON replies sit in the buffer until the process exits.
// Line-buffer both streams so every response is flushed on its trailing
// newline. Note: the names `stdout`/`stderr` below refer to libc FILE*
// symbols, which is intentional — Foundation's `FileHandle.standardOutput`
// shares the underlying fd with libc's `stdout`, so changing the libc
// buffering mode propagates.
setvbuf(Darwin.stdout, nil, _IOLBF, 0)
setvbuf(Darwin.stderr, nil, _IOLBF, 0)

let stdin = FileHandle.standardInput
let stdout = FileHandle.standardOutput
let stderr = FileHandle.standardError

func writeLine(_ response: Response) {
    do {
        let data = try JSONEncoder().encode(response)
        stdout.write(data)
        stdout.write("\n".data(using: .utf8)!)
        // Explicit flush: when stdout is a pipe (as it is under the Tauri
        // Supervisor), `FileHandle.write` is block-buffered and small
        // replies sit in the buffer until the process exits. Force a
        // flush after every line so the supervisor's probe round-trip
        // returns within its 3 s window.
        try? stdout.synchronize()
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

// Line-by-line stdin reader. We use POSIX `read(2)` directly instead of
// `FileHandle.read(upToCount:)` because Foundation's FileHandle on macOS
// appears to cache pipe reads in unhelpful chunks — small writes from the
// supervisor arrive through the kernel pipe but `FileHandle.read` doesn't
// surface them until the sender closes stdin. Going through libc read(2)
// on fd 0 sidesteps that layer entirely.
var buffer = Data()
var readBuf = [UInt8](repeating: 0, count: 4096)
while true {
    let n = readBuf.withUnsafeMutableBufferPointer { ptr -> Int in
        read(0, ptr.baseAddress, ptr.count)
    }
    if n <= 0 { break }
    buffer.append(readBuf, count: n)
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
