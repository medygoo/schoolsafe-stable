/**
 * @typedef {Object} SchoolIdentity
 * @property {string} name
 * @property {string|null} [nameEn]
 * @property {string|null} [legalName]
 * @property {string|null} [schoolType]
 * @property {string|null} [approvalCode]
 * @property {string|null} [motto]
 * @property {string} [officialLanguage]
 * @property {string|null} [address]
 * @property {string|null} [city]
 * @property {string|null} [province]
 * @property {string|null} [country]
 * @property {string|null} [phone]
 * @property {string|null} [email]
 * @property {string|null} [website]
 * @property {string} primaryColor
 * @property {string} accentColor
 * @property {string|null} [logoUrl]
 * @property {string|null} [documentFooter]
 * @property {string|null} [officialSealUrl]
 * @property {string} currency
 * @property {string|null} [bankName]
 * @property {string|null} [bankAccount]
 * @property {string|null} [taxId]
 * @property {string|null} [directorName]
 * @property {string|null} [directorSignatureUrl]
 * @property {{id:string,label:string,startsOn?:string,endsOn?:string}|null} [activeAcademicYear]
 * @property {{key:string,name:string}[]} [activeCycles]
 */

export function createSchoolIdentityProvider(api) {
  return {
    /**
     * @returns {Promise<SchoolIdentity>}
     */
    async load() {
      const settings = await api.getSettings();
      const identity = settings.identity || {};
      const brand = settings.brand || {};
      const contact = settings.contact || {};
      const years = settings.academic_years || [];
      const cycles = settings.cycles || [];

      const activeYear = years.find((y) => y.is_active) || years[0] || null;

      return {
        name: identity.name || "",
        nameEn: identity.name_en || null,
        legalName: identity.legal_name || null,
        schoolType: identity.school_type || null,
        approvalCode: identity.approval_code || null,
        motto: identity.motto || null,
        officialLanguage: identity.official_language || "FR",

        address: contact.address || null,
        city: contact.city || null,
        province: contact.province || null,
        country: contact.country || null,
        phone: contact.phone || null,
        email: contact.email || null,
        website: contact.website_url || null,

        primaryColor: brand.primary_color || "#071a3d",
        accentColor: brand.accent_color || "#e9a515",
        logoUrl: brand.logo_path || null,
        documentFooter: brand.document_footer || null,
        officialSealUrl: identity.official_seal_url || null,

        currency: identity.currency || "USD",
        bankName: identity.bank_name || null,
        bankAccount: identity.bank_account || null,
        taxId: identity.tax_id || null,
        directorName: identity.director_name || null,
        directorSignatureUrl: identity.director_signature_url || null,

        activeAcademicYear: activeYear
          ? { id: activeYear.id, label: activeYear.label, startsOn: activeYear.starts_on, endsOn: activeYear.ends_on }
          : null,
        activeCycles: cycles.filter((c) => c.is_active).map((c) => ({ key: c.cycle_key, name: c.cycle_name })),
      };
    },
  };
}
