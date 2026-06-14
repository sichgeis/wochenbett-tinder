import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recipesPath = path.join(rootDir, "src", "data", "recipes.json");
const outputDir = path.join(rootDir, "public", "recipes");
const creditsPath = path.join(outputDir, "credits.json");
const userAgent = "wochenbett-tinder/0.1 (local static app image preparation)";
const execFileAsync = promisify(execFile);
const rasterMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const fileTitleOverrides = {
  "herzhafte-eiermuffins-mild": "File:FoodOmelete.jpg",
  "kuerbis-lasagne": "File:Vegetable Lasagna 10-07 to 22 439.jpg",
  "linsen-dal-mild-klein-testen": "File:Dal tadka with hot chilli.jpg",
  "mediterraner-rinderschmortopf": "File:Claypot beef stew with potatoes and mushrooms.jpg",
  "mildes-bohnen-chili-klein-testen": "File:Chili con carne (4431800858).jpg",
  "smoothie-packs-beere-kefir": "File:Healthy Blueberry Smoothie.jpg",
};
const searchStopWords = new Set([
  "and",
  "bake",
  "casserole",
  "cheese",
  "classic",
  "cream",
  "creamy",
  "food",
  "mild",
  "sauce",
  "small",
  "test",
  "with",
]);

const allRecipes = JSON.parse(await readFile(recipesPath, "utf8"));
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const selectedRecipeIds = onlyArgument
  ? new Set(onlyArgument.replace("--only=", "").split(",").map((id) => id.trim()).filter(Boolean))
  : null;
const recipes = selectedRecipeIds
  ? allRecipes.filter((recipe) => selectedRecipeIds.has(recipe.id))
  : allRecipes;

if (selectedRecipeIds && recipes.length !== selectedRecipeIds.size) {
  const foundIds = new Set(recipes.map((recipe) => recipe.id));
  const missingIds = [...selectedRecipeIds].filter((recipeId) => !foundIds.has(recipeId));
  throw new Error(`Unknown recipe id(s): ${missingIds.join(", ")}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function textFromMetadata(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceUrlFromTitle(title) {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_")).replaceAll("%3A", ":")}`;
}

async function queryCommons(searchTerm) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: searchTerm,
    gsrnamespace: "6",
    gsrlimit: "25",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1100",
    format: "json",
    formatversion: "2",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: {
        "User-Agent": userAgent,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.query?.pages ?? [];
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 2500 * (attempt + 1);
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`Commons search failed for "${searchTerm}": ${response.status}`);
  }

  return [];
}

async function queryCommonsTitle(title) {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1100",
    format: "json",
    formatversion: "2",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: {
        "User-Agent": userAgent,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const page = data.query?.pages?.[0];
      const info = page?.imageinfo?.[0];

      if (!page || !info || !rasterMimeTypes.has(info.mime)) {
        throw new Error(`Override is not a supported raster image: ${title}`);
      }

      return { page, info };
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 2500 * (attempt + 1);
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`Commons title lookup failed for "${title}": ${response.status}`);
  }

  throw new Error(`Commons title lookup failed for "${title}"`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function deriveSearchTerms(recipe) {
  const primary = recipe.imageSearch ?? "";
  const words = primary.split(/\s+/).filter(Boolean);
  const foodType = words.find((word) =>
    [
      "bake",
      "bolognese",
      "cannelloni",
      "casserole",
      "chili",
      "curry",
      "dal",
      "fricassee",
      "gnocchi",
      "gratin",
      "lasagna",
      "meatballs",
      "moussaka",
      "muffins",
      "oats",
      "pasta",
      "pie",
      "porridge",
      "quark",
      "quiche",
      "rice",
      "sauce",
      "smoothie",
      "soup",
      "stew",
      "wrap",
    ].includes(word.toLowerCase()),
  );

  const firstIngredient = words.find((word) => word !== foodType);

  return unique([
    primary,
    `${primary} food`,
    foodType && firstIngredient ? `${firstIngredient} ${foodType}` : "",
    words.slice(0, 2).join(" "),
    words.slice(-2).join(" "),
    recipe.name,
  ]);
}

function significantWords(searchTerm) {
  return searchTerm
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !searchStopWords.has(word));
}

