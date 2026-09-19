// app/modules/document-engine/bootstrap-templates.js
// Register the default SchoolSafe document templates into a registry.

import { assignmentTemplate } from "./templates/assignment-template.js";
import { answerSheetTemplate } from "./templates/answer-sheet-template.js";
import { receiptTemplate } from "./templates/receipt-template.js";

export function registerDefaultTemplates(registry) {
  registry.register(assignmentTemplate.info, assignmentTemplate);
  registry.register(answerSheetTemplate.info, answerSheetTemplate);
  registry.register(receiptTemplate.info, receiptTemplate);
}
