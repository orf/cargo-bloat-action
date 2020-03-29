import {ExecOptions} from '@actions/exec/lib/interfaces'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import {Crate} from './snapshots'

export declare class Versions {
  rustc: string
  toolchain: string
  bloat: string
}

export declare interface BloatOutput {
  'file-size': number
  'text-section-size': number
  crates: Array<Crate>
}

export declare interface TreeOutput {
  lines: Array<string>
}

async function captureOutput(
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

export async function getToolchainVersions(): Promise<Versions> {
  const toolchain_out = await captureOutput('rustup', [
    'show',
    'active-toolchain'
  ])
  const toolchain = toolchain_out.split(' ')[0]

  const rustc_version_out = await captureOutput('rustc', ['--version'])
  const rustc = rustc_version_out.split(' ')[1]

  const bloat = (await captureOutput('cargo', ['bloat', '--version'])).trim()
  const tree = (await captureOutput('cargo', ['tree', '--version'])).split(' ')[1].trim()

  core.debug(
    `Toolchain: ${toolchain} with rustc ${rustc}, cargo-bloat ${bloat} and cargo-tree ${tree}`
  )

  return {toolchain, bloat, rustc}
}

export async function installCargoDependencies(cargoPath: string): Promise<void> {
  const args = ['install', 'cargo-bloat', 'cargo-tree', '--debug']
  await exec.exec(cargoPath, args)
}

export async function runCargoBloat(cargoPath: string): Promise<BloatOutput> {
  const args = [
    'bloat',
    '--release',
    '--message-format=json',
    '--all-features',
    '--crates',
    '-n',
    '0'
  ]
  const output = await captureOutput(cargoPath, args)
  return JSON.parse(output)
}

export async function runCargoTree(cargoPath: string): Promise<string> {
  const args = [
    'tree',
    '--prefix-depth'
  ]
  return await captureOutput(cargoPath, args)
}
