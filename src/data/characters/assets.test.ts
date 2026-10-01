import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyWebPAsset } from './assets'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const header = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])
function setup(
  bytes = header,
  type = 'image/webp',
  status = 200,
  decode = async () => {},
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(bytes, { headers: { 'content-type': type }, status }),
    ),
  )
  const revoke = vi.fn()
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:fixture',
    revokeObjectURL: revoke,
  })
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 32
      naturalHeight = 32
      decode = decode
    },
  )
  return revoke
}
describe('WebP 자산 검증', () => {
  it('응답이 끝나지 않아도 제한 시간에 실패하고 요청을 취소한다', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init) => {
        signal = init.signal
        return new Promise(() => {})
      }),
    )
    const checked = expect(
      verifyWebPAsset('/stalled.webp', 100),
    ).rejects.toThrow('시간 초과')
    await vi.advanceTimersByTimeAsync(100)
    await checked
    expect(signal?.aborted).toBe(true)
  })
  it('이미지 디코더가 끝나지 않아도 제한 시간에 실패하고 임시 URL을 해제한다', async () => {
    vi.useFakeTimers()
    const revoke = setup(header, 'image/webp', 200, () => new Promise(() => {}))
    const checked = expect(
      verifyWebPAsset('/stalled.webp', 100),
    ).rejects.toThrow('시간 초과')
    await vi.advanceTimersByTimeAsync(100)
    await checked
    expect(revoke).toHaveBeenCalledWith('blob:fixture')
  })
  it('HTTP·형식·디코딩을 모두 통과해야 성공하며 임시 URL을 해제한다', async () => {
    const decode = vi.fn(async () => {}),
      revoke = setup(header, 'image/webp; charset=binary', 200, decode)
    await verifyWebPAsset('/local.webp')
    expect(decode).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:fixture')
  })
  it.each([
    [header, 'image/webp', 404],
    [header, 'text/html', 200],
    [new Uint8Array([1, 2, 3]), 'image/webp', 200],
  ])(
    '잘못된 HTTP·Content-Type·파일을 거부한다',
    async (bytes, type, status) => {
      setup(bytes, type, status)
      await expect(verifyWebPAsset('/local.webp')).rejects.toThrow()
    },
  )
  it('WebP 헤더가 있어도 디코딩 실패 시 거부하고 임시 URL을 해제한다', async () => {
    const revoke = setup(header, 'image/webp', 200, async () => {
      throw new Error('손상 이미지')
    })
    await expect(verifyWebPAsset('/local.webp')).rejects.toThrow('손상 이미지')
    expect(revoke).toHaveBeenCalledOnce()
  })
})
