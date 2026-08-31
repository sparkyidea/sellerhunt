import { PutObjectCommand } from "@aws-sdk/client-s3";
import { authServer } from "@dashseller/auth/auth-server";
import { Hono } from "hono";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "../lib/r2";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const uploadRoutes = new Hono();

uploadRoutes.post("/images", async (c) => {
  const session = await authServer.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "Missing 'file' field" }, 400);
  }

  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return c.json({ error: "Unsupported image type" }, 415);
  }

  if (file.size > MAX_BYTES) {
    return c.json({ error: "File exceeds 5 MB limit" }, 413);
  }

  const key = `products/${session.user.id}/${crypto.randomUUID()}.${ext}`;
  const body = new Uint8Array(await file.arrayBuffer());

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return c.json({ url: `${R2_PUBLIC_URL}/${key}`, key });
});

export default uploadRoutes;
