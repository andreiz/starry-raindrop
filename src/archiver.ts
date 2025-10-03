import fs from "fs/promises";
import path from "path";
import { Octokit } from "octokit";
import { execSync } from "child_process";

export interface StarredRepo {
  full_name: string;
  html_url: string;
  starred_at: string;
  description: string | null;
  language: string | null;
  topics: string[];
}

const DATA_DIR = "data";
const ARCHIVE_FILE = path.join(DATA_DIR, "starred-repos.json");

/**
 * Load existing starred repos from the archive file
 */
async function loadExistingStars(): Promise<StarredRepo[]> {
  try {
    const content = await fs.readFile(ARCHIVE_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Save starred repos to the archive file
 */
async function saveStars(stars: StarredRepo[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ARCHIVE_FILE, JSON.stringify(stars, null, 2) + "\n");
}

/**
 * Fetch all starred repos from GitHub with their starred_at timestamps
 */
export async function fetchStarsFromGitHub(
  octokit: Octokit
): Promise<StarredRepo[]> {
  const stars = await octokit.paginate(
    octokit.rest.activity.listReposStarredByAuthenticatedUser,
    {
      per_page: 100,
      headers: {
        accept: "application/vnd.github.v3.star+json",
      },
    }
  );

  // Type assertion for the custom header response
  type ActualStar = { starred_at: string; repo: (typeof stars)[number] };

  return (stars as unknown as ActualStar[]).map((star) => ({
    full_name: star.repo.full_name,
    html_url: star.repo.html_url,
    starred_at: star.starred_at,
    description: star.repo.description,
    language: star.repo.language,
    topics: star.repo.topics || [],
  }));
}

/**
 * Archive starred repos to local JSON file and commit changes
 * Returns the current stars from GitHub and unstarred repos for cleanup
 */
export async function archiveStars(octokit: Octokit): Promise<{
  currentStars: StarredRepo[];
  unstarredRepos: StarredRepo[];
}> {
  console.log(new Date(), "Archiving starred repos...");

  // Load existing stars
  const existingStars = await loadExistingStars();
  const existingUrls = new Set(existingStars.map((s) => s.html_url));

  // Fetch current stars from GitHub
  const currentStars = await fetchStarsFromGitHub(octokit);
  const currentUrls = new Set(currentStars.map((s) => s.html_url));

  // Identify new stars
  const newStars = currentStars.filter((s) => !existingUrls.has(s.html_url));

  // Identify unstarred repos (exist in archive but not in current stars)
  const unstarredRepos = existingStars.filter((s) => !currentUrls.has(s.html_url));

  if (newStars.length === 0 && unstarredRepos.length === 0) {
    console.log(new Date(), "No new starred repos or unstarred repos to process");
    return { currentStars, unstarredRepos: [] };
  }

  if (newStars.length > 0) {
    console.log(new Date(), `Found ${newStars.length} new starred repos`);
  }

  if (unstarredRepos.length > 0) {
    console.log(new Date(), `Found ${unstarredRepos.length} unstarred repos to remove`);
  }

  // Sort by starred_at (descending - most recent first)
  const allStars = currentStars.sort(
    (a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime()
  );

  // Save to file
  await saveStars(allStars);
  console.log(new Date(), `Saved ${allStars.length} total stars to ${ARCHIVE_FILE}`);

  // Commit changes
  try {
    const today = new Date().toISOString().split("T")[0];
    const parts = [];
    if (newStars.length > 0) {
      parts.push(`+${newStars.length} starred`);
    }
    if (unstarredRepos.length > 0) {
      parts.push(`-${unstarredRepos.length} unstarred`);
    }
    const commitMessage = `Archive: ${parts.join(", ")} (${today})`;

    // Configure git user identity if not already set
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { stdio: "inherit" });
    execSync('git config user.name "github-actions[bot]"', { stdio: "inherit" });

    execSync(`git add ${ARCHIVE_FILE}`, { stdio: "inherit" });
    execSync(`git commit -m "${commitMessage}"`, { stdio: "inherit" });
    execSync('git push', { stdio: "inherit" });
    console.log(new Date(), `Committed and pushed changes: ${commitMessage}`);
  } catch (error: any) {
    console.error(new Date(), `Failed to commit changes: ${error.message}`);
  }

  return { currentStars, unstarredRepos };
}
