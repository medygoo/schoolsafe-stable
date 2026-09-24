// SchoolSafe School Context — Source of Truth for School Identity.
// Centralizes school profile data to avoid duplication across modules.
(function () {
  "use strict";

  var schoolProfile = null;

  function setProfile(profile) {
    schoolProfile = profile;
    // Dispatch event for modules to react to school identity changes
    window.dispatchEvent(new CustomEvent('schoolsafe:school-updated', { detail: profile }));
  }

  function getProfile() {
    return schoolProfile;
  }

  function getField(field, defaultValue) {
    if (!schoolProfile) return defaultValue;
    return schoolProfile[field] !== undefined ? schoolProfile[field] : defaultValue;
  }

  // Helper to format the official document code
  function getDocumentCode(type, sequence) {
    var code = getField('school_code', 'SCHOOL');
    var year = getField('active_year_label', '2026-2027');
    // Format: TYPE-CODE-YEAR-SEQ (e.g., DEV-LESAGE-2026-2027-000015)
    return type + '-' + code + '-' + year.replace(/[^0-9]/g, '-') + '-' + String(sequence).padStart(6, '0');
  }

  window.SchoolSafeSchoolContext = {
    setProfile: setProfile,
    getProfile: getProfile,
    getField: getField,
    getDocumentCode: getDocumentCode
  };
})();