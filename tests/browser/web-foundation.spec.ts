import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('M01 management web foundation', () => {
  test('renders the foundation landing surface without browser errors', async ({ page }) => {
    const browserErrors: string[] = []

    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      browserErrors.push(error.message)
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', {
        name: 'Software delivery with evidence, authority, and cost control.',
      }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Inspect web health' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View foundation status' })).toBeVisible()
    await expect(page.getByText('Production promotion is disabled by default.')).toBeVisible()

    const overlayCount = await page
      .locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
      .count()
    expect(overlayCount).toBe(0)
    expect(browserErrors).toEqual([])
  })

  test('exposes a versioned web health contract from the browser surface', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBe(true)

    const body = (await response.json()) as {
      schemaVersion?: unknown
      service?: unknown
      status?: unknown
    }

    expect(body.schemaVersion).toBe('1')
    expect(body.service).toBe('management-web')
    expect(body.status).toBe('ok')
  })

  test('has no detectable WCAG A/AA accessibility violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    expect(result.violations).toEqual([])
  })
})
