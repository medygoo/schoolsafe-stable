// app/modules/document-engine/template-registry.js
// Central registry for all document templates.

export function createTemplateRegistry() {
  const byType = new Map();

  return {
    /**
     * Register a template.
     * @param {TemplateInfo} info
     * @param {ProgrammaticTemplate | DeclarativeTemplate} template
     */
    register(info, template) {
      if (!info || !info.type) {
        throw new Error("TemplateInfo must have a type");
      }
      if (!template) {
        throw new Error(`Template ${info.type} is missing an implementation`);
      }
      if (!Array.isArray(info.permissions) || info.permissions.length === 0) {
        throw new Error(`Template ${info.type} must declare at least one permission`);
      }
      byType.set(info.type, { info, template });
    },

    /**
     * @param {string} type
     * @returns {ProgrammaticTemplate | DeclarativeTemplate}
     */
    get(type) {
      const entry = byType.get(type);
      if (!entry) throw new Error(`Template not found: ${type}`);
      return entry.template;
    },

    /**
     * @param {string} type
     * @returns {TemplateInfo}
     */
    getInfo(type) {
      const entry = byType.get(type);
      if (!entry) throw new Error(`Template info not found: ${type}`);
      return entry.info;
    },

    /**
     * @param {TemplateFilter} [filters]
     * @returns {TemplateInfo[]}
     */
    list(filters = {}) {
      let list = Array.from(byType.values()).map((entry) => entry.info);
      if (filters.sourceModule) {
        list = list.filter((info) => info.sourceModule === filters.sourceModule);
      }
      if (filters.nature) {
        list = list.filter((info) => info.nature === filters.nature);
      }
      if (filters.format) {
        list = list.filter((info) => info.supportedFormats.includes(filters.format));
      }
      return list;
    },
  };
}

/**
 * @typedef {Object} TemplateInfo
 * @property {string} type
 * @property {string} label
 * @property {string} [labelFr]
 * @property {string} [labelEn]
 * @property {string} sourceModule
 * @property {import("./contracts.js").DocumentNature} nature
 * @property {string[]} defaultFormats
 * @property {string[]} supportedFormats
 * @property {string} defaultLayout
 * @property {string[]} permissions
 * @property {string} templateVersion
 * @property {string} [description]
 */

/**
 * @typedef {Object} ProgrammaticTemplate
 * @property {TemplateInfo} info
 * @property {(ctx: RenderContext, model: import("./contracts.js").DocumentModel, layout: LayoutContext) => Promise<void>} render
 */

/**
 * @typedef {Object} DeclarativeTemplate
 * @property {TemplateInfo} info
 * @property {DeclarativeSchema} schema
 */

/**
 * @typedef {Object} TemplateFilter
 * @property {string} [sourceModule]
 * @property {string} [nature]
 * @property {string} [format]
 */
