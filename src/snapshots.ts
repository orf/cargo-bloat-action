import axios from 'axios'
import * as core from '@actions/core'
import {context} from '@actions/github'

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
}

export function compareSnapshots(
  current: Snapshot,
  master: Snapshot | null
): SnapshotDifference {
  const masterFileSize = master?.file_size || 0
  const masterTextSize = master?.text_section_size || 0

  const sizeDifference = current.file_size - masterFileSize
  const textDifference = current.text_section_size - masterTextSize

  const currentCratesObj: {[key: string]: number} = {}
  for (const o of current.crates) {
    currentCratesObj[o.name] = o.size
  }
  const masterCratesObj: {[key: string]: number} = {}
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
    if (newValue != oldValue) {
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

  return {
    sizeDifference,
    textDifference,
    crateDifference,
    currentSize,
    oldSize,
    currentTextSize,
    oldTextSize,
    masterCommit: master?.commit || null,
    currentCommit: context.sha
  }
}

export async function fetchSnapshot(
  repo: string,
  toolchain: string
): Promise<Snapshot | null> {
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
  core.info(`Post data: ${JSON.stringify(snapshot, undefined, 2)}`)
  const url = `https://us-central1-cargo-bloat.cloudfunctions.net/ingest`
  await axios.post(url, snapshot, {params: {repo}})
}
