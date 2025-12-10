"use client"

import { BadgeMinus, ClipboardCheck } from "lucide-react"
import { useSession } from "next-auth/react"
import toast from "react-hot-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { api } from "~/utils/api"
import { Button } from "../shadcn/ui/button"
import { useMapInteractionStore } from "~/store/map-stores"
import { useCopyCutModalStore } from "~/store/copy-cut-modal-store"

const CopyCutPinModal = () => {
  const {
    selectedPinForDetail: data, // Use selectedPinForDetail from the store as 'data'
    closePinDetailModal: handleClose, // Use closePinDetailModal from the store
    isPinCut,
    isPinCopied,
    setPinCopied,
    setPinCut,
    position,
    setIsAutoCollect, // This is for the copiedPinData, not the current pin's autoCollect
    setManual,
    setDuplicate,
    setPrevData,
  } = useMapInteractionStore()
  const { setIsOpen, isOpen } = useCopyCutModalStore()
  const utils = api.useUtils()
  const session = useSession()
  console.log("Cut", isPinCut)
  console.log("data", data)
  const PastePin = api.maps.pin.paste.useMutation({
    onSuccess: async (data) => {
      if (data.id) {
        await utils.maps.pin.getCreatorPins.refetch()

        toast.success("Pin pasted successfully")
        setPinCopied(false)
        setPinCut(false)
        handleClose()
        handleCloseModal()
      } else {
        toast.error("Something went wrong")
      }
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const handlePastePin = () => {
    // console.log("handlePastePin", data?.pinId, data?.long, data?.lat);
    if (data?.id && position?.lat && position?.lng) {
      // console.log("handlePastePin", data?.pinId, data?.long, data?.lat);
      PastePin.mutate({
        id: data?.id,
        long: position?.lng,
        lat: position?.lat,
        isCut: isPinCut,
      })
    } else {
      toast.error("Pin Id not found")
    }
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    setPinCopied(false)
    setPinCut(false)
    handleClose()

  }

  if (!session?.data?.user?.id) {
    return <div>Public Key not found</div>
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleCloseModal}>
      <DialogContent className="max-w-md">
        <DialogHeader className="space-y-4">
          <DialogTitle className="text-center text-xl font-semibold">Pin Action</DialogTitle>
          <p className="text-center text-sm text-muted-foreground">
            {isPinCut ? "Move" : "Copy"} your pin to the selected location
          </p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Button onClick={handlePastePin} className="w-full h-12 text-base font-medium" disabled={PastePin.isLoading}>
            <ClipboardCheck size={18} className="mr-2" />
            {PastePin.isLoading ? "Pasting..." : `Paste Pin Here`}
          </Button>

          <Button onClick={() => handleCloseModal()} variant="outline" className="w-full h-12 text-base font-medium bg-transparent">
            <BadgeMinus size={18} className="mr-2" />
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CopyCutPinModal
