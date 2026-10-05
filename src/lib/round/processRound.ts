import { assemblePrompt, shouldRotateSummary, type RoundAction } from './assemblePrompt';
import type { RoundRepository } from './roundRepository';
import { parseSceneTag } from '@/lib/scenes/scenes';
import { normalizeSettings } from '@/lib/campaign/settings';
import { parseCharacterTags } from '@/lib/character/tags';
import { applyCharacterTags } from '@/lib/character/applyTags';
import { applyXpTags, levelDamageBonus, levelForXp } from '@/lib/character/leveling';
import { weaponFor } from '@/lib/character/constants';
import { randomDie, rollDice } from '@/lib/character/dice';
import { applyInventoryTags, applyPotionActions } from '@/lib/inventory/apply';
import { applyEconomyTags } from '@/lib/economy/apply';

export interface ProcessRoundDeps {
  claimRound: (roundId: string) => Promise<boolean>;
  /** Hands a claimed round back to 'pending' so a retry doesn't wait out the stale window. */
  releaseRound?: (roundId: string) => Promise<void>;
  repository: RoundRepository;
  generateNarration: (prompt: string) => Promise<AsyncIterable<string>>;
  /** Rolls one d20 (1-20). Injectable so tests are deterministic. */
  rollDie?: () => number;
  /** Rolls one die with the given number of sides (weapon and tier damage). Injectable for tests. */
  rollSides?: (sides: number) => number;
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
  let rolled: RoundAction[];
  let diceEnabled = true;
  let stream: AsyncIterable<string>;
  let potions: ReturnType<typeof applyPotionActions>;
  try {
    context = await deps.repository.getRoundContext(roundId);
    if (context.tagsApplied) {
      // An earlier attempt already generated this round's narration and applied its HP/
      // inventory/gold tags, then failed or timed out before closing (claimRound's staleness
      // window let this attempt pick it back up). Finish the job without regenerating narration
      // or re-rolling dice, so nothing doubles up.
      const nextRoundId = await deps.repository.closeRoundAndOpenNext(context.campaignId, roundId);
      return { processed: true, nextRoundId };
    }
    // The server rolls, not the model, so results are fair and can be shown to the table.
    const rollDie = deps.rollDie ?? (() => 1 + Math.floor(Math.random() * 20));
    const settings = normalizeSettings(context.settings);
    diceEnabled = settings.diceEnabled;
    const rollSides = deps.rollSides ?? randomDie;
    // Potions resolve before narration so the DM sees the real HP; nothing is saved until the end,
    // so a failed generation leaves the potion untouched for the retry.
    potions = applyPotionActions(context.characters, context.inventories, context.actions, rollSides);
    const characterByName = new Map(context.characters.map((c) => [c.displayName.toLowerCase(), c]));
    rolled = context.actions.map((action) => {
      const a = { ...action, note: action.playerId ? potions.notes[action.playerId] : undefined };
      if (!diceEnabled) return a;
      const roll = rollDie();
      const character = characterByName.get(a.playerDisplayName.toLowerCase());
      if (!character) return { ...a, roll };
      const weapon = weaponFor(character.weaponId);
      return { ...a, roll, weaponLabel: weapon.id, damage: rollDice(weapon.dice, rollSides) + levelDamageBonus(levelForXp(character.xp ?? 0)) };
    });
    prompt = assemblePrompt(
      context.campaignSummary,
      context.recentMessages,
      rolled,
      context.adventure,
      context.sceneInstructionText,
      settings,
      { characters: potions.characters, pendingWipe: context.pendingWipe, inventories: potions.inventories, shop: context.currentShop }
    );
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
  if (diceEnabled) {
    await deps.repository
      .insertRollSummary(
        context.campaignId,
        roundId,
        rolled.map((r) => ({ playerDisplayName: r.playerDisplayName, roll: r.roll ?? 0 }))
      )
      .catch(() => {});
  }
  const messageId = await deps.repository.insertDmMessagePlaceholder(context.campaignId, roundId);

  // The stream is already fully buffered by the adapter, so save it in one write: appending per
  // chunk cost a read + update round trip each and ate the function's time budget.
  // The DM ends with a [[scene: id]] tag; parse it out so it never reaches the visible message.
  let narration = '';
  for await (const chunk of stream) narration += chunk;
  const { tags, cleanText: withoutCharacterTags } = parseCharacterTags(narration);
  const { sceneId, cleanText } = parseSceneTag(withoutCharacterTags);
  if (cleanText.trim()) await deps.repository.appendToMessage(messageId, cleanText);
  if (sceneId && context.allowedSceneIds.includes(sceneId)) {
    // A missing scene column or a bad tag must never fail the round.
    await deps.repository.setCurrentScene(context.campaignId, sceneId).catch(() => {});
    // The merchant stays put until the story actually moves on.
    if (context.currentShop && sceneId !== context.currentSceneId) {
      await deps.repository.setShop(context.campaignId, null).catch(() => {});
    }
  }

  // Best-effort like the scene change: a failure here must never leave the table stuck.
  // Claimed before anything is saved, not after: a retry that reaches this point must never
  // re-apply the same hurt/heal/give/take/gold effects on top of what an earlier attempt already
  // committed, even if that earlier attempt's own save was itself incomplete.
  if (context.characters.length > 0 && (await deps.repository.claimRoundTags(roundId))) {
    try {
      const result = applyCharacterTags(potions.characters, tags, deps.rollSides ?? randomDie);
      const inventoryResult = applyInventoryTags(result.characters, potions.inventories, tags);
      const economy = applyEconomyTags(result.characters, tags, deps.rollSides ?? randomDie);
      // A wiped party was just revived to active; paying XP for that would reward losing.
      const xpResult = result.wiped ? { characters: result.characters, changes: [] as string[] } : applyXpTags(result.characters, tags);
      // HP first on purpose: if only the inventory write fails, a potion heals without being
      // consumed, which is better for the player than being consumed without healing.
      await deps.repository.saveCharacterState(context.campaignId, xpResult.characters, result.wiped);
      const changedIds = [...new Set([...potions.changedPlayerIds, ...inventoryResult.changedPlayerIds])];
      // Its own try: if only the inventory write fails, the table must still see what happened.
      if (changedIds.length > 0) {
        try {
          await deps.repository.saveInventories(
            context.campaignId,
            changedIds.map((playerId) => ({
              playerId,
              items: inventoryResult.inventories[playerId] ?? [],
              // What this round assumed the pack looked like when it started; lets the repository
              // detect a shop purchase or trade that landed mid-round instead of overwriting it.
              baseItems: context.inventories[playerId] ?? [],
            }))
          );
        } catch {
          /* best-effort, like the rest of the mechanics */
        }
      }
      const goldChanges = Object.entries(economy.goldDeltas)
        .filter(([, delta]) => delta !== 0)
        .map(([playerId, delta]) => ({ playerId, delta }));
      if (goldChanges.length > 0) {
        try {
          await deps.repository.applyGold(goldChanges);
        } catch {
          /* best-effort */
        }
      }
      if (economy.shop) {
        try {
          await deps.repository.setShop(context.campaignId, economy.shop.action === 'open' ? economy.shop.shop : null);
        } catch {
          /* best-effort */
        }
      }
      await deps.repository.insertStatsSummary(context.campaignId, roundId, [
        ...potions.changes,
        ...result.changes,
        ...xpResult.changes,
        ...inventoryResult.changes,
        ...economy.changes,
      ]);
    } catch {
      /* the narration is already posted; the next round reads whatever state was saved */
    }
  }

  const nextRoundId = await deps.repository.closeRoundAndOpenNext(context.campaignId, roundId);

  // Best-effort and after the round is closed: a slow or failed summary must never leave the
  // table stuck on a round whose narration is already posted. It is retried next round.
  if (shouldRotateSummary(context.recentMessages)) {
    try {
      const summaryPrompt = `Summarize the campaign so far in under 500 words:

${prompt}`;
      const summaryStream = await deps.generateNarration(summaryPrompt);
      let summaryText = '';
      for await (const chunk of summaryStream) summaryText += chunk;
      await deps.repository.updateCampaignSummary(context.campaignId, summaryText, roundId);
    } catch {
      // Swallowed on purpose; see above.
    }
  }

  return { processed: true, messageId, nextRoundId };
}
