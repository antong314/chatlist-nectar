import React from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VerifiedWhatsappSession } from './types';

interface VerifiedWhatsappNoticeProps {
  session: VerifiedWhatsappSession;
  onForget: () => Promise<void>;
}

export function VerifiedWhatsappNotice({ session, onForget }: VerifiedWhatsappNoticeProps) {
  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
      <div className="flex items-start gap-2">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div>
          <p className="text-sm font-semibold">WhatsApp verified on this device</p>
          <p className="mt-1 text-xs leading-5 text-emerald-900/80">
            Your verified WhatsApp number ending in {session.phoneEnding} will be privately recorded with this action for moderation and accountability. You can save without messaging Machu again. Your number will not be shown publicly.
          </p>
        </div>
      </div>
      <Button
        className="h-auto p-0 text-xs text-emerald-800"
        onClick={() => void onForget()}
        type="button"
        variant="link"
      >
        <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
        Use another WhatsApp number
      </Button>
    </div>
  );
}
