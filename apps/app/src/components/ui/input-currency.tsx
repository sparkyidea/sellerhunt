"use client";

import { Input } from "@sparkyidea/ui/components/input";
import { useEffect, useState } from "react";

interface InputCurrencyProps {
  disabled?: boolean;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  value: number | null | undefined;
}

function centsToText(cents: number | null | undefined): string {
  if (cents == null) {
    return "";
  }
  return (cents / 100).toFixed(2);
}

function textToCents(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

export function InputCurrency({
  value,
  onChange,
  disabled,
  placeholder,
}: InputCurrencyProps) {
  const [text, setText] = useState(() => centsToText(value));

  useEffect(() => {
    setText((current) => {
      if (textToCents(current) === (value ?? null)) {
        return current;
      }
      return centsToText(value);
    });
  }, [value]);

  return (
    <Input
      disabled={disabled}
      inputMode="decimal"
      onBlur={() => setText(centsToText(value))}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        onChange(textToCents(next));
      }}
      placeholder={placeholder ?? "0.00"}
      value={text}
    />
  );
}
