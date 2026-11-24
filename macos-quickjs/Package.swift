// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PoeQuick",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/zqqf16/QuickJS-Swift.git", from: "1.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "PoeQuick",
            dependencies: [
                .product(name: "QuickJS", package: "QuickJS-Swift"),
            ],
            path: "PoeQuick",
            exclude: ["Resources/core-entry.js"],
            resources: [
                .copy("Resources/core.js"),
                .copy("Resources/cn-stats.compiled.js"),
                .copy("Resources/iconTemplate.png"),
                .copy("Resources/iconTemplate@2x.png"),
            ]
        ),
        // 命令行验证入口（独立 target，复用 QuickJSHost.swift）
        .executableTarget(
            name: "PoeQuickCLI",
            dependencies: [
                .product(name: "QuickJS", package: "QuickJS-Swift"),
            ],
            path: "PoeQuickCLI",
            resources: [
                .copy("Resources/core.js"),
                .copy("Resources/cn-stats.compiled.js"),
            ]
        ),
    ]
)
