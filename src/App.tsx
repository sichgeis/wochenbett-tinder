import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import { Heart, RotateCcw, Share2, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import recipesJson from "./data/recipes.json";
import {
  advanceCursor,
  countResponses,
  createExportText,
  normalizeCursor,
  recordDecision,
} from "./lib/swipe";
import type { Recipe, SwipeDecision, SwipeResponses } from "./types";

const recipes = recipesJson as Recipe[];
const storageKey = "wochenbett-tinder-state-v1";

const cardVariants: Variants = {
  enter: { opacity: 0, y: 18, scale: 0.96 },
  center: { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 },
  exit: (decision: SwipeDecision | null) => ({
    opacity: 0,
    x: decision === "like" ? 360 : decision === "nope" ? -360 : 0,
    y: decision === "superlike" ? -420 : 40,
    rotate: decision === "like" ? 18 : decision === "nope" ? -18 : 0,
    scale: 0.92,
  }),
};

interface PersistedState {
  cursor: number;
  cycles: number;
  responses: SwipeResponses;
}

const emptyState: PersistedState = {
  cursor: 0,
  cycles: 0,
  responses: {},
};

function readPersistedState(): PersistedState {
  try {
    const rawState = window.localStorage.getItem(storageKey);

    if (!rawState) {
      return emptyState;
    }

    const parsed = JSON.parse(rawState) as Partial<PersistedState>;

    return {
      cursor: normalizeCursor(parsed.cursor, recipes.length),
      cycles:
        typeof parsed.cycles === "number" && Number.isFinite(parsed.cycles)
          ? Math.max(0, Math.floor(parsed.cycles))
          : 0,
      responses: sanitizeResponses(parsed.responses),
    };
  } catch {
    return emptyState;
  }
}

function sanitizeResponses(responses: unknown): SwipeResponses {
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

function getImageUrl(recipe: Recipe): string {
  return `${import.meta.env.BASE_URL}recipes/${recipe.image}`;
}

function createDownloadFallback(text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "wochenbett-tinder-ergebnis.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [state, setState] = useState<PersistedState>(() => readPersistedState());
  const [lastDecision, setLastDecision] = useState<SwipeDecision | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const activeRecipe = recipes[state.cursor] ?? recipes[0];
  const counts = useMemo(
    () => countResponses(recipes, state.responses),
    [state.responses],
  );
  const progressText = `${state.cursor + 1}/${recipes.length}`;

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const submitDecision = useCallback(
    (decision: SwipeDecision) => {
      if (!activeRecipe) {
        return;
      }

      setLastDecision(decision);
      setState((currentState) => {
        const { nextIndex, completedCycle } = advanceCursor(
          currentState.cursor,
          recipes.length,
        );

        if (completedCycle) {
          setToast("Alle Gerichte gesehen. Der Durchlauf startet von vorne.");
        }

        return {
          cursor: nextIndex,
          cycles: currentState.cycles + (completedCycle ? 1 : 0),
          responses: recordDecision(
            currentState.responses,
            activeRecipe.id,
            decision,
          ),
        };
      });
    },
    [activeRecipe],
  );

  const onDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const horizontalIntent = Math.abs(info.offset.x) > Math.abs(info.offset.y);

      if (horizontalIntent && (info.offset.x > 110 || info.velocity.x > 650)) {
        submitDecision("like");
        return;
      }

      if (horizontalIntent && (info.offset.x < -110 || info.velocity.x < -650)) {
        submitDecision("nope");
        return;
      }

      if (!horizontalIntent && (info.offset.y < -110 || info.velocity.y < -650)) {
        submitDecision("superlike");
      }
    },
    [submitDecision],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "ArrowLeft") {
        submitDecision("nope");
      }

      if (event.key === "ArrowRight") {
        submitDecision("like");
      }

      if (event.key === "ArrowUp") {
        submitDecision("superlike");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submitDecision]);

  const shareResults = useCallback(async () => {
    const text = createExportText(recipes, state.responses);

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Wochenbett Tinder Ergebnis",
          text,
        });
        return;
      }

      await navigator.clipboard.writeText(text);
      setToast("Ergebnis wurde kopiert.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        setToast("Ergebnis wurde kopiert.");
      } catch {
        createDownloadFallback(text);
        setToast("Ergebnis wurde gespeichert.");
      }
    }
  }, [state.responses]);

  const resetResponses = useCallback(() => {
    if (counts.answered > 0 && !window.confirm("Alle Antworten löschen?")) {
      return;
    }

    setLastDecision(null);
    setState(emptyState);
    setToast("Antworten wurden gelöscht.");
  }, [counts.answered]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <p className="eyebrow">Wochenbett</p>
          <h1>Tinder</h1>
        </div>

        <div className="top-actions">
          <span className="progress-pill" aria-label="Fortschritt">
            {progressText}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={shareResults}
            aria-label="Ergebnis teilen"
            title="Ergebnis teilen"
          >
            <Share2 aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={resetResponses}
            aria-label="Antworten zurücksetzen"
            title="Antworten zurücksetzen"
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="deck-area" aria-live="polite">
        <AnimatePresence mode="popLayout" custom={lastDecision}>
          <motion.article
            key={`${activeRecipe.id}-${state.cursor}-${state.cycles}`}
            className="recipe-card"
            custom={lastDecision}
            drag
            dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
            dragElastic={0.2}
            onDragEnd={onDragEnd}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <img
              className="recipe-image"
              src={getImageUrl(activeRecipe)}
              alt={activeRecipe.name}
              draggable="false"
            />

            <div className="card-gradient card-gradient-top" />
            <div className="card-gradient card-gradient-bottom" />

            <div className="card-header">
              <span className="category-chip">{activeRecipe.category}</span>
              <h2>{activeRecipe.name}</h2>
            </div>

            <div className="card-copy">
              <p>{activeRecipe.description}</p>
            </div>
          </motion.article>
        </AnimatePresence>
      </section>

      <footer className="control-rail">
        <button
          className="action-button action-nope"
          type="button"
          onClick={() => submitDecision("nope")}
          aria-label="Nein"
          title="Nein"
        >
          <X aria-hidden="true" />
        </button>
        <button
          className="action-button action-super"
          type="button"
          onClick={() => submitDecision("superlike")}
          aria-label="Superlike"
          title="Superlike"
        >
          <Star aria-hidden="true" />
        </button>
        <button
          className="action-button action-like"
          type="button"
          onClick={() => submitDecision("like")}
          aria-label="Ja"
          title="Ja"
        >
          <Heart aria-hidden="true" />
        </button>
      </footer>

      <div className="summary-strip" aria-label="Zwischenstand">
        <span>{counts.superlike} Superlikes</span>
        <span>{counts.like} Ja</span>
        <span>{counts.nope} Nein</span>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
