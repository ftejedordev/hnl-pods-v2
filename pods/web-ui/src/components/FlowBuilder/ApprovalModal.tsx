import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentOutput } from '@/components/common/AgentOutput';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

interface ApprovalModalProps {
  isOpen: boolean;
  stepName: string;
  approvalMessage: string;
  content: string;
  onApprove: () => void;
  onReject: () => void;
  isSubmitting?: boolean;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  isOpen,
  stepName,
  approvalMessage,
  content,
  onApprove,
  onReject,
  isSubmitting = false,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-lg">Approval Required</DialogTitle>
              <DialogDescription className="text-sm">
                {stepName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">{approvalMessage}</p>
          </div>

          <div className="border rounded-lg p-4 bg-muted/20">
            <h4 className="text-sm font-semibold mb-3 text-foreground">
              Content to Review:
            </h4>
            <ScrollArea className="h-[300px] w-full pr-4">
              <AgentOutput output={content} className="text-sm" />
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            onClick={onReject}
            variant="outline"
            disabled={isSubmitting}
            className="flex items-center gap-2 flex-1 sm:flex-1"
          >
            <XCircle className="h-4 w-4" />
            Reject & Retry
          </Button>
          <Button
            onClick={onApprove}
            disabled={isSubmitting}
            className="flex items-center gap-2 flex-1 sm:flex-1 bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
