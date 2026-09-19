export function createDocumentNumberingService(supabaseClient, schoolId) {
  return {
    /**
     * @param {string} documentType
     * @param {string} [prefix]
     * @returns {Promise<string>}
     */
    async nextNumber(documentType, prefix = "") {
      const { data, error } = await supabaseClient.rpc("next_document_number", {
        p_school_id: schoolId,
        p_document_type: documentType,
        p_prefix: prefix,
      });
      if (error) throw new Error(`Document numbering failed: ${error.message}`);
      return data;
    },
  };
}
