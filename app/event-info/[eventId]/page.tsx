"use client"

import { useMemo } from "react"
import type React from "react"
import { use, useState, useEffect } from "react"
import Link from "next/link"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { eventCacheManager } from "@/lib/cache-manager"
// import { Nav } from "@/components/nav"
import OverviewTab from "@/components/event-info/overview-tab"
import AttendeesTab from "@/components/event-info/attendees-tab"
import DiscountsTab from "@/components/event-info/discounts-tab"
import PayoutsTab from "@/components/event-info/payouts-tab"
import EditEventTab from "@/components/event-info/edit-event-tab"
import MerchTab from "@/components/event-info/merch-tab"
import ReferralsTab from "@/components/event-info/referrals-tab"
import EventLinkTab from "@/components/event-info/event-link-tab"
import FormTab from "@/components/event-info/form-tab"
import ResponsesTab from "@/components/event-info/responses-tab"

// ─── Types ────────────────────────────────────────────────────────────────────
interface EventData {
  id: string
  eventName: string
  eventImage: string
  eventDate: string
  eventType: string
  eventDescription: string
  isFree: boolean
  ticketPrices: { policy: string; price: number }[]
  createdBy: string
  eventVenue: string
  totalCapacity: number
  ticketsSold: number
  totalRevenue: number
  eventEndDate: string
  eventStart: string
  eventEnd: string
  enableMaxSize: boolean
  maxSize: string
  enableColorCode: boolean
  colorCode: string
  enableStopDate: boolean
  stopDate: string
  payId?: string
  availableRevenue?: number
  totalPaidOut?: number
  status?: string
  enabledCollaboration?: boolean
}

interface AttendeeData {
  id: string
  fullName: string
  email: string
  ticketType: string
  verified: boolean
  purchaseDate: string
  purchaseTime: string
  ticketReference: string
}

interface PayoutData {
  id?: string
  date: string
  amount: number
  status: string
  actionCode?: string
  reference?: string
  payoutAmount?: number
  payableAmount?: number
  agentName?: string
  transactionTime?: string
}

interface DiscountData {
  id?: string
  code: string
  type: "percentage" | "flat"
  value: number
  maxUses: number
  usedCount: number
  active: boolean
}

interface ForecastData {
  status: "pending" | "ready" | string
  fetchedAt: string | null
  weather: object | null
  summary: string | null
  eventLocation?: { lat: number | null; lng: number | null; city: string } | null
  eventDate?: string | null
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 bg-slate-200 rounded-lg" />
      <div className="h-24 bg-slate-200 rounded-lg" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-slate-200 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ─── Weather forecast badge ───────────────────────────────────────────────────
function ForecastBadge({ forecast }: { forecast: ForecastData | null }) {
  if (!forecast) return null

  if (forecast.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
        Weather forecast pending — available 5 days before the event
      </span>
    )
  }

  if (forecast.status === "ready" && forecast.weather) {
    const w = forecast.weather as Record<string, any>
    const description: string = w.description ?? w.condition ?? ""
    const tempC: number | undefined = w.tempC ?? w.temp_c ?? w.temp
    const icon: string = w.icon ?? ""
    return (
      <span className="inline-flex items-center gap-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5">
        {icon && <img src={icon} alt="" className="w-5 h-5" />}
        {description && <span className="capitalize">{description}</span>}
        {tempC !== undefined && <span>{tempC}°C</span>}
        <span className="text-blue-400">· event day forecast</span>
      </span>
    )
  }

