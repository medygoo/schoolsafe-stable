// app/modules/document-engine/qr-block.js
import { MM_TO_PT } from "./print-layout.js";

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} size in mm
 * @returns {Promise<number>} the original y position
 */
export async function renderQRBlock(doc, text, x, y, size = 20) {
  if (typeof QRCode === "undefined") return y;

  const pxSize = Math.round(size * MM_TO_PT);
  let dataUrl = null;

  if (typeof QRCode.toCanvas === "function") {
    const canvas = document.createElement("canvas");
    await new Promise((resolve, reject) => {
      // eslint-disable-next-line no-undef
      QRCode.toCanvas(canvas, text, { width: pxSize * 2, margin: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    dataUrl = canvas.toDataURL("image/png");
  } else {
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
          setTimeout(resolve, 50);
        } catch (err) {
          reject(err);
        }
      });
      const img = wrapper.querySelector("img");
      if (img && img.src) dataUrl = img.src;
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
  }

  if (dataUrl) {
    doc.addImage(dataUrl, "PNG", x, y, pxSize, pxSize);
  }
  return y;
}
