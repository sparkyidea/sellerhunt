"use client"

import type { PasskeyAuthClient } from "@better-auth-ui/core/plugins/passkey"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { useUpdatePasskey } from "@better-auth-ui/react/plugins/passkey"
import { type FormEvent, useEffect, useState } from "react"
import { Button, buttonVariants } from "@sparkyidea/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@sparkyidea/ui/components/dialog"
import { Field, FieldLabel } from "@sparkyidea/ui/components/field"
import { Input } from "@sparkyidea/ui/components/input"
import { Spinner } from "@sparkyidea/ui/components/spinner"
import { passkeyPlugin } from "@dashseller/auth/lib/auth/passkey-plugin"
import type { ListedPasskey } from "./delete-passkey-dialog"

export function RenamePasskeyDialog({
  open,
  onOpenChange,
  passkey
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  passkey: ListedPasskey
}) {
  const { authClient, localization } = useAuth<PasskeyAuthClient>()
  const { localization: labels } = useAuthPlugin(passkeyPlugin)
  const [name, setName] = useState(passkey.name ?? "")

  useEffect(() => {
    if (open) setName(passkey.name ?? "")
  }, [open, passkey.name])

  const updatePasskey = useUpdatePasskey(authClient, {
    onSuccess: () => onOpenChange(false)
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextName = name.trim()
    if (nextName) updatePasskey.mutate({ id: passkey.id, name: nextName })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{labels.renamePasskey}</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`passkey-name-${passkey.id}`}>
              {labels.name}
            </FieldLabel>
            <Input
              id={`passkey-name-${passkey.id}`}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <DialogFooter>
            <DialogClose
              className={buttonVariants({ variant: "outline" })}
              type="button"
            >
              {localization.settings.cancel}
            </DialogClose>
            <Button
              disabled={!name.trim() || updatePasskey.isPending}
              type="submit"
            >
              {updatePasskey.isPending && <Spinner />}
              {localization.settings.saveChanges}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
