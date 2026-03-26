import { describe, expect, it } from 'vitest'
import { vercelFetch, TEST_PROJECT, TEST_TEAM } from './helpers'

describe('vercel deployments API', () => {
  it('should create a deployment via POST /v13/deployments', async () => {
    const res = await vercelFetch(`/v13/deployments?slug=${TEST_TEAM}`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_PROJECT,
        target: 'preview',
        files: [
          {
            file: 'index.html',
            data: '<h1>Hello</h1>',
          },
        ],
      }),
    })

    expect(res.ok).toBe(true)

    const data = await res.json()
    expect(data.id).toBeDefined()
    expect(data.url).toBeDefined()
    expect(data.name).toBe(TEST_PROJECT)
  })

  it('should retrieve a deployment by ID via GET /v13/deployments/:id', async () => {
    const createRes = await vercelFetch(`/v13/deployments?slug=${TEST_TEAM}`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_PROJECT,
        target: 'preview',
        files: [{ file: 'index.html', data: '<h1>Hello</h1>' }],
      }),
    })
    const created = await createRes.json()

    const getRes = await vercelFetch(`/v13/deployments/${created.id}?slug=${TEST_TEAM}`)
    expect(getRes.ok).toBe(true)

    const retrieved = await getRes.json()
    expect(retrieved.id).toBe(created.id)
    expect(retrieved.url).toBe(created.url)
    expect(retrieved.name).toBe(TEST_PROJECT)
  })

  it('should list deployments via GET /v6/deployments', async () => {
    await vercelFetch(`/v13/deployments?slug=${TEST_TEAM}`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_PROJECT,
        target: 'preview',
        files: [{ file: 'index.html', data: '<h1>Hello</h1>' }],
      }),
    })

    const listRes = await vercelFetch(`/v6/deployments?slug=${TEST_TEAM}`)
    expect(listRes.ok).toBe(true)

    const data = await listRes.json()
    expect(data.deployments).toBeDefined()
    expect(data.deployments.length).toBeGreaterThan(0)

    const deployment = data.deployments[0]
    expect(deployment.name).toBe(TEST_PROJECT)
    expect(deployment.url).toBeDefined()
  })
})
