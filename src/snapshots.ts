import axios from 'axios'
import * as core from '@actions/core'
import {context} from '@actions/github'
import * as Diff from 'diff'
import {set} from "lodash"
import {asTree} from "treeify"
import {ParsedDiff} from "diff"
import {Hunk} from "diff"

declare interface CrateDifference {
  name: string
  // If old is null, it's a new crate. If new is null, it's been deleted.
  // If both have values then it's changed.
  // If both are null then something has gone terribly wrong.
  old: number | null
  new: number | null
}

export declare interface SnapshotDifference {
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
  file_size: number
  text_section_size: number
  toolchain: string
  rustc: string
  bloat: string
  crates: Array<Crate>
  tree: string
}

export function shouldIncludeInDiff(
  newValue: number,
  oldValue: number | null
): boolean {
  const changedThreshold = 4000
  const newThreshold = 350

  if (oldValue == null) {
    // If we are adding a new crate that adds less than 350 bytes of bloat, ignore it.
    return newValue > newThreshold
  }
  const numberDiff = newValue - oldValue

  // If the size difference is between 4kb either way, don't record the difference.
  if (numberDiff > -changedThreshold && numberDiff < changedThreshold) {
    return false
  }

  return newValue != oldValue
}


function treeToDisplay(tree: string): string {
  // The syntax looks like this:
  // 1serde v1.0.104
  // 2itoa v0.4.5
  // 1another v1.2.3
  // And we need to construct a tree object that looks like
  // {
  //   'serde: v1.0.104': {
  //       'iota v0.4.5': null
  //   },
  //   'another v1.2.3': null
  // }

  const treeObject = {}
  const currentKeyPath: Array<string> = []

  tree.split('\n').forEach(line => {
    const found = line.match(/^(\d+)(.*)/)
    if (found == null) {
      return
    }
    const indent = parseInt(found[1], 10) - 1
    const ourKey = found[2]

    if (indent + 1 > currentKeyPath.length) {
      currentKeyPath.push(ourKey)
    } else {
      while (indent < currentKeyPath.length) {
        currentKeyPath.pop()
      }
      currentKeyPath.push(ourKey)
    }
    set(treeObject, currentKeyPath, null)
  })

  return asTree(treeObject, false, true)
}

export function compareSnapshots(
  current: Snapshot,
  master: Snapshot | null
): SnapshotDifference {
  const masterFileSize = master?.file_size || 0
  const masterTextSize = master?.text_section_size || 0

  const sizeDifference = current.file_size - masterFileSize
  const textDifference = current.text_section_size - masterTextSize

  const currentCratesObj: { [key: string]: number } = {}
  for (const o of current.crates) {
    currentCratesObj[o.name] = o.size
  }
  const masterCratesObj: { [key: string]: number } = {}
  for (const o of master?.crates || []) {
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

  const currentSize = current.file_size
  const currentTextSize = current.text_section_size

  const oldSize = masterFileSize
  const oldTextSize = masterTextSize

  const treeDiff = master?.tree && master.tree !== current.tree ?
    Diff.structuredPatch("master", "branch", treeToDisplay(master.tree), treeToDisplay(current.tree), "", "", {}).hunks : []

  return {
    sizeDifference,
    textDifference,
    crateDifference,
    currentSize,
    oldSize,
    currentTextSize,
    oldTextSize,
    masterCommit: master?.commit || null,
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
