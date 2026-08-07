import { computed } from 'vue';
import {
  useAgentImgGeneration,
  type GenerationDeps
} from './useAgentImgGeneration';
import {
  useAgentImgGenerationV2,
  type GenerationV2Deps
} from './useAgentImgGenerationV2';

export function useAgentImgGenerationController(
  legacyDeps: GenerationDeps,
  v2Deps: GenerationV2Deps,
  v2Enabled: { value: boolean }
) {
  const legacy = useAgentImgGeneration(legacyDeps);
  const v2 = useAgentImgGenerationV2(v2Deps);
  const pendingUserText = computed(() =>
    v2Enabled.value ? v2.pendingUserText.value : legacy.pendingUserText.value
  );
  const lastUserText = computed(() =>
    v2Enabled.value ? v2.lastUserText.value : legacy.lastUserText.value
  );
  const pendingNotice = computed(() =>
    v2Enabled.value ? v2.pendingNotice.value : legacy.pendingNotice.value
  );

  return {
    pendingUserText,
    lastUserText,
    pendingNotice,
    quoteConfirmation: v2.quoteConfirmation,
    doPrimary: () => (v2Enabled.value ? v2.prepareSubmission() : legacy.doPrimary()),
    doVariation: () => (v2Enabled.value ? v2.prepareSubmission('generate') : legacy.doPrimary()),
    confirmQuote: v2.confirmQuote,
    declineQuote: v2.declineQuote,
    onStopProcessing: () =>
      v2Enabled.value ? v2.onStopProcessing() : legacy.onStopProcessing(),
    abortImg2Img: () => {
      legacy.abortImg2Img();
      v2.abortImg2Img();
    },
    resumePendingTask: () => (v2Enabled.value ? v2.resumePendingTask() : Promise.resolve())
  };
}
