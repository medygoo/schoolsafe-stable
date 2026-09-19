// SchoolSafe Device Hub — Phase 1 : contrat générique DeviceAdapter (§7).
// Le cœur de SchoolSafe ne dépend d'aucune marque. Une opération non
// supportée renvoie "unsupported", jamais un faux succès. Aucune URL
// libre ni shell distant fourni par l'appareil.
export type DeviceCapability =
  | "fingerprint"
  | "pin"
  | "card"
  | "qr"
  | "face"
  | "attendance_events"
  | "remote_person_sync"
  | "remote_fingerprint_enrollment";

export interface DeviceInfo {
  vendor: string;
  model: string;
  serial_number: string;
  firmware: string | null;
  protocol: string;
}

export interface DeviceHealth {
  online: boolean;
  last_checked_at: string;
  detail?: string;
}

export interface DevicePerson {
  external_person_id: string;
  name: string;
  active: boolean;
}

export interface RawDeviceEvent {
  raw_provider_event_id: string | null;
  external_person_id: string | null;
  credential_type: "fingerprint" | "pin" | "card" | "qr";
  event_type: "check_in" | "check_out" | "authentication" | "access" | "unknown";
  occurred_at: string;
  metadata?: Record<string, unknown>;
}

export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; unsupported: true; reason: string }
  | { ok: false; error: string };

export interface DeviceAdapter {
  readonly kind: string;

  testConnection(): Promise<AdapterResult<boolean>>;
  getDeviceInfo(): Promise<AdapterResult<DeviceInfo>>;
  getCapabilities(): Promise<AdapterResult<Partial<Record<DeviceCapability, boolean>>>>;
  healthCheck(): Promise<AdapterResult<DeviceHealth>>;

  createPerson(person: DevicePerson): Promise<AdapterResult<{ external_person_id: string }>>;
  updatePerson(person: DevicePerson): Promise<AdapterResult<boolean>>;
  disablePerson(externalPersonId: string): Promise<AdapterResult<boolean>>;

  assignPin(externalPersonId: string, pin: string): Promise<AdapterResult<boolean>>;
  assignCard(externalPersonId: string, cardNumber: string): Promise<AdapterResult<boolean>>;

  startFingerprintEnrollment(externalPersonId: string): Promise<AdapterResult<{ started: boolean }>>;
  getEnrollmentStatus(externalPersonId: string): Promise<AdapterResult<{ enrolled: boolean }>>;

  getEvents(cursor: { position: string | null }): Promise<AdapterResult<{ events: RawDeviceEvent[]; next_position: string | null }>>;
}

export function unsupported<T>(reason: string): AdapterResult<T> {
  return { ok: false, unsupported: true, reason };
}

export function failure<T>(error: string): AdapterResult<T> {
  return { ok: false, error };
}

export function success<T>(value: T): AdapterResult<T> {
  return { ok: true, value };
}