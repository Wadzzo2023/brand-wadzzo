import React from "react";
import { useModal } from "../../lib/state/play/use-modal-store";
import { Button } from "../shadcn/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/shadcn/ui/dialog";
import AttachmentSection from "../bounty/attahment-section";
import { SubmissionAttachment } from "@prisma/client";

type ViewBountyAttachmentModalProps = {
    data: SubmissionAttachment[];
    isOpen: boolean;
    onClose: () => void;
};

const ViewBountyAttachmentModal = ({ data, isOpen, onClose }: ViewBountyAttachmentModalProps) => {

    const handleClose = () => {
        onClose();
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDownload = () => {
        // const fileUrl = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/snippet-GstNbOqFhV6gnmpgYP3eBDCSK96kPw.txt";
        // const fileName = "snippet-GstNbOqFhV6gnmpgYP3eBDCSK96kPw.txt";
        // downloadAttachment(fileUrl, fileName);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent
                onContextMenu={handleContextMenu}
                className="max-h-[80vh] overflow-y-auto p-6 md:max-w-[800px]"
            >
                <DialogHeader className="">
                    <DialogTitle className="text-center text-2xl  font-bold">
                        Your Attachments
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-8">
                    <AttachmentSection
                        title="Audio"
                        attachments={data?.filter((a) => a.type.startsWith("audio/"))}
                    />
                    <AttachmentSection
                        title="Video"
                        attachments={data?.filter((a) => a.type.startsWith("video/"))}
                    />
                    <AttachmentSection
                        title="Images"
                        attachments={data?.filter((a) => a.type.startsWith("image/"))}
                    />
                    <AttachmentSection
                        title="Documents"
                        attachments={data?.filter((a) => a.type.startsWith("application/"))}
                    />
                    <AttachmentSection
                        title="Text"
                        attachments={data?.filter((a) => a.type.startsWith("text/"))}
                    />
                </div>
                <DialogFooter className="mt-8 flex justify-between">

                    <Button onClick={handleClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ViewBountyAttachmentModal;

