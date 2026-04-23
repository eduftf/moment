// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MomentAISidecar",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "MomentAISidecar",
            path: "Sources/MomentAISidecar"
        ),
        .testTarget(
            name: "MomentAISidecarTests",
            dependencies: ["MomentAISidecar"],
            path: "Tests/MomentAISidecarTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
