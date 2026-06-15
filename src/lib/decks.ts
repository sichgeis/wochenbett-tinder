import type { DeckRunState, DeckState, Recipe, RecipeDeckId, SwipeResponses } from "../types";
import { normalizeCursor } from "./swipe";

export const recipeDeckIds: RecipeDeckId[] = ["healthy", "sweets"];

export function createEmptyDeckRunState(): DeckRunState {
  return {
    cursor: 0,
    cycles: 0,
    responses: {},
  };
}

export function createEmptyDeckState(): DeckState {
  return {
    healthy: createEmptyDeckRunState(),
    sweets: createEmptyDeckRunState(),
  };
}

export function sanitizeResponsesForRecipes(
  recipes: Pick<Recipe, "id">[],
  responses: unknown,
): SwipeResponses {
  if (!responses || typeof responses !== "object") {
    return {};
  }

  const knownIds = new Set(recipes.map((recipe) => recipe.id));
  const sanitized: SwipeResponses = {};

  for (const [recipeId, decision] of Object.entries(responses)) {
    if (
      knownIds.has(recipeId) &&
      (decision === "nope" || decision === "like" || decision === "superlike")
    ) {
      sanitized[recipeId] = decision;
    }
  }

  return sanitized;
}

export function sanitizeDeckRunState(
  state: unknown,
  recipes: Pick<Recipe, "id">[],
): DeckRunState {
  if (!state || typeof state !== "object") {
    return createEmptyDeckRunState();
  }

  const partialState = state as Partial<DeckRunState>;

  return {
    cursor: normalizeCursor(partialState.cursor, recipes.length),
    cycles:
      typeof partialState.cycles === "number" && Number.isFinite(partialState.cycles)
        ? Math.max(0, Math.floor(partialState.cycles))
        : 0,
    responses: sanitizeResponsesForRecipes(recipes, partialState.responses),
  };
}

export function restoreDeckState(
  parsedState: unknown,
  recipesByDeck: Record<RecipeDeckId, Pick<Recipe, "id">[]>,
): DeckState {
  if (!parsedState || typeof parsedState !== "object") {
    return createEmptyDeckState();
  }

  const maybeState = parsedState as {
    decks?: Partial<Record<RecipeDeckId, unknown>>;
  } & Partial<DeckRunState>;

  if (maybeState.decks && typeof maybeState.decks === "object") {
    return {
      healthy: sanitizeDeckRunState(maybeState.decks.healthy, recipesByDeck.healthy),
      sweets: sanitizeDeckRunState(maybeState.decks.sweets, recipesByDeck.sweets),
    };
  }

  return {
    healthy: sanitizeDeckRunState(maybeState, recipesByDeck.healthy),
    sweets: createEmptyDeckRunState(),
  };
}
