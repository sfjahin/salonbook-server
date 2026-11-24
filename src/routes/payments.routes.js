import { Router } from "express"

import { collections } from "../config/db.js"
import { requireAuth, requireCustomer } from "../middleware/auth.js"
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFoundError,
} from "../middleware/error.js"
import { asObjectIdOrNull } from "../utils/ids.js"
import { getStripe } from "../utils/stripe.js"

const router = Router()

function clientUrl() {
  return (
    process.env.CLIENT_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  )
}

/**
 * POST /api/payments/checkout
 * Creates a Stripe Checkout session for a confirmed, unpaid appointment.
 */
router.post(
  "/checkout",
  requireAuth,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { appointments, services, transactions } = await collections()

    const _id = asObjectIdOrNull(req.body?.appointmentId)
    if (!_id) throw badRequest("Please choose an appointment to pay for.")

    const appointment = await appointments.findOne({ _id })
    if (!appointment) throw notFoundError("We could not find that appointment.")

    if (String(appointment.customerId) !== req.user.id) {
      throw forbidden("You can only pay for your own appointments.")
    }
    if (appointment.status !== "confirmed") {
      throw badRequest(
        "Only confirmed appointments can be paid for. Please wait for the salon to confirm."
      )
    }
    if (appointment.paymentStatus === "paid") {
      throw badRequest("This appointment has already been paid.")
    }

    const alreadyPaid = await transactions.findOne({
      appointmentId: _id,
      status: "paid",
    })
    if (alreadyPaid) {
      throw badRequest("This appointment has already been paid.")
    }

    const service = await services.findOne({ _id: appointment.serviceId })
    const serviceName = service?.serviceName ?? "SalonBook service"
    const amount = Math.round(Number(appointment.servicePrice) * 100)

    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest("This appointment has an invalid price.")
    }

    const stripe = getStripe()
    const baseUrl = clientUrl()

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: req.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: {
              name: serviceName,
              description: `${appointment.appointmentDate} at ${appointment.timeSlot}`,
            },
          },
        },
      ],
      metadata: {
        appointmentId: String(_id),
        customerId: req.user.id,
      },
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`,
    })

    res.json({
      success: true,
      url: session.url,
      sessionId: session.id,
    })
  })
)

/**
 * POST /api/payments/webhook
 * The only place payment status is flipped to "paid": the signature is
 * verified against STRIPE_WEBHOOK_SECRET first.
 *
 * The raw body is captured in index.js before any JSON parser runs, so the
 * exact bytes Stripe signed are available here.
 */
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET

    if (!secret) {
      return res.status(503).json({
        success: false,
        message: "Stripe webhook is not configured.",
      })
    }

    const stripe = getStripe()
    const signature = req.headers["stripe-signature"]
    const rawBody = req.rawBody ?? req.body

    let event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Webhook signature verification failed: ${error.message}`,
      })
    }

    if (event.type === "checkout.session.completed") {
      await handleSuccessfulPayment(event.data.object)
    }

    if (event.type === "checkout.session.expired") {
      await handleFailedPayment(event.data.object)
    }

    res.json({ received: true })
  })
)

/** Marks the appointment paid and stores the transaction, idempotently. */
async function handleSuccessfulPayment(session) {
  const { appointments, transactions } = await collections()

  const existing = await transactions.findOne({
    stripeSessionId: session.id,
  })
  if (existing) return

  const _id = asObjectIdOrNull(session.metadata?.appointmentId)
  if (!_id) return

  const appointment = await appointments.findOne({ _id })
  if (!appointment) return

  if (appointment.paymentStatus !== "paid") {
    await appointments.updateOne(
      { _id },
      { $set: { paymentStatus: "paid", updatedAt: new Date() } }
    )
  }

  await transactions.insertOne({
    appointmentId: _id,
    customerId: appointment.customerId,
    amount: Number(session.amount_total ?? 0) / 100,
    currency: session.currency ?? "usd",
    stripeSessionId: session.id,
    status: "paid",
    createdAt: new Date(),
  })
}

/** Records a checkout that expired or was abandoned as a failed payment. */
async function handleFailedPayment(session) {
  const { appointments, transactions } = await collections()

  const existing = await transactions.findOne({
    stripeSessionId: session.id,
  })
  if (existing) return

  const _id = asObjectIdOrNull(session.metadata?.appointmentId)
  const appointment = _id ? await appointments.findOne({ _id }) : null
  if (!appointment) return

  await transactions.insertOne({
    appointmentId: _id,
    customerId: appointment.customerId,
    amount: Number(session.amount_total ?? 0) / 100,
    currency: session.currency ?? "usd",
    stripeSessionId: session.id,
    status: "failed",
    createdAt: new Date(),
  })
}

export default router
