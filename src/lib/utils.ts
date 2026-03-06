import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === "string" && error.trim()) return error
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

export function getAttachmentFilename(contentDisposition: string | null | undefined): string | null {
  if (!contentDisposition) return null

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].replace(/["']/g, '')).trim() || null
  }

  const basicMatch = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i)
  if (basicMatch?.[1]) {
    return basicMatch[1].trim() || null
  }

  return null
}

export function triggerBrowserDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
    anchor.remove()
  }, 1500)
}

export async function downloadResponseFile(response: Response, fallbackFilename: string) {
  const blob = await response.blob()
  const filename = getAttachmentFilename(response.headers.get('content-disposition')) || fallbackFilename
  triggerBrowserDownload(blob, filename)
}
