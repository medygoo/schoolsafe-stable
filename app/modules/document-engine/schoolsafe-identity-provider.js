// app/modules/document-engine/schoolsafe-identity-provider.js
// Centralized SchoolSafe identity provider used by every document.

const IDENTITY_PATH = "../shared/schoolsafe-identity.json";

let cached = null;

/**
 * @typedef {Object} SchoolSafeIdentity
 * @property {string} name
 * @property {string} nameFr
 * @property {string} nameEn
 * @property {string|null} logoUrl
 * @property {string|null} website
 * @property {string|null} email
 * @property {string|null} supportEmail
 * @property {string|null} documentFooter
 * @property {string|null} legalMention
 */

export function createSchoolSafeIdentityProvider(options = {}) {
  const path = options.path || IDENTITY_PATH;

  return {
    /**
     * @returns {Promise<SchoolSafeIdentity>}
     */
    async load() {
      if (cached && !options.noCache) {
        return cached;
      }
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to load SchoolSafe identity: ${res.status}`);
        const data = await res.json();
        cached = normalize(data);
        return cached;
      } catch (err) {
        // Fallback if fetch fails (e.g. in Node tests)
        cached = fallbackIdentity();
        return cached;
      }
    },

    reset() {
      cached = null;
    },
  };
}

function normalize(data) {
  return {
    name: data.name || "SchoolSafe",
    nameFr: data.nameFr || data.name || "SchoolSafe",
    nameEn: data.nameEn || data.name || "SchoolSafe",
    logoUrl: data.logoUrl || null,
    website: data.website || null,
    email: data.email || null,
    supportEmail: data.supportEmail || null,
    documentFooter: data.documentFooter || null,
    legalMention: data.legalMention || "Document généré par SchoolSafe",
  };
}

function fallbackIdentity() {
  return {
    name: "SchoolSafe",
    nameFr: "SchoolSafe",
    nameEn: "SchoolSafe",
    logoUrl: null,
    website: "https://schoolsafe.app",
    email: "contact@schoolsafe.app",
    supportEmail: "support@schoolsafe.app",
    documentFooter: "Solution de gestion scolaire SchoolSafe",
    legalMention: "Document généré par SchoolSafe",
  };
}
