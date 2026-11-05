import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import multer from 'multer'
import { env } from '../../env'
import { AppError } from '../../lib/errors'

const maxFileSize = 10 * 1024 * 1024
const uploadDirectory = path.resolve(process.cwd(), env.UPLOADS_DIR)

export const taskFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1 },
}).single('file')

const supportedTypes = new Map([
  ['application/pdf', (buffer: Buffer) => buffer.subarray(0, 5).toString() === '%PDF-'],
  ['image/jpeg', (buffer: Buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff],
  ['image/png', (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))],
  [
    'image/webp',
    (buffer: Buffer) =>
      buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
  ],
])

let s3: S3Client | null = null

function getS3Client() {
  if (!env.S3_BUCKET) {
    throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'El almacenamiento privado no está configurado')
  }
  if (!s3) {
    s3 = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } }
        : {}),
    })
  }
  return s3
}

export function validateTaskFile(file: Express.Multer.File) {
  const signatureMatches = supportedTypes.get(file.mimetype)?.(file.buffer) ?? false
  if (!signatureMatches) {
    throw new AppError(400, 'UNSUPPORTED_FILE', 'Adjunta un PDF o una imagen JPG, PNG o WebP válida')
  }
}

export function safeOriginalName(name: string) {
  return path
    .basename(name)
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .slice(0, 180) || 'archivo'
}

export async function savePrivateFile(file: Express.Multer.File) {
  const storageKey = `${crypto.randomUUID()}${extensionForMime(file.mimetype)}`
  if (env.STORAGE_PROVIDER === 's3') {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: storageKey,
        Body: file.buffer,
        ContentLength: file.size,
        ContentType: file.mimetype,
        CacheControl: 'private, no-store',
      }),
    )
    return storageKey
  }
  await writeLocalFile(storageKey, file.buffer)
  return storageKey
}

export async function saveGeneratedFile(buffer: Buffer, mimeType: string, extension: '.wav' | '.mp4') {
  const expectedMimeType = extension === '.wav' ? 'audio/wav' : 'video/mp4'
  if (mimeType !== expectedMimeType) {
    throw new AppError(400, 'UNSUPPORTED_FILE', 'Tipo de material generado no permitido')
  }
  const storageKey = `${crypto.randomUUID()}${extension}`
  if (env.STORAGE_PROVIDER === 's3') {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: mimeType,
        CacheControl: 'private, no-store',
      }),
    )
    return storageKey
  }
  await writeLocalFile(storageKey, buffer)
  return storageKey
}

export async function removeStoredObject(storageKey: string) {
  if (!/^[\da-f-]{36}\.(?:pdf|jpg|png|webp|wav|mp4)$/.test(storageKey)) {
    throw new AppError(400, 'INVALID_STORAGE_KEY', 'La clave del archivo no es válida')
  }
  if (env.STORAGE_PROVIDER === 's3') {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }),
    )
    return
  }
  await fs.rm(localFilePath(storageKey), { force: true })
}

export async function readPrivateFile(storageKey: string) {
  if (env.STORAGE_PROVIDER === 's3') {
    let output
    try {
      output = await getS3Client().send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }),
      )
    } catch (error) {
      if (error instanceof NoSuchKey) {
        throw new AppError(404, 'NOT_FOUND', 'El archivo ya no está disponible')
      }
      throw error
    }
    if (!output.Body) {
      throw new AppError(404, 'NOT_FOUND', 'El archivo ya no está disponible')
    }
    return Buffer.from(await output.Body.transformToByteArray())
  }
  try {
    return await fs.readFile(localFilePath(storageKey))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new AppError(404, 'NOT_FOUND', 'El archivo ya no está disponible')
    }
    throw error
  }
}

export async function removePrivateFile(storageKey: string) {
  if (env.STORAGE_PROVIDER === 's3') {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }),
    )
    return
  }
  await fs.rm(localFilePath(storageKey), { force: true })
}

export async function copyLocalPrivateFileToS3(storageKey: string, mimeType: string) {
  const buffer = await fs.readFile(localFilePath(storageKey))
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: mimeType,
      CacheControl: 'private, no-store',
    }),
  )
}

export async function removeLocalPrivateFile(storageKey: string) {
  await fs.rm(localFilePath(storageKey), { force: true })
}

async function writeLocalFile(storageKey: string, buffer: Buffer) {
  await fs.mkdir(uploadDirectory, { recursive: true })
  await fs.writeFile(localFilePath(storageKey), buffer, { flag: 'wx', mode: 0o600 })
}

function localFilePath(storageKey: string) {
  if (!/^[\da-f-]{36}\.(?:pdf|jpg|png|webp|wav|mp4)$/.test(storageKey)) {
    throw new AppError(404, 'NOT_FOUND', 'No encontramos el archivo')
  }
  return path.join(uploadDirectory, storageKey)
}

function extensionForMime(mimeType: string) {
  switch (mimeType) {
    case 'application/pdf':
      return '.pdf'
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    default:
      throw new AppError(400, 'UNSUPPORTED_FILE', 'Tipo de archivo no permitido')
  }
}
