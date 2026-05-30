/** Per-candidate draft keys — avoids leaking life map / essay between accounts on the same browser. */

const LEGACY_KEYS = [
  "invisionu_apply_substep",
  "invisionu_timeline",
  "invisionu_sjt",
  "invisionu_essay_prompt",
  "invisionu_essay_text",
] as const;

export function draftKeys(candidateId: number) {
  return {
    step: `invisionu_apply_substep_${candidateId}`,
    timeline: `invisionu_timeline_${candidateId}`,
    sjt: `invisionu_sjt_${candidateId}`,
    essayPrompt: `invisionu_essay_prompt_${candidateId}`,
    /** JSON `{ year, title }` — prompt text from i18n `apply.deepdive_prompt`. */
    essayPromptMeta: `invisionu_essay_prompt_meta_${candidateId}`,
    essayText: `invisionu_essay_text_${candidateId}`,
  } as const;
}

/** Remove legacy global keys (pre–per-user storage). */
export function clearLegacyApplyDraftKeys() {
  for (const k of LEGACY_KEYS) {
    localStorage.removeItem(k);
  }
}

export function clearApplyDraftForCandidate(candidateId: number) {
  const k = draftKeys(candidateId);
  localStorage.removeItem(k.step);
  localStorage.removeItem(k.timeline);
  localStorage.removeItem(k.sjt);
  localStorage.removeItem(k.essayPrompt);
  localStorage.removeItem(k.essayPromptMeta);
  localStorage.removeItem(k.essayText);
}
