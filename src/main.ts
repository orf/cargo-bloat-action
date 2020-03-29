import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  compareSnapshots,
  Snapshot,
  fetchSnapshot,
  recordSnapshot
} from './snapshots'
import {
  BloatOutput, CargoMetadata, getCargoPackages,
  getToolchainVersions,
  installCargoDependencies,
  runCargoBloat, runCargoTree, TreeOutput,
  Versions
} from './bloat'
import {createOrUpdateComment, createSnapshotComment} from './comments'
import * as io from "@actions/io"

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

  const cargoPath: string = await io.which('cargo', true)

  await core.group('Installing cargo dependencies', async () => {
    await installCargoDependencies(cargoPath)
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
      return await runCargoBloat(cargoPath)
    }
  )

  const metadata = await core.group(
    'Inspecting cargo packages',
    async (): Promise<CargoMetadata> => {
      return await getCargoPackages(cargoPath)
    }
  )

  let treeData: string

  if (metadata.packages.length > 1) {
    const packageName = metadata.packages[0].name
    treeData = await core.group(
      `Running cargo-tree on package ${packageName}`,
      async (): Promise<string> => {
        return await runCargoTree(cargoPath, packageName)
      }
    )
  } else {
    treeData = ""
  }

  const repo_path = `${github.context.repo.owner}/${github.context.repo.repo}`

  const currentSnapshot: Snapshot = {
    commit: github.context.sha,
    crates: bloatData.crates,
    file_size: bloatData['file-size'],
    text_section_size: bloatData['text-section-size'],
    toolchain: versions.toolchain,
    rustc: versions.rustc,
    bloat: versions.bloat,
    tree: treeData,
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
    async (): Promise<Snapshot | null> => {
      return await fetchSnapshot(repo_path, versions.toolchain)
    }
  )
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
