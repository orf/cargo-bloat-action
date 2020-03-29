import axios from 'axios'
import * as core from '@actions/core'
import {context} from '@actions/github'
import * as Diff from 'diff'
import {Hunk} from 'diff'
import {Package} from "./bloat"
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

  treeDiff: Hunk[]
}

export declare interface Crate {
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
  for (const o of current.bloat.crates) {
    currentCratesObj[o.name] = o.size
  }
  const masterCratesObj: { [key: string]: number } = {}
  for (const o of master?.bloat.crates || []) {
    masterCratesObj[o.name] = o.size
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
    Diff.structuredPatch("master", "branch", treeToDisplay(master.tree), treeToDisplay(current.tree), "", "", {}).hunks : []

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
    treeDiff
  }
}

export async function fetchSnapshot(
  repo: string,
  toolchain: string
): Promise<Snapshot | null> {
  // Don't be a dick, please.
  const url = `https://us-central1-cargo-bloat.cloudfunctions.net/fetch`
  const res = await axios.get(url, {params: {repo, toolchain}})
  core.info(`Response: ${JSON.stringify(res.data)}`)
  // This is a bit screwed.
  if (Object.keys(res.data).length == 0) {
    return null
  }
  return res.data as Snapshot
}

export async function recordSnapshot(
  repo: string,
  snapshot: Snapshot
): Promise<void> {
  // Don't be a dick, please.
  const url = `https://us-central1-cargo-bloat.cloudfunctions.net/ingest`
  core.info(`Post data: ${JSON.stringify(snapshot, undefined, 2)}`)
  await axios.post(url, snapshot, {params: {repo}})
}
