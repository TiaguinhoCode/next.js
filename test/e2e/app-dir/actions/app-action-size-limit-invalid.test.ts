import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { accountForOverhead } from './account-for-overhead'
import {
  Page,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from 'playwright'

const CONFIG_ERROR =
  'Server Actions Size Limit must be a valid number or filesize format larger than 1MB'

describe('app-dir action size limit invalid config', () => {
  const { next, isNextStart, isNextDeploy, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      nanoid: '4.0.1',
      'server-only': 'latest',
    },
  })
  if (skipped) return

  const logs: string[] = []

  beforeAll(() => {
    const onLog = (log: string) => {
      logs.push(stripAnsi(log.trim()))
    }

    next.on('stdout', onLog)
    next.on('stderr', onLog)
  })

  afterEach(async () => {
    logs.length = 0

    await next.stop()
  })

  if (isNextStart) {
    it('should error if serverActions.bodySizeLimit config is a negative number', async function () {
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: -3000 }
        },
      }
      `
      )
      try {
        await next.start()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })

    it('should error if serverActions.bodySizeLimit config is invalid', async function () {
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: 'testmb' }
        },
      }
      `
      )
      try {
        await next.start()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })

    it('should error if serverActions.bodySizeLimit config is a negative size', async function () {
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: '-3000mb' }
        },
      }
      `
      )
      try {
        await next.start()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })
  }

  describe('should respect the size set in serverActions.bodySizeLimit', () => {
    beforeEach(async () => {
      await next.patchFile(
        'next.config.js',
        `
        module.exports = {
          experimental: {
            serverActions: { bodySizeLimit: '1.5mb' }
          },
        }
        `
      )
      await next.start()
    })

    it('should not error for requests that stay below the size limit', async () => {
      const interceptor = createPostResponseInterceptor('/file')
      const browser = await next.browser('/file', {
        beforePageLoad(page: Page) {
          interceptor.intercept(page)
        },
      })

      // below the limit: ok
      await browser.elementByCss('#size-1mb').click()
      const postResponse = await interceptor.waitForNextResponse()
      expect(postResponse.status()).toBe(200)

      if (!isNextDeploy) {
        await retry(() =>
          expect(logs).toContainEqual(
            expect.stringContaining(`size = ${accountForOverhead(1)}`)
          )
        )
        expect(logs).not.toContainEqual(
          expect.stringContaining('Error: Body exceeded 1.5mb limit')
        )
      }
    })

    it('should error for requests that exceed the size limit', async () => {
      const interceptor = createPostResponseInterceptor('/file')
      const browser = await next.browser('/file', {
        beforePageLoad(page: Page) {
          interceptor.intercept(page)
        },
      })

      await browser.elementByCss('#size-2mb').click()
      const postResponse = await interceptor.waitForNextResponse()
      expect(postResponse.status()).toBe(500) // TODO: 413?

      if (!isNextDeploy) {
        await retry(() => {
          expect(logs).toContainEqual(
            expect.stringContaining('Error: Body exceeded 1.5mb limit')
          )
          expect(logs).toContainEqual(
            expect.stringContaining(
              'To configure the body size limit for Server Actions, see'
            )
          )
        })
        expect(logs).not.toContainEqual(expect.stringMatching(/^size = /))
      }
    })
  })

  describe('should respect the size set in serverActions.bodySizeLimit when submitting form', () => {
    beforeEach(async () => {
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: '2mb' }
        },
      }
      `
      )
      await next.start()
    })

    it('should not error for requests that stay below the size limit', async () => {
      const interceptor = createPostResponseInterceptor('/form')
      const browser = await next.browser('/form', {
        beforePageLoad(page: Page) {
          interceptor.intercept(page)
        },
      })

      await browser.elementByCss('#size-1mb').click()

      const postResponse = await interceptor.waitForNextResponse()
      expect(postResponse.status()).toBe(200)

      if (!isNextDeploy) {
        await retry(() =>
          expect(logs).toContainEqual(
            expect.stringContaining(`size = ${accountForOverhead(1)}`)
          )
        )
        expect(logs).not.toContainEqual(
          expect.stringContaining('Error: Body exceeded 2mb limit')
        )
      }
    })

    it('should not error for requests that are at the size limit', async () => {
      const interceptor = createPostResponseInterceptor('/form')
      const browser = await next.browser('/form', {
        beforePageLoad(page: Page) {
          interceptor.intercept(page)
        },
      })

      await browser.elementByCss('#size-2mb').click()

      const postResponse = await interceptor.waitForNextResponse()
      expect(postResponse.status()).toBe(200)

      if (!isNextDeploy) {
        await retry(() =>
          expect(logs).toContainEqual(
            expect.stringContaining(`size = ${accountForOverhead(2)}`)
          )
        )
        expect(logs).not.toContainEqual(
          expect.stringContaining('Error: Body exceeded 2mb limit')
        )
      }
    })

    it('should error for requests that exceed the limit', async () => {
      const interceptor = createPostResponseInterceptor('/form')
      const browser = await next.browser('/form', {
        beforePageLoad(page: Page) {
          interceptor.intercept(page)
        },
      })

      await browser.elementByCss('#size-3mb').click()

      const postResponse = await interceptor.waitForNextResponse()
      expect(postResponse.status()).toBe(500) // TODO: 413?

      if (!isNextDeploy) {
        await retry(() => {
          expect(logs).toContainEqual(
            expect.stringContaining('Error: Body exceeded 2mb limit')
          )
          expect(logs).toContainEqual(
            expect.stringContaining(
              'To configure the body size limit for Server Actions, see'
            )
          )
        })
        expect(logs).not.toContainEqual(expect.stringMatching(/^size = /))
      }
    })
  })
})

function createPostResponseInterceptor(pathname: string, timeoutMs = 5000) {
  let didSettle = false
  let ctrl = promiseWithResolvers<PlaywrightResponse>()
  let abortTimeoutId: ReturnType<typeof setTimeout> | undefined
  let postRequest: PlaywrightRequest | undefined

  function reset() {
    didSettle = false
    ctrl = promiseWithResolvers<PlaywrightResponse>()
    if (abortTimeoutId !== undefined) {
      clearTimeout(abortTimeoutId)
      abortTimeoutId = undefined
    }
    postRequest = undefined
  }

  function intercept(page: Page) {
    page.on('request', (request) => {
      if (postRequest) {
        return
      }

      if (
        new URL(request.url()).pathname === pathname &&
        request.method() === 'POST'
      ) {
        console.log('POST', request.url(), request.headers()['content-type'])
        postRequest = request
        abortTimeoutId = setTimeout(() => {
          if (!didSettle) {
            ctrl.reject(
              new Error(`Did not intercept a response within ${timeoutMs}ms`)
            )
            reset()
          }
        }, timeoutMs)
      }
    })

    page.on('response', (response) => {
      if (!postRequest || didSettle) {
        return
      }
      if (response.request() === postRequest) {
        console.log('POST response', response.status())
        ctrl.resolve(response)
        didSettle = true
        clearTimeout(abortTimeoutId)
      }
    })
  }

  async function waitForNextResponse(): Promise<PlaywrightResponse> {
    try {
      return await ctrl.promise
    } finally {
      reset()
    }
  }

  return { intercept, waitForNextResponse, reset } as const
}

function promiseWithResolvers<T>() {
  let resolve: (value: T) => void = undefined!
  let reject: (error: unknown) => void = undefined!
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}
