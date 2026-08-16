import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getWhatsappVerificationStatus } from './verificationApi';
import type { WhatsappVerificationChallenge } from './types';

interface WhatsappApprovalPanelProps {
  autoLaunchFailed?: boolean;
  challenge: WhatsappVerificationChallenge;
  onApproved: () => Promise<void>;
  onReset: () => void;
}

const POLL_INTERVAL_MS = 1_500;

export function WhatsappApprovalPanel({
  autoLaunchFailed = false,
  challenge,
  onApproved,
  onReset,
}: WhatsappApprovalPanelProps) {
  const [phase, setPhase] = useState<'waiting' | 'completing' | 'error'>('waiting');
  const [error, setError] = useState('');
  const onApprovedRef = useRef(onApproved);
  const completionStartedRef = useRef(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    onApprovedRef.current = onApproved;
  }, [onApproved]);

  const complete = useCallback(async () => {
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    setPhase('completing');
    setError('');
    try {
      await onApprovedRef.current();
    } catch (completionError) {
      setError(completionError instanceof Error
        ? completionError.message
        : 'Your request could not be completed. Please try again.');
      setPhase('error');
    }
  }, []);

  const checkStatus = useCallback(async () => {
    if (pollingRef.current || completionStartedRef.current) return;
    pollingRef.current = true;
    try {
      const result = await getWhatsappVerificationStatus(challenge);
      if (result.status === 'verified' || result.status === 'completed') {
        await complete();
      } else {
        setPhase('waiting');
        setError('');
      }
    } catch (statusError) {
      setError(statusError instanceof Error
        ? statusError.message
        : 'We could not check WhatsApp yet. Please try again.');
      setPhase('error');
    } finally {
      pollingRef.current = false;
    }
  }, [challenge, complete]);

  useEffect(() => {
    completionStartedRef.current = false;
    setPhase('waiting');
    setError('');
    void checkStatus();
    const interval = window.setInterval(() => void checkStatus(), POLL_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkStatus();
    };
    window.addEventListener('focus', checkStatus);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checkStatus);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [challenge.actionId, checkStatus]);

  const retry = () => {
    completionStartedRef.current = false;
    setPhase('waiting');
    setError('');
    void checkStatus();
  };

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-700">
          {phase === 'completing'
            ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            : phase === 'error'
              ? <MessageCircle aria-hidden="true" className="h-4 w-4" />
              : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
        </div>
        <div>
          <p className="font-semibold text-emerald-950">Approve with Machu in WhatsApp</p>
          <p className="mt-1 text-sm leading-6 text-emerald-900/80">
            {autoLaunchFailed
              ? 'WhatsApp did not open automatically. Use the button below, send the ready-made message, then come back here.'
              : 'WhatsApp opened with a ready-made message. Send it, then come back here—we’ll finish automatically.'}
          </p>
        </div>
      </div>

      <Button asChild className="w-full bg-[#167c3a] hover:bg-green-800">
        <a href={challenge.whatsappUrl ?? undefined} onClick={() => window.setTimeout(() => void checkStatus(), 500)} rel="noreferrer" target="_blank">
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          {autoLaunchFailed ? 'Open Machu in WhatsApp' : 'Open Machu in WhatsApp again'}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </Button>

      <div aria-live="polite" className="text-xs leading-5 text-emerald-900/75">
        {phase === 'completing'
          ? 'WhatsApp approved. Finishing your request…'
          : phase === 'waiting'
            ? 'Waiting for your message to Machu…'
            : null}
        {error && <p className="font-medium text-red-700" role="alert">{error}</p>}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button className="h-auto p-0 text-xs" onClick={onReset} type="button" variant="link">
          Start over
        </Button>
        {phase === 'error' && (
          <Button className="h-auto p-0 text-xs" onClick={retry} type="button" variant="link">
            Check again
          </Button>
        )}
      </div>
    </div>
  );
}
