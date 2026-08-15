import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PROVIDER_DELETION_REASONS,
  startProviderDeletionVerification,
  type ProviderDeletionReason,
  type RequestProviderDeletionInput,
} from '@/features/provider-deletion';
import {
  WhatsappApprovalPanel,
  type WhatsappVerificationChallenge,
} from '@/features/verification';

export type ProviderDeletionRequest = RequestProviderDeletionInput;

interface ProviderDeletionDialogProps {
  onDelete: (request: ProviderDeletionRequest) => Promise<void>;
  providerId: string;
  providerName: string;
}

const deletionReasonLabels = {
  outdated: 'Listing is outdated',
  duplicate: 'Duplicate listing',
  closed: 'Business has closed',
  incorrect: 'Information is incorrect',
  other: 'Other reason',
} satisfies Record<ProviderDeletionReason, string>;

const deletionReasons = PROVIDER_DELETION_REASONS.map((value) => ({
  value,
  label: deletionReasonLabels[value],
}));

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const normalizeConfirmation = (value: string) => value.trim().replace(/\s+/g, ' ');

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : 'We could not remove this listing. Check the details and try again.';

export function ProviderDeletionDialog({
  onDelete,
  providerId,
  providerName,
}: ProviderDeletionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [nameConfirmation, setNameConfirmation] = useState('');
  const [reason, setReason] = useState<ProviderDeletionReason | ''>('');
  const [requesterWhatsapp, setRequesterWhatsapp] = useState('');
  const [verificationChallenge, setVerificationChallenge] = useState<WhatsappVerificationChallenge | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nameMatches = normalizeName(nameConfirmation) === normalizeName(providerName);
  const canSubmit = nameMatches
    && Boolean(reason)
    && Boolean(requesterWhatsapp.trim())
    && !isSubmitting;

  const resetForm = () => {
    setNameConfirmation('');
    setReason('');
    setRequesterWhatsapp('');
    setVerificationChallenge(null);
    setSubmitError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return;
    setIsOpen(nextOpen);
    if (!nextOpen) resetForm();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canSubmit || !reason) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (verificationChallenge) return;
      const challenge = await startProviderDeletionVerification({
        providerId,
        providerNameConfirmation: normalizeConfirmation(nameConfirmation),
        reason,
        requesterWhatsapp: requesterWhatsapp.trim(),
      });
      setVerificationChallenge(challenge);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeApprovedDeletion = async () => {
    await onDelete({
      providerId,
      actionId: verificationChallenge!.actionId,
      actionToken: verificationChallenge!.actionToken,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Delete listing
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:rounded-xl [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader className="pr-10 text-left">
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700">
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          </div>
          <DialogTitle>Remove this provider?</DialogTitle>
          <DialogDescription className="leading-6">
            This will hide the listing from the public directory. It remains recoverable for a short time after removal.
            No login is required. You’ll send Machu a ready-made WhatsApp message before we remove it.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="delete-provider-name">
              Type <span className="font-bold text-foreground">{providerName}</span> to confirm
            </Label>
            <Input
              aria-describedby="delete-provider-name-hint"
              aria-invalid={Boolean(nameConfirmation && !nameMatches)}
              autoComplete="off"
              id="delete-provider-name"
              onChange={(event) => setNameConfirmation(event.target.value)}
              required
              disabled={Boolean(verificationChallenge)}
              value={nameConfirmation}
            />
            <p className="text-xs leading-5 text-muted-foreground" id="delete-provider-name-hint">
              Capitalization and extra spaces do not matter.
            </p>
            {nameConfirmation && !nameMatches && (
              <p className="text-sm text-red-700">The provider name does not match.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-reason">Why should this listing be removed?</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              id="delete-reason"
              onChange={(event) => setReason(event.target.value as ProviderDeletionReason | '')}
              required
              disabled={Boolean(verificationChallenge)}
              value={reason}
            >
              <option value="">Select a reason</option>
              {deletionReasons.map((deletionReason) => (
                <option key={deletionReason.value} value={deletionReason.value}>
                  {deletionReason.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-requester-whatsapp">Your WhatsApp number</Label>
            <Input
              aria-describedby="delete-requester-whatsapp-hint"
              autoComplete="tel"
              id="delete-requester-whatsapp"
              inputMode="tel"
              onChange={(event) => setRequesterWhatsapp(event.target.value)}
              required
              disabled={Boolean(verificationChallenge)}
              type="tel"
              value={requesterWhatsapp}
            />
            <p className="text-xs leading-5 text-muted-foreground" id="delete-requester-whatsapp-hint">
              Kept private as an audit contact. Your message to Machu confirms that you control this WhatsApp number.
            </p>
          </div>

          {verificationChallenge && (
            <WhatsappApprovalPanel
              challenge={verificationChallenge}
              onApproved={completeApprovedDeletion}
              onReset={() => {
                setVerificationChallenge(null);
                setSubmitError(null);
              }}
            />
          )}

          {submitError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {submitError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button disabled={isSubmitting} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            {!verificationChallenge && (
              <Button disabled={!canSubmit} type="submit" variant="destructive">
                {isSubmitting ? 'Preparing WhatsApp…' : 'Continue with WhatsApp'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
