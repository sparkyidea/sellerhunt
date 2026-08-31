"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsRightIcon,
  MoreHorizontalIcon,
  MoveDiagonal2,
} from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface PanelContextValue {
  contentKey: string | null | undefined;
  isTransitioning: boolean;
}

const PanelContext = createContext<PanelContextValue>({
  isTransitioning: false,
  contentKey: undefined,
});

const DEFAULT_PANEL_WIDTH = 380;
const DEFAULT_MIN_PANEL_WIDTH = 320;
const DEFAULT_MAX_PANEL_WIDTH = 720;
// Pointer travel (px) that distinguishes a click from a drag.
const DRAG_THRESHOLD = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function PanelProvider({
  open,
  id,
  className,
  children,
  resizable,
  defaultWidth = DEFAULT_PANEL_WIDTH,
  minWidth = DEFAULT_MIN_PANEL_WIDTH,
  maxWidth = DEFAULT_MAX_PANEL_WIDTH,
  onClose,
  ...props
}: Omit<ComponentProps<"div">, "id"> & {
  open?: boolean;
  id?: string | null;
  resizable?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onClose?: () => void;
}) {
  const collapsible = open !== undefined;

  // Snapshot children while open so the panel keeps its last contents
  // visible mid-close — otherwise it empties out as the width animates.
  const snapshotRef = useRef(children);
  if (open) {
    snapshotRef.current = children;
  }
  const visibleChildren = open === false ? snapshotRef.current : children;
  // Freeze the scroll container's key while closed so the inner div stays
  // mounted through the close animation. When open it tracks id, remounting
  // the inner div to reset scroll between selections.
  const stableIdRef = useRef(id);
  if (open !== false) {
    stableIdRef.current = id;
  }
  let dataState: "open" | "closed" | undefined;
  if (collapsible) {
    dataState = open ? "open" : "closed";
  }

  const [width, setWidth] = useState(() =>
    clamp(Math.round(defaultWidth), minWidth, maxWidth)
  );
  const [isResizing, setIsResizing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const outerRef = useRef<HTMLDivElement>(null);

  // Detect open changes synchronously at render time so isTransitioning flips
  // true on the same render that schedules the CSS transition. The
  // onTransitionEnd handler below clears it when the browser finishes.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (collapsible) {
      setIsTransitioning(true);
    }
  }

  const outerStyle = resizable
    ? { width: open === false ? 0 : width }
    : undefined;

  return (
    <PanelContext.Provider
      value={{ isTransitioning, contentKey: stableIdRef.current }}
    >
      <div
        className={cn(
          "group/panel relative not-first:ml-2 flex min-h-0 min-w-0 first:flex-1",
          collapsible &&
            "hidden transition-[width,margin] duration-200 ease-linear data-[state=closed]:ml-0 md:flex",
          !resizable && "not-first:w-95 data-[state=closed]:w-0",
          resizable && "first:flex-none",
          isResizing && "transition-none",
          className
        )}
        data-slot="panel-provider"
        data-state={dataState}
        id={id ?? undefined}
        onTransitionEnd={(e) => {
          if (e.propertyName === "width") {
            setIsTransitioning(false);
          }
        }}
        ref={outerRef}
        style={outerStyle}
        {...props}
      >
        {resizable && open !== false && (
          <PanelResize
            initialWidth={width}
            maxWidth={maxWidth}
            minWidth={minWidth}
            onClick={onClose}
            onDragWidth={(next) => {
              if (outerRef.current) {
                outerRef.current.style.width = `${next}px`;
              }
            }}
            onResizeEnd={(final) => {
              setIsResizing(false);
              setWidth(final);
            }}
            onResizeStart={() => setIsResizing(true)}
          />
        )}
        <div
          className={cn(
            "flex w-full min-w-0 flex-col overflow-hidden rounded-t-xl border border-b-0 bg-background",
            // Explicit clip-path: WebGL canvases (e.g. MapLibre) skip Chromium's
            // border-radius compositor clip when the padding-box geometry is
            // asymmetric (rounded-t + border-b-0). clip-path is an explicit
            // primitive the compositor always honors.
            "[clip-path:inset(0_round_var(--radius-xl)_var(--radius-xl)_0_0)]",
            "group-first/panel:rounded-l-none group-first/panel:border-l-0",
            "group-first/panel:[clip-path:inset(0_round_0_var(--radius-xl)_0_0)]"
          )}
          data-slot="panel-provider-inner"
        >
          {visibleChildren}
        </div>
      </div>
    </PanelContext.Provider>
  );
}

