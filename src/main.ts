import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import {ExecOptions} from '@actions/exec/lib/interfaces'

async function captureOutput(
  cargo: string,
  args: Array<string>
): Promise<string> {
  let stdout = ''

  const options: ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString()
    }
  }
  await exec.exec(cargo, args, options)
  return stdout
}

async function run(): Promise<void> {
  const cargo: string = await io.which('cargo', true)
  await core.group('Installing cargo-bloat', async () => {
    const args = ['install', 'cargo-bloat']
    await exec.exec(cargo, args)
  })
  const cargoOutput = await core.group('Running cargo-bloat', async () => {
    const args = ['bloat', '--message-format=json', '--crates']
    return await captureOutput(cargo, args)
  })
  core.info(`Output: ${cargoOutput}`)
}

async function main(): Promise<void> {
  try {
    await run()
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
