import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: "https://s3.us-east-005.backblazeb2.com",
  region: "us-east-005",
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
});

async function main() {
  const data = await client.send(new ListObjectsV2Command({ Bucket: "mehewara" }));
  console.log("Objects:", data.Contents ? data.Contents.length : 0);
}
main().catch(console.error);
