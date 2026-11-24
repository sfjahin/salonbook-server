import { Router } from "express"
import { ObjectId } from "mongodb"

import { collections } from "../config/db.js"
import { optionalAuth, requireAdmin, requireAuth } from "../middleware/auth.js"
import {
  asyncHandler,
  badRequest,
  notFoundError,
} from "../middleware/error.js"

const router = Router()

const SORTS = {
  "price-asc": { price: 1 },
  "price-desc": { price: -1 },
  newest: { createdAt: -1 },
  default: { createdAt: -1 },
}

function parseId(req) {
  const { id } = req.params
  if (!ObjectId.isValid(id)) {
    throw badRequest("That service id is not valid.")
  }
  return new ObjectId(id)
}

function normaliseService(body, existing = {}) {
  const serviceName = String(body.serviceName ?? existing.serviceName ?? "")
    .trim()
  const category = String(body.category ?? existing.category ?? "").trim()
  const description = String(
    body.description ?? existing.description ?? ""
  ).trim()
  const image = String(body.image ?? existing.image ?? "").trim()
  const price = Number(body.price ?? existing.price)
  const duration = Number(body.duration ?? existing.duration)
  const status = String(body.status ?? existing.status ?? "active")

  if (!serviceName) throw badRequest("Service name is required.")
  if (!category) throw badRequest("Service category is required.")
  if (!description) throw badRequest("Service description is required.")
  if (!image) throw badRequest("A service image is required.")
  if (!Number.isFinite(price) || price <= 0) {
    throw badRequest("Price must be a positive number.")
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw badRequest("Duration must be a positive number.")
  }
  if (!["active", "inactive"].includes(status)) {
    throw badRequest("Status must be active or inactive.")
  }

  return {
    serviceName,
    category,
    description,
    image,
    price: Math.round(price * 100) / 100,
    duration: Math.round(duration),
    status,
  }
}

/**
 * GET /api/services
 * Public catalogue with search, category filter and price sorting.
 * Only active services are returned unless an admin asks for everything.
 */
router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { services } = await collections()

    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    const category =
      typeof req.query.category === "string" ? req.query.category.trim() : ""
    const sortKey = typeof req.query.sort === "string" ? req.query.sort : ""
    const featured = req.query.featured === "true"
    const wantAll = req.query.all === "true" && req.user?.role === "admin"

    const filter = {}

    if (!wantAll) filter.status = "active"

    if (q) {
      filter.serviceName = { $regex: q, $options: "i" }
    }

    if (category && category !== "all") {
      filter.category = category
    }

    const sort = SORTS[sortKey] ?? SORTS.default

    let cursor = services.find(filter).sort(sort)
    if (featured) cursor = cursor.limit(6)

    const items = await cursor.toArray()

    res.json({
      success: true,
      count: items.length,
      services: items.map((item) => ({ ...item, id: String(item._id) })),
    })
  })
)

/** GET /api/services/categories — distinct categories of active services. */
router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const { services } = await collections()

    const rows = await services
      .aggregate([
        { $match: { status: "active" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray()

    const categories = rows.map((row) => ({
      label: row._id,
      value: row._id,
      count: row.count,
    }))

    res.json({ success: true, categories })
  })
)

/** GET /api/services/:id — a single service. */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { services } = await collections()
    const _id = parseId(req)

    const service = await services.findOne({ _id })
    if (!service) throw notFoundError("We could not find that service.")

    res.json({
      success: true,
      service: { ...service, id: String(service._id) },
    })
  })
)

/** POST /api/services — administrators only. */
router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { services } = await collections()
    const data = normaliseService(req.body)

    const now = new Date()
    const doc = { ...data, createdAt: now, updatedAt: now }

    const result = await services.insertOne(doc)

    res.status(201).json({
      success: true,
      message: "Service created.",
      service: { ...doc, _id: result.insertedId, id: String(result.insertedId) },
    })
  })
)

/** PUT /api/services/:id — administrators only. */
router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { services } = await collections()
    const _id = parseId(req)

    const existing = await services.findOne({ _id })
    if (!existing) throw notFoundError("We could not find that service.")

    const data = normaliseService(req.body, existing)
    const update = { ...data, updatedAt: new Date() }

    await services.updateOne({ _id }, { $set: update })

    res.json({
      success: true,
      message: "Service updated.",
      service: { ...existing, ...update, id: String(_id) },
    })
  })
)

/** PATCH /api/services/:id/status — activate or deactivate. */
router.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { services } = await collections()
    const _id = parseId(req)

    const status = String(req.body?.status ?? "")
    if (!["active", "inactive"].includes(status)) {
      throw badRequest("Status must be active or inactive.")
    }

    const existing = await services.findOne({ _id })
    if (!existing) throw notFoundError("We could not find that service.")

    await services.updateOne(
      { _id },
      { $set: { status, updatedAt: new Date() } }
    )

    res.json({
      success: true,
      message: status === "active" ? "Service activated." : "Service deactivated.",
      service: { ...existing, status, id: String(_id) },
    })
  })
)

/** DELETE /api/services/:id — administrators only. */
router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { services } = await collections()
    const _id = parseId(req)

    const existing = await services.findOne({ _id })
    if (!existing) throw notFoundError("We could not find that service.")

    await services.deleteOne({ _id })

    res.json({ success: true, message: "Service deleted." })
  })
)

export default router

