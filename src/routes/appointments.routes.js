import { Router } from "express"
import { ObjectId } from "mongodb"

import { collections } from "../config/db.js"
import { requireAdmin, requireAuth, requireCustomer } from "../middleware/auth.js"
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFoundError,
} from "../middleware/error.js"
import { decorateAppointments } from "../utils/decorate.js"
import { asObjectIdOrNull, plainId } from "../utils/ids.js"
import {
  APPOINTMENT_STATUSES,
  isValidDate,
  isValidSlot,
  todayIso,
} from "../utils/slots.js"

const router = Router()

function parseId(req) {
  const id = asObjectIdOrNull(req.params.id)
  if (!id) throw badRequest("That appointment id is not valid.")
  return id
}

async function findAppointment(req, cols) {
  const _id = parseId(req)
  const appointment = await cols.appointments.findOne({ _id })
  if (!appointment) throw notFoundError("We could not find that appointment.")
  return { _id, appointment }
}

/**
 * POST /api/appointments
 * Customers request an appointment; it starts as pending and unpaid.
 */
router.post(
  "/",
  requireAuth,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const cols = await collections()
    const { services, appointments, users } = cols

    const serviceId = asObjectIdOrNull(req.body?.serviceId)
    if (!serviceId) throw badRequest("Please choose a service.")

    const appointmentDate = String(req.body?.appointmentDate ?? "").trim()
    if (!isValidDate(appointmentDate)) {
      throw badRequest("Please choose a valid appointment date.")
    }
    if (appointmentDate < todayIso()) {
      throw badRequest("Appointments cannot be booked in the past.")
    }

    const timeSlot = String(req.body?.timeSlot ?? "").trim()
    if (!isValidSlot(timeSlot)) {
      throw badRequest("Please choose one of the available time slots.")
    }

    const message = String(req.body?.message ?? "").trim().slice(0, 500)

    const service = await services.findOne({ _id: serviceId })
    if (!service) throw notFoundError("We could not find that service.")

    if (service.status !== "active") {
      throw badRequest("This service is not available for booking right now.")
    }

    // One active booking per customer, per date and slot.
    const duplicate = await appointments.findOne({
      customerId: new ObjectId(req.user.id),
      appointmentDate,
      timeSlot,
      status: { $in: ["pending", "confirmed"] },
    })

    if (duplicate) {
      throw badRequest(
        `You already have an appointment on ${appointmentDate} at ${timeSlot}.`
      )
    }

    const now = new Date()
    const doc = {
      serviceId,
      customerId: new ObjectId(req.user.id),
      appointmentDate,
      timeSlot,
      message,
      servicePrice: service.price,
      status: "pending",
      paymentStatus: "unpaid",
      createdAt: now,
      updatedAt: now,
    }

    const result = await appointments.insertOne(doc)

    // Re-read through the decorator so the client gets a complete row.
    const [decorated] = await decorateAppointments(
      [{ ...doc, _id: result.insertedId }],
      { services, users }
    )

    res.status(201).json({
      success: true,
      message: "Your appointment request has been sent.",
      appointment: decorated,
    })
  })
)

/** GET /api/appointments/mine -- the signed-in customer's own requests. */
router.get(
  "/mine",
  requireAuth,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { appointments, services, users } = await collections()

    const rows = await appointments
      .find({ customerId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray()

    res.json({
      success: true,
      count: rows.length,
      appointments: await decorateAppointments(rows, { services, users }),
    })
  })
)

/** GET /api/appointments -- administrators see every request. */
router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { appointments, services, users } = await collections()

    const filter = {}
    if (
      typeof req.query.status === "string" &&
      APPOINTMENT_STATUSES.includes(req.query.status)
    ) {
      filter.status = req.query.status
    }

    const rows = await appointments
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray()

    res.json({
      success: true,
      count: rows.length,
      appointments: await decorateAppointments(rows, { services, users }),
    })
  })
)

/** GET /api/appointments/:id -- the owner or an administrator. */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cols = await collections()
    const { appointments, services, users } = cols
    const { appointment } = await findAppointment(req, cols)

    const isOwner = String(appointment.customerId) === req.user.id
    if (!isOwner && req.user.role !== "admin") {
      throw forbidden("You can only view your own appointments.")
    }

    const [decorated] = await decorateAppointments([appointment], {
      services,
      users,
    })

    res.json({ success: true, appointment: decorated })
  })
)

/**
 * PATCH /api/appointments/:id/status
 * Administrators confirm or cancel. Only pending requests can be confirmed.
 */
router.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const cols = await collections()
    const { appointments, services, users } = cols
    const { _id, appointment } = await findAppointment(req, cols)

    const status = String(req.body?.status ?? "")
    if (!APPOINTMENT_STATUSES.includes(status)) {
      throw badRequest("Unknown appointment status.")
    }

    if (status === "confirmed" && appointment.status !== "pending") {
      throw badRequest("Only pending appointments can be confirmed.")
    }

    if (status !== appointment.status) {
      await appointments.updateOne(
        { _id },
        { $set: { status, updatedAt: new Date() } }
      )
    }

    const [decorated] = await decorateAppointments(
      [{ ...appointment, status }],
      { services, users }
    )

    res.json({
      success: true,
      message:
        status === "confirmed"
          ? "Appointment confirmed."
          : status === "cancelled"
            ? "Appointment cancelled."
            : "Appointment updated.",
      appointment: decorated,
    })
  })
)

/** PATCH /api/appointments/:id/cancel -- customers cancel their own pending request. */
router.patch(
  "/:id/cancel",
  requireAuth,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const cols = await collections()
    const { appointments, services, users } = cols
    const { _id, appointment } = await findAppointment(req, cols)

    if (String(appointment.customerId) !== req.user.id) {
      throw forbidden("You can only cancel your own appointments.")
    }
    if (appointment.status !== "pending") {
      throw badRequest("Only pending appointments can be cancelled.")
    }
    if (appointment.paymentStatus === "paid") {
      throw badRequest(
        "This appointment is already paid. Please contact the salon."
      )
    }

    await appointments.updateOne(
      { _id },
      { $set: { status: "cancelled", updatedAt: new Date() } }
    )

    const [decorated] = await decorateAppointments(
      [{ ...appointment, status: "cancelled" }],
      { services, users }
    )

    res.json({
      success: true,
      message: "Your appointment has been cancelled.",
      appointment: decorated,
    })
  })
)

export default router
