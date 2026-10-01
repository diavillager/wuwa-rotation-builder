import { assertWebPContainer } from './webp'

/** 한 자산의 응답이나 디코딩 지연이 앱 시작을 무한히 막지 않게 한다. */
export async function verifyWebPAsset(
  url: string,
  timeoutMs = 15_000,
): Promise<void> {
  const controller = new AbortController()
  let blobUrl: string | undefined
  let image: HTMLImageElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('이미지 검증 시간 초과'))
      controller.abort()
    }, timeoutMs)
  })
  const verify = async () => {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok)
      throw new Error(`이미지 요청 실패: HTTP ${response.status}`)
    if (
      response.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'image/webp'
    )
      throw new Error('이미지 Content-Type이 image/webp가 아닙니다.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    controller.signal.throwIfAborted()
    assertWebPContainer(bytes)
    blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
    image = new Image()
    image.src = blobUrl
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error('이미지 크기가 유효하지 않습니다.')
  }
  try {
    await Promise.race([verify(), timeout])
  } finally {
    clearTimeout(timer)
    if (image) image.src = ''
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }
}
