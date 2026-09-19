export type NotificationChannel = "EMAIL" | "SMS" | "IN_APP" | "PUSH";

export type NotificationStatus =
  | "PENDING"
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "DELIVERED"
  | "DISMISSED";

export type NotificationInput = {
  schoolId: string;
  userId: string;
  eventId?: string;
  channel: NotificationChannel;
  templateKey?: string;
  title?: string;
  message: string;
  recipientEmail?: string;
  recipientPhone?: string;
};

export type NotificationResult = {
  id: string;
  status: NotificationStatus;
  provider?: string;
  error?: string;
};

export type NotificationRecord = NotificationInput & {
  id: string;
  status: NotificationStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
};

export type SendAttempt = {
  status: NotificationStatus;
  providerMessageId?: string;
  error?: string;
};

export interface NotificationProvider {
  readonly name: string;
  send(record: NotificationRecord): Promise<SendAttempt>;
}

export interface NotificationService {
  queue(input: NotificationInput): Promise<NotificationResult>;
}