export function Panel({ className, ...props }: ComponentProps<"div">) {
  const { isTransitioning, contentKey } = useContext(PanelContext);
  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 flex-col",
        isTransitioning
          ? "overflow-hidden"
          : "overflow-y-auto overflow-x-hidden"
      )}
      data-slot="panel"
      key={contentKey ?? undefined}
    >
      <div
        className={cn(
          "@container/panel mx-auto flex w-full max-w-240 flex-1 flex-col py-4 has-data-[slot=panel-toolbar]:pt-0",
          className
        )}
        data-slot="panel-inner"
        {...props}
      />
    </div>
  );
}

function PanelResize({
  initialWidth,
  minWidth,
  maxWidth,
  onDragWidth,
  onResizeStart,
  onResizeEnd,
  onClick,
}: {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  onDragWidth: (width: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (finalWidth: number) => void;
  onClick?: () => void;
}) {
  const startRef = useRef<{
    x: number;
    width: number;
    dragged: boolean;
  } | null>(null);
  // The drag owns its width via this ref so the parent doesn't have to re-render
  // on every pointer move — onDragWidth writes to the DOM directly instead.
  const latestWidthRef = useRef(initialWidth);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, width: initialWidth, dragged: false };
    latestWidthRef.current = initialWidth;
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!startRef.current) {
      return;
    }
    const delta = e.clientX - startRef.current.x;
    if (!startRef.current.dragged) {
      if (Math.abs(delta) < DRAG_THRESHOLD) {
        return;
      }
      startRef.current.dragged = true;
      onResizeStart();
    }
    const next = clamp(
      Math.round(startRef.current.width - delta),
      minWidth,
      maxWidth
    );
    if (next === latestWidthRef.current) {
      return;
    }
    latestWidthRef.current = next;
    onDragWidth(next);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!startRef.current) {
      return;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    const wasDragged = startRef.current.dragged;
    startRef.current = null;
    if (wasDragged) {
      onResizeEnd(latestWidthRef.current);
    } else {
      onClick?.();
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-col-resize touch-none"
            onPointerCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        }
      />
      <TooltipContent side="left">
        <div className="flex flex-col items-center gap-1">
          <div>
            <span className="font-semibold">Drag</span> to resize
          </div>
          {onClick && (
            <div>
              <span className="font-semibold">Click</span> to close
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// PanelGroup pairs PanelHeader with PanelAction on a single row. The group
// owns the horizontal padding; nested PanelHeader drops its own px so the two
// don't double up.
export function PanelGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 @lg/panel:px-6 px-4 pb-3",
        className
      )}
      data-slot="panel-group"
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5",
        // When nested in a PanelGroup, the group provides the padding.
        "[[data-slot=panel-group]>&]:px-0",
        className
      )}
      data-slot="panel-header"
      {...props}
    />
  );
}

type LinkRender = ComponentProps<typeof BreadcrumbLink>["render"];

// Slot-based primitive — caller supplies `render` for each link element so we
// stay framework-agnostic (no next/link, no usePathname). The smart wrapper
// that resolves routes from the pathname lives in the app layer.
//
// Below @lg/panel the root + parent segments hide so only the current label
// remains, styled identically to PanelTitle — keeps narrow panels readable
// without forcing callers to swap components by breakpoint.
export function PanelBreadcrumb({
  root,
  parent,
  current,
}: {
  root?: {
    icon: ReactNode;
    label: string;
    render: LinkRender;
  };
  parent?: {
    label: ReactNode;
    render: LinkRender;
  };
  current: ReactNode;
}) {
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {root && (
          <>
            <BreadcrumbItem className="@lg/panel:inline-flex hidden">
              <BreadcrumbLink aria-label={root.label} render={root.render}>
                {root.icon}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="@lg/panel:inline-flex hidden" />
          </>
        )}
        {parent && (
          <>
            <BreadcrumbItem className="@lg/panel:inline-flex hidden">
              <BreadcrumbLink
                className="block max-w-16 truncate transition-[max-width] duration-300 ease-in-out hover:max-w-sm focus-visible:max-w-sm"
                render={parent.render}
              >
                {parent.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="@lg/panel:inline-flex hidden" />
          </>
        )}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="@lg/panel:line-clamp-1 line-clamp-2 font-semibold @lg/panel:text-xl text-foreground text-lg leading-tight">
            {current}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function PanelTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "@lg/panel:line-clamp-1 line-clamp-2 font-semibold @lg/panel:text-xl text-foreground text-lg leading-tight",
        className
      )}
      data-slot="panel-title"
      {...props}
    />
  );
}

