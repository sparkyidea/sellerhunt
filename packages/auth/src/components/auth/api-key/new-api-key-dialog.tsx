"use client"

import {
  useAuth,
  useAuthPlugin,
  useCopyToClipboard
} from "@better-auth-ui/react"
import { Check, Copy, Key } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@sparkyidea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@sparkyidea/ui/components/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@sparkyidea/ui/components/input-group"
import { Label } from "@sparkyidea/ui/components/label"
import { apiKeyPlugin } from "@dashseller/auth/lib/auth/api-key-plugin"

export type NewApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string | null
  secretKey: string | null
}

export function NewApiKeyDialog({
  open,
  onOpenChange,
  name,
  secretKey
}: NewApiKeyDialogProps) {
  const { localization } = useAuth()
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin)

  const { copied, copy, reset } = useCopyToClipboard({
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error))
  })

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset()
    }

    onOpenChange(nextOpen)
  }

  const copySecretKey = async () => {
    if (!secretKey) return

    await copy(secretKey)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Key />
            {apiKeyLocalization.newApiKey}
          </DialogTitle>

          <DialogDescription>
            {apiKeyLocalization.newApiKeyWarning}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-api-key-secret">
            {name || apiKeyLocalization.apiKey}
          </Label>

          <InputGroup>
            <InputGroupInput
              id="new-api-key-secret"
              value={secretKey ?? ""}
              readOnly
              className="font-mono text-xs"
            />

            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={
                  copied
                    ? localization.settings.copiedToClipboard
                    : localization.settings.copyToClipboard
                }
                onClick={copySecretKey}
              >
                {copied ? <Check /> : <Copy />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => handleOpenChange(false)}>
            {apiKeyLocalization.dismissNewKey}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
