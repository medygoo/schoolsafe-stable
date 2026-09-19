// app/modules/document-engine/data-table.js
import { MM_TO_PT } from "./print-layout.js";

/**
 * Draw a simple table with header row repeated on new pages.
 * @param {import("jspdf").jsPDF} doc
 * @param {{header:string,width:number,align?:string}[]} columns
 * @param {string[][]} rows
 * @param {{startX:number,startY:number,maxY:number,rowHeight?:number,headerHeight?:number,fontSize?:number}} options
 * @returns {number} next Y position
 */
export function drawDataTable(doc, columns, rows, options) {
  const { startX, startY, maxY, rowHeight = 6 * MM_TO_PT, headerHeight = 7 * MM_TO_PT, fontSize = 9 } = options;
  const cellPadding = 1.5 * MM_TO_PT;
  let x = startX;
  let y = startY;

  function drawHeader() {
    doc.setFillColor(240, 240, 240);
    doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), headerHeight, "F");
    doc.setFontSize(fontSize);
    doc.setTextColor(0, 0, 0);
    let cx = startX;
    for (const col of columns) {
      doc.text(col.header, cx + cellPadding, y + headerHeight / 2 + 1.5, { align: "left", baseline: "middle" });
      cx += col.width;
    }
    y += headerHeight;
  }

  drawHeader();

  for (const row of rows) {
    if (y + rowHeight > maxY) {
      doc.addPage();
      y = options.startY;
      drawHeader();
    }
    let cx = startX;
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 30, 30);
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const text = String(row[i] ?? "");
      const align = col.align || "left";
      const tx = align === "right" ? cx + col.width - cellPadding : cx + cellPadding;
      doc.text(text, tx, y + rowHeight / 2 + 1, { align, baseline: "middle" });
      cx += col.width;
    }
    y += rowHeight;
  }

  return y;
}
