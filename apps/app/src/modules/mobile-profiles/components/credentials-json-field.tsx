"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Field, FieldLabel } from "@sparkyidea/ui/components/field";
import { Textarea } from "@sparkyidea/ui/components/textarea";
import { UploadIcon } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import type { CredentialApp } from "../credential-app";
import { credentialsPlaceholder } from "../credentials-json";

/** Form field name the submit handler reads off `FormData`. */
export const CREDENTIALS_JSON_NAME = "credentials";

/**
 * The only credential input on the create dialog: one slot that accepts a
 * paste, a drop, or a picked file. Uncontrolled — nothing reads the blob until
 * submit, and the drop/picker paths write straight into the textarea.
 * Validation happens on submit and every result leaves as a toast, so this
 * field carries no error state.
 */
export function CredentialsJsonField({
  app,
  disabled,
}: {
  app: CredentialApp;
  disabled?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);

  function readFile(file: File) {
    file
      .text()
      .then((text) => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.value = text;
          textarea.focus();
        }
      })
      .catch(() => toast.error("Could not read that file"));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) {
      return;
    }
    const file = event.dataTransfer.files.item(0);
    if (file) {
      readFile(file);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>Credentials JSON</FieldLabel>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the drop target wraps the textarea, which keeps every keyboard path */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dropping a file is a pointer-only shortcut for the file picker beside it */}
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
          name={CREDENTIALS_JSON_NAME}
          placeholder={credentialsPlaceholder(app)}
          ref={textareaRef}
          spellCheck={false}
        />
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="flex items-center gap-2 text-muted-foreground">
            <UploadIcon className="size-4" />
            Paste above, or drop a .json file
          </span>
          <Button
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            Choose file
          </Button>
          <input
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.item(0);
              if (file) {
                readFile(file);
              }
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
