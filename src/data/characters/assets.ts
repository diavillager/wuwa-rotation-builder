/** RIFF/WebP 표식과 실제 이미지 디코딩을 모두 확인한다. */
export async function verifyWebPAsset(url: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`이미지 요청 실패: HTTP ${response.status}`)
  if (
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'image/webp'
  )
    throw new Error('이미지 Content-Type이 image/webp가 아닙니다.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (
    bytes.length < 12 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  )
    throw new Error('WebP 파일 표식이 유효하지 않습니다.')
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
  try {
    const image = new Image()
    image.src = blobUrl
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error('이미지 크기가 유효하지 않습니다.')
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
