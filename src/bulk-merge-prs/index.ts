import {prompt} from 'enquirer';
import {orderBy, sum} from 'lodash';
import logSymbols from 'log-symbols';
import pMap from 'p-map';
import {approvePR, listOpenPRs, mergePR} from '@shelf/gh-sdk';

export async function bulkMergePRs(org: string): Promise<void> {
  const items = orderBy(
    await listOpenPRs({owner: org, searchText: 'renovate'}),
    ['updated_at'],
    ['desc']
  );

  const {prsToMerge} = await prompt({
    type: 'autocomplete',
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    multiple: true,
    name: 'prsToMerge',
    message: 'Pick a PR',
    choices: items.map(item => {
      const [_, repoWithPrNumber] = item.url.split(`/${org}/`);
      const [repo, prNumber] = repoWithPrNumber.split('/issues/');

      return `#${prNumber} [${repo}]: ${item.title}`;
    })
  });

  const failedToMergePRsURLs = [];

  const mergedPrsCounts = await pMap(
    prsToMerge,
    async (prToMerge: string) => {
      const {prNumber, repo} = /#(?<prNumber>\d+) \[(?<repo>.+)\]/gi.exec(prToMerge).groups;

      try {
        await approvePR({owner: org, repo, pr: Number(prNumber)});
        console.log(`${logSymbols.info} Approved PR #${prNumber} in ${repo}`);

        await mergePR({owner: org, repo, pr: Number(prNumber)});
        console.log(`${logSymbols.success} Merged PR #${prNumber} in ${repo}`);

        return 1;
      } catch (error) {
        console.error(
          `${logSymbols.error} Failed to merge PR #${prNumber} in ${repo}: ${error.message}`
        );

        failedToMergePRsURLs.push(`https://github.com/${org}/${repo}/pull/${prNumber}`);

        return 0;
      }
    },
    {concurrency: 10}
  );

  console.log(`\n${logSymbols.success} Merged ${sum(mergedPrsCounts)} PRs!`);
  console.log(`\n${logSymbols.error} Failed to merge ${failedToMergePRsURLs.length} PRs!`);
  console.log(failedToMergePRsURLs.join('\n'));
}
