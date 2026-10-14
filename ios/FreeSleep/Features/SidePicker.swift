import SwiftUI

struct SidePicker: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        @Bindable var model = model
        Picker("Bed side", selection: $model.side) {
            ForEach(BedSide.allCases, id: \.self) { side in Text(model.settings?[side].name ?? side.title).tag(side) }
        }.pickerStyle(.segmented).accessibilityLabel("Bed side")
    }
}
