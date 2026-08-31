import { useNavigationGuard } from "next-navigation-guard";
import { useEffect, useId, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { useContextualSaveBar } from "./use-contextual-save-bar";

interface UseFormSaveBarOptions {
  isPending?: boolean;
  message?: string;
  onDiscard: () => void;
  onSave: () => void | Promise<void>;
}

export function useFormSaveBar<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  options: UseFormSaveBarOptions
) {
  const id = useId();
  const register = useContextualSaveBar((s) => s.register);
  const unregister = useContextualSaveBar((s) => s.unregister);
  const requestAttention = useContextualSaveBar((s) => s.requestAttention);

  const { isDirty, isSubmitting } = form.formState;
  const saving = Boolean(options.isPending) || isSubmitting;
  const blocking = isDirty && !saving;

  const guard = useNavigationGuard({ enabled: blocking });

  useEffect(() => {
    if (!guard.active) {
      return;
    }
    requestAttention();
    guard.reject();
  }, [guard, requestAttention]);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    register({
      id,
      message: optionsRef.current.message,
      onSave: () => optionsRef.current.onSave(),
      onDiscard: () => optionsRef.current.onDiscard(),
      saving,
      saveDisabled: saving,
      discardDisabled: saving,
    });

    return () => unregister(id);
  }, [id, isDirty, saving, register, unregister]);
}
