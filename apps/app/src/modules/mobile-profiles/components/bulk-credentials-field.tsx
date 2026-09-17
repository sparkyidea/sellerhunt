"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Field, FieldLabel } from "@sparkyidea/ui/components/field";
import { Textarea } from "@sparkyidea/ui/components/textarea";
import { UploadIcon } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { bulkPlaceholder, mergeCaptureText } from "../bulk-merge";

/**
 * The bulk pane's one input: the same slot as the single-profile dialog's
 * `CredentialsJsonField` — paste, drop, or pick — except it takes several
 * files and appends each one's entries to whatever the pane already holds.
 *
 * Controlled, because the dialog parses on every keystroke and the row list
 * below is that parse.
 */
export function BulkCredentialsField({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (text: string) => void;
  value: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function appendFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    try {
      const read = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          text: await file.text(),
        }))
      );
      const merged = mergeCaptureText(value, read);
      if (!merged.ok) {
        toast.error(merged.message);
        return;
      }
      onChange(merged.text);
    } catch {
      toast.error("Could not read those files");
    }
  }

  function handleFiles(files: File[]) {
    appendFiles(files).catch(() => toast.error("Could not read those files"));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) {
      return;
    }
    handleFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>Credentials JSON</FieldLabel>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the drop target wraps the textarea, which keeps every keyboard path */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dropping files is a pointer-only shortcut for the file picker beside it */}
      <div
        className="flex flex-col gap-3 rounded-lg border border-input border-dashed bg-muted/50 p-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-[dragging=true]:border-ring data-[dragging=true]:bg-muted"
        data-dragging={dragging}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={handleDrop}
      >
        <Textarea
          autoComplete="off"
          className="field-sizing-fixed min-h-52 resize-none rounded-none border-0 bg-transparent p-0 pr-1 font-mono text-xs leading-relaxed focus-visible:border-0 focus-visible:ring-0 md:text-xs"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={bulkPlaceholder()}
          spellCheck={false}
          value={value}
        />
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="flex items-center gap-2 text-muted-foreground">
            <UploadIcon className="size-4" />
            Paste above, or drop .json files
          </span>
          <Button
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            Choose files
          </Button>
          <input
            accept=".json,application/json"
            className="hidden"
            multiple
            onChange={(event) => {
              handleFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
        </div>
      </div>
    </Field>
  );
}
