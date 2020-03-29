import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  compareSnapshots,
  Snapshot,
  fetchSnapshot,
  recordSnapshot
} from './snapshots'
import {
  BloatOutput, CargoPackage, getCargoPackages,
  getToolchainVersions,
  installCargoDependencies, Package,
  runCargoBloat, runCargoTree,
  Versions
} from './bloat'
// import {createOrUpdateComment, createSnapshotComment} from './comments'
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

  const packages = await core.group(
    'Inspecting cargo packages',
    async (): Promise<Array<CargoPackage>> => {
      return await getCargoPackages(cargoPath)
    }
  )

  const packageData : Record<string, Package> = {}

  for (const cargoPackage of packages) {
    const bloatData = await core.group(
      `Running cargo-bloat on package ${cargoPackage.name}`,
      async (): Promise<BloatOutput> => {
        return await runCargoBloat(cargoPath, cargoPackage.name)
      }
    )
    const treeData = await core.group(
      `Running cargo-tree on package ${cargoPackage.name}`,
      async (): Promise<string> => {
        return await runCargoTree(cargoPath, cargoPackage.name)
      }
    )
    packageData[cargoPackage.name] = {bloat: bloatData, tree: treeData}
  }

  const repo_path = `${github.context.repo.owner}/${github.context.repo.repo}`

  const currentSnapshot: Snapshot = {
    commit: github.context.sha,
    toolchain: versions.toolchain,
    rustc: versions.rustc,
    bloat: versions.bloat,
    packages: packageData,
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
      const masterCommit = masterSnapshot?.commit || null;
      const snapShotDiffs = Object.entries(currentSnapshot.packages).map(obj => {
        const [name, currentPackage] = obj
        return compareSnapshots(name, masterCommit, currentPackage, masterSnapshot?.packages?.[name] || null)
      })
      core.debug(`snapshot: ${JSON.stringify(snapShotDiffs, undefined, 2)}`)
      // await createOrUpdateComment(
      //   versions.toolchain,
      //   createSnapshotComment(versions.toolchain, snapshotDiff)
      // )
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
