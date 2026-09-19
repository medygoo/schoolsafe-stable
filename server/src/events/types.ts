export type EventType =
  | "STUDENT_ENTERED"
  | "STUDENT_EXITED"
  | "UNAUTHORIZED_EXIT_ATTEMPT"
  | "LOCKDOWN_ACTIVATED";

export type SchoolSafeEvent = {
  type: EventType;
  schoolId: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  payload: Record<string, unknown>;
};

export type EmitOptions = {
  dispatchImmediately?: boolean;
};

export type EmitResult = {
  id: string;
  status: string;
};

export type EventServiceOptions = {
  dispatcher?: {
    dispatch: (event: SchoolSafeEvent & { id: string }) => Promise<void>;
  };
};

export interface EventService {
  emit(event: SchoolSafeEvent, options?: EmitOptions): Promise<EmitResult>;
}
