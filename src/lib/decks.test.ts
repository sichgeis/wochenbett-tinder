import { describe, expect, it } from "vitest";
import type { Recipe } from "../types";
import {
  restoreDeckState,
  sanitizeDeckRunState,
  sanitizeResponsesForRecipes,
} from "./decks";
import { countResponses, createExportText } from "./swipe";

const healthyRecipes: Recipe[] = [
  {
    id: "suppe",
    name: "Suppe",
    description: "Warm und mild.",
    category: "Suppe",
    image: "suppe.jpg",
  },
  {
    id: "lasagne",
    name: "Lasagne",
    description: "Gut einfrierbar.",
    category: "Auflauf",
    image: "lasagne.jpg",
  },
];

const sweetRecipes: Recipe[] = [
  {
    id: "brownie",
    name: "Brownie",
    description: "Schokoladig.",
    category: "Gebäck",
    image: "brownie.jpg",
  },
  {
    id: "milchreis",
    name: "Milchreis",
    description: "Cremig.",
    category: "Süßspeise",
    image: "milchreis.jpg",
  },
];

const recipesByDeck = {
  healthy: healthyRecipes,
  sweets: sweetRecipes,
};

describe("deck state", () => {
  it("migrates the old single-deck state into the healthy deck", () => {
    const restored = restoreDeckState(
      {
        cursor: 1,
        cycles: 2,
        responses: {
          suppe: "like",
          brownie: "superlike",
        },
      },
      recipesByDeck,
    );

    expect(restored.healthy).toEqual({
      cursor: 1,
      cycles: 2,
      responses: {
        suppe: "like",
      },
    });
    expect(restored.sweets).toEqual({
      cursor: 0,
      cycles: 0,
      responses: {},
    });
  });

  it("sanitizes unknown recipe ids and invalid decisions per deck", () => {
    expect(
      sanitizeResponsesForRecipes(sweetRecipes, {
        milchreis: "superlike",
        lasagne: "like",
        brownie: "maybe",
      }),
    ).toEqual({
      milchreis: "superlike",
    });
  });

  it("normalizes cursors against the selected deck length", () => {
    expect(sanitizeDeckRunState({ cursor: 5, cycles: 1 }, sweetRecipes)).toMatchObject({
      cursor: 1,
      cycles: 1,
    });
  });

  it("counts and exports only recipes from the active deck", () => {
    const responses = {
      suppe: "like",
      brownie: "superlike",
    } as const;

    expect(countResponses(sweetRecipes, responses)).toEqual({
      answered: 1,
      nope: 0,
      like: 0,
      superlike: 1,
    });
    expect(createExportText(sweetRecipes, responses, "Genuss Ergebnis")).toContain(
      "Bewertet: 1/2",
    );
    expect(createExportText(sweetRecipes, responses, "Genuss Ergebnis")).not.toContain(
      "Suppe",
    );
  });
});
