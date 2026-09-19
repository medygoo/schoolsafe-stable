// SchoolSafe Device Hub — MockDeviceAdapter (Phase 5 du plan).
// Simule un terminal biométrique pour le développement sans matériel :
// online/offline pilotable, création de personnes, événements empreinte/PIN,
// doublons, échecs réseau et reconnexion. Aucune donnée persistée ici —
// tout vit en mémoire pour la durée du process de test.
import type {
  DeviceAdapter, DeviceInfo, DeviceHealth, DevicePerson, RawDeviceEvent, AdapterResult,
} from "./adapter.js";
import { success, failure, unsupported } from "./adapter.js";
import { randomUUID } from "node:crypto";

export interface MockState {
  online: boolean;
  failNextNetworkCall: boolean;
  persons: Map<string, DevicePerson>;
  enrolledFingerprints: Set<string>;
  events: RawDeviceEvent[];
}

export function createMockDeviceAdapter(options?: {
  serialNumber?: string;
  online?: boolean;
}): { adapter: DeviceAdapter; state: MockState } {
  const state: MockState = {
    online: options?.online ?? true,
    failNextNetworkCall: false,
    persons: new Map(),
    enrolledFingerprints: new Set(),
    events: [],
  };
  const serial = options?.serialNumber ?? "MOCK-000001";

  function guard<T>(): AdapterResult<T> | null {
    if (state.failNextNetworkCall) {
      state.failNextNetworkCall = false;
      return failure<T>("MOCK_NETWORK_FAILURE: appel réseau simulé échoué");
    }
    if (!state.online) {
      return failure<T>("MOCK_OFFLINE: terminal hors ligne");
    }
    return null;
  }

  const adapter: DeviceAdapter = {
    kind: "mock",

    async testConnection() {
      const blocked = guard<boolean>();
      if (blocked) return blocked;
      return success(state.online);
    },

    async getDeviceInfo(): Promise<AdapterResult<DeviceInfo>> {
      const blocked = guard<DeviceInfo>();
      if (blocked) return blocked;
      return success({
        vendor: "SchoolSafe",
        model: "MockTerminal",
        serial_number: serial,
        firmware: "mock-1.0.0",
        protocol: "mock",
      });
    },

    async getCapabilities() {
      const blocked = guard<Partial<Record<string, boolean>>>();
      if (blocked) return blocked;
      return success({
        fingerprint: true,
        pin: true,
        card: true,
        qr: false,
        face: false,
        attendance_events: true,
        remote_person_sync: true,
        remote_fingerprint_enrollment: false,
      });
    },

    async healthCheck(): Promise<AdapterResult<DeviceHealth>> {
      const blocked = guard<DeviceHealth>();
      if (blocked) return blocked;
      return success({ online: state.online, last_checked_at: new Date().toISOString() });
    },

    async createPerson(person: DevicePerson): Promise<AdapterResult<{ external_person_id: string }>> {
      const blocked = guard<{ external_person_id: string }>();
      if (blocked) return blocked;
      const id = person.external_person_id || String(state.persons.size + 1);
      state.persons.set(id, { ...person, external_person_id: id });
      return success({ external_person_id: id });
    },

    async updatePerson(person: DevicePerson): Promise<AdapterResult<boolean>> {
      const blocked = guard<boolean>();
      if (blocked) return blocked;
      if (!state.persons.has(person.external_person_id)) {
        return failure(`MOCK: personne ${person.external_person_id} inconnue`);
      }
      state.persons.set(person.external_person_id, { ...person });
      return success(true);
    },

    async disablePerson(externalPersonId: string): Promise<AdapterResult<boolean>> {
      const blocked = guard<boolean>();
      if (blocked) return blocked;
      const person = state.persons.get(externalPersonId);
      if (!person) return failure(`MOCK: personne ${externalPersonId} inconnue`);
      state.persons.set(externalPersonId, { ...person, active: false });
      return success(true);
    },

    async assignPin(externalPersonId: string, pin: string): Promise<AdapterResult<boolean>> {
      const blocked = guard<boolean>();
      if (blocked) return blocked;
      if (!state.persons.has(externalPersonId)) return failure(`MOCK: personne ${externalPersonId} inconnue`);
      if (!/^\d{4,8}$/.test(pin)) return failure("MOCK: PIN invalide (4 à 8 chiffres attendus)");
      return success(true);
    },

    async assignCard(externalPersonId: string, _cardNumber: string): Promise<AdapterResult<boolean>> {
      const blocked = guard<boolean>();
      if (blocked) return blocked;
      if (!state.persons.has(externalPersonId)) return failure(`MOCK: personne ${externalPersonId} inconnue`);
      return success(true);
    },

    async startFingerprintEnrollment(externalPersonId: string): Promise<AdapterResult<{ started: boolean }>> {
      // Le mock (comme le DS-K1T808MFWX) n'expose pas d'enrôlement distant :
      // l'enrôlement physique sur le terminal reste le parcours normal (§11).
      return unsupported("MOCK: enrôlement distant non supporté — enrôlement physique sur le terminal");
    },

    async getEnrollmentStatus(externalPersonId: string): Promise<AdapterResult<{ enrolled: boolean }>> {
      const blocked = guard<{ enrolled: boolean }>();
      if (blocked) return blocked;
      return success({ enrolled: state.enrolledFingerprints.has(externalPersonId) });
    },

    async getEvents(cursor: { position: string | null }): Promise<AdapterResult<{ events: RawDeviceEvent[]; next_position: string | null }>> {
      const blocked = guard<{ events: RawDeviceEvent[]; next_position: string | null }>();
      if (blocked) return blocked;
      const startIndex = cursor.position ? Number(cursor.position) || 0 : 0;
      const slice = state.events.slice(startIndex);
      return success({
        events: slice,
        next_position: slice.length ? String(state.events.length) : cursor.position,
      });
    },
  };

  return { adapter, state };
}

/** Outils de test : simuler un pointage (empreinte, PIN ou carte) sur le mock. */
export function mockSimulateScan(
  state: MockState,
  input: {
    external_person_id: string;
    credential_type: "fingerprint" | "pin" | "card" | "qr";
    event_type?: "check_in" | "check_out";
    duplicate?: boolean;
  },
): RawDeviceEvent {
  const event: RawDeviceEvent = {
    raw_provider_event_id: input.duplicate ? `mock-dup-${Date.now()}` : randomUUID(),
    external_person_id: input.external_person_id,
    credential_type: input.credential_type,
    event_type: input.event_type ?? "check_in",
    occurred_at: new Date().toISOString(),
  };
  state.events.push(event);
  return event;
}

/** Outils de test : simuler l'enrôlement physique d'une empreinte. */
export function mockSimulateFingerprintEnrollment(state: MockState, externalPersonId: string): void {
  state.enrolledFingerprints.add(externalPersonId);
}