function scoreCandidate(candidate, searchTerm) {
  const title = candidate.page.title.toLowerCase();
  const words = significantWords(searchTerm);
  let score = candidate.info.mime === "image/jpeg" ? 0.5 : 0;

  for (const word of words) {
    if (title.includes(word)) {
      score += 2;
    }
  }

  if (title.includes(searchTerm.toLowerCase())) {
    score += 5;
  }

  return score;
}

function getRasterCandidates(pages) {
  return pages
    .map((page) => ({
      page,
      info: page.imageinfo?.[0],
    }))
    .filter(({ info }) => info && rasterMimeTypes.has(info.mime) && (info.thumburl || info.url));
}

function selectImageCandidate(pages, searchTerm) {
  const candidates = getRasterCandidates(pages);
  const scoredCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, searchTerm),
    }))
    .sort((left, right) => right.score - left.score);

  return scoredCandidates.find((candidate) => candidate.score >= 2);
}

function selectFallbackCandidate(pages) {
  const candidates = pages
    .map((page) => ({
      page,
      info: page.imageinfo?.[0],
    }))
    .filter(({ info }) => info && rasterMimeTypes.has(info.mime) && (info.thumburl || info.url));

  return (
    candidates.find(({ info }) => info.mime === "image/jpeg") ??
    candidates[0]
  );
}

async function findRecipeImage(recipe) {
  if (fileTitleOverrides[recipe.id]) {
    return queryCommonsTitle(fileTitleOverrides[recipe.id]);
  }

  const searchTerms = deriveSearchTerms(recipe);
  let fallbackCandidate = null;

  for (const searchTerm of searchTerms) {
    const pages = await queryCommons(searchTerm);
    const candidate = selectImageCandidate(pages, searchTerm);
    fallbackCandidate ??= selectFallbackCandidate(pages);

    if (candidate) {
      return candidate;
    }

    await sleep(180);
  }

  if (fallbackCandidate) {
    return fallbackCandidate;
  }

  throw new Error(`No raster image found for "${recipe.name}"`);
}

async function downloadImage(url, filePath, mime) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`Image download failed for ${url}: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (mime === "image/jpeg") {
    await writeFile(filePath, bytes);
    return;
  }

  const tempPath = `${filePath}.source`;
  await writeFile(tempPath, bytes);

  try {
    await execFileAsync("sips", ["-s", "format", "jpeg", tempPath, "--out", filePath]);
  } finally {
    await rm(tempPath, { force: true });
  }
}

await mkdir(outputDir, { recursive: true });

let existingCredits = [];

if (selectedRecipeIds) {
  try {
    existingCredits = JSON.parse(await readFile(creditsPath, "utf8"));
  } catch {
    existingCredits = [];
  }
}

const creditByRecipeId = new Map(
  existingCredits.map((credit) => [credit.recipeId, credit]),
);

for (const [index, recipe] of recipes.entries()) {
  const { page, info } = await findRecipeImage(recipe);
  const imageUrl = info.thumburl || info.url;
  const filePath = path.join(outputDir, recipe.image);
  const metadata = info.extmetadata ?? {};

  await downloadImage(imageUrl, filePath, info.mime);

  creditByRecipeId.set(recipe.id, {
    recipeId: recipe.id,
    recipeName: recipe.name,
    file: recipe.image,
    sourceTitle: page.title,
    sourceUrl: sourceUrlFromTitle(page.title),
    author: textFromMetadata(metadata.Artist?.value),
    credit: textFromMetadata(metadata.Credit?.value),
    license: textFromMetadata(metadata.LicenseShortName?.value),
  });

  console.log(`${index + 1}/${recipes.length} ${recipe.image} <- ${page.title}`);
  await sleep(850);
}

const orderedCredits = allRecipes
  .map((recipe) => creditByRecipeId.get(recipe.id))
  .filter(Boolean);

await writeFile(creditsPath, `${JSON.stringify(orderedCredits, null, 2)}\n`);
