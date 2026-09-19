// app/modules/document-engine/render-context.js
// Abstract rendering surface. No jsPDF dependency here.

export class RenderContext {
  /**
   * @param {LayoutContext} layout
   */
  constructor(layout) {
    this.layout = layout;
  }

  getDimensions() {
    return this.layout.dimensions;
  }

  getCurrentPage() {
    throw new Error("getCurrentPage not implemented");
  }

  drawRect(x, y, w, h, options = {}) {
    throw new Error("drawRect not implemented");
  }

  drawText(text, x, y, options = {}) {
    throw new Error("drawText not implemented");
  }

  async drawImage(src, x, y, w, h, options = {}) {
    throw new Error("drawImage not implemented");
  }

  async drawQR(text, x, y, size, options = {}) {
    throw new Error("drawQR not implemented");
  }

  drawLine(x1, y1, x2, y2, options = {}) {
    throw new Error("drawLine not implemented");
  }

  drawTable(config, x, y, maxY) {
    throw new Error("drawTable not implemented");
  }

  addPage() {
    throw new Error("addPage not implemented");
  }

  setPage(pageNumber) {
    throw new Error("setPage not implemented");
  }

  setTitle(title) {
    throw new Error("setTitle not implemented");
  }

  setAuthor(author) {
    throw new Error("setAuthor not implemented");
  }
}

/**
 * @typedef {Object} LayoutContext
 * @property {PageDimensions} dimensions
 * @property {Margins} margins
 * @property {string} layoutName
 */

/**
 * @typedef {Object} PageDimensions
 * @property {number} width
 * @property {number} height
 * @property {string} unit
 */

/**
 * @typedef {Object} Margins
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 * @property {number} left
 */

/**
 * @typedef {Object} TextOptions
 * @property {number} [fontSize]
 * @property {string} [fontFamily]
 * @property {string} [fontStyle]
 * @property {string} [color]
 * @property {string} [align]
 * @property {number} [maxWidth]
 */

/**
 * @typedef {Object} TableConfig
 * @property {ColumnDef[]} columns
 * @property {string[][]} rows
 * @property {number} [rowHeight]
 * @property {number} [headerHeight]
 * @property {number} [fontSize]
 */

/**
 * @typedef {Object} ColumnDef
 * @property {string} header
 * @property {number} width
 * @property {string} [align]
 */
