import { Router } from "express"
import { ObjectId } from "mongodb"

import { collections } from "../config/db.js"
import { requireAdmin, requireAuth, requireCustomer } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/error.js"

const router = Router()

function sumAmounts(rows) {
  return Math.round(
    rows.reduce((total, row) => total + Number(row.amount || 0), 0) * 100
  ) / 100
}

/** GET /api/stats/admin -- numbers for the administrator overview. */
router.get(
  "/admin",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { users, services, appointments, transactions } = await collections()

    const [totalCustomers, totalUsers, activeServices, totalServices] =
      await Promise.all([
        users.countDocuments({ role: { $ne: "admin" } }),
        users.countDocuments({}),
        services.countDocuments({ status: "active" }),
        services.countDocuments({}),
      ])

    const [totalAppointments, pending, confirmed, cancelled, paidCount] =
      await Promise.all([
        appointments.countDocuments({}),
        appointments.countDocuments({ status: "pending" }),
        appointments.countDocuments({ status: "confirmed" }),
        appointments.countDocuments({ status: "cancelled" }),
        transactions.countDocuments({ status: "paid" }),
      ])

    const paidTransactions = await transactions
      .find({ status: "paid" })
      .project({ amount: 1 })
      .toArray()

    res.json({
      success: true,
      stats: {
        totalCustomers,
        totalUsers,
        totalActiveServices: activeServices,
        totalServices,
        totalAppointments,
        pendingAppointments: pending,
        confirmedAppointments: confirmed,
        cancelledAppointments: cancelled,
        successfulPayments: paidCount,
        totalRevenue: sumAmounts(paidTransactions),
      },
    })
  })
)

/** GET /api/stats/customer -- numbers for the customer overview. */
router.get(
  "/customer",
  requireAuth,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { appointments, transactions } = await collections()
    const customerId = new ObjectId(req.user.id)

    const [total, pending, confirmed, cancelled, paidCount, paidRows] =
      await Promise.all([
        appointments.countDocuments({ customerId }),
        appointments.countDocuments({ customerId, status: "pending" }),
        appointments.countDocuments({ customerId, status: "confirmed" }),
        appointments.countDocuments({ customerId, status: "cancelled" }),
        transactions.countDocuments({ customerId, status: "paid" }),
        transactions
          .find({ customerId, status: "paid" })
          .project({ amount: 1 })
          .toArray(),
      ])

    res.json({
      success: true,
      stats: {
        totalAppointments: total,
        pendingAppointments: pending,
        confirmedAppointments: confirmed,
        cancelledAppointments: cancelled,
        successfulPayments: paidCount,
        totalSpent: sumAmounts(paidRows),
      },
    })
  })
)

export default router
