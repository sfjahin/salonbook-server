import { Router } from "express"
import multer from "multer"

import { requireAuth } from "../middleware/auth.js"
import { asyncHandler, badRequest } from "../middleware/error.js"

const router = Router()

const MAX_SIZE = 8 * 1024 * 1024 // 8 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      return cb(badRequest("Please upload an image file."))
    }
    cb(null, true)
  },
})

function receiveImage(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (error) {
      error.status = 400
      error.message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Images must be smaller than 8 MB."
          : error.message
      return next(error)
    }
    next()
  })
}

/**
 * POST /api/upload
 * Sends an image to ImgBB and returns the hosted URL. The API key stays on
 * the server, so it is never exposed to the browser.
 */
router.post(
  "/",
  requireAuth,
  receiveImage,
  asyncHandler(async (req, res) => {
    const key = process.env.IMGBB_API_KEY

    if (!key) {
      return res.status(503).json({
        success: false,
        message: "Image uploads are not configured yet (IMGBB_API_KEY).",
      })
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Choose an image to upload." })
    }

    const form = new FormData()
    form.append("key", key)
    form.append(
      "image",
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname || "upload.jpg"
    )

    let data
    try {
      const response = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST",
        body: form,
      })
      data = await response.json()
    } catch {
      return res.status(502).json({
        success: false,
        message: "The image host could not be reached. Please try again.",
      })
    }

    if (!data?.success) {
      return res.status(502).json({
        success: false,
        message: data?.error?.message || "The image could not be uploaded.",
      })
    }

    return res.json({
      success: true,
      url: data.data.display_url,
      thumb: data.data.thumb?.url ?? data.data.display_url,
    })
  })
)

export default router
