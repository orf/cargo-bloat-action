import {set} from "lodash"
import {asTree} from "treeify"
import {ExecOptions} from "@actions/exec/lib/interfaces"
import * as exec from "@actions/exec"

export function treeToDisplay(tree: string): string {
    // The syntax looks like this:
    // 1serde v1.0.104
    // 2itoa v0.4.5 (*)
    // 1another v1.2.3
    // And we need to construct a tree object that looks like
    // {
    //   'serde v1.0.104': {
    //       'iota v0.4.5': null
    //   },
    //   'another v1.2.3': null
    // }

    const treeObject = {}
    const currentKeyPath: Array<string> = []

    tree.split('\n').forEach(line => {
        const found = line.match(/^(\d+)(.*)?/)
        if (found == null) {
            return
        }
        const indent = parseInt(found[1], 10) - 1
        const ourKey = found[2].replace("(*)", "")

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

export function shouldIncludeInDiff(
  newValue: number,
  oldValue: number | null
): boolean {
  const changedThreshold = 4000
  const newThreshold = 512

  if (oldValue == null) {
    // If we are adding a new crate that adds less than 512 bytes of bloat, ignore it.
    return newValue > newThreshold
  }
  const numberDiff = newValue - oldValue

  // If the size difference is between 4kb either way, don't record the difference.
  if (numberDiff > -changedThreshold && numberDiff < changedThreshold) {
    return false
  }

  return newValue != oldValue
}

export async function captureOutput(
  cmd: string,
  args: Array<string>
): Promise<string> {
  let stdout = ''

  const options: ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer): void => {
      stdout += data.toString()
    }
  }
  await exec.exec(cmd, args, options)
  return stdout
}

export async function refToSha(branch: string): Promise<string> {
  let sha = await captureOutput("git", ["rev-parse", branch]);
  return sha.trim();
}
