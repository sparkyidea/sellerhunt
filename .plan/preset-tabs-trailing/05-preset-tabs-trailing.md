# Step 5 — `components/preset-tabs/index.tsx`: `trailing?: ReactNode`

## Rule

**No markup change when `trailing` is absent.** Keep today's exact return
path in that case and only branch when `trailing != null`.

## With `trailing`

### Line variant

```tsx
<div className="flex w-full">
  {mobileSelect && <Select … />}                 // sm:hidden as today
  <TabsList className={cn(mobileSelect ? "hidden sm:flex" : "flex",
    "min-w-0 flex-1 justify-start gap-4 overflow-x-auto rounded-none border-b p-0")} …/>
  <div className="flex items-center gap-2 self-stretch border-b pl-2">{trailing}</div>
</div>
```

- `TabsList` keeps its own `border-b` (this preserves the working
  underline-overlap geometry with `after:bottom-[-0.5px]`); only `w-full`
  is swapped for `min-w-0 flex-1` so it can shrink and scroll.
- The trailing container also has `border-b` + `self-stretch`, so the 1px
  line continues seamlessly under the trailing content.

### Segmented variant

```tsx
<div className="flex h-9 items-center gap-2">
  {mobileSelect && <Select … />}                 // sm:hidden
  <TabsList className={mobileSelect ? "hidden sm:flex" : "flex"} …/>
  <div className="ml-auto flex items-center gap-2">{trailing}</div>
</div>
```

`h-9` matches `NotionToolbar` row 1 so the sold band + icon cluster row is
the same height as before the change.

### Mobile

The Select (`sm:hidden`) and TabsList (`hidden sm:flex`) both live inside
the wrapper, so `trailing` stays visible at every breakpoint.

## Prop doc

```ts
/** Right-aligned content on the tab row (e.g. toolbar actions). */
trailing?: ReactNode;
```

Update the component JSDoc with the `trailing={<NotionToolbarActions />}`
+ sibling `<NotionToolbarChips />` example.
