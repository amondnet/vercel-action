import { describe, expect, it } from 'vitest'

describe('emulate.dev smoke test', () => {
  it('should have Vercel emulator URL set', () => {
    expect(process.env.EMULATE_VERCEL_URL).toBeDefined()
    expect(process.env.EMULATE_VERCEL_URL).toContain('localhost')
  })

  it('should have GitHub emulator URL set', () => {
    expect(process.env.EMULATE_GITHUB_URL).toBeDefined()
    expect(process.env.EMULATE_GITHUB_URL).toContain('localhost')
  })

  it('should reach Vercel emulator', async () => {
    const res = await fetch(`${process.env.EMULATE_VERCEL_URL}/v2/user`, {
      headers: { Authorization: 'Bearer test-token' },
    })
    expect(res.status).toBeLessThan(500)
  })

  it('should reach GitHub emulator', async () => {
    const res = await fetch(`${process.env.EMULATE_GITHUB_URL}/user`)
    expect(res.status).toBeLessThan(500)
  })
})
