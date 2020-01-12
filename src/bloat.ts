import {ExecOptions} from '@actions/exec/lib/interfaces'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as io from '@actions/io'
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

  core.debug(
    `Toolchain: ${toolchain} with rustc ${rustc} and cargo-bloat ${bloat}`
  )

  return {toolchain, bloat, rustc}
}

export async function installCargoBloat(): Promise<void> {
  const cargo: string = await io.which('cargo', true)
  const args = ['install', 'cargo-bloat']
  await exec.exec(cargo, args)
}

export async function runCargoBloat(): Promise<BloatOutput> {
  const cargo: string = await io.which('cargo', true)
  const args = [
    'bloat',
    '--release',
    '--message-format=json',
    '--all-features',
    '--crates',
    '-n',
    '0'
  ]
  const output = await captureOutput(cargo, args)
  return JSON.parse(output)
}
