import * as exec from '@actions/exec'
import * as core from '@actions/core'
import {Crate} from './snapshots'
import {captureOutput} from "./utils"

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

export declare interface Package {
  bloat: BloatOutput
  tree: string
}

export declare interface CargoPackage {
  name: string
}

declare interface CargoMetadata {
  packages: Array<CargoPackage>
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

export async function runCargoBloat(cargoPath: string, packageName: string): Promise<BloatOutput> {
  const defaultArgs = [
    'bloat',
    '--release',
    '--message-format=json',
    '--all-features',
    '--crates',
    '-n',
    '0',
    '-p',
    packageName
  ]
  let optionalArgs = core.getInput("bloat_flags");
  if (optionalArgs.length > 0) {
    const output = await captureOutput(cargoPath, ["bloat", ...optionalArgs.split(" ")]);
    return JSON.parse(output)
  }
  const output = await captureOutput(cargoPath, defaultArgs)
  return JSON.parse(output)
}

export async function runCargoTree(cargoPath: string, packageName: string): Promise<string> {
  let optionalArgs = core.getInput("tree_args");
  const args = (optionalArgs.length > 0) ? ['tree', ...optionalArgs.split(" ")] : [
    'tree',
    '--prefix-depth',
    '--all-features',
    '--no-dev-dependencies',
    '-p',
    packageName
  ];
  // The first line has the version and other metadata in it. We strip that here:
  const lines = (await captureOutput(cargoPath, args)).split("\n")
  return lines.slice(1).join("\n")
}

export async function getCargoPackages(cargoPath: string): Promise<Array<CargoPackage>> {
  const args = ['metadata', '--no-deps', '--format-version=1']
  const output = await captureOutput(cargoPath, args)
  return (JSON.parse(output) as CargoMetadata).packages
}
