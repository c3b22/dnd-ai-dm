import { assemblePrompt, shouldRotateSummary, type RoundAction } from './assemblePrompt';
import type { RoundRepository } from './roundRepository';
import { parseSceneTag } from '@/lib/scenes/scenes';
import { normalizeSettings } from '@/lib/campaign/settings';
import { parseCharacterTags } from '@/lib/character/tags';
import { applyCharacterTags } from '@/lib/character/applyTags';
import { applyAbilityActions, eventfulRound, tickCooldowns } from '@/lib/character/applyAbilities';
import { applyXpTags, levelDamageBonus, levelForXp } from '@/lib/character/leveling';
import { weaponFor } from '@/lib/character/constants';
import { randomDie, rollDice } from '@/lib/character/dice';
import { applyInventoryTags, applyPotionActions, applyScrollActions } from '@/lib/inventory/apply';
import { takeItem } from '@/lib/inventory/rules';
import { advanceEncounter, applyEnemyTags, type Encounter } from '@/lib/combat/encounter';
import { applyVenom, applyAttackOutcomes, applyEnemyAttackOutcomes, applyEnemyAttackTags, applyLifesteal, runAttacks, runEnemyAttacks, type AttackOutcome, type EnemyAttackOutcome } from '@/lib/combat/attack';
import { selectFacts } from '@/lib/memory/facts';
import { applyEconomyTags } from '@/lib/economy/apply';
import { parseCheckPlan, runChecks } from '@/lib/character/checkPlan';
import { changedDeathSaves, runDeathSaves, settleDeathSaves, type DeathSaveRoll } from '@/lib/character/deathSaves';
import { DEATH_SAVE_SKILL } from '@/lib/character/skillLabels';
import type { RollSummaryEntry } from './roundRepository';
import { applyPermadeath, type Corpse } from '@/lib/character/permadeath';
import { applyLootTags } from '@/lib/character/loot';
import type { Character } from '@/lib/character/types';

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

async function* single(text: string): AsyncIterable<string> {
  yield text;
}

/** A death save shown like a skill check so the dice overlay renders it for everyone (H1). */
function deathSaveEntry(r: DeathSaveRoll): RollSummaryEntry {
  return {
    playerDisplayName: r.playerDisplayName,
    roll: r.die,
    check: { skill: DEATH_SAVE_SKILL, dc: r.dc, advantage: 'none', dice: [r.die], modifier: 0, proficiency: 0, total: r.total, success: r.success, critical: r.critical },
  };
}

