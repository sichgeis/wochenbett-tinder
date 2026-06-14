export type SwipeDecision = "nope" | "like" | "superlike";

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
