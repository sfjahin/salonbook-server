import { Router } from "express"

import { collections } from "../config/db.js"
import {
  requireAdmin,
  requireAuth,
  requireCustomer,
} from "../middleware/auth.js"
import { asyncHandler, forbidden, notFoundError } from "../middleware/error.js"
import { decorateAppointments } from "../utils/decorate.js"
import { asObjectIdOrNull, plainId } from "../utils/ids.js"

const router = Router()

/**
 * Attaches the related appointment (and therefore the service) plus the
 * customer that paid, so lists can render without extra round trips.
 */
async function decorateTransactions(rows, { appointments, services, users }) {
  if (rows.length === 0) return []

  const idsFrom = (value) =>
    [...new Set(rows.map((row) => asObjectIdOrNull(value(row))).filter(Boolean))]

  const appointmentIds = idsFrom((row) => row.appointmentId)
  const customerIds = idsFrom((row) => row.customerId)

  const [appointmentDocs, userDocs] = await Promise.all([
    appointmentIds.length
      ? appointments.find({ _id: { $in: appointmentIds } }).toArray()
      : [],
    customerIds.length
      ? users
          .find({ _id: { $in: customerIds } })
          .project({ name: 1, email: 1, image: 1, phone: 1 })
          .toArray()
      : [],
  ])

  const decoratedAppointments = await decorateAppointments(appointmentDocs, {
    services,
    users,
  })

  const appointmentMap = new Map(
    decoratedAppointments.map((item) => [String(item.id), item])
  )
  const userMap = new Map(userDocs.map((doc) => [String(doc._id), doc]))

  return rows.map((row) => {
    const appointment = appointmentMap.get(String(row.appointmentId)) ?? null
    const user = userMap.get(String(row.customerId))

    return {
      ...row,
      id: plainId(row._id),
      appointmentId: plainId(row.appointmentId),
      customerId: plainId(row.customerId),
      appointment,
      customer: appointment?.customer ??
        (user
          ? {
              id: String(user._id),
              name: user.name,
              email: user.email,
              image: user.image ?? null,
              phone: user.phone ?? null,
            }
          : null),
    }
  })
}

/** GET /api/transactions/mine -- the signed-in customer's payments. */
router.get(
  "/mine",
  requireAuth,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const cols = await collections()
    const customerId = asObjectIdOrNull(req.user.id) ?? req.user.id

    const rows = await cols.transactions
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray()

    res.json({
      success: true,
      count: rows.length,
      transactions: await decorateTransactions(rows, cols),
    })
  })
)

/** GET /api/transactions -- administrators only. */
router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const cols = await collections()

    const rows = await cols.transactions
      .find({})
      .sort({ createdAt: -1 })
      .toArray()

    res.json({
      success: true,
      count: rows.length,
      transactions: await decorateTransactions(rows, cols),
    })
  })
)

/** GET /api/transactions/:id -- owner or administrator. */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cols = await collections()

    const _id = asObjectIdOrNull(req.params.id)
    const row = _id ? await cols.transactions.findOne({ _id }) : null

    if (!row) throw notFoundError("We could not find that transaction.")

    if (String(row.customerId) !== req.user.id && req.user.role !== "admin") {
      throw forbidden("You can only view your own transactions.")
    }

    const [decorated] = await decorateTransactions([row], cols)

    res.json({ success: true, transaction: decorated })
  })
)

export default router