/** An enemy attack shown like a roll so the dice overlay renders it for everyone (I2). */
function enemyAttackEntry(o: EnemyAttackOutcome): RollSummaryEntry {
  return {
    playerDisplayName: o.enemy,
    roll: o.die,
    enemyAttack: { target: o.playerDisplayName, bonus: o.bonus, total: o.total, ac: o.ac, hit: o.hit, critical: o.critical },
  };
}

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
  const rollD20 = deps.rollDie ?? (() => 1 + Math.floor(Math.random() * 20));
  const claimed = await deps.claimRound(roundId);
  if (!claimed) {
    return { processed: false };
  }

  let context: Awaited<ReturnType<RoundRepository['getRoundContext']>>;
  let prompt: string;
  let rolled: RoundAction[];
  let attackOutcomes: AttackOutcome[] = [];
  let enemyAttackOutcomes: EnemyAttackOutcome[] = [];
  let deathSaveRolls: DeathSaveRoll[] = [];
  let deathSaveChanges: string[] = [];
  let roundCharacters: Character[] = [];
  let storedEncounter: Encounter | null = null;
  let venomChanges: string[] = [];
  let corpses: Corpse[] = [];
  let diceEnabled = true;
  let stream: AsyncIterable<string>;
  let potions: ReturnType<typeof applyPotionActions>;
  let abilities: ReturnType<typeof applyAbilityActions>;
  let scrolls: ReturnType<typeof applyScrollActions>;
  try {
    context = await deps.repository.getRoundContext(roundId);
    // H3a: a permanently dead character cannot act; their action (e.g. from a stale client) never reaches the AI.
    const deadIds = new Set(context.characters.filter((c) => c.status === 'dead').map((c) => c.id));
    if (deadIds.size > 0) context = { ...context, actions: context.actions.filter((a) => !(a.playerId && deadIds.has(a.playerId))) };
    if (context.tagsApplied) {
      // An earlier attempt already generated this round's narration and applied its HP/
      // inventory/gold tags, then failed or timed out before closing (claimRound's staleness
      // window let this attempt pick it back up). Finish the job without regenerating narration
      // or re-rolling dice, so nothing doubles up.
      const nextRoundId = await deps.repository.closeRoundAndOpenNext(context.campaignId, roundId);
      return { processed: true, nextRoundId };
    }
    // I4 venomous: last round's poisoned players lose HP now, before anything else; the stored encounter keeps its
    // poisoned list until this round's end-of-round save replaces it, so a retry before that never loses it.
    storedEncounter = context.currentEncounter ?? null;
    if (storedEncounter?.poisoned) {
      const venom = applyVenom(context.characters, storedEncounter.poisoned);
      venomChanges = venom.changes;
      const { poisoned: _poisoned, ...rest } = storedEncounter;
      void _poisoned;
      context = { ...context, characters: venom.characters, currentEncounter: rest };
    }
    // The server rolls, not the model, so results are fair and can be shown to the table.
    const rollDie = rollD20;
    const settings = normalizeSettings(context.settings);
    diceEnabled = settings.diceEnabled;
    const rollSides = deps.rollSides ?? randomDie;
    // Potions resolve before narration so the DM sees the real HP; nothing is saved until the end,
    // so a failed generation leaves the potion untouched for the retry.
    potions = applyPotionActions(context.characters, context.inventories, context.actions, rollSides);
    // Class abilities resolve here too, before narration and unsaved until the end, like potions.
    abilities = applyAbilityActions(potions.characters, context.actions, rollSides);
    // F5e: scrolls cut pips off the targeted enemy before narration; like potions nothing is saved until the end.
    scrolls = applyScrollActions(abilities.characters, potions.inventories, context.currentEncounter ?? null, context.actions);
    // H1: downed characters roll a death save before narration (dice tables only, like every other roll).
    // Unsaved until the end, like potions; a nat 20 stands the character up before the DM narrates.
    const deaths = diceEnabled ? runDeathSaves(abilities.characters, rollDie) : { characters: abilities.characters, outcomes: [], changes: [] as string[], died: [] as string[], charmsSpent: [] as { characterId: string; itemId: string }[] };
    // F5g: a charm that just revived its wearer is spent: remove it from the pack now (saved with the other
    // inventory changes at the end) so the narration prompt and every later step already see it gone.
    const spentCharms = deaths.charmsSpent;
    if (spentCharms.length > 0) {
      const inventories = { ...scrolls.inventories };
      const changed = new Set(scrolls.changedPlayerIds);
      for (const { characterId, itemId } of spentCharms) {
        inventories[characterId] = takeItem(inventories[characterId] ?? [], itemId).items;
        changed.add(characterId);
      }
      scrolls = { ...scrolls, inventories, changedPlayerIds: [...changed] };
    }
    deathSaveRolls = deaths.outcomes;
    deathSaveChanges = deaths.changes;
    roundCharacters = deaths.characters;
    // H3a: only in rooms with permadeath does a third failed save (without a charm) kill for good.
    if (settings.permadeath && deaths.died.length > 0) {
      const permanent = applyPermadeath(deaths.characters, scrolls.inventories, deaths.died);
      roundCharacters = permanent.characters;
      corpses = permanent.corpses;
      deathSaveChanges = [...deathSaveChanges, ...permanent.changes];
    }
    const characterByName = new Map(context.characters.map((c) => [c.displayName.toLowerCase(), c]));
    rolled = context.actions.map((action) => {
      const note = action.playerId
        ? [potions.notes[action.playerId], scrolls.notes[action.playerId], abilities.notes[action.playerId]].filter(Boolean).join('; ') || undefined
        : undefined;
      const a = { ...action, note };
      if (!diceEnabled) return a;
      const roll = rollDie();
      const character = characterByName.get(a.playerDisplayName.toLowerCase());
      if (!character) return { ...a, roll };
      const weapon = weaponFor(character.weaponId);
      return { ...a, roll, weaponLabel: weapon.id, damage: abilities.damage[character.id] ?? rollDice(weapon.dice, rollSides) + levelDamageBonus(levelForXp(character.xp ?? 0)) };
    });
    const build = (actions: RoundAction[], planChecks = false, enemyAttackResults: EnemyAttackOutcome[] = []) =>
      assemblePrompt(
        context.campaignSummary,
        context.recentMessages,
        actions,
        context.adventure,
        context.sceneInstructionText,
        settings,
        { characters: roundCharacters, pendingWipe: context.pendingWipe, inventories: scrolls.inventories, shop: context.currentShop, encounter: scrolls.encounter, corpses: context.corpses ?? [] },
        context.facts ?? [],
        { planChecks, enemyAttacks: enemyAttackResults }
      );
    prompt = build(rolled);
    // Generate before writing anything: the real adapter resolves only once Gemini has
    // answered (and throws on API failure), so a failed attempt leaves no orphaned empty
    // DM message or player-action messages that a retry would duplicate.
    if (diceEnabled && roundCharacters.length > 0) {
      // Dice tables: the first call either asks for skill checks or narrates outright. Only a
      // round with checks costs a second call; anything unusable falls back to a plain narration.
      const first = parseCheckPlan(await collect(await deps.generateNarration(build(rolled, true))));
      if (first.kind === 'narration' || first.kind === 'plain') {
        stream = single(first.text);
      } else {
        // C8: attacks on enemies resolve first (their damage was already rolled above); a player
        // who attacks does not also get a skill check this round.
        const damageByName = new Map(rolled.map((a) => [a.playerDisplayName.toLowerCase(), a.damage]));
        attackOutcomes =
          first.kind === 'checks'
            ? runAttacks(first.attacks, roundCharacters, scrolls.encounter, (c) => damageByName.get(c.displayName.toLowerCase()), rollDie)
            : [];
        const attackers = new Set(attackOutcomes.map((o) => o.playerDisplayName.toLowerCase()));
        const outcomes =
          first.kind === 'checks'
            ? runChecks(first.checks.filter((c) => !attackers.has(c.player.toLowerCase())), roundCharacters, rollDie)
            : [];
        // I2: enemy attacks roll against the players' AC before the narration, then the DM narrates the real result.
        enemyAttackOutcomes = first.kind === 'checks' ? runEnemyAttacks(first.enemyAttacks, roundCharacters, scrolls.encounter, rollDie, rollSides, applyAttackOutcomes(scrolls.encounter, attackOutcomes)) : [];
        if (outcomes.length > 0 || attackOutcomes.length > 0 || enemyAttackOutcomes.length > 0) {
          const byName = new Map(outcomes.map((o) => [o.playerDisplayName.toLowerCase(), o]));
          const attackByName = new Map(attackOutcomes.map((o) => [o.playerDisplayName.toLowerCase(), o]));
          rolled = rolled.map((a) => {
            const key = a.playerDisplayName.toLowerCase();
            const check = byName.get(key);
            const attack = attackByName.get(key);
            return { ...a, ...(check ? { check } : {}), ...(attack ? { attack } : {}) };
          });
          prompt = build(rolled, false, enemyAttackOutcomes);
        }
        stream = await deps.generateNarration(prompt);
      }
    } else {
      stream = await deps.generateNarration(prompt);
    }
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
        [...rolled.map((r): RollSummaryEntry => {
          const c = r.check;
          if (r.attack) {
            const a = r.attack;
            return { playerDisplayName: r.playerDisplayName, roll: a.die, attack: { target: a.target, modifier: a.modifier, proficiency: a.proficiency, magic: a.magic, total: a.total, ac: a.dc, hit: a.hit, critical: a.critical } };
          }
          if (!c) return { playerDisplayName: r.playerDisplayName, roll: r.roll ?? 0 };
          return {
            playerDisplayName: r.playerDisplayName,
            roll: c.die,
            check: { skill: c.skill, dc: c.dc, advantage: c.advantage, dice: c.dice, modifier: c.modifier, proficiency: c.proficiency, total: c.total, success: c.success, critical: c.critical },
          };
        }), ...enemyAttackOutcomes.map(enemyAttackEntry), ...deathSaveRolls.map(deathSaveEntry)]
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
  let sceneChanged = false;
  if (sceneId && context.allowedSceneIds.includes(sceneId)) {
    sceneChanged = sceneId !== context.currentSceneId;
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
      // C8: enemy attacks land first so a wipe they cause is handled by applyCharacterTags below.
      // An enemy that joins this very round may attack; one the players just downed still did.
      const roundStart = applyEnemyTags(context.currentEncounter ?? null, tags.filter((t) => t.kind === 'enemy'));
      const wardUsed = new Set<string>(); // F5j4: one ward use per wearer per round, across both damage paths
      // I2: attacks the server rolled from the plan land first; only when there were none, an [[enemy_attack]]
      // tag from a pure narration is rolled by the same formula and reported in the stats summary.
      const plannedHits = applyEnemyAttackOutcomes(roundCharacters, enemyAttackOutcomes, wardUsed, abilities.guards);
      const tagHits =
        enemyAttackOutcomes.length === 0
          ? applyEnemyAttackTags(plannedHits.characters, roundStart, tags, rollD20, deps.rollSides ?? randomDie, wardUsed, abilities.guards)
          : { characters: plannedHits.characters, changes: [] as string[], outcomes: [] as EnemyAttackOutcome[] };
      const poisonedIds = [...enemyAttackOutcomes, ...tagHits.outcomes].filter((o) => o.venomous).map((o) => o.playerId);
      const enemyAttacks = { characters: tagHits.characters, changes: [...plannedHits.changes, ...tagHits.changes] };
      // F5j2: lifesteal heals after enemy attacks so a wearer downed this round is not revived by it.
      const lifesteal = applyLifesteal(enemyAttacks.characters, sceneChanged ? null : scrolls.encounter, attackOutcomes);
      const result = applyCharacterTags(lifesteal.characters, tags, deps.rollSides ?? randomDie, abilities.guards, wardUsed);
      const inventoryResult = applyInventoryTags(result.characters, scrolls.inventories, tags, { given: context.magicGiven ?? null });
      // H3c: the corpse's things move to the looter; the corpse row is only written back after the pack save below.
      const lootable = context.corpses ?? [];
      const lootResult = lootable.length > 0 && deps.repository.saveCorpseLoot
        ? applyLootTags(result.characters, inventoryResult.inventories, lootable, tags)
        : null;
      const economy = applyEconomyTags(result.characters, tags, deps.rollSides ?? randomDie);
      // A wiped party was just revived to active; paying XP for that would reward losing.
      const xpResult = result.wiped ? { characters: result.characters, changes: [] as string[] } : applyXpTags(result.characters, tags);
      // HP first on purpose: if only the inventory write fails, a potion heals without being
      // consumed, which is better for the player than being consumed without healing.
      // Cooldowns tick inside the tagsApplied claim, so a stale retry can never tick them twice.
      const finalCharacters = settleDeathSaves(tickCooldowns(
        xpResult.characters,
        eventfulRound({ character: [...enemyAttacks.changes, ...lifesteal.changes, ...result.changes], inventory: inventoryResult.changes, economy: economy.changes, xp: xpResult.changes }),
        abilities.used
      ));
      await deps.repository.saveCharacterState(context.campaignId, finalCharacters, result.wiped);
      // H1: best-effort like the rest; a missing death_saves column just means no tally carries over.
      const deathSaveWrites = changedDeathSaves(context.characters, finalCharacters);
      if (deathSaveWrites.length > 0 && deps.repository.saveDeathSaves) {
        try {
          await deps.repository.saveDeathSaves(deathSaveWrites);
        } catch {
          /* best-effort */
        }
      }
      // H3a: the corpse is written first; only once it exists do the pack and gold leave the dead character.
      let corpsesSaved = false;
      if (corpses.length > 0 && deps.repository.saveCorpses) {
        try {
          await deps.repository.saveCorpses(context.campaignId, corpses);
          corpsesSaved = true;
        } catch {
          /* best-effort: without the table the dead character keeps their things */
        }
      }
      const finalInventories = { ...(lootResult?.inventories ?? inventoryResult.inventories) };
      const corpseIds: string[] = [];
      if (corpsesSaved) {
        for (const corpse of corpses) {
          if ((context.inventories[corpse.playerId] ?? []).length > 0 || corpse.items.length > 0) {
            finalInventories[corpse.playerId] = [];
            corpseIds.push(corpse.playerId);
          }
        }
      }
      const changedIds = [...new Set([...potions.changedPlayerIds, ...scrolls.changedPlayerIds, ...inventoryResult.changedPlayerIds, ...(lootResult?.changedPlayerIds ?? []), ...corpseIds])];
      // Its own try: if only the inventory write fails, the table must still see what happened.
      let packSaved = changedIds.length === 0;
      if (changedIds.length > 0) {
        try {
          await deps.repository.saveInventories(
            context.campaignId,
            changedIds.map((playerId) => ({
              playerId,
              items: finalInventories[playerId] ?? [],
              // What this round assumed the pack looked like when it started; lets the repository
              // detect a shop purchase or trade that landed mid-round instead of overwriting it.
              baseItems: context.inventories[playerId] ?? [],
            }))
          );
          packSaved = true;
        } catch {
          /* best-effort, like the rest of the mechanics */
        }
      }
      // H3c: looted things leave the corpse only once the looter's pack is saved, so a failure can duplicate
      // (a retry of the tag is blocked by the claim) but never destroys items; gold follows the same gate.
      let lootGold: Record<string, number> = {};
      if (lootResult && lootResult.corpseUpdates.length > 0 && packSaved) {
        lootGold = lootResult.goldDeltas;
        try {
          await deps.repository.saveCorpseLoot!(lootResult.corpseUpdates);
        } catch {
          /* best-effort */
        }
      }
      // F5f: remember which magic items were handed out. Best-effort: a missing table must not matter.
      if (inventoryResult.magicGiven.length > 0 && deps.repository.saveMagicGiven) {
        try {
          await deps.repository.saveMagicGiven(context.campaignId, inventoryResult.magicGiven);
        } catch {
          /* best-effort, like the facts */
        }
      }
      const goldDeltas: Record<string, number> = { ...economy.goldDeltas };
      for (const [playerId, delta] of Object.entries(lootGold)) goldDeltas[playerId] = (goldDeltas[playerId] ?? 0) + delta;
      if (corpsesSaved) for (const corpse of corpses) if (corpse.gold > 0) goldDeltas[corpse.playerId] = (goldDeltas[corpse.playerId] ?? 0) - corpse.gold;
      const goldChanges = Object.entries(goldDeltas)
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
      // Enemy tags go last, after every other tag. No automatic rewards: XP and gold still come
      // only from the DM's own xp/gold tags. Moving to another scene ends the fight.
      const before = storedEncounter;
      const after = advanceEncounter(sceneChanged ? null : before, applyEnemyTags(applyAttackOutcomes(sceneChanged ? null : scrolls.encounter, attackOutcomes), tags), poisonedIds);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        try {
          await deps.repository.setEncounter(context.campaignId, after);
        } catch {
          /* best-effort, like the shop */
        }
      }
      // World memory (npc/quest/clue). Best-effort: a missing campaign_facts table must not matter.
      const facts = selectFacts(tags);
      if (facts.length > 0) {
        try {
          await deps.repository.saveFacts(context.campaignId, facts);
        } catch {
          /* best-effort, like the encounter */
        }
      }
      await deps.repository.insertStatsSummary(context.campaignId, roundId, [
        ...venomChanges,
        ...deathSaveChanges,
        ...potions.changes,
        ...scrolls.changes,
        ...abilities.changes,
        ...enemyAttacks.changes,
        ...lifesteal.changes,
        ...result.changes,
        ...xpResult.changes,
        ...inventoryResult.changes,
        ...(lootResult?.changes ?? []),
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
