import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType?: string;
}) {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType
  });
  await s3.send(command);
}

export async function createDownloadUrl(params: {
  key: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: params.key,
    ResponseContentType: params.contentType,
    ResponseContentDisposition: `attachment; filename="${params.filename}"`
  });
  return getSignedUrl(s3, command, { expiresIn: params.expiresIn });
}
