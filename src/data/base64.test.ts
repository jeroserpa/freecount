import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from './base64'

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 without padding', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3])
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255])
  })
  it('decodes a 65-byte VAPID public key', () => {
    const key = 'BPPB0-cVGlYoWIkuGlUU2B7oX0WkUrrltZeVXbMrF7LSi0uGFGRGA9lsGqh6SjETh1DwJXuZs_QUKOVNfM6qJ-0'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4) // uncompressed EC point
  })
})
