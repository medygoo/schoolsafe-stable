// app/modules/document-engine/document-header.js
import { A4_WIDTH_PT, MM_TO_PT, MARGINS } from "./print-layout.js";

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {import("./school-identity-provider.js").SchoolIdentity} identity
 * @param {string} title
 * @param {string} [subtitle]
 * @param {number} [yOffset=0]
 * @returns {number} bottom Y of the header
 */
export async function renderDocumentHeader(doc, identity, title, subtitle, yOffset = 0) {
  const top = yOffset + 12 * MM_TO_PT;
  const primary = identity.primaryColor || "#071a3d";
  const rgb = hexToRgb(primary);

  // Blue bar
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.rect(0, yOffset, A4_WIDTH_PT, 28 * MM_TO_PT, "F");

  // Logo
  let logoX = 15 * MM_TO_PT;
  if (identity.logoUrl) {
    try {
      const img = await loadImage(identity.logoUrl);
      const aspect = img.width / img.height;
      const h = 16 * MM_TO_PT;
      const w = h * aspect;
      const format = detectImageFormat(img.src);
      doc.addImage(img.src, format, logoX, yOffset + 5 * MM_TO_PT, w, h);
      logoX += w + 5 * MM_TO_PT;
    } catch {
      // ignore missing logo
    }
  }

  // School name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  const textX = logoX;
  const maxTextWidth = A4_WIDTH_PT - textX - MARGINS.right;
  doc.text(identity.name, textX, yOffset + 11 * MM_TO_PT, { align: "left", maxWidth: maxTextWidth });

  // Contact line
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const contactParts = [identity.address, identity.city, identity.phone, identity.email, identity.website].filter(Boolean);
  doc.text(contactParts.join(" · "), textX, yOffset + 16 * MM_TO_PT, { align: "left", maxWidth: maxTextWidth });

  // Title block
  const titleY = yOffset + 36 * MM_TO_PT;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, A4_WIDTH_PT / 2, titleY, { align: "center" });

  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, A4_WIDTH_PT / 2, titleY + 6 * MM_TO_PT, { align: "center" });
  }

  return titleY + (subtitle ? 10 * MM_TO_PT : 6 * MM_TO_PT);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
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
