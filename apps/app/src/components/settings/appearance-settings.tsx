"use client";

import { SectionHeader } from "@dashseller/auth/components/auth/section-header";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@sparkyidea/ui/components/field";
import {
  RadioGroup,
  RadioGroupItem,
} from "@sparkyidea/ui/components/radio-group";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export interface AppearanceSettingsProps {
  className?: string;
}

/**
 * Theme selector card backed directly by `next-themes`.
 *
 * Renders a radio group of system/light/dark options, each with a small visual
 * preview. Selection is written through `useTheme().setTheme`, which persists to
 * the `<ThemeProvider>` configured in the app's client providers.
 *
 * @param className - Optional additional CSS class names for the card container.
 */
export function AppearanceSettings({ className }: AppearanceSettingsProps) {
  const { theme, setTheme } = useTheme();

  // `next-themes` only knows the persisted theme on the client, so committing to
  // a selected value during SSR would cause a hydration mismatch. Hold the group
  // empty and disabled until mounted, then reflect the real value.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  return (
    <div className={className}>
      <SectionHeader title="Theme" />

      <RadioGroup
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        disabled={!isMounted}
        onValueChange={setTheme}
        value={isMounted ? (theme ?? "") : ""}
      >
        {THEME_OPTIONS.map((option) => (
          <FieldLabel htmlFor={option.value} key={option.value}>
            <Field orientation="horizontal">
              <FieldContent className="gap-2">
                <div className="flex items-center justify-between gap-2">
                  <FieldTitle>
                    <option.icon className="size-4 text-muted-foreground" />

                    {option.label}
                  </FieldTitle>

                  <RadioGroupItem id={option.value} value={option.value} />
                </div>

                <ThemePreview value={option.value} />
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </div>
  );
}

/**
 * Static, theme-independent mockup used to preview a theme option. Colors are
 * fixed (not driven by the active theme) so each swatch always shows what that
 * option looks like.
 */
function ThemePreview({
  value,
}: {
  value: (typeof THEME_OPTIONS)[number]["value"];
}) {
  return (
    <div className="flex h-14 w-full overflow-hidden rounded-md border">
      {value === "system" ? (
        <>
          <PreviewPanel className="w-1/2" tone="light" />
          <PreviewPanel className="w-1/2 border-l" tone="dark" />
        </>
      ) : (
        <PreviewPanel tone={value} />
      )}
    </div>
  );
}

function PreviewPanel({
  tone,
  className,
}: {
  tone: "light" | "dark";
  className?: string;
}) {
  const isDark = tone === "dark";

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col gap-1.5 p-2",
        isDark ? "bg-neutral-900" : "bg-neutral-100",
        className
      )}
    >
      <div
        className={cn(
          "h-2 w-1/2 rounded-full",
          isDark ? "bg-neutral-600" : "bg-neutral-400"
        )}
      />
      <div
        className={cn(
          "h-2 w-full rounded-full",
          isDark ? "bg-neutral-700" : "bg-neutral-300"
        )}
      />
      <div
        className={cn(
          "h-2 w-5/6 rounded-full",
          isDark ? "bg-neutral-700" : "bg-neutral-300"
        )}
      />
    </div>
  );
}
