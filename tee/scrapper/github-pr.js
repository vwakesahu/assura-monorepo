const { Octokit } = require("@octokit/rest");
const simpleGit = require("simple-git");
const path = require("path");
const fs = require("fs").promises;

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const UPSTREAM_OWNER = "Assura-Network";
const UPSTREAM_REPO = "assura-monorepo";
const BRANCH_NAME = "main";
const DATA_FILE_PATH = path.join(__dirname, "addresses.json");

// Initialize Octokit
let octokit = null;
if (GITHUB_TOKEN) {
  octokit = new Octokit({
    auth: GITHUB_TOKEN,
  });
} else {
  console.warn(
    "[GitHub PR] GITHUB_TOKEN not set. PR creation will be disabled."
  );
}

// Initialize git
const git = simpleGit(path.join(__dirname, "..", "..")); // Go up to monorepo root

/**
 * Check if there are any changes to commit
 */
async function hasChanges() {
  try {
    const status = await git.status();
    return status.files.length > 0;
  } catch (error) {
    console.error(`[GitHub PR] Error checking git status:`, error.message);
    return false;
  }
}

/**
 * Commit and push changes directly to upstream main branch
 */
async function commitAndPush(results, timestamp) {
  try {
    // Ensure we're on main branch
    await git.checkout(BRANCH_NAME);
    
    // Stash any unstaged changes first
    const status = await git.status();
    if (status.files.length > 0) {
      try {
        await git.stash(["push", "-m", "Auto-stash before pull"]);
        console.log(`[GitHub PR] Stashed ${status.files.length} uncommitted changes`);
      } catch (error) {
        // Ignore stash errors if nothing to stash
      }
    }

    // Pull from upstream (Assura-Network) to get latest changes
    try {
      await git.pull("upstream", BRANCH_NAME, { "--rebase": false });
      console.log(`[GitHub PR] Pulled latest changes from upstream`);
    } catch (error) {
      console.log(
        `[GitHub PR] Note: Could not pull from upstream: ${error.message}`
      );
      // Try to pull from origin as fallback
      try {
        await git.pull("origin", BRANCH_NAME, { "--rebase": false });
      } catch (e) {
        console.log(`[GitHub PR] Could not pull from origin either`);
      }
    }

    // Pop stash if we stashed anything
    try {
      await git.stash(["pop"]);
    } catch (error) {
      // Ignore if no stash to pop
    }

    // Stage addresses.json
    let hasChanges = false;
    try {
      await git.add("tee/scrapper/addresses.json");
      hasChanges = true;
    } catch (error) {
      console.log(`[GitHub PR] Note: addresses.json may not be tracked yet`);
    }

    // Check if there are staged changes
    const statusAfterAdd = await git.status();
    if (statusAfterAdd.staged.length === 0 && !hasChanges) {
      console.log(`[GitHub PR] No changes detected. Skipping commit.`);
      return { success: false, reason: "no_changes" };
    }

    // Create commit message with timestamp and results
    const totalNew = results.reduce((sum, r) => sum + (r.newAddresses || 0), 0);
    const totalScraped = results.reduce(
      (sum, r) => sum + (r.totalScraped || 0),
      0
    );

    const commitMessage =
      `Update OFAC addresses - ${timestamp}\n\n` +
      `Poll Results:\n` +
      `- GitHub: ${results[0]?.newAddresses || 0} new addresses (${
        results[0]?.totalScraped || 0
      } total)\n` +
      `- OFAC XML: ${results[1]?.newAddresses || 0} new addresses (${
        results[1]?.totalScraped || 0
      } total)\n` +
      `- Total new: ${totalNew}\n` +
      `- Total addresses scraped: ${totalScraped}\n` +
      `- Status: ${results[0]?.success ? "✅" : "❌"} GitHub | ${
        results[1]?.success ? "✅" : "❌"
      } OFAC XML`;

    // Commit changes
    await git.commit(commitMessage);
    console.log(`[GitHub PR] Committed changes`);

    // Push directly to upstream main branch
    try {
      await git.push("upstream", BRANCH_NAME);
      console.log(
        `[GitHub PR] Successfully pushed to ${UPSTREAM_OWNER}/${UPSTREAM_REPO}:${BRANCH_NAME}`
      );
    } catch (error) {
      // If upstream push fails, try origin (but log warning)
      console.warn(`[GitHub PR] Failed to push to upstream, trying origin: ${error.message}`);
      await git.push("origin", BRANCH_NAME);
      console.log(`[GitHub PR] Pushed to origin instead`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[GitHub PR] Error committing/pushing:`, error.message);
    return { success: false, error: error.message };
  }
}

// Removed findExistingPR - now handled in createPullRequest with branch-specific check

// PR creation removed - now pushing directly to upstream

/**
 * Main function to handle commit and push directly to upstream
 */
async function createPRAfterPoll(results) {
  if (!GITHUB_TOKEN) {
    console.warn("[GitHub PR] GITHUB_TOKEN not set. Skipping push.");
    return { success: false, reason: "no_token" };
  }

  const timestamp = new Date().toISOString();

  try {
    // Commit and push directly to upstream main branch
    const commitResult = await commitAndPush(results, timestamp);
    return commitResult;
  } catch (error) {
    console.error(`[GitHub PR] Unexpected error:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createPRAfterPoll,
  hasChanges,
};
