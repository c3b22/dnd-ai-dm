# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small groups of Thai-speaking friends playing D&D together, with an AI (Gemini) as Dungeon Master. Play happens on both phones and desktops: some sessions are everyone on their own phone (often sitting together or talking on Discord), others are longer sessions at a computer. Every screen must work well at both sizes.

## Product Purpose

A multiplayer web app where an AI Dungeon Master narrates in Thai, resolves each player's action per round, and keeps the story inside a chosen adventure outline. Success: a group can start a room, play a whole adventure together, and feel like there was a real DM at the table.

## Positioning

Round-based simultaneous play: every player submits an action for the round, then the DM resolves them all at once (atomic HP/state per round), rather than a free-form chat with an AI. Adventures are outlines (hook, acts, NPCs, DM-only secrets), not fixed scripts.

## Operating Context

- Owner creates a room, picks an adventure, names a character and starting weapon; others join with a 6-digit code.
- Lobby waits for players, then the owner starts.
- During play: scene image banner with per-campaign mood tint, DM narration stream, action input (abilities, spells, extras), round timer, player order (reorderable per settings), enemies, inventory, shop, trades between players, rest votes, team chat and limited "ask the DM" per round, recap, quest log, respawn, campaign end summary and sequel.
- Players can author, edit, and share custom adventures via share code.
- 3D dice roll animation (`@3d-dice/dice-box`).

## Capabilities and Constraints

- Next.js 15 App Router, React 19, TypeScript, Supabase (anonymous auth, realtime), Vercel AI SDK with Google Gemini.
- All UI copy is Thai; adventure titles also exist in English.
- Scene illustrations live in `public/scenes/` (40 JPGs); theme assets in `public/assets/themes`.

## Brand Commitments

- Name: "D&D AI DM". Thai-first copy.

## Evidence on Hand

- 9 built-in adventures with Thai titles and taglines (`src/lib/adventures/adventures.ts`).
- Scene art in `public/scenes/`.
- No testimonials, user counts, or press; never fabricate them.

## Product Principles

1. The table comes first: what the group is doing this round is always the clearest thing on screen.
2. The DM's story is the reward; reading it should feel good on a phone.
3. Phone and desktop are equal citizens.
4. Thai typography is not an afterthought.
