import * as github from '@actions/github'
import {context} from '@actions/github'
import * as core from '@actions/core'
import {SnapshotDifference} from './snapshots'
import fileSize from 'filesize'
import table from 'text-table'

export function githubClient(): github.GitHub {
  const token = core.getInput('token')
  return new github.GitHub(token)
}

async function postNewComment(message: string): Promise<void> {
  const client = githubClient()
  await client.issues.createComment({
    body: message,
    issue_number: context.issue.number,
    owner: context.issue.owner,
    repo: context.issue.repo
  })
}

async function updateComment(
  message: string,
  comment_id: number
): Promise<void> {
  const client = githubClient()

  await client.issues.updateComment({
    body: message,
    comment_id,
    owner: context.issue.owner,
    repo: context.issue.repo
  })
}

export async function createOrUpdateComment(
  toolchain: string,
  message: string
): Promise<void> {
  console.log(`Find comments for issue: ${github.context.issue.number}`)
  const client = githubClient()

  const comments = await client.issues.listComments({
    owner: context.issue.owner,
    repo: context.issue.repo,
    issue_number: context.issue.number,
    per_page: 100
  })

  if (comments.status != 200) {
    return core.setFailed(
      `Error fetching comments for MR ${github.context.issue.number}`
    )
  }
  const ourComments = comments.data.filter(v => {
    // Is there a better way to do this?
    return v.user.login == 'github-actions[bot]' && v.body.includes(toolchain)
  })

  if (!ourComments.length) {
    await postNewComment(message)
  } else {
    // Update the first comment
    await updateComment(message, ourComments[0].id)
  }
}

export function createSnapshotComment(
  toolchain: string,
  diff: SnapshotDifference
): string {
  const crateTableRows: Array<[string, string]> = []
  diff.crateDifference.forEach(d => {
    if (d.old === null && d.new === null) {
      return
    }
    if (d.old === d.new) {
      crateTableRows.push([`${d.name}`, fileSize(d.new as number)])
    } else {
      if (d.old) {
        crateTableRows.push([`- ${d.name}`, fileSize(d.old)])
      }
      if (d.new) {
        crateTableRows.push([`+ ${d.name}`, fileSize(d.new)])
      }
    }
  })

  const sizeTableRows: Array<[string, string]> = []
  if (diff.sizeDifference) {
    sizeTableRows.push(['- Size', fileSize(diff.oldSize)])
    sizeTableRows.push([
      '+ Size',
      `${fileSize(diff.currentSize)} (${fileSize(diff.sizeDifference)})`
    ])
  } else {
    sizeTableRows.push(['Size', fileSize(diff.currentTextSize)])
  }

  if (diff.textDifference) {
    sizeTableRows.push(['- Text Size', fileSize(diff.oldTextSize)])
    sizeTableRows.push([
      '+ Text Size',
      `${fileSize(diff.currentTextSize)} (${fileSize(diff.textDifference)})`
    ])
  } else {
    sizeTableRows.push(['Text size', fileSize(diff.currentTextSize)])
  }

  const crateTable = table(crateTableRows)

  const sizeTable = table(sizeTableRows)

  const emojiList = {
    apple: 'apple',
    windows: 'office',
    arm: 'muscle',
    linux: 'cowboy_hat_face' // Why not?
  }

  let selectedEmoji = 'crab'
  for (const [key, emoji] of Object.entries(emojiList)) {
    if (toolchain.includes(key)) {
      selectedEmoji = emoji
      break
    }
  }

  return `
:${selectedEmoji}: Cargo bloat for toolchain **${toolchain}** :${selectedEmoji}:

\`\`\`diff
@@ Size breakdown @@

${sizeTable}

\`\`\`

<details>
<summary>Size difference per crate</summary>
<br />

\`\`\`diff
@@ Breakdown per crate @@

${crateTable}
\`\`\`

</details>
`
}
