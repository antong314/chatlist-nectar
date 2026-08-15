import { useCallback, useEffect, useState } from 'react';
import {
  forgetVerifiedWhatsappSession,
  getVerifiedWhatsappSession,
} from './verificationApi';
import type { VerifiedWhatsappSession } from './types';

const anonymousSession: VerifiedWhatsappSession = { authenticated: false };

export function useVerifiedWhatsappSession() {
  const [session, setSession] = useState<VerifiedWhatsappSession>(anonymousSession);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setSession(await getVerifiedWhatsappSession());
    } catch {
      setSession(anonymousSession);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const forget = useCallback(async () => {
    await forgetVerifiedWhatsappSession();
    setSession(anonymousSession);
  }, []);

  return { session, isLoading, forget, refresh };
}
