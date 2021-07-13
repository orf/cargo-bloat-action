import {restoreCache, saveCache} from '@actions/cache';
import * as core from '@actions/core'
import {exec} from '@actions/exec';
import * as github from '@actions/github';
import {context} from '@actions/github';
import * as Diff from 'diff'
import {Change} from 'diff'
import {promises} from 'fs';
import {BloatOutput, CargoPackage, getCargoPackages, Package, runCargoBloat, runCargoTree, Versions} from "./bloat"
import {shouldIncludeInDiff, treeToDisplay} from "./utils"

declare interface CrateDifference {
  name: string
  // If old is null, it's a new crate. If new is null, it's been deleted.
  // If both have values then it's changed.
  // If both are null then something has gone terribly wrong.
  old: number | null
  new: number | null
}

export declare interface SnapshotDifference {
  packageName: string

  currentSize: number
  oldSize: number
  sizeDifference: number

  currentTextSize: number
  oldTextSize: number
  textDifference: number

  masterCommit: string | null
  currentCommit: string

  crateDifference: Array<CrateDifference>

  treeDiff: Change[] | string
  oldDependenciesCount: number
  newDependenciesCount: number
}

export declare interface Crate {
  crate: string | null
  name: string
  size: number
}

export declare interface Snapshot {
  commit: string
  toolchain: string
  rustc: string
  bloat: string
  packages: Record<string, Package>
}


function crateOrFunctionName(crate: Crate) : string {
  const name = crate.crate ? `(${crate.crate}) ${crate.name}` : crate.name
  if (name.length > 70) {
    return `${name.substring(0, 70)}...`
  }
  return name
}


export function compareSnapshots(
  packageName: string,
  masterCommit: string | null,
  current: Package,
  master: Package | null
): SnapshotDifference {
  const masterFileSize = master?.bloat["file-size"] || 0
  const masterTextSize = master?.bloat["text-section-size"]|| 0

  const sizeDifference = current.bloat["file-size"] - masterFileSize
  const textDifference = current.bloat["text-section-size"] - masterTextSize

  const currentCratesObj: { [key: string]: number } = {}
  const currentCrateOrFunction = current.bloat.crates ? current.bloat.crates : current.bloat.functions
  const masterCrateOrFunction = master?.bloat.crates ? master?.bloat.crates : master?.bloat.functions

  // Should never happen
  if (currentCrateOrFunction == undefined) {
    throw Error("Neither crates or functions are defined!")
  }

  for (const o of currentCrateOrFunction) {
    currentCratesObj[crateOrFunctionName(o)] = o.size
  }
  const masterCratesObj: { [key: string]: number } = {}
  for (const o of masterCrateOrFunction || []) {
    masterCratesObj[crateOrFunctionName(o)] = o.size
  }

  // Ignore unknown crates for now.
  delete currentCratesObj['[Unknown]']
  delete masterCratesObj['[Unknown]']

  const crateDifference: CrateDifference[] = []

  // Crates with new or altered values
  for (const [name, newValue] of Object.entries(currentCratesObj)) {
    let oldValue: number | null = masterCratesObj[name] || null
    if (oldValue == null) {
      oldValue = null
    } else {
      delete masterCratesObj[name]
    }
    if (shouldIncludeInDiff(newValue, oldValue)) {
      crateDifference.push({name, new: newValue, old: oldValue})
    }
  }

  // Crates that have been removed
  for (const [name, oldValue] of Object.entries(masterCratesObj)) {
    crateDifference.push({name, new: null, old: oldValue})
  }

  const currentSize = current.bloat["file-size"]
  const currentTextSize = current.bloat["text-section-size"]

  const oldSize = masterFileSize
  const oldTextSize = masterTextSize

  const treeDiff = master?.tree && master.tree !== current.tree ?
    Diff.diffLines(treeToDisplay(master.tree), treeToDisplay(current.tree)) : treeToDisplay(current.tree)
    // Diff.structuredPatch("master", "branch", treeToDisplay(master.tree), treeToDisplay(current.tree), "", "", {}).hunks : treeToDisplay(current.tree)

  const oldDependenciesCount = master?.tree.split("\n").length || 0
  const newDependenciesCount = current.tree.split("\n").length

  return {
    packageName,
    sizeDifference,
    textDifference,
    crateDifference,
    currentSize,
    oldSize,
    currentTextSize,
    oldTextSize,
    masterCommit,
    currentCommit: context.sha,
    treeDiff,
    newDependenciesCount,
    oldDependenciesCount
  }
}

function cacheKey(sha: string): string {
  return `bloat-cache-${sha}`;
}
function snapshotFilename(sha: string): string {
  return `${cacheKey(sha)}.json`;
}

async function fetchSnapshot(
  sha: string,
): Promise<Snapshot | null> {
  let path = snapshotFilename(sha);
  let res = await restoreCache([path], cacheKey(sha));
  if (res === undefined) return null;

  try {
    let content = (await promises.readFile(path)).toString();
    return JSON.parse(content);
  }
  catch (e) {
    core.error(`Error while restoring cached snapshot: ${e}`);
    return null;
  }
}

async function recordSnapshot(
  sha: string,
  snapshot: Snapshot
): Promise<void> {
  core.info(`Storing bloat snapshot of ${sha} into cache`)
  let path = snapshotFilename(sha);
  await promises.writeFile(path, JSON.stringify(snapshot, undefined, 2));
  let key = cacheKey(sha);

  try {
    await saveCache([path], `${key}-${process.env.GITHUB_RUN_ID}`);
  } catch (e) {
    core.error(`Error while storing cached snapshot: ${e}`);
  }
}

export async function computeSnapshot(cargoPath: string, versions: Versions, sha: string): Promise<Snapshot> {
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

  let snapshot = {
    commit: sha,
    toolchain: versions.toolchain,
    rustc: versions.rustc,
    bloat: versions.bloat,
    packages: packageData,
  };

  await recordSnapshot(sha, snapshot);

  return snapshot;
}

/**
 * Either restore the snapshot with the given `sha` from cache, or checkout the given `sha` and compute the snapshot.
 */
export async function restoreOrComputeSnapshot(cargoPath: string, versions: Versions, sha: string): Promise<Snapshot> {
  let restored = await fetchSnapshot(sha);
  if (restored !== null) {
    core.info(`Snapshot of ${sha} was successfully restored from cache`);
    return restored;
  }
  core.info(`Snapshot of ${sha} was not found in the cache, it will recomputed`);

  // Temporarily checkout the target branch
  core.info(`Checking out ${sha}`);
  await exec("git", ["checkout", sha]);
  let snapshot = await computeSnapshot(cargoPath, versions, sha);

  // Checkout the original version back
  core.info(`Checking out ${github.context.sha}`);
  await exec("git", ["checkout", github.context.sha]);

  return snapshot;
}
