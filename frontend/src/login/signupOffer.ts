import { buildApiUrl } from '@/utils/api';
import { fetchJsonQuery } from '@/services/serverState';

type SignupMetadata = {
  ok?: boolean;
  capabilities?: { publicSignup?: boolean };
  signupOffer?: { available?: boolean; credits?: number };
};

export const getSignupOfferCredits = async (): Promise<number | null> => {
  try {
    const metadata = await fetchJsonQuery<SignupMetadata | null>({
      queryKey: ['public', 'signup-offer'],
      staleTime: 60_000,
      request: (signal) => fetch(buildApiUrl('/api/meta'), { signal, credentials: 'omit' })
    });
    const credits = metadata?.signupOffer?.credits;
    return metadata?.ok === true &&
      metadata.capabilities?.publicSignup === true &&
      metadata.signupOffer?.available === true &&
      typeof credits === 'number' && Number.isSafeInteger(credits) && credits > 0
      ? credits
      : null;
  } catch {
    // A missing or failed configuration must never become a promotional claim.
    return null;
  }
};
