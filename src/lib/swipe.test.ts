import { describe, expect, it } from "vitest";
import type { Recipe } from "../types";
import {
  advanceCursor,
  countResponses,
  createExportText,
  recordDecision,
} from "./swipe";

const recipes: Recipe[] = [
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
  {
    id: "porridge",
    name: "Porridge",
    description: "Schnelles Frühstück.",
    category: "Frühstück",
    image: "porridge.jpg",
  },
];

describe("swipe logic", () => {
  it("records a swipe decision", () => {
    const responses = recordDecision({}, "suppe", "like");

    expect(responses).toEqual({ suppe: "like" });
  });

  it("overwrites an earlier decision for the same recipe", () => {
    const liked = recordDecision({}, "suppe", "like");
    const changed = recordDecision(liked, "suppe", "superlike");

    expect(changed).toEqual({ suppe: "superlike" });
  });

  it("groups export text by superlikes, likes, and nopes", () => {
    const responses = {
      suppe: "superlike",
      lasagne: "like",
      porridge: "nope",
    } as const;

    expect(createExportText(recipes, responses)).toContain("Superlikes (1)\n- Suppe (Suppe)");
    expect(createExportText(recipes, responses)).toContain("Ja, gerne (1)\n- Lasagne (Auflauf)");
    expect(createExportText(recipes, responses)).toContain(
      "Nicht so meins (1)\n- Porridge (Frühstück)",
    );
  });

  it("counts decisions without counting unknown recipe IDs", () => {
    expect(countResponses(recipes, { suppe: "like", alt: "nope" })).toEqual({
      answered: 1,
      nope: 0,
      like: 1,
      superlike: 0,
    });
  });

  it("reports completion after the last recipe in the data source", () => {
    expect(advanceCursor(0, recipes.length)).toEqual({
      nextIndex: 1,
      completedCycle: false,
    });
    expect(advanceCursor(2, recipes.length)).toEqual({
      nextIndex: 0,
      completedCycle: true,
    });
  });
});
