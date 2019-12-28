import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import {ExecOptions} from '@actions/exec/lib/interfaces'
import axios from 'axios'
import * as github from '@actions/github'

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
  const context = github.context
  const cargo: string = await io.which('cargo', true)
  await core.group('Installing cargo-bloat', async () => {
    const args = ['install', 'cargo-bloat']
    await exec.exec(cargo, args)
  })
  const cargoOutput = await core.group('Running cargo-bloat', async () => {
    const args = ['bloat', '--release', '--message-format=json', '--crates']
    return await captureOutput(cargo, args)
  })
  const bloatData = JSON.parse(cargoOutput)
  await core.group('Recording', async () => {
    const data = {
      commit: context.sha,
      crates: bloatData.crates,
      file_size: bloatData['file-size'],
      text_size: bloatData['text-section-size'],
      build_id: context.action
    }
    core.info(`Post data: ${JSON.stringify(data)}`)
    const url = `https://bloaty-backend.appspot.com/ingest/${context.repo.owner}/${context.repo.repo}`
    await axios.post(url, data)
  })
}

async function main(): Promise<void> {
  try {
    await run()
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
