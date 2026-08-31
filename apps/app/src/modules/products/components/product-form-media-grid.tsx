"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Loader2Icon, Plus, XIcon } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadImage } from "@/lib/utils/upload-image";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const VISIBLE_SLOTS = 8;

interface ProductFormMediaGridProps {
  disabled?: boolean;
  onChange: (urls: string[]) => void;
  value: string[];
}

export function ProductFormMediaGrid({
  value,
  onChange,
  disabled,
}: ProductFormMediaGridProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const all = Array.from(files);
      if (all.length === 0) {
        return;
      }

      const list: File[] = [];
      for (const file of all) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          toast.error(`"${file.name}" is not a supported image type`);
        } else if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" exceeds the 5 MB size limit`);
        } else {
          list.push(file);
        }
      }

      if (list.length === 0) {
        return;
      }

      const ids = list.map(() => crypto.randomUUID());
      setPendingIds((prev) => [...prev, ...ids]);

      const results = await Promise.allSettled(list.map(uploadImage));
      const uploaded: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          uploaded.push(result.value);
        } else {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : "Upload failed";
          toast.error(message);
        }
      }

      if (uploaded.length > 0) {
        onChange([...valueRef.current, ...uploaded]);
      }
      setPendingIds((prev) => prev.filter((id) => !ids.includes(id)));
    },
    [onChange]
  );

  const handleRemove = useCallback(
    (url: string) => {
      onChange(value.filter((u) => u !== url));
    },
    [onChange, value]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      if (disabled) {
        return;
      }
      const files = event.dataTransfer.files;
      if (files && files.length > 0) {
        handleFiles(files).catch(() => {
          // errors are surfaced via toast inside handleFiles
        });
      }
    },
    [disabled, handleFiles]
  );

  const hiddenCount = expanded ? 0 : Math.max(0, value.length - VISIBLE_SLOTS);
  const visibleImages = expanded
    ? value
    : value.slice(0, hiddenCount > 0 ? VISIBLE_SLOTS - 1 : VISIBLE_SLOTS);
  const hasMain = visibleImages.length > 0;

  const addButton = (
    <button
      aria-label="Add image"
      className={cn(
        "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
        isDragOver && "border-ring bg-accent text-foreground",
        disabled && "cursor-not-allowed opacity-50 hover:border-input"
      )}
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragLeave={() => setIsDragOver(false)}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) {
          setIsDragOver(true);
        }
      }}
      onDrop={handleDrop}
      type="button"
    >
      <Plus className="size-5" />
    </button>
  );

  const fileInput = (
    <input
      accept="image/png,image/jpeg,image/webp,image/gif"
      className="hidden"
      multiple
      onChange={(e) => {
        const files = e.target.files;
        if (files) {
          handleFiles(files).catch(() => {
            // errors are surfaced via toast inside handleFiles
          });
        }
        e.target.value = "";
      }}
      ref={inputRef}
      type="file"
    />
  );

  // Expanded: uniform grid of all images
  if (expanded) {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-4 gap-2">
          {value.map((url) => (
            <ImageTile
              disabled={disabled}
              key={url}
              onRemove={() => handleRemove(url)}
              url={url}
            />
          ))}
          {pendingIds.map((id) => (
            <PendingTile key={id} />
          ))}
          {!disabled && addButton}
        </div>
        <button
          className="text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setExpanded(false)}
          type="button"
        >
          Show less
        </button>
        {fileInput}
      </div>
    );
  }

  // Collapsed: hero + thumbnail grid
  return (
    <div className="grid grid-cols-6 gap-2">
      {/* Main / hero image */}
      {hasMain ? (
        <div className="group relative col-span-2 row-span-2 overflow-hidden rounded-lg border bg-muted">
          <div className="relative aspect-square w-full">
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="(min-width: 768px) 200px, 160px"
              src={visibleImages[0]}
              unoptimized
            />
          </div>
          {!disabled && (
            <Button
              aria-label="Remove image"
              className="absolute top-1 right-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => handleRemove(visibleImages[0])}
              size="icon-xs"
              type="button"
              variant="secondary"
            >
              <XIcon />
            </Button>
          )}
        </div>
      ) : (
        <div className="col-span-2 row-span-2">{addButton}</div>
      )}

      {/* Thumbnail images (positions 2-8) */}
      {visibleImages.slice(1).map((url) => (
        <ImageTile
          disabled={disabled}
          key={url}
          onRemove={() => handleRemove(url)}
          url={url}
        />
      ))}

      {/* "+N" overlay tile */}
      {hiddenCount > 0 && (
        <button
          className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/80 font-medium text-foreground text-lg transition-colors hover:bg-muted"
          onClick={() => setExpanded(true)}
          type="button"
        >
          <Image
            alt=""
            className="object-cover opacity-40"
            fill
            sizes="96px"
            src={value[VISIBLE_SLOTS - 1]}
            unoptimized
          />
          <span className="relative z-10 drop-shadow-sm">
            +{hiddenCount + 1}
          </span>
        </button>
      )}

      {/* Pending uploads */}
      {pendingIds.map((id) => (
        <PendingTile key={id} />
      ))}

      {/* Add button (shown when there's at least one image) */}
      {hasMain && !disabled && addButton}

      {fileInput}
    </div>
  );
}

function ImageTile({
  url,
  onRemove,
  disabled,
}: {
  disabled?: boolean;
  onRemove: () => void;
  url: string;
}) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
      <Image
        alt=""
        className="object-cover"
        fill
        sizes="96px"
        src={url}
        unoptimized
      />
      {!disabled && (
        <Button
          aria-label="Remove image"
          className="absolute top-1 right-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          onClick={onRemove}
          size="icon-xs"
          type="button"
          variant="secondary"
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

function PendingTile() {
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed bg-muted">
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
