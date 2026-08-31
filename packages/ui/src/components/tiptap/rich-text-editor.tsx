"use client";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, type Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { TipTapFloatingMenu } from "./extensions/floating-menu";
import { FloatingToolbar } from "./extensions/floating-toolbar";
import { ImageExtension } from "./extensions/image";
import { ImagePlaceholder } from "./extensions/image-placeholder";
import SearchAndReplace from "./extensions/search-and-replace";
import { EditorToolbar } from "./toolbars/editor-toolbar";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_MIME_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

function buildExtensions(onUploadImage?: (file: File) => Promise<string>) {
  return [
    StarterKit.configure({
      orderedList: {
        HTMLAttributes: {
          class: "list-decimal",
        },
      },
      bulletList: {
        HTMLAttributes: {
          class: "list-disc",
        },
      },
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
    }),
    Placeholder.configure({
      emptyNodeClass: "is-editor-empty",
      placeholder: ({ node, pos, editor }) => {
        switch (node.type.name) {
          case "heading":
            return `Heading ${node.attrs.level}`;
          case "detailsSummary":
            return "Section title";
          case "blockquote":
          case "bulletList":
          case "orderedList":
          case "listItem":
          case "codeBlock":
            return "";
          default: {
            const resolvedPos = editor.state.doc.resolve(pos);
            if (resolvedPos.parent.type.name === "blockquote") {
              return "Empty quote";
            }
            return "Write, type '/' for commands";
          }
        }
      },
      includeChildren: true,
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TextStyle,
    Subscript,
    Superscript,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    ImageExtension,
    ImagePlaceholder.configure({
      allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
      maxSize: MAX_IMAGE_SIZE,
      onDrop: onUploadImage
        ? (files: File[], editor: import("@tiptap/react").Editor) => {
            for (const file of files) {
              onUploadImage(file)
                .then((url) => {
                  editor.chain().focus().setImage({ src: url }).run();
                })
                .catch(() => {
                  // Upload errors are handled by the consumer
                });
            }
          }
        : undefined,
      // onEmbed is a notification callback — the component already inserts
      // the image from the URL, so no additional handling is needed.
    }),
    SearchAndReplace,
    Typography,
  ];
}

export interface RichTextEditorProps {
  className?: string;
  disabled?: boolean;
  editorClassName?: string;
  onChange: (html: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  placeholder?: string;
  value: string;
}

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  className,
  editorClassName,
  disabled,
}: RichTextEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");

  const extensions = useMemo(
    () => buildExtensions(onUploadImage),
    [onUploadImage]
  );

  // Tiptap normalizes incoming content (wraps in <p>, encodes &, applies
  // Typography rules, etc). These internal transactions fire onUpdate even
  // though no user edit happened — which would falsely dirty host forms.
  // We capture tiptap's canonical render of the externally-set value and
  // skip any onUpdate whose HTML matches it.
  const canonicalHtmlRef = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: extensions as Extension[],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "typography typography--compact max-w-full focus:outline-none",
          editorClassName
        ),
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      if (html === canonicalHtmlRef.current) {
        // Echo of the externally-set value after tiptap normalization — skip.
        return;
      }
      // Real user edit. Update canonical so subsequent equivalent echoes
      // (e.g. further Typography passes) don't re-fire.
      canonicalHtmlRef.current = html;
      // Tiptap returns "<p></p>" for empty — normalize so form dirty checks work.
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Sync external value changes (e.g., form.reset) into the editor and
  // capture the canonical HTML tiptap produced so onUpdate can skip echoes.
  // setContent internally uses flushSync; defer to a microtask so it never
  // fires while a parent is still in its commit phase. Capture the canonical
  // ref synchronously so any update event fired before the microtask runs
  // (e.g. from setEditable on mount) is recognized as an echo.
  useEffect(() => {
    if (!editor) {
      return;
    }
    const current = editor.getHTML();
    const next = value || "<p></p>";
    canonicalHtmlRef.current = current;
    if (current === next) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) {
        return;
      }
      editor.commands.setContent(next, { emitUpdate: false });
      canonicalHtmlRef.current = editor.getHTML();
    });
    return () => {
      cancelled = true;
    };
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  const handleToggleSourceMode = () => {
    if (!editor) {
      return;
    }
    if (sourceMode) {
      // Leaving source mode: push textarea contents back into the editor.
      editor.commands.setContent(sourceDraft || "<p></p>");
      setSourceMode(false);
      return;
    }
    // Entering source mode: snapshot current HTML into the textarea.
    setSourceDraft(editor.getHTML());
    setSourceMode(true);
  };

  const handleClickBelow = () => {
    if (!editor?.isEditable) {
      return;
    }

    const lastNode = editor.state.doc.lastChild;
    const isLastNodeEmpty =
      lastNode?.type.name === "paragraph" && lastNode.content.size === 0;

    if (isLastNodeEmpty) {
      editor.commands.focus("end");
    } else {
      const endPos = editor.state.doc.content.size;
      editor
        .chain()
        .insertContentAt(endPos, { type: "paragraph" })
        .focus("end")
        .run();
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-card",
        className
      )}
    >
      <EditorToolbar
        editor={editor}
        onToggleSourceMode={handleToggleSourceMode}
        sourceMode={sourceMode}
      />
      <FloatingToolbar editor={editor} />
      <TipTapFloatingMenu editor={editor} />
      <div className="flex max-h-[500px] min-h-[150px] flex-col overflow-y-auto">
        <div
          className={cn(
            "grid [&>*]:col-start-1 [&>*]:row-start-1",
            sourceMode && "flex-1"
          )}
        >
          <EditorContent
            className={cn(
              "w-full min-w-full cursor-text p-4 pb-0",
              sourceMode && "invisible"
            )}
            editor={editor}
          />
          <textarea
            aria-label="HTML source"
            className={cn(
              "h-full w-full resize-none bg-transparent p-4 font-mono text-sm outline-none",
              !sourceMode && "invisible"
            )}
            onChange={(e) => setSourceDraft(e.target.value)}
            spellCheck={false}
            tabIndex={sourceMode ? 0 : -1}
            value={sourceDraft}
          />
        </div>
        {/* Spacer fills remaining height below content — clicking here appends a new block */}
        {!sourceMode && (
          <div
            aria-hidden="true"
            className="min-h-8 flex-1 cursor-text"
            onClick={handleClickBelow}
          />
        )}
      </div>
    </div>
  );
}
