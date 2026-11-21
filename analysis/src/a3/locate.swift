// Prints where each heading actually landed in the PDF: "index|page|top" per line, where top is the
// fraction of the page height from the top edge. Used by a3.report to place page breaks.
import PDFKit
let args = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: args[1]))!
for (i, needle) in args.dropFirst(2).enumerated() {
  for sel in doc.findString(needle, withOptions: []) {
    guard let page = sel.pages.first else { continue }
    let box = page.bounds(for: .mediaBox)
    let b = sel.bounds(for: page)
    print("\(i)|\(doc.index(for: page))|\(1 - b.maxY / box.height)")
  }
}
