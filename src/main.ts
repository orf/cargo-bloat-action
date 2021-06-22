import * as core from '@actions/core'
import {exec} from '@actions/exec';
import * as github from '@actions/github'
import {
  compareSnapshots,
  computeSnapshot, restoreOrComputeSnapshot
} from './snapshots'
import {
  getToolchainVersions,
  installCargoDependencies,
  Versions
} from './bloat'
import * as io from "@actions/io"
import {createComment, createOrUpdateComment} from "./comments"
import {refToSha} from './utils';

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

  let currentSnapshot = await computeSnapshot(cargoPath, versions, github.context.sha);
  if (github.context.eventName != "pull_request") return;

  // Download base branch commit
  await exec("git", ["fetch", "--depth", "1", "origin", process.env.GITHUB_BASE_REF as string]);

  let referenceSha = await refToSha("FETCH_HEAD");
  const masterSnapshot = await restoreOrComputeSnapshot(cargoPath, versions, referenceSha);

  await core.group(
    'Posting comment',
    async (): Promise<void> => {
      const masterCommit = masterSnapshot?.commit || null;
      const snapShotDiffs = Object.entries(currentSnapshot.packages).map(obj => {
        const [name, currentPackage] = obj
        return compareSnapshots(name, masterCommit, currentPackage, masterSnapshot?.packages?.[name] || null)
      })
      core.info(`snapshot: ${JSON.stringify(snapShotDiffs, undefined, 2)}`)
      const comment = createComment(masterCommit, currentSnapshot.commit, versions.toolchain, snapShotDiffs);
      await createOrUpdateComment(
        versions.toolchain,
        comment
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
