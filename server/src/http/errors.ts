export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "ACCESS_DENIED"
  | "SCOPE_DENIED"
  | "CONDITION_DENIED"
  | "VALIDATION_INVALID"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_DUPLICATE"
  | "DEPENDENCY_UNAVAILABLE"
  | "AUDIT_UNAVAILABLE"
  | "SETUP_TOKEN_INVALID"
  | "SETUP_SCHOOL_FAILED"
  | "SETUP_ADMIN_FAILED"
  | "SCHOOL_NOT_FOUND"
  | "STUDENT_MATRICULE_EXISTS"
  | "STUDENT_DRAFT_INVALID"
  | "STUDENT_DRAFT_FAILED"
  | "STUDENT_COMPENSATION_FAILED"
  | "STUDENT_READ_FAILED"
  | "STUDENT_NOT_FOUND"
  | "STUDENT_NOT_OPERATIONAL"
  | "PARENT_SEARCH_FAILED"
  | "FILE_MISSING"
  | "FILE_INVALID"
  | "LICENSE_INACTIVE"
  | "FILE_TOO_LARGE"
  | "NOT_FOUND"
  | "TRIAL_EXPIRED"
  | "JASPE_OFFLINE"
  | "JASPE_TIMEOUT"
  | "JASPE_PROVIDER_ERROR"
  | "JASPE_RATE_LIMITED"
  | "CONTROL_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  code: ApiErrorCode;
  message: string;
  request_id: string;
  retryable: boolean;
};

export class SchoolSafeError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    public readonly publicMessage: string,
    public readonly retryable: boolean
  ) {
    super(publicMessage);
    this.name = "SchoolSafeError";
  }
}
