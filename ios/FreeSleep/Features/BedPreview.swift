import SwiftUI

struct BedPreview: View {
    let head: Double
    let feet: Double
    var body: some View {
        GeometryReader { geometry in
            let scale = geometry.size.width / 320
            let headRise = sin(head * .pi / 180) * 90
            let feetRise = sin(feet * .pi / 180) * 70
            let points = [CGPoint(x: 40, y: 91 - headRise), CGPoint(x: 130, y: 91), CGPoint(x: 185, y: 91),
                CGPoint(x: 245, y: 91 - feetRise), CGPoint(x: 284, y: 91 - feetRise * 0.5)]
            Path { path in
                path.move(to: CGPoint(x: 35 * scale, y: 114)); path.addLine(to: CGPoint(x: 285 * scale, y: 114))
                for horizontal in [60.0, 260.0] {
                    path.move(to: CGPoint(x: horizontal * scale, y: 114)); path.addLine(to: CGPoint(x: horizontal * scale, y: 128))
                }
            }.stroke(.secondary.opacity(0.2), style: StrokeStyle(lineWidth: 5, lineCap: .round))
            Path { path in
                path.move(to: CGPoint(x: points[0].x * scale, y: points[0].y))
                for point in points.dropFirst() { path.addLine(to: CGPoint(x: point.x * scale, y: point.y)) }
            }.stroke(SleepTheme.accent, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
        }.frame(height: 140).accessibilityLabel("Position preview: head \(Int(head)) degrees, feet \(Int(feet)) degrees")
    }
}