  return null
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EventInfoPage({
  params,
}: {
  params: Promise<{ userId: string; eventId: string }>
}) {
  const { userId, eventId } = use(params)

  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [refreshing, setRefreshing]       = useState(false)
  const [currentUser, setCurrentUser]     = useState<any>(null)
  const [eventData, setEventData]         = useState<EventData | null>(null)
  const [attendees, setAttendees]         = useState<AttendeeData[]>([])
  const [payouts, setPayouts]             = useState<PayoutData[]>([])
  const [discounts, setDiscounts]         = useState<DiscountData[]>([])
  const [bookerBVT, setBookerBVT]         = useState<string>("")
  const [ticketSalesByDay, setTicketSalesByDay] = useState<any[]>([])
  const [ticketSalesByType, setTicketSalesByType] = useState<any[]>([])
  const [availableBalance, setAvailableBalance] = useState<number>(0)
  const [totalPaidOut, setTotalPaidOut]   = useState<number>(0)
  const [forecast, setForecast]           = useState<ForecastData | null>(null)
  const [editFormData, setEditFormData]   = useState<any>(null)
  const [copiedField, setCopiedField]     = useState<string | null>(null)
  const [cacheInfo, setCacheInfo]         = useState<{ isCached: boolean; remainingTime: number | null }>({ isCached: false, remainingTime: null })
  const [activeTab, setActiveTab]         = useState<
    "overview" | "eventlink" | "attendees" | "payouts" | "edit" | "discounts" | "merch" | "referrals" | "form" | "responses"
  >("overview")
  const [loadedTabs, setLoadedTabs]       = useState<Set<string>>(new Set(["overview"]))
  const [newDiscount, setNewDiscount]     = useState<DiscountData>({
    code: "", type: "percentage", value: 0, maxUses: 1, usedCount: 0, active: true,
  })

  const ticketTypeData = useMemo(() => {
    if (!eventData || !attendees.length) return []
    const typeCount: Record<string, number> = {}
    attendees.forEach((a) => { typeCount[a.ticketType] = (typeCount[a.ticketType] || 0) + 1 })
    return Object.keys(typeCount).map((type) => ({ type, count: typeCount[type] }))
  }, [eventData, attendees])

  const handleTabSwitch = (
    tab: "overview" | "eventlink" | "attendees" | "payouts" | "edit" | "discounts" | "merch" | "referrals" | "form" | "responses"
  ) => {
    setActiveTab(tab)
    setLoadedTabs((prev) => new Set([...Array.from(prev), tab]))
  }

  // ── Auth → fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { 
        setCurrentUser(user)
        fetchEventInfo()
      }
      else setLoading(false)
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function fetchEventInfo(forceRefresh: boolean = false) {
    try {
      // Check cache if not forcing refresh
      if (!forceRefresh) {
        const cachedData = eventCacheManager.get(`event_${eventId}`)
        if (cachedData) {
          console.log("[EventInfoPage] Using cached data for event:", eventId)
          populateEventData(cachedData)
          const remainingTime = eventCacheManager.getRemainingTime(`event_${eventId}`)
          setCacheInfo({ isCached: true, remainingTime })
          setLoading(false)
          return
        }
      }

      // Invalidate cache if forcing refresh
      if (forceRefresh) {
        eventCacheManager.invalidate(`event_${eventId}`)
        setRefreshing(true)
      }

      const res = await fetch(`/api/event/list/${eventId}`)
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }))
        console.error("[EventInfoPage] API error:", error)
        return
      }
      const data = await res.json()
      
      // Cache the full response
      eventCacheManager.set(`event_${eventId}`, data)
      
      populateEventData(data)
      setCacheInfo({ isCached: false, remainingTime: null })
    } catch (e) {
      console.error("[EventInfoPage] fetch failed:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function populateEventData(data: any) {
    setEventData(data.eventData)
    setBookerBVT(data.bookerBVT ?? "")
    setAttendees(data.attendees ?? [])
    setDiscounts(data.discounts ?? [])
    setPayouts(data.payouts ?? [])
    setTicketSalesByDay(data.ticketSalesByDay ?? [])
    setTicketSalesByType(data.ticketSalesByType ?? [])
    setAvailableBalance(data.availableBalance ?? 0)
    setTotalPaidOut(data.totalPaidOut ?? 0)
    setForecast(data.forecast ?? null)
    setEditFormData({ ...data.eventData, enablePricing: !data.eventData.isFree })
  }

  const handleRefreshData = () => {
    fetchEventInfo(true)
  }

  // ── Clipboard ──────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // ── Add discount ───────────────────────────────────────────────────────────
  const handleDiscountInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setNewDiscount((prev) => ({ ...prev, [name]: type === "number" ? Number(value) : value }))
  }

  const handleAddDiscount = async () => {
    if (!newDiscount.code.trim()) { alert("Please enter a discount code."); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/event/list/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addDiscount", ...newDiscount }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "Failed to add discount."); return }

      // Append the new discount (with server-assigned id) to local state
      setDiscounts((prev) => [...prev, data.discount])
      setNewDiscount({ code: "", type: "percentage", value: 0, maxUses: 1, usedCount: 0, active: true })
      alert("Discount code added successfully!")
    } catch (e) {
      console.error("[addDiscount]", e)
      alert("Failed to add discount code.")
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle discount ────────────────────────────────────────────────────────
  // The GET response now includes `id` on each discount so we can target the
  // doc directly without a secondary lookup.
  const handleToggleDiscountStatus = async (index: number) => {
    const target = discounts[index]
    if (!target.id) { console.error("Discount missing id — cannot toggle"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/event/list/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleDiscount", discountId: target.id }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "Failed to toggle discount."); return }

      setDiscounts((prev) =>
        prev.map((d, i) => (i === index ? { ...d, active: data.active } : d))
      )
    } catch (e) {
      console.error("[toggleDiscount]", e)
      alert("Failed to update discount status.")
    } finally {
      setSaving(false)
    }
  }

  // ── Edit event ─────────────────────────────────────────────────────────────
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    if (type === "checkbox") {
      setEditFormData((prev: any) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }))
    } else {
      setEditFormData((prev: any) => ({ ...prev, [name]: value }))
    }
  }

  const handleTicketPriceChange = (index: number, field: string, value: string) => {
    const updated = [...editFormData.ticketPrices]
    updated[index][field as "policy" | "price"] = field === "price" ? Number(value) : value
    setEditFormData((prev: any) => ({ ...prev, ticketPrices: updated }))
  }

  const addTicketPrice = () => {
    setEditFormData((prev: any) => ({
      ...prev,
      ticketPrices: [...prev.ticketPrices, { policy: "", price: 0 }],
    }))
  }

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/event/list/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", ...editFormData }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "Failed to update event."); return }

      // Reflect edits in local eventData so Overview tab updates immediately
      setEventData((prev) =>
        prev
          ? {
              ...prev,
              eventName: editFormData.eventName,
              eventDescription: editFormData.eventDescription,
              eventDate: editFormData.eventDate,
              eventEndDate: editFormData.eventEndDate,
              eventVenue: editFormData.eventVenue,
              eventStart: editFormData.eventStart,
              eventEnd: editFormData.eventEnd,
              eventType: editFormData.eventType,
              isFree: !editFormData.enablePricing,
              ticketPrices: editFormData.enablePricing ? editFormData.ticketPrices : [],
              enableStopDate: editFormData.enableStopDate,
              stopDate: editFormData.enableStopDate ? editFormData.stopDate : "",
              enableColorCode: editFormData.enableColorCode,
              colorCode: editFormData.enableColorCode ? editFormData.colorCode : "",
              enableMaxSize: editFormData.enableMaxSize,
              maxSize: editFormData.enableMaxSize ? editFormData.maxSize : "",
            }
          : prev
      )
      alert("Event updated successfully!")
      handleTabSwitch("overview")
    } catch (e) {
      console.error("[submitEdit]", e)
      alert("Failed to update event.")
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-10 w-40 bg-slate-200 rounded mb-8" />
          <div className="h-64 w-full bg-slate-200 rounded-lg mb-6" />
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-lg" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        {/* <Nav /> */}
        <div className="max-w-6xl mx-auto">
          <Link href="/events">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors mb-4">
              <ArrowLeft size={18} /> Back to Events
            </button>
          </Link>
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
            <p className="text-slate-600">Event not found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* <Nav /> */}
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link href="/events">
              <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                <ArrowLeft size={18} /> Back to Events
              </button>
            </Link>
            <div className="flex items-center gap-3">
              {cacheInfo.isCached && cacheInfo.remainingTime !== null && (
                <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  Cached for {Math.ceil(cacheInfo.remainingTime / 1000)}s
                </span>
              )}
              <button
                onClick={handleRefreshData}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh event data and invalidate cache"
              >
                <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold text-slate-900">{eventData.eventName}</h1>
            <p className="text-slate-600">{eventData.eventVenue}</p>
            <ForecastBadge forecast={forecast} />
          </div>
        </div>

        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="border-b border-slate-200 bg-white rounded-t-lg">
            <div className="flex overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-[#6b2fa5] [&::-webkit-scrollbar-thumb]:rounded-full">
              {(["overview", "eventlink", "attendees", "discounts", "merch", "referrals", "form", "responses", "payouts", "edit"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabSwitch(tab)}
                  className={`px-6 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? "border-b-purple-600 text-purple-600"
                      : "border-b-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab === "overview"    ? "Overview"
                   : tab === "eventlink" ? "Share Event"
                   : tab === "attendees" ? "Attendees"
                   : tab === "discounts" ? "Discounts"
                   : tab === "merch"     ? "Merch"
                   : tab === "referrals" ? "Referrals"
                   : tab === "form"      ? "Form"
                   : tab === "responses" ? "Responses"
                   : tab === "payouts"   ? "Payouts"
                   :                      "Edit Event"}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-b-lg border border-slate-200 p-6">

            {activeTab === "overview" && (
              loadedTabs.has("overview") && eventData ? (
                <OverviewTab
                  eventData={eventData}
                  availableBalance={availableBalance}
                  totalPaidOut={totalPaidOut}
                  copiedField={copiedField}
                  bookerBVT={bookerBVT}
                  ticketSalesByDay={ticketSalesByDay}
                  ticketTypeData={ticketTypeData}
                  copyToClipboard={copyToClipboard}
                />
              ) : <TabSkeleton />
            )}

          {activeTab === "eventlink" && (
            loadedTabs.has("eventlink") && eventData ? (
              <EventLinkTab eventId={eventData.id} />
            ) : <TabSkeleton />
          )}

            {activeTab === "attendees" && (
              loadedTabs.has("attendees") ? (
                <AttendeesTab
                  attendees={attendees}
                  formatFirestoreTimestamp={(ts: any) => String(ts)} eventId={""}                />
              ) : <TabSkeleton />
            )}

            {activeTab === "discounts" && (
              loadedTabs.has("discounts") ? (
                <DiscountsTab
                  discounts={discounts}
                  newDiscount={newDiscount}
                  handleDiscountInputChange={handleDiscountInputChange}
                  handleAddDiscount={handleAddDiscount}
                  handleToggleDiscountStatus={handleToggleDiscountStatus}
                />
              ) : <TabSkeleton />
            )}

            {activeTab === "merch" && (
              loadedTabs.has("merch") && currentUser && eventData ? (
                <MerchTab
                  eventId={eventId}
                  eventName={eventData.eventName}
                  currentUserId={currentUser.uid}
                />
              ) : <TabSkeleton />
            )}

            {activeTab === "referrals" && (
              loadedTabs.has("referrals")
                ? <ReferralsTab eventId={eventId} />
                : <TabSkeleton />
            )}

            {activeTab === "form" && (
              loadedTabs.has("form") && eventData ? (
                <FormTab
                  userId={userId}
                  eventId={eventId}
                  ticketTypes={eventData.ticketPrices ?? []}
                />
              ) : <TabSkeleton />
            )}

            {activeTab === "responses" && (
              loadedTabs.has("responses")
                ? <ResponsesTab userId={userId} eventId={eventId} />
                : <TabSkeleton />
            )}

            {activeTab === "payouts" && (
              loadedTabs.has("payouts") && eventData ? (
                <PayoutsTab
                  availableBalance={availableBalance}
                  eventData={eventData}
                  userId={userId}
                  eventId={eventId}
                  currentUserId={currentUser?.uid ?? ""}
                  attendees={attendees}
                  payId={eventData.payId ?? ""}
                />
              ) : <TabSkeleton />
            )}

            {activeTab === "edit" && (
              loadedTabs.has("edit") && editFormData ? (
                <EditEventTab
                  editFormData={editFormData}
                  handleInputChange={handleInputChange}
                  handleTicketPriceChange={handleTicketPriceChange}
                  addTicketPrice={addTicketPrice}
                  handleSubmitEdit={handleSubmitEdit}
                  setEditFormData={setEditFormData}
                  userId=""
                  eventId=""
                />
              ) : <TabSkeleton />
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
