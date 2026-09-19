import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

export async function uploadBuffer(
  client: S3Client,
  bucket: string,
  key: string,
  buffer: Buffer,
  contentType = "image/png"
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType
  });
  await client.send(command);
}

export async function getSignedDownloadUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds = 72 * 60 * 60
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
