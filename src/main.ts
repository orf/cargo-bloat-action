import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import {ExecOptions} from '@actions/exec/lib/interfaces'
import axios from 'axios'
import * as github from '@actions/github'
import {graphql} from '@octokit/graphql'
import {context} from '@actions/github'

const ALLOWED_EVENTS = ['pull_request', 'push']

declare class Versions {
  rustc: string
  toolchain: string
  bloat: string
}

async function captureOutput(
  cmd: string,
  args: Array<string>
): Promise<string> {
  let stdout = ''

  const options: ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString()
    }
  }
  await exec.exec(cmd, args, options)
  return stdout
}

async function run(): Promise<void> {
  const token = core.getInput('token')
  if (!ALLOWED_EVENTS.includes(github.context.eventName)) {
    core.setFailed(
      `This can only be used with the following events: ${ALLOWED_EVENTS.join(
        ', '
      )}`
    )
    return
  }

  const cargo: string = await io.which('cargo', true)
  await core.group('Installing cargo-bloat', async () => {
    const args = ['install', 'cargo-bloat']
    await exec.exec(cargo, args)
  })
  const cargoOutput = await core.group('Running cargo-bloat', async () => {
    const args = [
      'bloat',
      '--release',
      '--message-format=json',
      '--all-features',
      '--crates',
      '-n',
      '0'
    ]
    return await captureOutput(cargo, args)
  })
  const bloatData = JSON.parse(cargoOutput)

  const versions = await core.group(
    'Toolchain info',
    async (): Promise<Versions> => {
      const toolchain_out = await captureOutput('rustup', [
        'show',
        'active-toolchain'
      ])
      const toolchain = toolchain_out.split(' ')[0]

      const rustc_version_out = await captureOutput('rustc', ['--version'])
      const rustc = rustc_version_out.split(' ')[1]

      const bloat = (
        await captureOutput('cargo', ['bloat', '--version'])
      ).trim()

      core.debug(
        `Toolchain: ${toolchain} with rustc ${rustc} and cargo-bloat ${bloat}`
      )

      return {toolchain, bloat, rustc}
    }
  )

  const repo_path = `${github.context.repo.owner}/${github.context.repo.repo}`

  if (github.context.eventName == 'push') {
    // Record the results
    await core.group('Recording', async () => {
      const data = {
        repo: repo_path,
        commit: github.context.sha,
        crates: bloatData.crates,
        file_size: bloatData['file-size'],
        text_size: bloatData['text-section-size'],
        toolchain: versions.toolchain,
        rustc: versions.rustc,
        bloat: versions.bloat
      }
      core.info(`Post data: ${JSON.stringify(data, undefined, 2)}`)
      const url = `https://us-central1-cargo-bloat.cloudfunctions.net/ingest`
      await axios.post(url, data)
    })
    return
  }

  // A merge request
  const lastBuildData = await core.group('Fetching last build', async () => {
    const url = `https://us-central1-cargo-bloat.cloudfunctions.net/fetch?repo=${repo_path}`
    const res = await axios.get(url)
    core.info(`Response: ${JSON.stringify(res.data)}`)
  })

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `bearer ${token}`
    }
  })
  console.log(`Number: ${github.context.issue.number}`)

  const thing = await graphqlWithAuth(
    `
  query issueComments($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        comments(first: 100) {
          nodes {
            author {
              login,
            }
            body
          }
        }
      }
    }
  }
  `,
    {
      owner: context.issue.owner,
      repo: context.issue.repo,
      pr: context.issue.number
    }
  )

  core.info(`Response: ${JSON.stringify(thing)}`)
}

async function main(): Promise<void> {
  try {
    await run()
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
