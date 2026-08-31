"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@sparkyidea/ui/components/command";
import { ScrollArea } from "@sparkyidea/ui/components/scroll-area";
import { useDebounce } from "@sparkyidea/ui/hooks/use-debounce";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { FloatingMenu } from "@tiptap/react/menus";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronRight,
  Code2,
  CodeSquare,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface CommandGroupType {
  group: string;
  items: {
    command: (editor: Editor) => void;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    keywords: string;
    shortcut?: string;
    title: string;
  }[];
}

const groups: CommandGroupType[] = [
  {
    group: "Basic blocks",
    items: [
      {
        title: "Text",
        description: "Just start writing with plain text",
        icon: ChevronRight,
        keywords: "paragraph text",
        command: (editor) => editor.chain().focus().clearNodes().run(),
      },
      {
        title: "Heading 1",
        description: "Large section heading",
        icon: Heading1,
        keywords: "h1 title header",
        shortcut: "#",
        command: (editor) =>
          editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        title: "Heading 2",
        description: "Medium section heading",
        icon: Heading2,
        keywords: "h2 subtitle",
        shortcut: "##",
        command: (editor) =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        title: "Heading 3",
        description: "Small section heading",
        icon: Heading3,
        keywords: "h3 subheader",
        shortcut: "###",
        command: (editor) =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        title: "Heading 4",
        description: "Fourth level heading",
        icon: Heading4,
        keywords: "h4",
        shortcut: "####",
        command: (editor) =>
          editor.chain().focus().toggleHeading({ level: 4 }).run(),
      },
      {
        title: "Heading 5",
        description: "Fifth level heading",
        icon: Heading5,
        keywords: "h5",
        shortcut: "#####",
        command: (editor) =>
          editor.chain().focus().toggleHeading({ level: 5 }).run(),
      },
      {
        title: "Heading 6",
        description: "Sixth level heading",
        icon: Heading6,
        keywords: "h6",
        shortcut: "######",
        command: (editor) =>
          editor.chain().focus().toggleHeading({ level: 6 }).run(),
      },
      {
        title: "Bullet List",
        description: "Create a simple bullet list",
        icon: List,
        keywords: "unordered ul bullets",
        shortcut: "-",
        command: (editor) => editor.chain().focus().toggleBulletList().run(),
      },
      {
        title: "Numbered List",
        description: "Create a ordered list",
        icon: ListOrdered,
        keywords: "numbered ol",
        shortcut: "1.",
        command: (editor) => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        title: "Code Block",
        description: "Capture code snippets",
        icon: Code2,
        keywords: "code snippet pre",
        shortcut: "```",
        command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        title: "Image",
        description: "Insert an image",
        icon: ImageIcon,
        keywords: "image picture photo",
        command: (editor) =>
          editor.chain().focus().insertImagePlaceholder().run(),
      },
      {
        title: "Horizontal Rule",
        description: "Add a horizontal divider",
        icon: Minus,
        keywords: "horizontal rule divider",
        shortcut: "---",
        command: (editor) => editor.chain().focus().setHorizontalRule().run(),
      },
    ],
  },
  {
    group: "Inline",
    items: [
      {
        title: "Quote",
        description: "Capture a quotation",
        icon: Quote,
        keywords: "blockquote cite",
        shortcut: ">",
        command: (editor) => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        title: "Code",
        description: "Inline code snippet",
        icon: CodeSquare,
        keywords: "code inline",
        shortcut: "`code`",
        command: (editor) => editor.chain().focus().toggleCode().run(),
      },
    ],
  },
  {
    group: "Alignment",
    items: [
      {
        title: "Align Left",
        description: "Align text to the left",
        icon: AlignLeft,
        keywords: "align left",
        command: (editor) => editor.chain().focus().setTextAlign("left").run(),
      },
      {
        title: "Align Center",
        description: "Center align text",
        icon: AlignCenter,
        keywords: "align center",
        command: (editor) =>
          editor.chain().focus().setTextAlign("center").run(),
      },
      {
        title: "Align Right",
        description: "Align text to the right",
        icon: AlignRight,
        keywords: "align right",
        command: (editor) => editor.chain().focus().setTextAlign("right").run(),
      },
    ],
  },
];

