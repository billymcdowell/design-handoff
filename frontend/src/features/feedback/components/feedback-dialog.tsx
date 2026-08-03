import { useEffect, useState } from "react"
import { useLocation } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { createFeedback } from "@/lib/api"
import { toast } from "@/lib/toast"
import { FEEDBACK_TYPES, type FeedbackType } from "@/lib/types"

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Bug",
  idea: "Idea",
  ux: "UX",
}

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const location = useLocation()
  const [type, setType] = useState<FeedbackType>("idea")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setType("idea")
      setMessage("")
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const page =
        typeof window !== "undefined"
          ? `${window.location.origin}${location.pathname}${location.search}${location.hash}`
          : `${location.pathname}${location.search}${location.hash}`
      await createFeedback({ type, message: trimmed, page })
      toast.success("Thanks — feedback sent")
      onOpenChange(false)
    } catch {
      toast.error("Failed to send feedback")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Report a bug, share an idea, or note a UX issue about Design Handoff.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="feedback-type">Type</Label>
              <NativeSelect
                id="feedback-type"
                className="w-full"
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
              >
                {FEEDBACK_TYPES.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {TYPE_LABELS[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedback-message">Message</Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened, or what would you like to see?"
                required
                autoFocus
                rows={5}
                maxLength={5000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !message.trim()}>
              {saving ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
