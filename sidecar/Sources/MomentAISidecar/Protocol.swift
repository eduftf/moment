import Foundation

struct Request: Decodable {
    let id: String
    let op: String
    let args: [String: AnyCodable]?
}

struct Response: Encodable {
    let id: String
    let ok: Bool
    let result: AnyEncodable?
    let error: ResponseError?

    static func success(id: String, result: AnyEncodable) -> Response {
        Response(id: id, ok: true, result: result, error: nil)
    }
    static func failure(id: String, code: String, message: String) -> Response {
        Response(id: id, ok: false, result: nil, error: ResponseError(code: code, message: message))
    }
}

struct ResponseError: Encodable {
    let code: String
    let message: String
}

// Minimal type-erased coders — good enough for M2's small shapes.
struct AnyCodable: Decodable {
    let value: Any
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s; return }
        if let i = try? c.decode(Int.self) { value = i; return }
        if let d = try? c.decode(Double.self) { value = d; return }
        if let b = try? c.decode(Bool.self) { value = b; return }
        if let a = try? c.decode([AnyCodable].self) { value = a.map(\.value); return }
        if let o = try? c.decode([String: AnyCodable].self) {
            value = o.mapValues(\.value); return
        }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "unsupported JSON type")
    }
    func string(_ key: String) -> String? { (value as? [String: Any])?[key] as? String }
}

struct AnyEncodable: Encodable {
    let value: Encodable
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
