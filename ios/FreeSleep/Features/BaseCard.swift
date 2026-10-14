import SwiftUI

struct BaseCard: View {
    @Environment(AppModel.self) private var model
    @State private var head = 0.0
    @State private var feet = 0.0
    var body: some View {
        SleepCard(title: "Find your position", eyebrow: "POD ULTRA BASE · EXPERIMENTAL") {
            BedPreview(head: head, feet: feet)
            Text("Position preview · moves the whole bed").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity)
            ViewThatFits(in: .horizontal) {
                HStack { presetButtons }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) { presetButtons }
            }
            VStack {
                HStack { Text("Head"); Spacer(); Text("\(Int(head))°") }
                Slider(value: $head, in: 0...60, step: 1) { Text("Head angle preview") }
                HStack { Text("Feet"); Spacer(); Text("\(Int(feet))°") }
                Slider(value: $feet, in: 0...45, step: 1) { Text("Feet angle preview") }
            }
            if let position = model.base?.position, model.base?.stale == false {
                Text("Reported · head \(Int(position.left.head))° / \(Int(position.right.head))° · feet \(Int(position.left.feet))° / \(Int(position.right.feet))°")
                    .font(.caption).foregroundStyle(.secondary)
            } else { Text("Live position unavailable. Connect the base before moving.").font(.caption).foregroundStyle(.secondary) }
            HStack {
                if model.base?.state == "connected" {
                    Button("Move bed") { Task { await model.moveBase(head: head, feet: feet) } }
                        .buttonStyle(.borderedProminent).disabled(model.base?.ready != true || model.acting)
                } else {
                    Button("Connect base") { Task { await model.connectBase() } }.buttonStyle(.borderedProminent).disabled(model.acting)
                }
                Spacer()
                Button("Stop", role: .destructive) { Task { await model.stopBase() } }
                    .buttonStyle(.bordered).disabled(model.base?.state != "connected" || model.stopping)
            }.controlSize(.large)
        }
    }
    private var presetButtons: some View {
        ForEach(BasePreset.allCases, id: \.self) { preset in
            Button(preset.rawValue.capitalized) { head = preset.head; feet = preset.feet }
                .buttonStyle(.bordered).frame(maxWidth: .infinity).controlSize(.large)
                .accessibilityAddTraits(head == preset.head && feet == preset.feet ? .isSelected : [])
        }
    }
}
