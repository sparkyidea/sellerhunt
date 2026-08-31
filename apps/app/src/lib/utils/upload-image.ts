import { env } from "@dashseller/env/app";

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/uploads/images`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    }
  );

  const payload = (await response.json()) as {
    error?: string;
    url?: string;
  };

  if (!(response.ok && payload.url)) {
    throw new Error(payload.error ?? "Upload failed");
  }

  return payload.url;
}
