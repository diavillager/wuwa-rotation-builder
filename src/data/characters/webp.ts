/** 확장자·Content-Type과 별도로 검사하며 실제 디코더 검증을 대체하지 않는다. */
export function assertWebPContainer(bytes: Uint8Array): void {
  if (
    bytes.length < 12 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  )
    throw new Error('WebP 파일 표식이 유효하지 않습니다.')
}
