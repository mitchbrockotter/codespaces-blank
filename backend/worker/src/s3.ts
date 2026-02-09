import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { env } from "./env";

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE
});

export async function downloadObject(key: string) {
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  return s3.send(command);
}

export async function uploadObject(params: { key: string; body: Readable; contentType: string }) {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType
  });
  await s3.send(command);
}
