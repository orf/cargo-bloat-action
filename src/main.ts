import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  compareSnapshots,
  Snapshot,
  fetchSnapshot,
  recordSnapshot
} from './snapshots'
import {
  BloatOutput,
  getToolchainVersions,
  installCargoBloat,
  runCargoBloat,
  Versions
} from './bloat'
import {createOrUpdateComment, createSnapshotComment} from './comments'
import {context} from '@actions/github'

const ALLOWED_EVENTS = ['pull_request', 'push']

async function run(): Promise<void> {
  if (!ALLOWED_EVENTS.includes(github.context.eventName)) {
    core.setFailed(
      `This can only be used with the following events: ${ALLOWED_EVENTS.join(
        ', '
      )}`
    )
    return
  }

  await core.group('Installing cargo-bloat', async () => {
    await installCargoBloat()
  })

  const versions = await core.group(
    'Toolchain info',
    async (): Promise<Versions> => {
      return getToolchainVersions()
    }
  )

  const bloatData = await core.group(
    'Running cargo-bloat',
    async (): Promise<BloatOutput> => {
      return await runCargoBloat()
    }
  )

  const repo_path = `${github.context.repo.owner}/${github.context.repo.repo}`

  const currentSnapshot: Snapshot = {
    commit: github.context.sha,
    crates: bloatData.crates,
    file_size: bloatData['file-size'],
    text_section_size: bloatData['text-section-size'],
    toolchain: versions.toolchain,
    rustc: versions.rustc,
    bloat: versions.bloat
  }

  if (github.context.eventName == 'push') {
    // Record the results
    return await core.group('Recording', async () => {
      return await recordSnapshot(repo_path, currentSnapshot)
    })
  }

  // A merge request
  const masterSnapshot = await core.group(
    'Fetching last build',
    async (): Promise<Snapshot> => {
      return await fetchSnapshot(repo_path, versions.toolchain)
    }
  )
  context.issue.number
  await core.group(
    'Posting comment',
    async (): Promise<void> => {
      const snapshotDiff = compareSnapshots(currentSnapshot, masterSnapshot)
      core.debug(`snapshot: ${JSON.stringify(snapshotDiff, undefined, 2)}`)
      await createOrUpdateComment(
        versions.toolchain,
        createSnapshotComment(versions.toolchain, snapshotDiff)
      )
    }
  )
}

async function main(): Promise<void> {
  try {
    await run()
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
