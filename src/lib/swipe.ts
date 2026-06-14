import type { Recipe, SwipeDecision, SwipeResponses } from "../types";

export interface CursorAdvance {
  nextIndex: number;
  completedCycle: boolean;
}

export interface ResponseCounts {
  answered: number;
  nope: number;
  like: number;
  superlike: number;
}

const decisionOrder: SwipeDecision[] = ["superlike", "like", "nope"];

const decisionHeadings: Record<SwipeDecision, string> = {
  superlike: "Superlikes",
  like: "Ja, gerne",
  nope: "Nicht so meins",
};

export function recordDecision(
  responses: SwipeResponses,
  recipeId: string,
  decision: SwipeDecision,
): SwipeResponses {
  return {
    ...responses,
    [recipeId]: decision,
  };
}

export function advanceCursor(currentIndex: number, recipeCount: number): CursorAdvance {
  if (recipeCount < 1) {
    return { nextIndex: 0, completedCycle: false };
  }

  const nextIndex = (currentIndex + 1) % recipeCount;

  return {
    nextIndex,
    completedCycle: nextIndex === 0,
  };
}

export function normalizeCursor(index: unknown, recipeCount: number): number {
  if (recipeCount < 1 || typeof index !== "number" || !Number.isFinite(index)) {
    return 0;
  }

  return Math.max(0, Math.floor(index)) % recipeCount;
}

export function countResponses(
  recipes: Pick<Recipe, "id">[],
  responses: SwipeResponses,
): ResponseCounts {
  const counts: ResponseCounts = {
    answered: 0,
    nope: 0,
    like: 0,
    superlike: 0,
  };

  for (const recipe of recipes) {
    const decision = responses[recipe.id];

    if (!decision) {
      continue;
    }

    counts.answered += 1;
    counts[decision] += 1;
  }

  return counts;
}

export function createExportText(recipes: Recipe[], responses: SwipeResponses): string {
  const counts = countResponses(recipes, responses);
  const lines = [
    "Wochenbett Tinder Ergebnis",
    `Bewertet: ${counts.answered}/${recipes.length}`,
    `Superlikes: ${counts.superlike}`,
    `Ja, gerne: ${counts.like}`,
    `Nicht so meins: ${counts.nope}`,
    "",
  ];

  for (const decision of decisionOrder) {
    const selectedRecipes = recipes.filter((recipe) => responses[recipe.id] === decision);
    lines.push(`${decisionHeadings[decision]} (${selectedRecipes.length})`);

    if (selectedRecipes.length === 0) {
      lines.push("- keine");
    } else {
      for (const recipe of selectedRecipes) {
        lines.push(`- ${recipe.name} (${recipe.category})`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}
