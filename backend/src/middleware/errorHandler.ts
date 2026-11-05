import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { AppError } from '../lib/errors'

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: 'Revisa los datos ingresados',
        fields: err.flatten().fieldErrors,
      },
    })
    return
  }

  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE'
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
        message: tooLarge
          ? 'El archivo supera el límite de 10 MB'
          : 'No pudimos procesar el archivo adjunto',
      },
    })
    return
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es válido' },
    })
    return
  }

  console.error(err)
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado' },
  })
}
