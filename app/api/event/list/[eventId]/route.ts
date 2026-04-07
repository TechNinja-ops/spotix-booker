/**
 * app/api/event/list/[eventId]/route.ts
 *
 * GET    /api/event/list/[eventId]
 *   → Returns full event detail: eventData, attendees, discounts, payouts,
 *     chart data, bookerBVT, and weather forecast.
 *
 * PATCH  /api/event/list/[eventId]
 *   Body { action: "edit", ...editFields }      → Update core event fields
 *   Body { action: "toggleDiscount", code }     → Flip discount active flag
 *
 * POST   /api/event/list/[eventId]
 *   Body { action: "addDiscount", ...discount } → Add a new discount code
 *
 * All handlers:
 *   - Auth via spotix_at httpOnly cookie
 *   - Ownership enforced: authenticated user must be the event organizer
 *   - Admin SDK only — no client SDK
 *
 * Flat Firestore structure:
 *   events/{eventId}
 *   events/{eventId}/attendees
 *   events/{eventId}/discounts
 *   events/{eventId}/payouts
 *   users/{organizerId}
 *   forecasts/{eventId}
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}

function fail(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message, developer: DEV_TAG },
    { status }
  )
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function authenticate(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return fail("No access token", 401)
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return fail("Invalid or expired access token", 401)
  }
}

// ─── Ownership guard ──────────────────────────────────────────────────────────
// Returns the event snapshot if the user owns it, or a fail response.
async function resolveOwnedEvent(
  eventId: string,
  userId: string
): Promise<
  | { snap: FirebaseFirestore.DocumentSnapshot; ref: FirebaseFirestore.DocumentReference }
  | NextResponse
> {
  const ref = adminDb.collection("events").doc(eventId)
  const snap = await ref.get()
  if (!snap.exists) return fail("Event not found", 404)
  if (snap.data()!.organizerId !== userId) return fail("Forbidden: you do not own this event", 403)
  return { snap, ref }
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────
function tsToDateString(ts: FirebaseFirestore.Timestamp | null | undefined): string {
  if (!ts) return "Unknown"
  try { return ts.toDate().toLocaleDateString() } catch { return "Unknown" }
}

function tsToTimeString(ts: FirebaseFirestore.Timestamp | null | undefined): string {
  if (!ts) return ""
  try { return ts.toDate().toLocaleTimeString() } catch { return "" }
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { snap: eventSnap, ref: eventRef } = owned
  const ev = eventSnap.data()!

  // ── Fetch user doc (bookerBVT) ─────────────────────────────────────────────
  let bookerBVT = ""
  try {
    const userSnap = await adminDb.collection("users").doc(userId).get()
    if (userSnap.exists) bookerBVT = userSnap.data()?.bvt ?? ""
  } catch (e) {
    console.error("[GET eventId] user fetch failed", e)
  }

  // ── Subcollections in parallel ─────────────────────────────────────────────
  const [attendeesSnap, discountsSnap, payoutsSnap] = await Promise.all([
    eventRef.collection("attendees").get(),
    eventRef.collection("discounts").get(),
    eventRef.collection("payouts").orderBy("createdAt", "desc").get(),
  ])

  // ── Shape attendees ────────────────────────────────────────────────────────
  const attendees = attendeesSnap.docs.map((d) => {
    const a = d.data()
    return {
      id: d.id,
      fullName: a.fullName ?? "Unknown",
      email: a.email ?? "no-email@example.com",
      ticketType: a.ticketType ?? "Standard",
      verified: a.verified ?? false,
      purchaseDate: tsToDateString(a.purchaseDate),
      purchaseTime: a.purchaseTime ?? tsToTimeString(a.purchaseDate),
      ticketReference: a.ticketReference ?? "Unknown",
    }
  })

  // ── Shape discounts ────────────────────────────────────────────────────────
  const discounts = discountsSnap.docs.map((d) => {
    const dc = d.data()
    return {
      id: d.id, // included so toggle can target the doc without a re-scan
      code: dc.code ?? "",
      type: dc.type ?? "percentage",
      value: dc.value ?? 0,
      maxUses: dc.maxUses ?? 1,
      usedCount: dc.usedCount ?? 0,
      active: dc.active !== false,
    }
  })

  // ── Shape payouts ──────────────────────────────────────────────────────────
  let calculatedTotalPaidOut = 0
  const payouts = payoutsSnap.docs.map((d) => {
    const p = d.data()
    const payoutAmount = p.payoutAmount ?? 0
    if (p.status === "Confirmed") calculatedTotalPaidOut += payoutAmount
    return {
      id: d.id,
      date: tsToDateString(p.createdAt),
      amount: payoutAmount,
      status: p.status ?? "Pending",
      actionCode: p.actionCode ?? "",
      reference: p.reference ?? "",
      payoutAmount,
      payableAmount: p.payableAmount ?? 0,
      agentName: p.agentName ?? "",
      transactionTime: p.transactionTime ?? tsToTimeString(p.createdAt),
    }
  })

  // ── Financial figures ──────────────────────────────────────────────────────
  // Calculate totalRevenue from ticketPrices and ticket sales if not stored
  let calculatedRevenue = 0
  if (attendees.length > 0 && ev.ticketPrices && ev.ticketPrices.length > 0) {
    for (const attendee of attendees) {
      const ticketType = ev.ticketPrices.find((t: any) => t.policy === attendee.ticketType)
      if (ticketType) {
        calculatedRevenue += Number(ticketType.price)
      }
    }
  }
  
  const totalRevenue = ev.totalRevenue ?? ev.revenue ?? calculatedRevenue ?? 0
  const totalPaidOut = ev.totalPaidOut ?? calculatedTotalPaidOut
  const availableRevenue = ev.availableRevenue ?? (totalRevenue - totalPaidOut)

  // ── Shape event data ───────────────────────────────────────────────────────
  const eventDate: Date = ev.eventDate?.toDate?.() ?? new Date(ev.eventDate)

  const eventData = {
    id: eventSnap.id,
    eventName: ev.eventName ?? "",
    eventImage: ev.eventImage ?? "/placeholder.svg",
    eventImages: ev.eventImages ?? [],
    eventDate: eventDate.toISOString(),
    eventType: ev.eventType ?? "",
    eventDescription: ev.eventDescription ?? "",
    isFree: ev.isFree ?? false,
    ticketPrices: ev.ticketPrices ?? [],
    createdBy: ev.organizerId ?? userId,
    eventVenue: ev.eventVenue ?? "",
    totalCapacity: ev.enableMaxSize ? parseInt(ev.maxSize, 10) : 100,
    ticketsSold: ev.ticketsSold ?? 0,
    totalRevenue,
    eventEndDate: ev.eventEndDate ?? "",
    eventStart: ev.eventStart ?? "",
    eventEnd: ev.eventEnd ?? "",
    enableMaxSize: ev.enableMaxSize ?? false,
    maxSize: ev.maxSize ?? "",
    enableColorCode: ev.enableColorCode ?? false,
    colorCode: ev.colorCode ?? "",
    enableStopDate: ev.enableStopDate ?? ev.hasStopDate ?? false,
    stopDate: ev.stopDate
      ? (ev.stopDate.toDate?.() ?? new Date(ev.stopDate)).toISOString()
      : "",
    payId: ev.payId ?? "",
    availableRevenue,
    totalPaidOut,
    status: ev.status ?? "active",
    enabledCollaboration: ev.enabledCollaboration ?? false,
  }

  // ── Chart data ─────────────────────────────────────────────────────────────
  // Build sales by day chart with actual purchase timestamps
  const salesByDayMap: Record<string, { count: number; revenue: number }> = {}
  for (const doc of attendeesSnap.docs) {
    const a = doc.data()
    const purchaseDate = a.purchaseDate?.toDate?.() ?? new Date(a.purchaseDate)
    
    if (purchaseDate) {
      const dateStr = purchaseDate.toLocaleDateString("en-US", { 
        year: "numeric", 
        month: "short", 
        day: "numeric" 
      })
      
      const ticketType = ev.ticketPrices?.find((t: any) => t.policy === a.ticketType)
      const price = Number(ticketType?.price ?? 0)
      
      if (!salesByDayMap[dateStr]) {
        salesByDayMap[dateStr] = { count: 0, revenue: 0 }
      }
      salesByDayMap[dateStr].count += 1
      salesByDayMap[dateStr].revenue += price
    }
  }
  
  const ticketSalesByDay = Object.entries(salesByDayMap)
    .map(([date, data]) => ({ date, count: data.count, revenue: data.revenue }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Build sales by type chart
  const salesByTypeMap: Record<string, { count: number; revenue: number }> = {}
  for (const doc of attendeesSnap.docs) {
    const a = doc.data()
    const ticketType = a.ticketType ?? "Standard"
    const price = ev.ticketPrices?.find((t: any) => t.policy === ticketType)?.price ?? 0
    
    if (!salesByTypeMap[ticketType]) {
      salesByTypeMap[ticketType] = { count: 0, revenue: 0 }
    }
    salesByTypeMap[ticketType].count += 1
    salesByTypeMap[ticketType].revenue += Number(price)
  }
  
  const ticketSalesByType = Object.entries(salesByTypeMap).map(([type, data]) => ({ 
    type, 
    count: data.count, 
    revenue: data.revenue 
  }))

  // ── Weather forecast ───────────────────────────────────────────────────────
  let forecast: object | null = null
  try {
    const forecastSnap = await adminDb.collection("forecasts").doc(eventId).get()
    if (forecastSnap.exists) {
      const f = forecastSnap.data()!
      if (f.status !== "pending" && f.weather) {
        forecast = {
          status: f.status,
          fetchedAt: f.fetchedAt
            ? (f.fetchedAt.toDate?.() ?? new Date(f.fetchedAt)).toISOString()
            : null,
          eventDate: f.eventDate ?? null,
          eventLocation: f.eventLocation ?? null,
          weather: f.weather,
          summary: f.summary ?? null,
        }
      } else {
        forecast = {
          status: f.status ?? "pending",
          fetchedAt: null,
          weather: null,
          summary: null,
          eventLocation: f.eventLocation ?? null,
          eventDate: f.eventDate ?? null,
        }
      }
    }
  } catch (e) {
    console.error("[GET eventId] forecast fetch failed", e)
  }

  return ok({
    eventData,
    bookerBVT,
    attendees,
    discounts,
    payouts,
    ticketSalesByDay,
    ticketSalesByType,
    ticketTypeData: ticketSalesByType,
    availableBalance: availableRevenue,
    totalPaidOut,
    forecast,
  })
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
// action: "edit"           → update core event fields
// action: "toggleDiscount" → flip active flag on a discount doc by code
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { action } = body
  if (!action) return fail("action is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  // ── action: edit ──────────────────────────────────────────────────────────
  if (action === "edit") {
    const {
      eventName, eventDescription, eventDate, eventEndDate,
      eventVenue, eventStart, eventEnd, eventType,
      enablePricing, ticketPrices,
      enableStopDate, stopDate,
      enableColorCode, colorCode,
      enableMaxSize, maxSize,
    } = body

    if (!eventName?.trim())       return fail("eventName is required", 400)
    if (!eventDescription?.trim()) return fail("eventDescription is required", 400)
    if (!eventDate?.trim())       return fail("eventDate is required", 400)
    if (!eventVenue?.trim())      return fail("eventVenue is required", 400)
    if (!eventStart?.trim() || !eventEnd?.trim() || !eventEndDate?.trim()) {
      return fail("eventStart, eventEnd, and eventEndDate are required", 400)
    }
    if (!eventType?.trim()) return fail("eventType is required", 400)

    const updateData: Record<string, any> = {
      eventName: eventName.trim(),
      eventDescription: eventDescription.trim(),
      eventDate,
      eventEndDate,
      eventVenue: eventVenue.trim(),
      eventStart,
      eventEnd,
      eventType,
      isFree: !enablePricing,
      ticketPrices: enablePricing ? (ticketPrices ?? []) : [],
      enableStopDate: !!enableStopDate,
      stopDate: enableStopDate && stopDate ? new Date(stopDate) : null,
      enableColorCode: !!enableColorCode,
      colorCode: enableColorCode ? (colorCode ?? null) : null,
      enableMaxSize: !!enableMaxSize,
      maxSize: enableMaxSize ? (maxSize ?? null) : null,
      updatedAt: FieldValue.serverTimestamp(),
    }

    try {
      await eventRef.update(updateData)
      return ok({ message: "Event updated successfully" })
    } catch (e: any) {
      console.error("[PATCH edit] Firestore update failed", e)
      return fail("Failed to update event", 500)
    }
  }

  // ── action: toggleDiscount ────────────────────────────────────────────────
  if (action === "toggleDiscount") {
    const { discountId } = body
    if (!discountId) return fail("discountId is required", 400)

    const discountRef = eventRef.collection("discounts").doc(discountId)
    const discountSnap = await discountRef.get()

    if (!discountSnap.exists) return fail("Discount not found", 404)

    const currentActive = discountSnap.data()!.active !== false
    try {
      await discountRef.update({ active: !currentActive })
      return ok({ message: "Discount status updated", active: !currentActive })
    } catch (e: any) {
      console.error("[PATCH toggleDiscount] failed", e)
      return fail("Failed to update discount", 500)
    }
  }

  return fail(`Unknown action: ${action}`, 400)
}

// ─── POST ─────────────────────────────────────────────────────────────────────
// action: "addDiscount" → create a new discount doc
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { action } = body
  if (action !== "addDiscount") return fail(`Unknown action: ${action}`, 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  const { code, type, value, maxUses, usedCount, active } = body

  if (!code?.trim()) return fail("code is required", 400)
  if (!["percentage", "flat"].includes(type)) return fail("type must be 'percentage' or 'flat'", 400)
  if (typeof value !== "number" || value < 0) return fail("value must be a non-negative number", 400)

  // Check for duplicate code (case-insensitive)
  const existing = await eventRef
    .collection("discounts")
    .where("code", "==", code.trim().toUpperCase())
    .limit(1)
    .get()

  // Also check lowercase/mixed — normalise before comparing
  const existingAll = await eventRef.collection("discounts").get()
  const duplicate = existingAll.docs.some(
    (d) => d.data().code?.toLowerCase() === code.trim().toLowerCase()
  )
  if (duplicate) return fail("A discount with this code already exists", 409)

  const discountDoc = {
    code: code.trim(),
    type,
    value,
    maxUses: maxUses ?? 1,
    usedCount: usedCount ?? 0,
    active: active !== false,
    createdAt: FieldValue.serverTimestamp(),
  }

  try {
    const docRef = await eventRef.collection("discounts").add(discountDoc)
    return ok(
      {
        message: "Discount added successfully",
        discount: { id: docRef.id, ...discountDoc, createdAt: undefined },
      },
      201
    )
  } catch (e: any) {
    console.error("[POST addDiscount] failed", e)
    return fail("Failed to add discount", 500)
  }
}
