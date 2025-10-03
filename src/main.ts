import axios from "axios";
import _ from "lodash";
import { Octokit } from "octokit";
import { archiveStars, fetchStarsFromGitHub } from "./archiver.js";

const raindropAxios = axios.create({
  baseURL: "https://api.raindrop.io/rest/v1",
  headers: {
    Authorization: `Bearer ${process.env.RAINDROP_TOKEN}`,
    "Content-Type": "application/json",
  },
});

export const main = async () => {
  const octokit = new Octokit({ auth: process.env.GH_TOKEN });

  // Archive starred repos to local JSON file
  await archiveStars(octokit);

  console.log(new Date(), "Fetching all your starred repos...");
  const starredRepos = await fetchStarsFromGitHub(octokit);
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
};
