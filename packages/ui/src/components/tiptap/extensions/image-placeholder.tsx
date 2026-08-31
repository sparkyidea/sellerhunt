/** biome-ignore-all lint/a11y/noStaticElementInteractions: upstream shadcn-tiptap source */
/** biome-ignore-all lint/a11y/noNoninteractiveElementInteractions: upstream shadcn-tiptap drag-drop zone */
/** biome-ignore-all lint/suspicious/noExplicitAny: tiptap HTMLAttributes type */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: default noop options */
"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Input } from "@sparkyidea/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sparkyidea/ui/components/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sparkyidea/ui/components/tabs";
import {
  isValidUrl,
  NODE_HANDLES_SELECTED_STYLE_CLASSNAME,
} from "@sparkyidea/ui/lib/tiptap-utils";
import { cn } from "@sparkyidea/ui/lib/utils";
import {
  type CommandProps,
  type Editor,
  mergeAttributes,
  Node,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Image, Link, Upload } from "lucide-react";
import { useState } from "react";

export interface ImagePlaceholderOptions {
  allowedMimeTypes?: Record<string, string[]>;
  HTMLAttributes: Record<string, any>;
  maxFiles?: number;
  maxSize?: number;
  onDrop: (files: File[], editor: Editor) => void;
  onDropRejected?: (files: File[], editor: Editor) => void;
  onEmbed: (url: string, editor: Editor) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imagePlaceholder: {
      /**
       * Inserts an image placeholder
       */
      insertImagePlaceholder: () => ReturnType;
    };
  }
}

export const ImagePlaceholder = Node.create<ImagePlaceholderOptions>({
  name: "image-placeholder",

  addOptions() {
    return {
      HTMLAttributes: {},
      onDrop: () => {},
      onDropRejected: () => {},
      onEmbed: () => {},
    };
  },

  group: "block",

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImagePlaceholderComponent, {
      className: NODE_HANDLES_SELECTED_STYLE_CLASSNAME,
    });
  },

  addCommands() {
    return {
      insertImagePlaceholder: () => (props: CommandProps) => {
        return props.commands.insertContent({
          type: "image-placeholder",
        });
      },
    };
  },
});

function ImagePlaceholderComponent(props: NodeViewProps) {
  const { editor, extension, selected } = props;

  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDragReject, setIsDragReject] = useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    setIsDragReject(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    setIsDragReject(false);

    const { files } = e.dataTransfer;
    const acceptedFiles: File[] = [];
    const rejectedFiles: File[] = [];

    for (const file of Array.from(files)) {
      if (
        extension.options.allowedMimeTypes &&
        !Object.keys(extension.options.allowedMimeTypes).some((type) =>
          file.type.match(type)
        )
      ) {
        rejectedFiles.push(file);
      } else if (
        extension.options.maxSize &&
        file.size > extension.options.maxSize
      ) {
        rejectedFiles.push(file);
      } else {
        acceptedFiles.push(file);
      }
    }

    if (rejectedFiles.length > 0) {
      setIsDragReject(true);
      extension.options.onDropRejected?.(rejectedFiles, editor);
    }

    if (acceptedFiles.length > 0) {
      handleAcceptedFiles(acceptedFiles);
    }
  };

  const handleAcceptedFiles = (acceptedFiles: File[]) => {
    if (extension.options.onDrop) {
      // Let the consumer handle uploading and inserting the image.
      extension.options.onDrop(acceptedFiles, editor);
      return;
    }

    // Fallback: read as data URL and insert inline.
    for (const file of acceptedFiles) {
      const reader = new FileReader();

      reader.onload = () => {
        const src = reader.result as string;
        editor.chain().focus().setImage({ src }).run();
      };

      reader.readAsDataURL(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const accepted: File[] = [];
    const rejected: File[] = [];

    for (const file of files) {
      if (
        extension.options.allowedMimeTypes &&
        !Object.keys(extension.options.allowedMimeTypes).some((type) =>
          file.type.match(type)
        )
      ) {
        rejected.push(file);
      } else if (
        extension.options.maxSize &&
        file.size > extension.options.maxSize
      ) {
        rejected.push(file);
      } else {
        accepted.push(file);
      }
    }

    if (rejected.length > 0) {
      extension.options.onDropRejected?.(rejected, editor);
    }

    if (accepted.length > 0) {
      handleAcceptedFiles(accepted);
    }
  };

  const handleInsertEmbed = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = isValidUrl(url);
    if (!valid) {
      setUrlError(true);
      return;
    }
    if (url !== "") {
      editor.chain().focus().setImage({ src: url }).run();
      extension.options.onEmbed(url, editor);
    }
  };

  return (
    <NodeViewWrapper className="w-full">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          nativeButton={false}
          render={
            <div
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md bg-accent p-2 py-3 text-accent-foreground text-sm transition-colors hover:bg-secondary",
                selected && "bg-primary/10 hover:bg-primary/20"
              )}
            >
              <Image className="h-6 w-6" />
              Add an image
            </div>
          }
        />
        <PopoverContent className="w-[450px] px-0 py-2">
          <Tabs className="px-3" defaultValue="upload">
            <TabsList>
              <TabsTrigger className="px-2 py-1 text-sm" value="upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </TabsTrigger>
              <TabsTrigger className="px-2 py-1 text-sm" value="url">
                <Link className="mr-2 h-4 w-4" />
                Embed link
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload">
              <div
                className={cn(
                  "my-2 rounded-md border border-dashed text-sm transition-colors",
                  isDragActive && "border-primary bg-secondary",
                  isDragReject && "border-destructive bg-destructive/10",
                  "hover:bg-secondary"
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  accept={Object.keys(
                    extension.options.allowedMimeTypes ?? {}
                  ).join(",")}
                  className="hidden"
                  id="file-input"
                  multiple={extension.options.maxFiles !== 1}
                  onChange={handleFileInputChange}
                  type="file"
                />
                <label
                  className="flex h-28 w-full cursor-pointer flex-col items-center justify-center text-center"
                  htmlFor="file-input"
                >
                  <Upload className="mx-auto mb-2 h-6 w-6" />
                  Drag & drop or click to upload
                </label>
              </div>
            </TabsContent>
            <TabsContent value="url">
              <form onSubmit={handleInsertEmbed}>
                <Input
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlError) {
                      setUrlError(false);
                    }
                  }}
                  placeholder="Paste the image link..."
                  value={url}
                />
                {urlError && (
                  <p className="py-1.5 text-danger-11 text-xs">
                    Please enter a valid URL
                  </p>
                )}
                <Button
                  className="my-2 h-8 w-full p-2 text-xs"
                  onClick={handleInsertEmbed}
                  size="sm"
                  type="button"
                >
                  Embed Image
                </Button>
                <p className="text-center text-gray-11 text-xs">
                  Works with any image from the web
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
