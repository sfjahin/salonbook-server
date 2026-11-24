/** Predefined booking slots offered by the salon. */
export const TIME_SLOTS = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
  "06:00 PM",
]

export const APPOINTMENT_STATUSES = ["pending", "confirmed", "cancelled"]
export const PAYMENT_STATUSES = ["unpaid", "paid"]

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime())
}

/** Today's date in the server's local time, as YYYY-MM-DD. */
export function todayIso() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isValidSlot(slot) {
  return TIME_SLOTS.includes(slot)
}
