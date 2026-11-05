import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AppError } from '../lib/errors'

export type VideoScene = { heading: string; visual: string }

const frameRate = 24
const minDurationSeconds = 5 * 60
const maxDurationSeconds = 10 * 60

export function wavFromPcm(data: Buffer, mimeType: string) {
  if (data.subarray(0, 4).toString() === 'RIFF') return data
  const sampleRate = Number(mimeType.match(/rate=(\d+)/i)?.[1] ?? 24000)
  const channels = Number(mimeType.match(/channels=(\d+)/i)?.[1] ?? 1)
  const bitsPerSample = 16
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(channels * bitsPerSample / 8, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

function audioDurationSeconds(wav: Buffer) {
  const sampleRate = wav.readUInt32LE(24)
  const byteRate = wav.readUInt32LE(28)
  const dataLength = wav.readUInt32LE(40)
  if (!sampleRate || !byteRate || dataLength === 0) {
    throw new AppError(502, 'INVALID_AUDIO', 'La narración generada no tiene un formato de audio válido.')
  }
  return dataLength / byteRate
}

function wrapText(value: string, width: number) {
  return value
    .split(/\r?\n/)
    .flatMap((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean)
      const lines: string[] = []
      let line = ''
      for (const word of words) {
        if (line && `${line} ${word}`.length > width) {
          lines.push(line)
          line = word
        } else {
          line = line ? `${line} ${word}` : word
        }
      }
      if (line) lines.push(line)
      return [...lines, '']
    })
    .slice(0, 15)
    .join('\n')
    .trim()
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function defaultFontPath() {
  if (process.platform === 'win32') return 'C:\\Windows\\Fonts\\arial.ttf'
  if (process.platform === 'darwin') return '/System/Library/Fonts/Supplemental/Arial.ttf'
  return '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
}

async function runFFmpeg(args: string[], cwd: string) {
  const executable = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  await new Promise<void>((resolve, reject) => {
    const processHandle = spawn(executable, args, { cwd, windowsHide: true })
    let stderr = ''
    processHandle.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000)
    })
    processHandle.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new AppError(503, 'VIDEO_RENDERER_NOT_CONFIGURED', 'Instala FFmpeg en el servidor y configura FFMPEG_PATH para habilitar videos.'))
        return
      }
      reject(error)
    })
    processHandle.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      console.error('FFmpeg no pudo ensamblar el video', stderr)
      reject(new AppError(502, 'VIDEO_RENDER_FAILED', 'No se pudo ensamblar el video. Inténtalo de nuevo más tarde.'))
    })
  })
}

export async function renderNarratedVideo(input: {
  title: string
  scenes: VideoScene[]
  audio: Buffer
  audioMimeType: string
}) {
  const wav = wavFromPcm(input.audio, input.audioMimeType)
  const sourceDuration = audioDurationSeconds(wav)
  if (sourceDuration < 150 || sourceDuration > maxDurationSeconds * 2) {
    throw new AppError(422, 'VIDEO_SCRIPT_LENGTH', 'La narración debe durar entre 5 y 10 minutos. Intenta generar una explicación más breve o extensa.')
  }
  const duration = Math.min(maxDurationSeconds, Math.max(minDurationSeconds, sourceDuration))
  const tempo = sourceDuration / duration
  const fontPath = process.env.VIDEO_FONT_PATH?.trim() || defaultFontPath()
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aischool-video-'))
  try {
    await writeFile(path.join(directory, 'narration.wav'), wav)
    const textFiles = await Promise.all(input.scenes.map(async (scene, index) => {
      const name = `scene-${index}.txt`
      const text = `${scene.heading}\n\n${scene.visual}`.slice(0, 1200)
      await writeFile(path.join(directory, name), wrapText(text, 42), 'utf8')
      return name
    }))
    await writeFile(path.join(directory, 'title.txt'), wrapText(input.title, 60), 'utf8')
    const filters = [
      'drawbox=x=72:y=64:w=1136:h=592:color=0xFFFFFF:t=fill',
      'drawbox=x=72:y=64:w=1136:h=14:color=0x3498DB:t=fill',
      `drawtext=fontfile='${escapeFilterPath(fontPath)}':textfile=title.txt:fontcolor=0x3498DB:fontsize=28:x=100:y=110:expansion=none`,
      ...textFiles.map((name, index) => {
        const start = duration * index / textFiles.length
        const end = duration * (index + 1) / textFiles.length
        return `drawtext=fontfile='${escapeFilterPath(fontPath)}':textfile=${name}:fontcolor=0x2C3E50:fontsize=42:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:expansion=none:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`
      }),
    ].join(',')
    await runFFmpeg([
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=0xECF0F1:s=1280x720:r=${frameRate}:d=${duration.toFixed(2)}`,
      '-i', 'narration.wav',
      '-vf', filters,
      '-af', `atempo=${tempo.toFixed(5)}`,
      '-t', duration.toFixed(2),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      'lesson.mp4',
    ], directory)
    return {
      buffer: await readFile(path.join(directory, 'lesson.mp4')),
      durationSeconds: Math.round(duration),
      mimeType: 'video/mp4',
      title: input.title,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
