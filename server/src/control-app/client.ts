import { createHmac } from "node:crypto";

export type ControlAppConfig = {
  url: string;
  instanceId: string;
  hmacSecret: string;
};

export function signControlAppRequest(payload: {
  method: string;
  path: string;
  body: string;
  timestamp: number;
  secret: string;
}): string {
  const data = `${payload.method.toUpperCase()}\n${payload.path}\n${payload.timestamp}\n${payload.body}`;
  return createHmac("sha256", payload.secret).update(data).digest("hex");
}

export async function pushCardPrintRequest(
  config: ControlAppConfig,
  request: {
    school_id: string;
    student_id: string;
    student_name: string;
    class_name: string;
    academic_year: string;
    front_key: string;
    back_key: string;
    front_signed_url: string;
    back_signed_url: string;
    signed_url_expires_at: string;
    format: "badge" | "carte";
    version: number;
    is_duplicate: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<{ id: string }> {
  const path = "/card-print-requests";
  const body = JSON.stringify(request);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signControlAppRequest({
    method: "POST",
    path,
    body,
    timestamp,
    secret: config.hmacSecret
  });

  const url = new URL(path, config.url).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-schoolsafe-instance": config.instanceId,
      "x-schoolsafe-timestamp": String(timestamp),
      "x-schoolsafe-signature": signature
    },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`Control app returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { data: { id: string } };
  return { id: data.data.id };
}

/** Device Hub : déclarer un appareil auprès de Control (registre maître matériel). */
export async function pushDeviceRegistration(
  config: ControlAppConfig,
  device: {
    school_id: string;
    device_code: string;
    vendor: string;
    model: string;
    serial_number: string;
    location?: string;
  }
): Promise<{ id: string }> {
  const path = "/device-registrations";
  const body = JSON.stringify(device);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signControlAppRequest({
    method: "POST",
    path,
    body,
    timestamp,
    secret: config.hmacSecret
  });

  const url = new URL(path, config.url).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-schoolsafe-instance": config.instanceId,
      "x-schoolsafe-timestamp": String(timestamp),
      "x-schoolsafe-signature": signature
    },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`Control app returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { data: { id: string } };
  return { id: data.data.id };
}

/** Lot 1 cartes : notifier Control qu'un ZIP de lot est prêt à être téléchargé/imprimé. */
export async function pushCardPrintBatch(
  config: ControlAppConfig,
  batch: {
    school_id: string;
    batch_id: string;
    version: number;
    card_count: number;
    r2_key: string;
    zip_signed_url: string;
    signed_url_expires_at: string;
    zip_sha256: string;
  }
): Promise<{ id: string }> {
  const path = "/card-print-batches";
  const body = JSON.stringify(batch);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signControlAppRequest({
    method: "POST",
    path,
    body,
    timestamp,
    secret: config.hmacSecret
  });

  const url = new URL(path, config.url).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-schoolsafe-instance": config.instanceId,
      "x-schoolsafe-timestamp": String(timestamp),
      "x-schoolsafe-signature": signature
    },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`Control app returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { data: { id: string } };
  return { id: data.data.id };
}
