// app/modules/document-engine/layout-engine.js
// Page dimensions, header, footer and pagination.

export const MM_TO_PT = 2.83465;
const UNIVERSAL_HEADER_HEIGHT = 37 * MM_TO_PT;
const UNIVERSAL_FOOTER_HEIGHT = 20 * MM_TO_PT;

export const LAYOUTS = Object.freeze({
  A4_PORTRAIT: {
    name: "a4-portrait",
    dimensions: { width: 210 * MM_TO_PT, height: 297 * MM_TO_PT, unit: "pt" },
    margins: { top: 15 * MM_TO_PT, right: 15 * MM_TO_PT, bottom: 20 * MM_TO_PT, left: 15 * MM_TO_PT },
  },
  A4_LANDSCAPE: {
    name: "a4-landscape",
    dimensions: { width: 297 * MM_TO_PT, height: 210 * MM_TO_PT, unit: "pt" },
    margins: { top: 15 * MM_TO_PT, right: 15 * MM_TO_PT, bottom: 20 * MM_TO_PT, left: 15 * MM_TO_PT },
  },
  A5_PORTRAIT: {
    name: "a5-portrait",
    dimensions: { width: 148 * MM_TO_PT, height: 210 * MM_TO_PT, unit: "pt" },
    margins: { top: 12 * MM_TO_PT, right: 12 * MM_TO_PT, bottom: 15 * MM_TO_PT, left: 12 * MM_TO_PT },
  },
  A5_RECEIPT: {
    name: "a5-receipt",
    dimensions: { width: 148 * MM_TO_PT, height: 210 * MM_TO_PT, unit: "pt" },
    margins: { top: 10 * MM_TO_PT, right: 10 * MM_TO_PT, bottom: 12 * MM_TO_PT, left: 10 * MM_TO_PT },
  },
  A4_TWO_UP_A5: {
    name: "a4-two-up-a5",
    dimensions: { width: 210 * MM_TO_PT, height: 297 * MM_TO_PT, unit: "pt" },
    margins: { top: 10 * MM_TO_PT, right: 10 * MM_TO_PT, bottom: 10 * MM_TO_PT, left: 10 * MM_TO_PT },
    isTwoUp: true,
  },
  STUDENT_CARD_HORIZONTAL: {
    name: "student-card-horizontal",
    dimensions: { width: 86 * MM_TO_PT, height: 54 * MM_TO_PT, unit: "pt" },
    margins: { top: 3 * MM_TO_PT, right: 3 * MM_TO_PT, bottom: 3 * MM_TO_PT, left: 3 * MM_TO_PT },
  },
  STUDENT_BADGE_VERTICAL: {
    name: "student-badge-vertical",
    dimensions: { width: 54 * MM_TO_PT, height: 86 * MM_TO_PT, unit: "pt" },
    margins: { top: 3 * MM_TO_PT, right: 3 * MM_TO_PT, bottom: 3 * MM_TO_PT, left: 3 * MM_TO_PT },
  },
});

