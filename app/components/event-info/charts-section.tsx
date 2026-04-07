"use client"

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface ChartsSectionProps {
  ticketSalesByDay: any[]
  ticketTypeData: any[]
  ticketSalesByType: any[]
  eventData: any
}

const COLORS = ["#6b2fa5", "#8b4fc5", "#a86dd4", "#c491e0", "#d9a8e8", "#e9d5ff"]

export default function ChartsSection({
  ticketSalesByDay,
  ticketTypeData,
  ticketSalesByType,
  eventData,
}: ChartsSectionProps) {
  return (
    <div className="space-y-8">
      {/* Sales Over Time */}
      <div className="bg-white rounded-lg border border-purple-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ticket Sales Over Time</h3>
        {ticketSalesByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={ticketSalesByDay} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6b2fa5" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#6b2fa5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
              <XAxis dataKey="date" stroke="#999" />
              <YAxis stroke="#999" />
              <Tooltip
                contentStyle={{ backgroundColor: "#fff", border: "1px solid #e9d5ff", borderRadius: "8px" }}
                cursor={{ stroke: "#6b2fa5", strokeWidth: 2 }}
                formatter={(value, name) => {
                  if (name === "count") return [value, "Tickets Sold"]
                  if (name === "revenue") return [`₦${Number(value).toLocaleString()}`, "Revenue"]
                  return [value, name]
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="count"
                name="Tickets Sold"
                stroke="#6b2fa5"
                fillOpacity={1}
                fill="url(#colorCount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-gray-500 py-12">No sales data available yet.</p>
        )}
      </div>

      {/* Sales by Ticket Type */}
      {ticketSalesByType.length > 0 && (
        <div className="bg-white rounded-lg border border-purple-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Sales by Ticket Type</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ticketSalesByType} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
                <XAxis dataKey="type" stroke="#999" />
                <YAxis stroke="#999" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e9d5ff", borderRadius: "8px" }}
                  cursor={{ fill: "#f3e8ff" }}
                  formatter={(value, name) => {
                    if (name === "count") return [value, "Tickets Sold"]
                    if (name === "revenue") return [`₦${Number(value).toLocaleString()}`, "Revenue"]
                    return [value, name]
                  }}
                />
                <Legend />
                <Bar dataKey="count" name="Tickets Sold" fill="#6b2fa5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Pie Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={ticketSalesByType}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ type, count }) => `${type}: ${count}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {ticketSalesByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "count") return [value, "Tickets Sold"]
                    if (name === "revenue") return [`₦${Number(value).toLocaleString()}`, "Revenue"]
                    return [value, name]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Ticket Types */}
      <div className="bg-white rounded-lg border border-purple-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ticket Types</h3>

        {/* Chart */}
        {ticketTypeData.length > 0 ? (
          <div className="mb-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ticketTypeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
                <XAxis dataKey="type" stroke="#999" />
                <YAxis stroke="#999" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e9d5ff", borderRadius: "8px" }}
                  cursor={{ fill: "#f3e8ff" }}
                />
                <Legend />
                <Bar dataKey="count" name="Tickets Sold" fill="#6b2fa5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-gray-500 py-12">No ticket type data available yet.</p>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-purple-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Type</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Price</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Sold</th>
              </tr>
            </thead>
            <tbody>
              {eventData.isFree ? (
                <tr className="border-b border-gray-200 hover:bg-purple-50">
                  <td className="py-3 px-4 text-gray-700">Free Admission</td>
                  <td className="py-3 px-4 text-gray-700">₦0.00</td>
                  <td className="py-3 px-4 text-gray-700 font-semibold">{eventData.ticketsSold}</td>
                </tr>
              ) : (
                eventData.ticketPrices.map((ticket: any, index: number) => {
                  const typeData = ticketSalesByType.find((t) => t.type === ticket.policy)
                  const soldCount = typeData ? typeData.count : 0

                  return (
                    <tr key={index} className="border-b border-gray-200 hover:bg-purple-50">
                      <td className="py-3 px-4 text-gray-700">{ticket.policy}</td>
                      <td className="py-3 px-4 text-gray-700">
                        ₦{Number.parseFloat(ticket.price.toString()).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-gray-700 font-semibold">{soldCount}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
