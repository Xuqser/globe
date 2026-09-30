import Foundation
import ImageIO

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any] else {
    fputs("无法读取图片元数据\n", stderr)
    exit(1)
}
let gps = properties[kCGImagePropertyGPSDictionary as String] as? [String: Any] ?? [:]
let exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
func coordinate(_ key: CFString, _ ref: CFString, negative: String) -> Double? {
    guard let n = gps[key as String] as? NSNumber else { return nil }
    return (gps[ref as String] as? String) == negative ? -n.doubleValue : n.doubleValue
}
let result: [String: Any] = [
    "latitude": coordinate(kCGImagePropertyGPSLatitude, kCGImagePropertyGPSLatitudeRef, negative: "S") as Any,
    "longitude": coordinate(kCGImagePropertyGPSLongitude, kCGImagePropertyGPSLongitudeRef, negative: "W") as Any,
    "takenAt": exif[kCGImagePropertyExifDateTimeOriginal as String] ?? NSNull()
]
let clean = result.mapValues { value -> Any in
    if let optional = value as? Optional<Double> { return optional ?? NSNull() }
    return value
}
let data = try JSONSerialization.data(withJSONObject: clean)
print(String(data: data, encoding: .utf8)!)
