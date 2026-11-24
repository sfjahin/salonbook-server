import { asObjectIdOrNull, plainId } from "./ids.js"

/**
 * Adds the service and customer details an appointment list needs, without
 * duplicating that data inside the appointment document.
 */
export async function decorateAppointments(rows, { services, users }) {
  if (rows.length === 0) return []

  const serviceIds = [
    ...new Set(
      rows
        .map((row) => asObjectIdOrNull(row.serviceId))
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ].map(asObjectIdOrNull)

  const customerIds = [
    ...new Set(
      rows
        .map((row) => asObjectIdOrNull(row.customerId))
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ].map(asObjectIdOrNull)

  const [serviceDocs, userDocs] = await Promise.all([
    serviceIds.length
      ? services.find({ _id: { $in: serviceIds } }).toArray()
      : [],
    customerIds.length
      ? users
          .find({ _id: { $in: customerIds } })
          .project({ name: 1, email: 1, phone: 1, image: 1, banned: 1 })
          .toArray()
      : [],
  ])

  const serviceMap = new Map(
    serviceDocs.map((doc) => [String(doc._id), doc])
  )
  const userMap = new Map(userDocs.map((doc) => [String(doc._id), doc]))

  return rows.map((row) => {
    const service = serviceMap.get(String(row.serviceId))
    const customer = userMap.get(String(row.customerId))

    return {
      ...row,
      id: plainId(row._id),
      serviceId: plainId(row.serviceId),
      customerId: plainId(row.customerId),
      service: service
        ? {
            id: String(service._id),
            serviceName: service.serviceName,
            category: service.category,
            image: service.image,
            price: service.price,
            duration: service.duration,
            status: service.status,
          }
        : null,
      customer: customer
        ? {
            id: String(customer._id),
            name: customer.name,
            email: customer.email,
            phone: customer.phone ?? null,
            image: customer.image ?? null,
            blocked: Boolean(customer.banned),
          }
        : null,
    }
  })
}
