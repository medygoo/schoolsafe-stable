// app/modules/document-engine/adapters/jspdf-render-context.js
// jsPDF implementation of the abstract RenderContext.

import { RenderContext } from "../render-context.js";

export class JspdfRenderContext extends RenderContext {
  /**
   * @param {import("jspdf").jsPDF} doc
   * @param {import("../render-context.js").LayoutContext} layout
   */
  constructor(doc, layout) {
    super(layout);
    this.doc = doc;
  }

  getCurrentPage() {
    return this.doc.internal.getNumberOfPages();
  }

  drawRect(x, y, w, h, options = {}) {
    if (options.fill) {
      const { r, g, b } = normalizeColor(options.fill);
      this.doc.setFillColor(r, g, b);
      this.doc.rect(x, y, w, h, "F");
    }
    if (options.stroke) {
      const { r, g, b } = normalizeColor(options.stroke);
      this.doc.setDrawColor(r, g, b);
      this.doc.rect(x, y, w, h, "S");
    }
    if (!options.fill && !options.stroke) {
      this.doc.setFillColor(200, 200, 200);
      this.doc.rect(x, y, w, h, "F");
    }
  }

  drawText(text, x, y, options = {}) {
    const fontSize = options.fontSize || 10;
    const fontStyle = options.fontStyle || "normal";
    const color = options.color || "#000000";
    const align = options.align || "left";
    const maxWidth = options.maxWidth;

    this.doc.setFontSize(fontSize);
    this.doc.setFont("helvetica", fontStyle);
    const { r, g, b } = hexToRgb(color);
    this.doc.setTextColor(r, g, b);

    const textArgs = [String(text || ""), x, y];
    const opts = { align, baseline: options.baseline || "alphabetic" };
    if (maxWidth) opts.maxWidth = maxWidth;
    this.doc.text(...textArgs, opts);
  }

  async drawImage(src, x, y, w, h, options = {}) {
    try {
      const format = detectImageFormat(src);
      if (options.fit === "contain" && typeof Image !== "undefined") {
        const dims = await measureImage(src);
        const scale = Math.min(w / dims.width, h / dims.height);
        const drawW = dims.width * scale;
        const drawH = dims.height * scale;
        const offsetX = options.align === "right" ? w - drawW : options.align === "center" ? (w - drawW) / 2 : 0;
        const offsetY = options.valign === "bottom" ? h - drawH : options.valign === "middle" ? (h - drawH) / 2 : 0;
        this.doc.addImage(src, format, x + offsetX, y + offsetY, drawW, drawH);
      } else {
        this.doc.addImage(src, format, x, y, w, h);
      }
    } catch (err) {
      // Draw a placeholder rectangle if image fails.
      this.drawRect(x, y, w, h, { stroke: "#cccccc" });
      this.drawText("[image]", x + 2, y + h / 2, { fontSize: 8, color: "#888888" });
    }
  }

  async drawQR(text, x, y, size, options = {}) {
    if (typeof QRCode === "undefined") {
      this.drawRect(x, y, size * 2.83465, size * 2.83465, { stroke: "#cccccc" });
      return;
    }
    const MM_TO_PT = 2.83465;
    const pxSize = Math.round(size * MM_TO_PT);

    // qrcodejs (used by SchoolSafe app) exposes a constructor API.
    // node-qrcode exposes toCanvas. Support both.
    if (typeof QRCode.toCanvas === "function") {
      const canvas = document.createElement("canvas");
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(canvas, String(text), { width: pxSize * 2, margin: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      const dataUrl = canvas.toDataURL("image/png");
      this.doc.addImage(dataUrl, "PNG", x, y, pxSize, pxSize);
      return;
    }

    // qrcodejs constructor API
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-9999px";
    document.body.appendChild(wrapper);
    try {
      await new Promise((resolve, reject) => {
        try {
          // eslint-disable-next-line no-undef
          new QRCode(wrapper, {
            text: String(text),
            width: pxSize * 2,
            height: pxSize * 2,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.H : 0,
          });
          // qrcodejs renders asynchronously; give it a short tick.
          setTimeout(resolve, 50);
        } catch (err) {
          reject(err);
        }
      });
      const img = wrapper.querySelector("img");
      if (img && img.src) {
        this.doc.addImage(img.src, "PNG", x, y, pxSize, pxSize);
      } else {
        this.drawRect(x, y, pxSize, pxSize, { stroke: "#cccccc" });
      }
    } catch (err) {
      this.drawRect(x, y, pxSize, pxSize, { stroke: "#cccccc" });
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
  }

  drawLine(x1, y1, x2, y2, options = {}) {
    const color = options.color || "#000000";
    const { r, g, b } = hexToRgb(color);
    this.doc.setDrawColor(r, g, b);
    if (Array.isArray(options.dash) && options.dash.length > 0) {
      this.doc.setLineDash(options.dash, 0);
    } else {
      this.doc.setLineDash([], 0);
    }
    this.doc.line(x1, y1, x2, y2);
    this.doc.setLineDash([], 0);
  }

  drawTable(config, x, y, maxY) {
    const { columns, rows, rowHeight = 6 * 2.83465, headerHeight = 7 * 2.83465, fontSize = 9 } = config;
    const cellPadding = 1.5 * 2.83465;
    const startX = x;
    const startY = y;
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
    let cy = startY;

    const drawHeader = () => {
      this.doc.setFillColor(240, 240, 240);
      this.doc.rect(startX, cy, tableWidth, headerHeight, "F");
      this.doc.setFontSize(fontSize);
      this.doc.setTextColor(0, 0, 0);
      let cx = startX;
      for (const col of columns) {
        this.doc.text(col.header, cx + cellPadding, cy + headerHeight / 2 + 1.5, { align: "left", baseline: "middle" });
        cx += col.width;
      }
      cy += headerHeight;
    };

    drawHeader();

    for (const row of rows) {
      if (cy + rowHeight > maxY) {
        this.doc.addPage();
        cy = startY;
        drawHeader();
      }
      let cx = startX;
      this.doc.setFontSize(fontSize);
      this.doc.setTextColor(30, 30, 30);
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const text = String(row[i] ?? "");
        const align = col.align || "left";
        const tx = align === "right" ? cx + col.width - cellPadding : cx + cellPadding;
        this.doc.text(text, tx, cy + rowHeight / 2 + 1, { align, baseline: "middle" });
        cx += col.width;
      }
      cy += rowHeight;
    }

    return cy;
  }

  addPage() {
    this.doc.addPage();
  }

  setPage(pageNumber) {
    this.doc.setPage(pageNumber);
  }

  setTitle(title) {
    this.doc.setProperties({ title: String(title) });
  }

  setAuthor(author) {
    this.doc.setProperties({ author: String(author) });
  }
}

function normalizeColor(color) {
  if (typeof color === "object" && "r" in color && "g" in color && "b" in color) {
    return color;
  }
  return hexToRgb(color);
}

function hexToRgb(hex) {
  const clean = String(hex || "#000000").replace("#", "");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function measureImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = reject;
    img.src = src;
  });
}

function detectImageFormat(src) {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:image\/([^;]+);/);
    if (match) {
      const mime = match[1].toLowerCase();
      if (mime === "jpeg" || mime === "jpg") return "JPEG";
      if (mime === "png") return "PNG";
      if (mime === "webp") return "WEBP";
    }
    return "PNG";
  }
  const clean = src.split("?")[0].split("#")[0];
  const ext = clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (ext === "png") return "PNG";
  if (ext === "webp") return "WEBP";
  return "PNG";
}
