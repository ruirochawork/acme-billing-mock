// Step 3 of the loop: given a finding, search the source for the code behind it and present the
// remediation for a human to approve.
//
// What is automated here: resolving the finding's route to a real file and line in the source,
// and naming the control that is missing. What is NOT automated: writing the fix. The patch is a
// stored file, and every output says so, so nobody approving it thinks a model authored it.
//
// Usage:
//   node security/locate-fix.mjs --finding cross-tenant-invoice-read [--summary <file>] [--json]

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const findingId = arg('--finding', 'cross-tenant-invoice-read');
const summaryFile = arg('--summary', process.env.GITHUB_STEP_SUMMARY || null);
const asJson = process.argv.includes('--json');

// Find the 1-based line of the first occurrence of `pattern` in `file`.
async function locate(file, pattern) {
  const text = await readFile(join(root, file), 'utf8');
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.includes(pattern));
  if (index === -1) return null;
  return {
    file,
    line: index + 1,
    excerpt: lines.slice(index, index + 8).join('\n'),
  };
}

async function main() {
  const findings = JSON.parse(await readFile(join(root, 'security/findings.json'), 'utf8'));
  const finding = findings[findingId];
  if (!finding) {
    console.error(`unknown finding: ${findingId}`);
    console.error(`known: ${Object.keys(findings).join(', ')}`);
    return 1;
  }

  const site = await locate(finding.locate.file, finding.locate.pattern);
  if (!site) {
    console.error(`could not locate ${finding.locate.pattern} in ${finding.locate.file}`);
    console.error('the route may have moved; update security/findings.json');
    return 1;
  }

  const patch = await readFile(join(root, finding.patch), 'utf8');

  const result = {
    finding: findingId,
    title: finding.title,
    severity: finding.severity,
    route: `${finding.route.method} ${finding.route.path}`,
    location: `${site.file}:${site.line}`,
    missingControl: finding.missingControl,
    patchFile: finding.patch,
    provenance: finding.provenance,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Finding:   ${result.title}`);
    console.log(`Severity:  ${result.severity}`);
    console.log(`Route:     ${result.route}`);
    console.log(`Found at:  ${result.location}`);
    console.log(`Missing:   ${result.missingControl}`);
    console.log(`Patch:     ${result.patchFile}`);
    console.log(`Provenance: ${result.provenance}`);
  }

  if (summaryFile) {
    const md = [
      `## Proposed fix for \`${findingId}\``,
      '',
      `**${result.title}** · severity **${result.severity}**`,
      '',
      `| | |`,
      `|---|---|`,
      `| Route | \`${result.route}\` |`,
      `| Located at | \`${result.location}\` |`,
      `| Missing control | ${result.missingControl} |`,
      '',
      '### Code as it stands',
      '',
      '```js',
      site.excerpt,
      '```',
      '',
      '### Patch to be applied',
      '',
      '```diff',
      patch.trimEnd(),
      '```',
      '',
      `> **Provenance:** ${result.provenance}`,
      '',
      'Approving this job applies the patch on a branch and opens the pull request.',
      'The pull request is then gated by `retest-pr`, which must observe the exploit fail',
      'while the control request still succeeds.',
      '',
    ].join('\n');
    const { appendFile } = await import('node:fs/promises');
    await appendFile(summaryFile, md);
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 2;
  });
