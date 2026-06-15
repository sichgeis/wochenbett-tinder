import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import {
  ArrowLeft,
  CakeSlice,
  Heart,
  RotateCcw,
  Salad,
  Share2,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import healthyRecipesJson from "./data/recipes.json";
import sweetRecipesJson from "./data/sweet-recipes.json";
import {
  createEmptyDeckRunState,
  restoreDeckState,
} from "./lib/decks";
import {
  advanceCursor,
  countResponses,
  createExportText,
  recordDecision,
} from "./lib/swipe";
import type {
  DeckRunState,
  DeckState,
  Recipe,
  RecipeDeckId,
  SwipeDecision,
} from "./types";

const healthyRecipes = healthyRecipesJson as Recipe[];
const sweetRecipes = sweetRecipesJson as Recipe[];
const storageKey = "wochenbett-tinder-state-v1";

const recipeDecks: Record<
  RecipeDeckId,
  {
    id: RecipeDeckId;
    label: string;
    shortLabel: string;
    description: string;
    recipes: Recipe[];
    Icon: LucideIcon;
  }
> = {
  healthy: {
    id: "healthy",
    label: "Gesunde Wochenbett-Prep",
    shortLabel: "Wochenbett-Prep",
    description: "Warme, milde Mahlzeiten und Frühstücke für den Vorrat.",
    recipes: healthyRecipes,
    Icon: Salad,
  },
  sweets: {
    id: "sweets",
    label: "Schweinezeug und Genuss",
    shortLabel: "Genuss",
    description: "Süßspeisen, Desserts und kleine Belohnungsportionen.",
    recipes: sweetRecipes,
    Icon: CakeSlice,
  },
};

const recipesByDeck = {
  healthy: healthyRecipes,
  sweets: sweetRecipes,
};

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

const decisionFeedback: Record<
  SwipeDecision,
  { label: string; Icon: LucideIcon }
> = {
  nope: { label: "Nein", Icon: X },
  like: { label: "Ja", Icon: Heart },
  superlike: { label: "Superlike", Icon: Star },
};

function readPersistedState(): DeckState {
  try {
    const rawState = window.localStorage.getItem(storageKey);

    if (!rawState) {
      return restoreDeckState(null, recipesByDeck);
    }

    return restoreDeckState(JSON.parse(rawState), recipesByDeck);
  } catch {
    return restoreDeckState(null, recipesByDeck);
  }
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
  const [deckState, setDeckState] = useState<DeckState>(() => readPersistedState());
  const [selectedDeckId, setSelectedDeckId] = useState<RecipeDeckId | null>(null);
  const [lastDecision, setLastDecision] = useState<SwipeDecision | null>(null);
  const [feedbackDecision, setFeedbackDecision] = useState<SwipeDecision | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const activeDeck = selectedDeckId ? recipeDecks[selectedDeckId] : null;
  const activeDeckState = selectedDeckId
    ? deckState[selectedDeckId]
    : createEmptyDeckRunState();
  const activeRecipe = activeDeck?.recipes[activeDeckState.cursor] ?? activeDeck?.recipes[0];
  const feedback = feedbackDecision ? decisionFeedback[feedbackDecision] : null;
  const FeedbackIcon = feedback?.Icon;
  const counts = useMemo(
    () =>
      activeDeck
        ? countResponses(activeDeck.recipes, activeDeckState.responses)
        : { answered: 0, nope: 0, like: 0, superlike: 0 },
    [activeDeck, activeDeckState.responses],
  );
  const progressText = activeDeck
    ? `${activeDeckState.cursor + 1}/${activeDeck.recipes.length}`
    : "Auswahl";

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ version: 2, decks: deckState }),
    );
  }, [deckState]);

  useEffect(() => {
    if (!feedbackDecision) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFeedbackDecision(null), 560);
    return () => window.clearTimeout(timeoutId);
  }, [feedbackDecision]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const selectDeck = useCallback((deckId: RecipeDeckId, decision: SwipeDecision) => {
    setFeedbackDecision(null);
    setLastDecision(decision);
    setSelectedDeckId(deckId);
    setToast(null);
  }, []);

  const returnToDeckChoice = useCallback(() => {
    setFeedbackDecision(null);
    setLastDecision(null);
    setSelectedDeckId(null);
  }, []);

  const submitDecision = useCallback(
    (decision: SwipeDecision) => {
      if (!selectedDeckId || !activeDeck || !activeRecipe) {
        return;
      }

      setFeedbackDecision(decision);
      setLastDecision(decision);
      setDeckState((currentDeckState) => {
        const currentRunState = currentDeckState[selectedDeckId];
        const { nextIndex, completedCycle } = advanceCursor(
          currentRunState.cursor,
          activeDeck.recipes.length,
        );

        if (completedCycle) {
          setToast("Alle Gerichte gesehen. Der Durchlauf startet von vorne.");
        }

        const nextRunState: DeckRunState = {
          cursor: nextIndex,
          cycles: currentRunState.cycles + (completedCycle ? 1 : 0),
          responses: recordDecision(
            currentRunState.responses,
            activeRecipe.id,
            decision,
          ),
        };

        return {
          ...currentDeckState,
          [selectedDeckId]: nextRunState,
        };
      });
    },
    [activeDeck, activeRecipe, selectedDeckId],
  );

  const onRecipeDragEnd = useCallback(
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

  const onDeckChoiceDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const horizontalIntent = Math.abs(info.offset.x) > Math.abs(info.offset.y);

      if (horizontalIntent && (info.offset.x > 110 || info.velocity.x > 650)) {
        selectDeck("healthy", "like");
      }

      if (horizontalIntent && (info.offset.x < -110 || info.velocity.x < -650)) {
        selectDeck("sweets", "nope");
      }
    },
    [selectDeck],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (!selectedDeckId) {
        if (event.key === "ArrowLeft") {
          selectDeck("sweets", "nope");
        }

        if (event.key === "ArrowRight") {
          selectDeck("healthy", "like");
        }

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
  }, [selectDeck, selectedDeckId, submitDecision]);

  const shareResults = useCallback(async () => {
    if (!activeDeck) {
      return;
    }

    const text = createExportText(
      activeDeck.recipes,
      activeDeckState.responses,
      `${activeDeck.label} Ergebnis`,
    );

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
  }, [activeDeck, activeDeckState.responses]);

  const resetResponses = useCallback(() => {
    if (!selectedDeckId || !activeDeck) {
      return;
    }

    if (
      counts.answered > 0 &&
      !window.confirm(`Alle Antworten für "${activeDeck.label}" löschen?`)
    ) {
      return;
    }

    setLastDecision(null);
    setFeedbackDecision(null);
    setDeckState((currentDeckState) => ({
      ...currentDeckState,
      [selectedDeckId]: createEmptyDeckRunState(),
    }));
    setToast("Antworten wurden gelöscht.");
  }, [activeDeck, counts.answered, selectedDeckId]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <p className="eyebrow">Wochenbett</p>
          <h1>Tinder</h1>
        </div>

        <div className="top-actions">
          {activeDeck && (
            <button
              className="deck-switch-button"
              type="button"
              onClick={returnToDeckChoice}
              aria-label="Kategorie wechseln"
              title="Kategorie wechseln"
            >
              <ArrowLeft aria-hidden="true" />
              <span>{activeDeck.shortLabel}</span>
            </button>
          )}
          <span className="progress-pill" aria-label="Fortschritt">
            {progressText}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={shareResults}
            disabled={!activeDeck}
            aria-label="Ergebnis teilen"
            title="Ergebnis teilen"
          >
            <Share2 aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={resetResponses}
            disabled={!activeDeck}
            aria-label="Antworten zurücksetzen"
            title="Antworten zurücksetzen"
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="deck-area" aria-live="polite">
        <AnimatePresence mode="popLayout" custom={lastDecision}>
          {!activeDeck && (
            <motion.article
              key="deck-choice"
              className="recipe-card deck-choice-card"
              custom={lastDecision}
              drag
              dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
              dragElastic={0.2}
              onDragEnd={onDeckChoiceDragEnd}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <div className="deck-choice-background" />
              <div className="deck-choice-content">
                <span className="category-chip">Was wird getindert?</span>
                <h2>Wähle deinen Stapel</h2>
                <div className="deck-choice-options">
                  <button
                    className="deck-choice-option deck-choice-option-sweets"
                    type="button"
                    onClick={() => selectDeck("sweets", "nope")}
                  >
                    <CakeSlice aria-hidden="true" />
                    <span>{recipeDecks.sweets.label}</span>
                  </button>
                  <button
                    className="deck-choice-option deck-choice-option-healthy"
                    type="button"
                    onClick={() => selectDeck("healthy", "like")}
                  >
                    <Salad aria-hidden="true" />
                    <span>{recipeDecks.healthy.label}</span>
                  </button>
                </div>
              </div>
            </motion.article>
          )}

          {activeDeck && activeRecipe && (
            <motion.article
              key={`${activeDeck.id}-${activeRecipe.id}-${activeDeckState.cursor}-${activeDeckState.cycles}`}
              className="recipe-card"
              custom={lastDecision}
              drag
              dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
              dragElastic={0.2}
              onDragEnd={onRecipeDragEnd}
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
          )}
        </AnimatePresence>

        <AnimatePresence>
          {feedbackDecision && feedback && FeedbackIcon && (
            <motion.div
              key={feedbackDecision}
              className={`decision-feedback decision-feedback-${feedbackDecision}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              aria-hidden="true"
            >
              <div className="decision-feedback-badge">
                <FeedbackIcon aria-hidden="true" />
                <span>{feedback.label}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="control-rail">
        {activeDeck ? (
          <>
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
          </>
        ) : (
          <>
            <button
              className="action-button action-nope"
              type="button"
              onClick={() => selectDeck("sweets", "nope")}
              aria-label={recipeDecks.sweets.label}
              title={recipeDecks.sweets.label}
            >
              <CakeSlice aria-hidden="true" />
            </button>
            <button
              className="action-button action-like"
              type="button"
              onClick={() => selectDeck("healthy", "like")}
              aria-label={recipeDecks.healthy.label}
              title={recipeDecks.healthy.label}
            >
              <Salad aria-hidden="true" />
            </button>
          </>
        )}
      </footer>

      <div className="summary-strip" aria-label="Zwischenstand">
        {activeDeck ? (
          <>
            <span>{counts.superlike} Superlikes</span>
            <span>{counts.like} Ja</span>
            <span>{counts.nope} Nein</span>
          </>
        ) : (
          <>
            <span>{healthyRecipes.length} Prep-Ideen</span>
            <span>{sweetRecipes.length} Genuss-Ideen</span>
          </>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
