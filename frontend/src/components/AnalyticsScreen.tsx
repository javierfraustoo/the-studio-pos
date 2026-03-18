import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import * as api from '../api';
import type { AnalyticsOrder, HourlyData } from '../api';

// ─── Sales by Hour Heatmap ──────────────────────────────────────────────────

function SalesByHourChart({ data }: { data: HourlyData[] }) {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const maxOrders = Math.max(...data.map(d => d.orders), 1);
  // Show 6am - 10pm (typical coffee shop hours)
  const hours = data.filter(d => d.hour >= 6 && d.hour <= 22);

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 120, padding: '0 4px' }}>
      {hours.map(d => {
        const intensity = d.revenue / maxRevenue;
        const barH = Math.max(4, intensity * 100);
        const bg = intensity > 0.7 ? '#059669' : intensity > 0.4 ? '#F59E0B' : intensity > 0 ? '#93C5FD' : 'var(--bg-hover)';
        return (
          <div key={d.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 600 }}>
              {d.orders > 0 ? `$${d.revenue.toFixed(0)}` : ''}
            </span>
            <div style={{ width: '100%', height: barH, backgroundColor: bg, borderRadius: 4, minHeight: 4, transition: 'height 0.3s' }} />
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 500 }}>
              {d.hour}h
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Analytics Screen ──────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { analytics, fetchAnalytics } = useStore();
  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders'>('dashboard');

  useEffect(() => { fetchAnalytics(); }, []);

  useEffect(() => {
    if (activeTab === 'orders') {
      api.fetchAnalyticsOrders().then(setOrders).catch(console.error);
    }
  }, [activeTab]);

  if (!analytics) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>Análisis y Datos</h2>
        <p style={styles.subtitle}>Cargando datos...</p>
      </div>
    );
  }

  const { revenue, orderCount, avgTicket, wasteCost, recipeCost, topSellers, profitability, hourlyData, wastePercent, top5Profitable } = analytics;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Análisis y Datos</h2>
      <p style={styles.subtitle}>Inteligencia de negocio en tiempo real</p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button onClick={() => setActiveTab('dashboard')}
          style={{ ...styles.tabBtn, backgroundColor: activeTab === 'dashboard' ? 'var(--accent)' : 'var(--bg-hover)', color: activeTab === 'dashboard' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
          Dashboard
        </button>
        <button onClick={() => setActiveTab('orders')}
          style={{ ...styles.tabBtn, backgroundColor: activeTab === 'orders' ? 'var(--accent)' : 'var(--bg-hover)', color: activeTab === 'orders' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
          Detalle de Órdenes ({orderCount})
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          {/* KPI Cards Row */}
          <div style={styles.kpiRow} data-kpi-row>
            <KpiCard label="Ventas totales" value={`$${revenue.toFixed(0)}`} color="#059669" />
            <KpiCard label="Ordenes" value={`${orderCount}`} color="#2563EB" />
            <KpiCard label="Ticket Promedio" value={`$${avgTicket.toFixed(0)}`} color="#7C3AED" sub="Venta total / Ordenes" />
            <KpiCard label="COGS del dia" value={`$${recipeCost.toFixed(0)}`} color="#D97706" sub="Costo total insumos" />
            <KpiCard label="Merma %" value={`${wastePercent}%`} color="#EF4444" sub={`$${wasteCost.toFixed(0)} perdidos`} />
          </div>

          {/* Main Grid: 3 columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            {/* Sales by Hour */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Ventas por Hora</h3>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 12px' }}>Identifica tus horas pico de venta</p>
              {hourlyData ? <SalesByHourChart data={hourlyData} /> : <p style={styles.empty}>Sin datos</p>}
            </div>

            {/* Top 5 Most Profitable */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Top 5 Más Rentables</h3>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 12px' }}>Por margen bruto, no por volumen</p>
              {top5Profitable && top5Profitable.length > 0 ? (
                top5Profitable.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: i === 0 ? '#10B981' : 'var(--text-faint)', width: 24 }}>#{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        Precio: ${p.price} | Costo: ${p.recipeCost.toFixed(2)}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                      backgroundColor: p.margin >= 70 ? 'var(--success-bg)' : p.margin >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                      color: p.margin >= 70 ? 'var(--success)' : p.margin >= 50 ? 'var(--warning)' : 'var(--danger)',
                    }}>
                      {p.margin}%
                    </span>
                  </div>
                ))
              ) : <p style={styles.empty}>Agrega recetas a tus productos para ver rentabilidad</p>}
            </div>
          </div>

          {/* Full Width: Profitability Table + Top Sellers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Margen de Rentabilidad por Producto</h3>
              <div style={styles.tableHeader}>
                <span style={{ ...styles.th, flex: 2 }}>Producto</span>
                <span style={styles.th}>Precio</span>
                <span style={styles.th}>Costo</span>
                <span style={styles.th}>Margen</span>
                <span style={styles.th}>%</span>
              </div>
              {profitability.map((p) => (
                <div key={p.id} style={styles.tableRow}>
                  <span style={{ ...styles.td, flex: 2, fontWeight: 600 }}>{p.name}</span>
                  <span style={styles.td}>${p.price.toFixed(0)}</span>
                  <span style={{ ...styles.td, color: 'var(--danger)' }}>${p.recipeCost.toFixed(2)}</span>
                  <span style={{ ...styles.td, fontWeight: 700, color: 'var(--success)' }}>${(p.price - p.recipeCost).toFixed(2)}</span>
                  <span style={styles.td}>
                    <span style={{
                      ...styles.pctBadge,
                      backgroundColor: p.margin >= 70 ? 'var(--success-bg)' : p.margin >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                      color: p.margin >= 70 ? 'var(--success)' : p.margin >= 50 ? 'var(--warning)' : 'var(--danger)',
                    }}>
                      {p.margin.toFixed(1)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Productos Más Vendidos</h3>
              {topSellers.length === 0 ? (
                <p style={styles.empty}>Procesa órdenes para ver datos</p>
              ) : (
                topSellers.map((p, i) => (
                  <div key={p.product_id} style={styles.sellerRow}>
                    <span style={styles.sellerRank}>#{i + 1}</span>
                    <div style={styles.sellerInfo}>
                      <span style={styles.sellerName}>{p.product_name}</span>
                      <span style={styles.sellerRevenue}>${p.totalRevenue.toFixed(0)} ingreso</span>
                    </div>
                    <div style={styles.sellerBar}>
                      <div style={{
                        ...styles.sellerBarFill,
                        width: `${topSellers[0]?.totalQty ? (p.totalQty / topSellers[0].totalQty) * 100 : 0}%`,
                      }} />
                    </div>
                    <span style={styles.sellerQty}>{p.totalQty}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        /* ─── Orders Detail Tab ─── */
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Detalle de Órdenes del Dia</h3>
          {orders.length === 0 ? (
            <p style={styles.empty}>Sin órdenes hoy</p>
          ) : (
            <div>
              {/* Table header */}
              <div style={{ ...styles.orderRow, backgroundColor: 'var(--bg-hover)', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, borderRadius: '8px 8px 0 0' }}>
                <span style={{ width: 60 }}># Orden</span>
                <span style={{ flex: 1 }}>Cajero</span>
                <span style={{ flex: 1 }}>Cliente</span>
                <span style={{ width: 70, textAlign: 'center' }}>Tipo</span>
                <span style={{ width: 80, textAlign: 'right' }}>Total</span>
                <span style={{ width: 80, textAlign: 'right' }}>Costo</span>
                <span style={{ width: 80, textAlign: 'right' }}>Margen</span>
                <span style={{ width: 70, textAlign: 'center' }}>Prep</span>
                <span style={{ width: 50, textAlign: 'center' }}>Hora</span>
              </div>
              {orders.map(order => {
                const isExpanded = expandedOrder === order.id;
                return (
                  <div key={order.id}>
                    <div onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      style={{ ...styles.orderRow, cursor: 'pointer', backgroundColor: isExpanded ? 'var(--info-bg)' : 'var(--bg-card)' }}>
                      <span style={{ width: 60, fontWeight: 700, color: 'var(--text-primary)' }}>#{order.order_number}</span>
                      <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-secondary)' }}>{order.user_name}</span>
                      <span style={{ flex: 1, color: 'var(--text-muted)' }}>{order.customer_name || '-'}</span>
                      <span style={{ width: 70, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          backgroundColor: order.order_type === 'to_go' ? 'var(--warning-bg)' : 'var(--info-bg)',
                          color: order.order_type === 'to_go' ? 'var(--warning)' : 'var(--info)',
                        }}>
                          {order.order_type === 'to_go' ? 'LLEVAR' : 'MESA'}
                        </span>
                      </span>
                      <span style={{ width: 80, textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>${order.total.toFixed(0)}</span>
                      <span style={{ width: 80, textAlign: 'right', color: 'var(--danger)', fontSize: 12 }}>${order.recipeCost.toFixed(2)}</span>
                      <span style={{ width: 80, textAlign: 'right' }}>
                        <span style={{
                          ...styles.pctBadge,
                          backgroundColor: order.grossMargin >= 70 ? 'var(--success-bg)' : order.grossMargin >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                          color: order.grossMargin >= 70 ? 'var(--success)' : order.grossMargin >= 50 ? 'var(--warning)' : 'var(--danger)',
                        }}>
                          {order.grossMargin.toFixed(1)}%
                        </span>
                      </span>
                      <span style={{ width: 70, textAlign: 'center', fontWeight: 600, color: order.prepTimeMinutes !== null ? (order.prepTimeMinutes > 10 ? 'var(--danger)' : order.prepTimeMinutes > 5 ? 'var(--warning)' : 'var(--success)') : 'var(--text-faint)' }}>
                        {order.prepTimeMinutes !== null ? `${order.prepTimeMinutes} min` : '--'}
                      </span>
                      <span style={{ width: 50, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ padding: '12px 20px', backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                          <div>
                            <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block' }}>Cajero</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{order.user_name}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block' }}>Pago</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{order.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block' }}>Tiempo prep.</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: order.prepTimeMinutes !== null && order.prepTimeMinutes > 10 ? 'var(--danger)' : 'var(--success)' }}>
                              {order.prepTimeMinutes !== null ? `${order.prepTimeMinutes} min` : 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block' }}>Margen Bruto</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
                              ${(order.total - order.recipeCost).toFixed(2)} ({order.grossMargin.toFixed(1)}%)
                            </span>
                          </div>
                          {(order.discount && order.discount > 0) ? (
                            <div>
                              <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block' }}>Descuento</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>
                                -${order.discount.toFixed(2)} ({order.subtotal && order.subtotal > 0 ? ((order.discount / order.subtotal) * 100).toFixed(0) : '?'}%)
                              </span>
                              {order.discount_authorized_by && (
                                <span style={{ fontSize: 10, color: 'var(--text-faint)', display: 'block' }}>
                                  Autorizó: {order.discount_authorized_by}
                                </span>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Producto</th>
                              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Cant</th>
                              <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Precio</th>
                              <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map(item => (
                              <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {item.product_name}
                                  {item.modifiers.length > 0 && (
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                                      ({item.modifiers.map(m => m.shortName || m.name).join(', ')})
                                    </span>
                                  )}
                                  {item.notes && <span style={{ fontSize: 10, color: 'var(--warning)', marginLeft: 6, fontStyle: 'italic' }}>{item.notes}</span>}
                                </td>
                                <td style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-secondary)' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-secondary)' }}>${item.unit_price.toFixed(0)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>${item.line_total.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={styles.kpiCard}>
      <span style={{ ...styles.kpiValue, color }}>{value}</span>
      <span style={styles.kpiLabel}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, height: '100%', overflowY: 'auto', backgroundColor: 'var(--bg-primary)' },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' },
  tabBtn: { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 },
  kpiCard: { backgroundColor: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  kpiValue: { fontSize: 28, fontWeight: 800 },
  kpiLabel: { fontSize: 12, color: 'var(--text-faint)', fontWeight: 500, marginTop: 4 },
  card: { backgroundColor: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' },
  tableHeader: { display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--border)' },
  th: { flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const },
  tableRow: { display: 'flex', padding: '10px 0', borderBottom: '1px solid var(--border-light)', alignItems: 'center' },
  td: { flex: 1, fontSize: 13, color: 'var(--text-secondary)' },
  pctBadge: { padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 },
  empty: { color: 'var(--text-faint)', textAlign: 'center', marginTop: 40, fontSize: 13 },
  sellerRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-light)' },
  sellerRank: { fontSize: 14, fontWeight: 800, color: 'var(--text-faint)', width: 28 },
  sellerInfo: { flex: 0, minWidth: 120 },
  sellerName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block' },
  sellerRevenue: { fontSize: 11, color: 'var(--text-faint)' },
  sellerBar: { flex: 1, height: 8, backgroundColor: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' },
  sellerBarFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 4, transition: 'width 0.3s' },
  sellerQty: { fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', width: 36, textAlign: 'right' },
  orderRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border-light)', fontSize: 13 },
};
