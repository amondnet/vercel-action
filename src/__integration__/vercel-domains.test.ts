import { describe, expect, it } from 'vitest'
import { vercelFetch, TEST_PROJECT, TEST_TEAM } from './helpers'

describe('vercel domains and aliases API', () => {
  it('should add a domain to a project via POST /v10/projects/:id/domains', async () => {
    const res = await vercelFetch(`/v10/projects/${TEST_PROJECT}/domains?slug=${TEST_TEAM}`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'preview.example.com',
      }),
    })

    expect(res.ok).toBe(true)

    const data = await res.json()
    expect(data.name).toBe('preview.example.com')
  })

  it('should list domains for a project via GET /v9/projects/:id/domains', async () => {
    await vercelFetch(`/v10/projects/${TEST_PROJECT}/domains?slug=${TEST_TEAM}`, {
      method: 'POST',
      body: JSON.stringify({ name: 'list-test.example.com' }),
    })

    const listRes = await vercelFetch(`/v9/projects/${TEST_PROJECT}/domains?slug=${TEST_TEAM}`)
    expect(listRes.ok).toBe(true)

    const data = await listRes.json()
    expect(data.domains).toBeDefined()
    expect(data.domains.length).toBeGreaterThan(0)

    const domain = data.domains.find((d: { name: string }) => d.name === 'list-test.example.com')
    expect(domain).toBeDefined()
  })

  it('should verify a domain via POST /v9/projects/:id/domains/:domain/verify', async () => {
    await vercelFetch(`/v10/projects/${TEST_PROJECT}/domains?slug=${TEST_TEAM}`, {
      method: 'POST',
      body: JSON.stringify({ name: 'verify-test.example.com' }),
    })

    const verifyRes = await vercelFetch(
      `/v9/projects/${TEST_PROJECT}/domains/verify-test.example.com/verify?slug=${TEST_TEAM}`,
      { method: 'POST' },
    )

    expect(verifyRes.ok).toBe(true)

    const data = await verifyRes.json()
    expect(data.name).toBe('verify-test.example.com')
  })
})
