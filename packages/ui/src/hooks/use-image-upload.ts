import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface UseImageUploadProps {
  acceptedTypes?: string[];
  maxSize?: number;
  onUpload?: (url: string) => void;
}

export function useImageUpload({
  onUpload,
  maxSize = DEFAULT_MAX_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
}: UseImageUploadProps = {}) {
  const previewRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dummy upload function that simulates a delay and returns the local preview URL.
  // Replace with a real upload implementation in consumer apps.
  const dummyUpload = async (
    _file: File,
    localUrl: string
  ): Promise<string> => {
    try {
      setUploading(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (Math.random() < 0.2) {
        throw new Error("Upload failed - This is a demo error");
      }

      setError(null);
      return localUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleThumbnailClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        if (!acceptedTypes.includes(file.type)) {
          setError("File type not supported");
          return;
        }
        if (file.size > maxSize) {
          const limitMB = Math.round(maxSize / 1024 / 1024);
          setError(`File size exceeds ${limitMB} MB limit`);
          return;
        }

        setError(null);
        setFileName(file.name);
        const localUrl = URL.createObjectURL(file);
        setPreviewUrl(localUrl);
        previewRef.current = localUrl;

        try {
          const uploadedUrl = await dummyUpload(file, localUrl);
          onUpload?.(uploadedUrl);
        } catch {
          URL.revokeObjectURL(localUrl);
          setPreviewUrl(null);
          setFileName(null);
        }
      }
    },
    [onUpload, maxSize, acceptedTypes]
  );

  const handleRemove = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setFileName(null);
    previewRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setError(null);
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  return {
    previewUrl,
    fileName,
    fileInputRef,
    handleThumbnailClick,
    handleFileChange,
    handleRemove,
    uploading,
    error,
  };
}