function itemValue(group: string, title: string) {
  return `${group}-${title}`;
}

function canOpenSlashMenu(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  if ($from.parent.type.name === "codeBlock") {
    return false;
  }
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", " ");
  if (textBefore.length === 0) {
    return true;
  }
  return textBefore.at(-1) === " ";
}

function checkSlashCommand(
  state: EditorState,
  editor: Editor | null
): { query: string } | null {
  if (!editor) {
    return null;
  }

  const { $from } = state.selection;
  if ($from.parent.type.name === "codeBlock") {
    return null;
  }

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", " ");

  // Cursor must be at end of text
  if ($from.parentOffset !== textBefore.length) {
    return null;
  }

  // Find the last "/" that is at position 0 or preceded by a space
  const lastSlashIdx = textBefore.lastIndexOf("/");
  if (lastSlashIdx === -1) {
    return null;
  }

  if (lastSlashIdx > 0 && textBefore[lastSlashIdx - 1] !== " ") {
    return null;
  }

  // Text after the slash is the query — if it has a space, treat as plain text
  const query = textBefore.slice(lastSlashIdx + 1);
  if (query.includes(" ")) {
    return null;
  }

  return { query };
}

export function TipTapFloatingMenu({ editor }: { editor: Editor }) {
  const isOpenRef = useRef(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef("");
  const slashPending = useRef(false);
  const debouncedSearch = useDebounce(search, 300);
  const commandRef = useRef<HTMLDivElement>(null);
  const [selectedValue, setSelectedValue] = useState("");

  const closeMenu = useCallback(() => {
    const wasOpen = isOpenRef.current;
    isOpenRef.current = false;
    const query = searchRef.current;
    searchRef.current = "";
    setSearch("");
    // Delete the "/" and query text to dismiss the menu naturally
    if (wasOpen) {
      const { from } = editor.state.selection;
      const deleteLength = query.length + 1;
      editor
        .chain()
        .focus()
        .deleteRange({
          from: Math.max(0, from - deleteLength),
          to: from,
        })
        .run();
    }
  }, [editor]);

  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              item.title
                .toLowerCase()
                .includes(debouncedSearch.toLowerCase()) ||
              item.description
                .toLowerCase()
                .includes(debouncedSearch.toLowerCase()) ||
              item.keywords
                .toLowerCase()
                .includes(debouncedSearch.toLowerCase())
          ),
        }))
        .filter((group) => group.items.length > 0),
    [debouncedSearch]
  );

  // Flat list of {value, command} for keyboard navigation
  const flatItems = useMemo(
    () =>
      filteredGroups.flatMap((g) =>
        g.items.map((item) => ({
          value: itemValue(g.group, item.title),
          command: item.command,
        }))
      ),
    [filteredGroups]
  );

  const commandMap = useMemo(() => {
    const map = new Map<string, (editor: Editor) => void>();
    for (const group of groups) {
      for (const item of group.items) {
        map.set(itemValue(group.group, item.title), item.command);
      }
    }
    return map;
  }, []);

  const executeCommand = useCallback(
    (commandFn: (editor: Editor) => void) => {
      if (!editor) {
        return;
      }

      try {
        const { from } = editor.state.selection;
        const slashCommandLength = searchRef.current.length + 1;

        editor
          .chain()
          .focus()
          .deleteRange({
            from: Math.max(0, from - slashCommandLength),
            to: from,
          })
          .run();

        commandFn(editor);
      } catch (error) {
        console.error("Error executing command:", error);
      } finally {
        isOpenRef.current = false;
        searchRef.current = "";

        setSearch("");
      }
    },
    [editor]
  );

  const navigateMenu = useCallback(
    (direction: "up" | "down") => {
      const currentIdx = flatItems.findIndex((i) => i.value === selectedValue);
      let nextIdx: number;
      if (direction === "down") {
        nextIdx = currentIdx < flatItems.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : flatItems.length - 1;
      }
      const item = flatItems[nextIdx];
      if (item) {
        setSelectedValue(item.value);
      }
    },
    [flatItems, selectedValue]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!editor) {
        return;
      }

      // Flag "/" keypress so shouldShow opens the menu after ProseMirror inserts it
      if (e.key === "/" && !isOpenRef.current) {
        if (canOpenSlashMenu(editor)) {
          slashPending.current = true;
        }
        return;
      }

      if (!isOpenRef.current) {
        return;
      }

      const preventDefault = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };

      switch (e.key) {
        case "ArrowDown":
          preventDefault();
          navigateMenu("down");
          break;

        case "ArrowUp":
          preventDefault();
          navigateMenu("up");
          break;

        case "Enter": {
          preventDefault();
          const cmdFn = commandMap.get(selectedValue);
          if (cmdFn) {
            executeCommand(cmdFn);
          }
          break;
        }

        case "Escape":
          preventDefault();
          closeMenu();
          break;

        default:
          break;
      }
    },
    [editor, navigateMenu, selectedValue, commandMap, executeCommand, closeMenu]
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const editorElement = editor.view.dom;
    const handleEditorKeyDown = (e: Event) => handleKeyDown(e as KeyboardEvent);

    editorElement.addEventListener("keydown", handleEditorKeyDown, true);
    return () =>
      editorElement.removeEventListener("keydown", handleEditorKeyDown, true);
  }, [handleKeyDown, editor]);

  // Scroll selected item into view
  useEffect(() => {
    if (!selectedValue) {
      return;
    }
    requestAnimationFrame(() => {
      const selectedEl = document.querySelector(
        `[cmdk-item][data-selected="true"]`
      );
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    });
  }, [selectedValue]);

  return (
    <FloatingMenu
      appendTo={() => document.body}
      editor={editor}
      options={{
        placement: "bottom-start",
      }}
      shouldShow={({ state }) => {
        // Check if "/" was just pressed
        if (slashPending.current) {
          slashPending.current = false;
          const result = checkSlashCommand(state, editor);
          if (result) {
            isOpenRef.current = true;

            if (result.query !== searchRef.current) {
              searchRef.current = result.query;
              setSearch(result.query);
            }
            return true;
          }
          return false;
        }

        if (!isOpenRef.current) {
          return false;
        }

        const result = checkSlashCommand(state, editor);
        if (!result) {
          isOpenRef.current = false;

          return false;
        }

        if (result.query !== searchRef.current) {
          searchRef.current = result.query;
          setSearch(result.query);
        }
        return true;
      }}
    >
      <Command
        className="z-50 w-72 overflow-hidden rounded-lg border bg-popover shadow-lg"
        filter={() => 1}
        onValueChange={setSelectedValue}
        ref={commandRef}
        role="listbox"
        value={selectedValue}
      >
        <ScrollArea className="max-h-[330px]">
          <CommandList>
            <CommandEmpty className="py-3 text-center text-muted-foreground text-sm">
              No results found
            </CommandEmpty>

            {filteredGroups.map((group, groupIndex) => (
              <CommandGroup
                heading={group.group}
                key={`${group.group}-${groupIndex}`}
              >
                {group.items.map((item, itemIndex) => (
                  <CommandItem
                    className="gap-3"
                    key={`${group.group}-${item.title}-${itemIndex}`}
                    onSelect={() => executeCommand(item.command)}
                    value={itemValue(group.group, item.title)}
                  >
                    <div className="flex size-9 items-center justify-center rounded-md border bg-background">
                      <item.icon className="size-4" />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <span className="font-medium text-sm">{item.title}</span>
                      <span className="text-muted-foreground text-xs">
                        {item.description}
                      </span>
                    </div>
                    {item.shortcut && (
                      <CommandShortcut>{item.shortcut}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </ScrollArea>
      </Command>
    </FloatingMenu>
  );
}
