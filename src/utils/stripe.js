import Stripe from "stripe"
import "dotenv/config"

let stripeInstance

/** Lazily create the Stripe client so the server boots without a key. */
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY

  if (!key) {
    const error = new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment."
    )
    error.status = 503
    throw error
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(key)
  }

  return stripeInstance
}

/**
 * The webhook needs the raw request body for signature verification, so it
 * is read before any JSON parser runs.
 */
export function stripeWebhookRawBody(req, res, buffer) {
  if (req.originalUrl === "/api/payments/webhook") {
    req.rawBody = buffer
  }
}
