const MAX_WIDTH = 320
const JPEG_QUALITY = 0.82

export function compressCanvas(canvas: HTMLCanvasElement): string {
  const scale = Math.min(1, MAX_WIDTH / canvas.width)
  const w = Math.round(canvas.width * scale)
  const h = Math.round(canvas.height * scale)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(canvas, 0, 0, w, h)
  return out.toDataURL('image/jpeg', JPEG_QUALITY)
}

export function compressDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_WIDTH / img.naturalWidth)
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const out = document.createElement('canvas')
      out.width = w
      out.height = h
      out.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(out.toDataURL('image/jpeg', JPEG_QUALITY))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