export function createLayoutEngine(options = {}) {
  const defaultLayoutName = options.defaultLayout || LAYOUTS.A4_PORTRAIT.name;

  return {
    /**
     * @param {string} layoutName
     * @returns {import("./render-context.js").LayoutContext}
     */
    getLayout(layoutName) {
      const key = Object.keys(LAYOUTS).find((k) => LAYOUTS[k].name === (layoutName || defaultLayoutName));
      const layout = key ? LAYOUTS[key] : LAYOUTS.A4_PORTRAIT;
      return { ...layout };
    },

    getDimensions(layoutName) {
      return this.getLayout(layoutName).dimensions;
    },

    /**
     * @param {import("./render-context.js").RenderContext} ctx
     * @param {import("./contracts.js").DocumentModel} model
     */
    async applyHeader(ctx, model) {
      const dims = ctx.getDimensions();
      const primary = model.school.primaryColor || "#071a3d";
      const rgb = hexToRgb(primary);
      const protectedCard = isProtectedCardLayout(ctx.layout && ctx.layout.name);
      const h = (protectedCard ? 28 : 24) * MM_TO_PT;

      ctx.drawRect(0, 0, dims.width, h, { fill: rgb });

      if (protectedCard) {
        ctx.drawText(model.school.name, 15 * MM_TO_PT, 11 * MM_TO_PT, {
          fontSize: 16,
          fontStyle: "bold",
          color: "#ffffff",
          maxWidth: dims.width - 30 * MM_TO_PT,
        });
        const legacyParts = [model.school.address, model.school.city, model.school.phone, model.school.email].filter(Boolean);
        ctx.drawText(legacyParts.join(" · "), 15 * MM_TO_PT, 16 * MM_TO_PT, {
          fontSize: 8,
          color: "#ffffff",
          maxWidth: dims.width - 30 * MM_TO_PT,
        });
        return;
      }

      const logoWidth = model.school.logoUrl ? 16 * MM_TO_PT : 0;
      if (logoWidth) {
        await ctx.drawImage(model.school.logoUrl, 12 * MM_TO_PT, 4 * MM_TO_PT, logoWidth, 16 * MM_TO_PT, { fit: "contain" });
      }
      const identityX = (logoWidth ? 32 : 15) * MM_TO_PT;
      ctx.drawText(model.school.name, identityX, 10 * MM_TO_PT, {
        fontSize: protectedCard ? 16 : 15,
        fontStyle: "bold",
        color: "#ffffff",
        maxWidth: dims.width - identityX - 12 * MM_TO_PT,
      });

      const parts = [model.school.address, model.school.city, model.school.phone, model.school.email, model.school.website].filter(Boolean);
      ctx.drawText(parts.join(" · "), identityX, 16 * MM_TO_PT, {
        fontSize: 8,
        color: "#ffffff",
        maxWidth: dims.width - identityX - 12 * MM_TO_PT,
      });

      const label = model.meta.documentLabel || model.content?.title || model.meta.documentType || "Document";
      const date = formatDate(model.meta.generatedAt || model.meta.createdAt, model.meta.locale);
      const status = model.meta.generatedBy === "frontend" ? "BROUILLON" : "APERÇU";
      const sensitivity = String(model.meta.sensitivity || "internal").toUpperCase();
      const reference = model.meta.reference ? `Réf. ${model.meta.reference}` : "Réf. BACKEND_LATER";
      ctx.drawText(label, 15 * MM_TO_PT, 29 * MM_TO_PT, {
        fontSize: 11,
        fontStyle: "bold",
        color: "#071a3d",
        maxWidth: dims.width * 0.48,
      });
      ctx.drawText(`${status} · ${sensitivity} · ${reference} · ${date}`, dims.width - 15 * MM_TO_PT, 29 * MM_TO_PT, {
        fontSize: 8,
        align: "right",
        color: "#4b5563",
        maxWidth: dims.width * 0.48,
      });
      ctx.drawLine(15 * MM_TO_PT, 33 * MM_TO_PT, dims.width - 15 * MM_TO_PT, 33 * MM_TO_PT, { color: "#d1d5db" });
    },

    /**
     * @param {import("./render-context.js").RenderContext} ctx
     * @param {import("./contracts.js").DocumentModel} model
     */
    applyFooter(ctx, model) {
      const dims = ctx.getDimensions();
      if (isProtectedCardLayout(ctx.layout && ctx.layout.name)) {
        const legacyFooterY = dims.height - 12 * MM_TO_PT;
        ctx.drawLine(15 * MM_TO_PT, legacyFooterY - 2 * MM_TO_PT, dims.width - 15 * MM_TO_PT, legacyFooterY - 2 * MM_TO_PT, { color: "#cccccc" });
        const legacyParts = [model.school.name, model.school.address, model.school.city, model.school.phone, model.school.email].filter(Boolean);
        ctx.drawText(legacyParts.join(" · "), dims.width / 2, legacyFooterY, {
          fontSize: 8,
          align: "center",
          maxWidth: dims.width - 30 * MM_TO_PT,
        });
        const legacyGeneratedAt = model.meta.generatedAt || model.meta.createdAt;
        ctx.drawText(`Document généré par SchoolSafe — ${formatDate(legacyGeneratedAt, model.meta.locale)}`, dims.width / 2, legacyFooterY + 5 * MM_TO_PT, {
          fontSize: 7,
          align: "center",
          color: "#888888",
          maxWidth: dims.width - 30 * MM_TO_PT,
        });
        return;
      }
      const footerY = dims.height - 16 * MM_TO_PT;

      ctx.drawLine(15 * MM_TO_PT, footerY - 2 * MM_TO_PT, dims.width - 15 * MM_TO_PT, footerY - 2 * MM_TO_PT, { color: "#cccccc" });

      const configuredFooter = model.school.documentFooter || model.schoolsafe.documentFooter || "";
      ctx.drawText(configuredFooter, dims.width / 2, footerY, {
        fontSize: 8,
        align: "center",
        maxWidth: dims.width - 30 * MM_TO_PT,
      });

      const generatedAt = model.meta.generatedAt || model.meta.createdAt;
      const secondaryIdentity = [model.schoolsafe.name || "SchoolSafe", model.schoolsafe.website, model.schoolsafe.legalMention].filter(Boolean).join(" · ");
      ctx.drawText(`${secondaryIdentity} — ${formatDate(generatedAt, model.meta.locale)}`, dims.width / 2, footerY + 5 * MM_TO_PT, {
        fontSize: 7,
        align: "center",
        color: "#888888",
        maxWidth: dims.width - 30 * MM_TO_PT,
      });
    },

    /**
     * @param {import("./render-context.js").RenderContext} ctx
     * @param {import("./contracts.js").DocumentModel} model
     * @param {{page:number, totalPages:number}} pagination
     */
    applyPageNumber(ctx, model, pagination) {
      const dims = ctx.getDimensions();
      const footerY = dims.height - 16 * MM_TO_PT;
      ctx.drawText(`Page ${pagination.page} / ${pagination.totalPages}`, dims.width - 15 * MM_TO_PT, footerY + 9 * MM_TO_PT, {
        fontSize: 8,
        align: "right",
      });
    },
  };
}

export function getUniversalContentBounds(layout) {
  if (isProtectedCardLayout(layout && layout.name)) {
    return {
      top: layout.margins.top + 28 * MM_TO_PT,
      bottom: layout.dimensions.height - layout.margins.bottom - 12 * MM_TO_PT,
    };
  }
  return {
    top: Math.max(layout.margins.top, UNIVERSAL_HEADER_HEIGHT),
    bottom: layout.dimensions.height - Math.max(layout.margins.bottom, UNIVERSAL_FOOTER_HEIGHT),
  };
}

export function isProtectedCardLayout(layoutName) {
  return layoutName === LAYOUTS.STUDENT_CARD_HORIZONTAL.name || layoutName === LAYOUTS.STUDENT_BADGE_VERTICAL.name;
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

function formatDate(isoString, locale) {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat(locale || "fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
