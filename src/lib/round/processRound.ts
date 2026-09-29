import { assemblePrompt, shouldRotateSummary } from './assemblePrompt';
import type { RoundRepository } from './roundRepository';
import { allowedScenes, parseSceneTag } from '@/lib/scenes/scenes';

export interface ProcessRoundDeps {
  claimRound: (roundId: string) => Promise<boolean>;
  /** Hands a claimed round back to 'pending' so a retry doesn't wait out the stale window. */
  releaseRound?: (roundId: string) => Promise<void>;
  repository: RoundRepository;
  generateNarration: (prompt: string) => Promise<AsyncIterable<string>>;
}

export interface ProcessRoundResult {
  processed: boolean;
  messageId?: string;
  nextRoundId?: string;
}

export async function processRound(
  deps: ProcessRoundDeps,
  roundId: string
): Promise<ProcessRoundResult> {
  const claimed = await deps.claimRound(roundId);
  if (!claimed) {
    return { processed: false };
  }

  let context: Awaited<ReturnType<RoundRepository['getRoundContext']>>;
  let prompt: string;
  let stream: AsyncIterable<string>;
  try {
    context = await deps.repository.getRoundContext(roundId);
    prompt = assemblePrompt(context.campaignSummary, context.recentMessages, context.actions, context.adventureId);
    // Generate before writing anything: the real adapter resolves only once Gemini has
    // answered (and throws on API failure), so a failed attempt leaves no orphaned empty
    // DM message or player-action messages that a retry would duplicate.
    stream = await deps.generateNarration(prompt);
  } catch (error) {
    // Nothing was written yet, so it is safe to release the claim for an immediate retry.
    await deps.releaseRound?.(roundId).catch(() => {});
    throw error;
  }

  await deps.repository.insertPlayerActionMessages(context.campaignId, roundId, context.actions);
  const messageId = await deps.repository.insertDmMessagePlaceholder(context.campaignId, roundId);

  // The DM ends with a [[scene: id]] tag. Hold back anything from a possible tag onward so it
  // never reaches the visible message, then use it to move the scene banner.
  let pending = '';
  for await (const chunk of stream) {
    pending += chunk;
    const tagStart = pending.indexOf('[[');
    let safeLength =
      tagStart >= 0 ? tagStart : pending.endsWith('[') ? pending.length - 1 : pending.length;
    // The tag sits on its own line, so also hold back the line break before it.
    const lineBreak = /\s*\n\s*$/.exec(pending.slice(0, safeLength));
    if (lineBreak) safeLength = lineBreak.index;
    if (safeLength > 0) {
      await deps.repository.appendToMessage(messageId, pending.slice(0, safeLength));
      pending = pending.slice(safeLength);
    }
  }
  const { sceneId, cleanText } = parseSceneTag(pending);
  if (cleanText.trim()) await deps.repository.appendToMessage(messageId, cleanText);
  if (sceneId && allowedScenes(context.adventureId).some((s) => s.id === sceneId)) {
    // A missing scene column or a bad tag must never fail the round.
    await deps.repository.setCurrentScene(context.campaignId, sceneId).catch(() => {});
  }

  if (shouldRotateSummary(context.recentMessages)) {
    const summaryPrompt = `Summarize the campaign so far in under 500 words:\n\n${prompt}`;
    const summaryStream = await deps.generateNarration(summaryPrompt);
    let summaryText = '';
    for await (const chunk of summaryStream) summaryText += chunk;
    await deps.repository.updateCampaignSummary(context.campaignId, summaryText, roundId);
  }

  const nextRoundId = await deps.repository.closeRoundAndOpenNext(context.campaignId, roundId);

  return { processed: true, messageId, nextRoundId };
}