export function PanelTags({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      data-slot="panel-tags"
      {...props}
    />
  );
}

// PanelAction owns the rest of the header row: grows into whatever the title
// doesn't claim, with a minimum reserved for the dropdown trigger (and prev/next
// nav once @lg/panel). This lets the title sit at its natural content width and
// only wrap when it truly can't fit alongside the action's reserved minimum.
export function PanelAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex @lg/panel:min-w-25 min-w-7 flex-1 items-center justify-end gap-2",
        className
      )}
      data-slot="panel-action"
      {...props}
    />
  );
}

export function PanelContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-4 @lg/panel:px-6 px-4",
        className
      )}
      data-slot="panel-content"
      {...props}
    />
  );
}

type ButtonRender = ComponentProps<typeof Button>["render"];
type ButtonSize = ComponentProps<typeof Button>["size"];
type ButtonVariant = ComponentProps<typeof Button>["variant"];

export function PanelClose({
  onClose,
  label = "Close panel",
  size = "icon-sm",
  variant = "ghost",
}: {
  onClose: () => void;
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return (
    <Button aria-label={label} onClick={onClose} size={size} variant={variant}>
      <ChevronsRightIcon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

export function PanelExpand({
  render,
  label = "Open full view",
  size = "icon-sm",
  variant = "ghost",
}: {
  render: ButtonRender;
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return (
    <Button
      aria-label={label}
      nativeButton={false}
      render={render}
      size={size}
      variant={variant}
    >
      <MoveDiagonal2 className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

// Caller provides `prev` / `next` as render-prop slots (e.g. <Link href="..." />).
// Omitting a slot renders a disabled placeholder so the layout stays stable.
export function PanelNav({
  className,
  prev,
  next,
  size = "icon-sm",
  variant = "secondary",
}: {
  className?: string;
  prev?: ButtonRender;
  next?: ButtonRender;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return (
    <div className={cn("@lg/panel:flex hidden gap-2", className)}>
      <Button
        disabled={!prev}
        nativeButton={!prev}
        render={prev}
        size={size}
        variant={variant}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        disabled={!next}
        nativeButton={!next}
        render={next}
        size={size}
        variant={variant}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function PanelToolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex shrink-0 items-center gap-1 bg-background p-2",
        className
      )}
      data-slot="panel-toolbar"
      {...props}
    />
  );
}

export interface ActionItem {
  disabled?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  onSelect?: () => void;
  // Marks this action as pinned to the toolbar. When the container has room,
  // pinned items render as inline buttons; when space runs out, they fall
  // back into the dropdown menu. Items without this flag always live in the
  // dropdown. Defaults to false so pinning is explicit opt-in per action.
  pinned?: boolean;
  render?: ButtonRender;
}

const GAP_PX = 8;

// Measures how many pinned items fit inline given the container's allocated
// width, and exposes refs to wire up the container and its ghost-DOM measurer.
//
// The container should be `flex-1 min-w-0` so its `clientWidth` reflects what
// flex *allocated* — not the items currently rendered. That's what makes the
// pin/unpin pass bidirectional: shrinking the viewport reduces the allocation
// (pinned items fall back into the menu), and growing it again restores
// allocation (they return inline). If the container sized itself to its
// content, the allocation grow would never fire ResizeObserver and items
// would stay stuck in the dropdown.
//
// The measurer must render every pinned item at its natural inline size, plus
// the icon-sized dropdown trigger. `calculate` reads `offsetWidth` from each
// child in DOM order: pinned items first, then the trigger.
//
// `displayed` starts at 0 so the unmeasured first render (SSR and
// pre-layout-effect) lays out as "everything in the dropdown trigger".
// `useLayoutEffect` runs before paint and shows whichever pinned items fit —
// they appear to expand outward from the trigger rather than overflowing and
// then snapping back.
function usePinFit(pinnedCount: number, hasUnpinned: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measurerRef = useRef<HTMLDivElement>(null);
  const [displayed, setDisplayed] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measurer = measurerRef.current;
    if (!(container && measurer)) {
      return;
    }

    const calculate = () => {
      const kids = Array.from(measurer.children) as HTMLElement[];
      const itemWidths = kids.slice(0, pinnedCount).map((k) => k.offsetWidth);
      const triggerWidth = kids[pinnedCount]?.offsetWidth ?? 0;
      const containerWidth = container.clientWidth;

      let used = 0;
      let count = 0;
      for (let i = 0; i < pinnedCount; i++) {
        const itemWidth = itemWidths[i] ?? 0;
        // The trigger must stay visible whenever something will still be in
        // the menu after this one: either remaining pinned items that won't
        // fit, or any unpinned items (which always live in the menu).
        const stillOverflows = i < pinnedCount - 1 || hasUnpinned;
        const triggerReserve = stillOverflows ? triggerWidth + GAP_PX : 0;
        const tentative = used + (count > 0 ? GAP_PX : 0) + itemWidth;
        if (tentative + triggerReserve <= containerWidth) {
          used = tentative;
          count++;
        } else {
          break;
        }
      }
      setDisplayed(count);
    };

    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    calculate();
    return () => observer.disconnect();
  }, [pinnedCount, hasUnpinned]);

  return { containerRef, displayed, measurerRef };
}

// MoreActions: actions live in the dropdown menu by default. Items marked
// `pinned` are pulled out as inline buttons when the container has spare
// room, in their original relative order. Unpinned items always stay in the
// menu. Items are passed as a data array so they compose freely through
// helpers (e.g. `[...baseActions, ...marketplaceActions]`).
export function MoreActions({
  items,
  label = "More actions",
  size = "sm",
  variant = "secondary",
  hidePinned = false,
}: {
  items: ActionItem[];
  label?: string;
  // Applied to inline pinned buttons. The dropdown trigger is always icon-sm.
  size?: ButtonSize;
  variant?: ButtonVariant;
  // When true, no items are pinned inline — everything collapses into the
  // dropdown regardless of available space.
  hidePinned?: boolean;
}) {
  const pinnedItems = hidePinned ? [] : items.filter((item) => item.pinned);
  const hasUnpinned = items.length > pinnedItems.length;

  const { containerRef, displayed, measurerRef } = usePinFit(
    pinnedItems.length,
    hasUnpinned
  );

  if (items.length === 0) {
    return null;
  }

  // Walk items in original order, splitting into inline vs overflow based on
  // which pinned items currently fit. Unpinned items always overflow.
  const displayedSet = new Set(pinnedItems.slice(0, displayed));
  const inline: ActionItem[] = [];
  const overflow: ActionItem[] = [];
  for (const item of items) {
    if (displayedSet.has(item)) {
      inline.push(item);
    } else {
      overflow.push(item);
    }
  }

  return (
    <div
      // The visible items wrapper is absolutely positioned with `right-0`, so
      // it always grows leftward from the container's right edge. Combined
      // with `overflow-hidden` on this container, anything that doesn't fit
      // is clipped on the left — the dropdown trigger and rightmost items
      // stay pinned at the right regardless of pre-measure overflow.
      className="relative h-7 min-w-0 flex-1 overflow-hidden"
      ref={containerRef}
    >
      <div className="absolute top-0 right-0 flex h-7 items-center gap-2">
        {inline.map(
          ({ icon, label: itemLabel, onSelect, render, disabled }, i) => (
            <Button
              disabled={disabled}
              key={`v${i}`}
              nativeButton={render ? false : undefined}
              onClick={render ? undefined : onSelect}
              render={render}
              size={size}
              variant={variant}
            >
              {icon}
              {itemLabel}
            </Button>
          )
        )}
        {overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant={variant}>
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">{label}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40">
              {overflow.map(
                ({ icon, label: itemLabel, onSelect, render, disabled }, i) => (
                  <DropdownMenuItem
                    disabled={disabled}
                    key={`m${i}`}
                    onSelect={render ? undefined : onSelect}
                    render={render}
                  >
                    {icon}
                    {itemLabel}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-2"
        ref={measurerRef}
      >
        {pinnedItems.map(
          ({ icon, label: itemLabel, onSelect, render, disabled }, i) => (
            <Button
              disabled={disabled}
              key={`x${i}`}
              nativeButton={render ? false : undefined}
              onClick={render ? undefined : onSelect}
              render={render}
              size={size}
              variant={variant}
            >
              {icon}
              {itemLabel}
            </Button>
          )
        )}
        <Button size="icon-sm" variant={variant}>
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
