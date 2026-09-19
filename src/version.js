// Reports the commit the running process was built from. The retest reads this so a "fixed"
// verdict is tied to a specific deployed commit rather than to whatever happens to be running.
export const gitSha = process.env.GIT_SHA || 'dev';
