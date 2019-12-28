import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'

async function run() {
  const cargo: string = await io.which('cargo', true)
  const args = ['install', 'cargo-bloat']
  await exec.exec(cargo, args)
}

async function main(): Promise<void> {
  try {
    await run()
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
