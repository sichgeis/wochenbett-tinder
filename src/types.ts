export type SwipeDecision = "nope" | "like" | "superlike";
export type RecipeDeckId = "healthy" | "sweets";

export interface Recipe {
  id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  imageSearch?: string;
  imageSourceUrl?: string;
}

export type SwipeResponses = Partial<Record<string, SwipeDecision>>;

export interface DeckRunState {
  cursor: number;
  cycles: number;
  responses: SwipeResponses;
}

export type DeckState = Record<RecipeDeckId, DeckRunState>;
