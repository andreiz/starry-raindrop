import axios from "axios";
import _ from "lodash";
import { Octokit } from "octokit";
import { archiveStars } from "./archiver.js";

const raindropAxios = axios.create({
  baseURL: "https://api.raindrop.io/rest/v1",
  headers: {
    Authorization: `Bearer ${process.env.RAINDROP_TOKEN}`,
    "Content-Type": "application/json",
  },
});

export const main = async () => {
  const octokit = new Octokit({ auth: process.env.GH_TOKEN });

  // Archive starred repos to local JSON file and get current stars
  console.log(new Date(), "Fetching and archiving starred repos...");
  const { currentStars: starredRepos, unstarredRepos } = await archiveStars(octokit);
  console.log(new Date(), `Found ${starredRepos.length} starred repos!`);

  // Convert to the format expected by the original code
  const stars = starredRepos.map((repo) => ({
    starred_at: repo.starred_at,
    repo: {
      full_name: repo.full_name,
      html_url: repo.html_url,
      description: repo.description,
      language: repo.language,
      topics: repo.topics,
    },
  }));

  const newRaindrops = stars.map((star) => {
    return {
      collectionId: process.env.RAINDROP_COLLECTION_ID,
      title: star.repo.full_name,
      link: star.repo.html_url,
      tags: _([
        "github"
      ])
        .compact()
        .map((i) => i.toLowerCase())
        .value(),
      note: `topics: ${[star.repo.language || undefined, ...(star.repo.topics || [])].join(", ")}`,
      created: star.starred_at,
      excerpt: star.repo.description,
    };
  });
  const chunks = _.chunk(newRaindrops, 100);

  console.log(new Date(), `Looping through chunks of 100 repos...`);
  for (const chunk of chunks) {
    const existingUrlsRes = await raindropAxios.post("/import/url/exists", {
      urls: chunk.map((s) => s.link),
    });
    const existingUrls = existingUrlsRes.data;
    const toImport = chunk.filter((r) => {
      return existingUrls.duplicates.every((d: any) => d.link !== r.link);
    });
    if (toImport.length > 0) {
      await raindropAxios.post("/raindrops", {
        items: toImport,
      });
      console.log(new Date(), `Added ${toImport.length} stars to Raindrop`);
    } else {
      console.log(new Date(), `Skipped chunk (${chunk.length} repos)`);
    }
  }

  // Delete unstarred repos from Raindrop.io
  if (unstarredRepos.length > 0) {
    console.log(new Date(), `Removing ${unstarredRepos.length} unstarred repos from Raindrop...`);

    // Search for raindrops by URL and delete them
    for (const unstarredRepo of unstarredRepos) {
      try {
        // Search for the raindrop by URL in the collection
        const searchRes = await raindropAxios.get(
          `/raindrops/${process.env.RAINDROP_COLLECTION_ID}`,
          {
            params: {
              search: unstarredRepo.html_url,
            },
          }
        );

        // Find exact URL match
        const raindrop = searchRes.data.items?.find(
          (item: any) => item.link === unstarredRepo.html_url
        );

        if (raindrop) {
          // Delete the raindrop
          await raindropAxios.delete(`/raindrop/${raindrop._id}`);
          console.log(new Date(), `Deleted: ${unstarredRepo.full_name}`);
        } else {
          console.log(new Date(), `Not found in Raindrop: ${unstarredRepo.full_name}`);
        }
      } catch (error: any) {
        console.error(
          new Date(),
          `Failed to delete ${unstarredRepo.full_name}: ${error.message}`
        );
      }
    }

    console.log(new Date(), `Finished removing unstarred repos from Raindrop`);
  }
};
