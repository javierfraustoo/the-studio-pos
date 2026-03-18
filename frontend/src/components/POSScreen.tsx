import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { CartItemModifier } from '../store/useStore';
import type { Product } from '../api';
import ConfirmModal from './ConfirmModal';
import OverrideModal from './OverrideModal';
import { Percent } from 'lucide-react';

// ─── Category Tabs ──────────────────────────────────────────────────────────

function CategoryTabs() {
  const { selectedCategory, setSelectedCategory, categories } = useStore();
  return (
    <div style={S.categoryBar}>
      {categories.map((cat) => {
        const isActive = selectedCategory === cat.id;
        return (
          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
            style={{
              ...S.categoryTab,
              backgroundColor: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
              color: isActive ? '#10B981' : '#A1A1AA',
              borderColor: isActive ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)',
            }}>
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}

// ─── Product Grid ────────────────────────────────────────────────────────

function ProductGrid() {
  const { selectedCategory, products, categories, openModifierSheet } = useStore();
  const filtered = products.filter((p) => p.category_id === selectedCategory);
  const cat = categories.find((c) => c.id === selectedCategory);

  return (
    <div style={S.grid} data-product-grid>
      {filtered.map((p) => (
        <button key={p.id} data-product="true" onClick={() => openModifierSheet(p)}
          style={{ ...S.productCard, borderLeft: `3px solid ${cat?.color || '#10B981'}` }}>
          <span style={S.productName}>{p.name}</span>
          <span style={S.productPrice}>${p.price}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Modifier Sheet ─────────────────────────────────────────────────────

function ModifierSheet() {
  const { modifierSheetProduct, closeModifierSheet, addToCart, modifierGroups } = useStore();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const product = modifierSheetProduct;
  const groups = product
    ? product.modifierGroupIds.map((gid) => modifierGroups.find((g) => g.id === gid)).filter(Boolean) as typeof modifierGroups
    : [];

  useEffect(() => {
    if (!product) return;
    const defaults: Record<string, string[]> = {};
    for (const gid of product.modifierGroupIds) {
      const group = modifierGroups.find((g) => g.id === gid);
      if (!group) continue;
      const def = group.modifiers.find((m) => m.isDefault);
      if (def && group.selectionType === 'single') defaults[group.id] = [def.id];
    }
    setSelected(defaults);
    setCollapsed({});
    setNotes('');
  }, [product?.id]);

  if (!product) return null;

  const toggleModifier = (groupId: string, modId: string, selType: string) => {
    setSelected((prev) => {
      const current = prev[groupId] || [];
      if (selType === 'single') return { ...prev, [groupId]: [modId] };
      if (current.includes(modId)) return { ...prev, [groupId]: current.filter((id) => id !== modId) };
      return { ...prev, [groupId]: [...current, modId] };
    });
  };

  const toggleCollapse = (id: string) => setCollapsed((p) => ({ ...p, [id]: !p[id] }));

  const handleAdd = () => {
    const mods: CartItemModifier[] = [];
    for (const group of groups) {
      const sel = selected[group.id] || [];
      for (const mod of group.modifiers) {
        if (sel.includes(mod.id)) mods.push({ id: mod.id, name: mod.name, shortName: mod.shortName, priceAdjustment: mod.priceAdjustment });
      }
      if (sel.length === 0 && group.isRequired && group.selectionType === 'single') {
        const def = group.modifiers.find((m) => m.isDefault) || group.modifiers[0];
        if (def) mods.push({ id: def.id, name: def.name, shortName: def.shortName, priceAdjustment: def.priceAdjustment });
      }
    }
    addToCart(product, mods, notes);
    setSelected({});
    setNotes('');
    closeModifierSheet();
  };

  const handleClose = () => { setSelected({}); setNotes(''); closeModifierSheet(); };

  const modTotal = Object.values(selected).flat().reduce((sum, modId) => {
    for (const g of groups) { const m = g.modifiers.find((mod) => mod.id === modId); if (m) return sum + m.priceAdjustment; }
    return sum;
  }, 0);

  const getGroupSummary = (gid: string) => {
    const sel = selected[gid] || [];
    const group = modifierGroups.find((g) => g.id === gid);
    return sel.map((id) => group?.modifiers.find((m) => m.id === id)?.shortName || '').filter(Boolean).join(', ');
  };

  return (
    <div style={S.overlay} onClick={handleClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.sheetHeader}>
          <div>
            <h2 style={S.sheetTitle}>{product.name}</h2>
            <span style={S.sheetPrice}>${(product.price + modTotal).toFixed(0)} MXN</span>
          </div>
          <button onClick={handleClose} style={S.closeBtn}>✕</button>
        </div>

        <div style={S.sheetBody}>
          {groups.map((group) => {
            const isCollapsed = collapsed[group.id] || false;
            const summary = getGroupSummary(group.id);
            return (
              <div key={group.id} style={S.modSection}>
                <button onClick={() => toggleCollapse(group.id)} style={S.modSectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>{isCollapsed ? '▸' : '▾'}</span>
                    <span style={S.modGroupTitle}>{group.name}</span>
                    {group.isRequired && <span style={S.required}>requerido</span>}
                  </div>
                  {summary && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{summary}</span>}
                </button>
                {!isCollapsed && (
                  <div style={S.modOptions}>
                    {group.modifiers.map((mod) => {
                      const isSel = (selected[group.id] || []).includes(mod.id);
                      return (
                        <button key={mod.id} onClick={() => toggleModifier(group.id, mod.id, group.selectionType)}
                          style={{
                            ...S.modBtn,
                            backgroundColor: isSel ? 'var(--accent-glow)' : 'var(--bg-hover)',
                            color: isSel ? 'var(--accent)' : 'var(--text-secondary)',
                            borderColor: isSel ? 'rgba(16,185,129,0.3)' : 'var(--border)',
                          }}>
                          <span style={{ fontWeight: 600 }}>{mod.name}</span>
                          {mod.priceAdjustment > 0 && <span style={{ fontSize: 11, opacity: 0.6 }}>+${mod.priceAdjustment}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div style={S.modSection}>
            <button onClick={() => toggleCollapse('__notes__')} style={S.modSectionHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>{collapsed['__notes__'] ? '▸' : '▾'}</span>
                <span style={S.modGroupTitle}>Notas</span>
              </div>
              {notes && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{notes.substring(0, 25)}...</span>}
            </button>
            {!collapsed['__notes__'] && (
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Extra caliente, sin crema..."
                style={{ ...S.notesInput, margin: '0 0 12px 24px', width: 'calc(100% - 24px)' }} />
            )}
          </div>
        </div>

        <button onClick={handleAdd} style={S.addBtn}>
          Agregar — ${(product.price + modTotal).toFixed(0)}
        </button>
      </div>
    </div>
  );
}

// ─── Cart Panel (Área de Pedido) ─────────────────────────────────────────

function CartPanel() {
  const { cart, removeFromCart, updateQuantity, clearCart, cartSubtotal, processOrder } = useStore();
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState<'dine_in' | 'to_go'>('dine_in');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ orderNumber: number; total: number; paymentMethod: string } | null>(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAuthorizer, setDiscountAuthorizer] = useState('');
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [pendingDiscount, setPendingDiscount] = useState(0);

  const subtotal = cartSubtotal();
  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  const handlePay = async (method: string) => {
    setProcessing(true);
    try {
      const order = await processOrder(method, customerName, orderType, discountPercent > 0 ? discountPercent : undefined, discountAuthorizer || undefined);
      if (order) setLastOrder({ orderNumber: order.order_number, total: order.total, paymentMethod: order.payment_method });
    } catch (err) { console.error(err); }
    setProcessing(false);
  };

  if (lastOrder) {
    return (
      <div style={S.cartPanel}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: 'linear-gradient(135deg, #10B981, #059669)', color: '#FFF', fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Orden #{lastOrder.orderNumber}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0' }}>{lastOrder.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'} — ${lastOrder.total.toFixed(2)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>Enviado a KDS</p>
          <button onClick={() => { setLastOrder(null); setDiscountPercent(0); setDiscountAuthorizer(''); setPendingDiscount(0); setShowDiscountInput(false); setCustomerName(''); }} style={{ ...S.checkoutBtn, marginTop: 24, width: '80%' }}>Nueva orden</button>
        </div>
      </div>
    );
  }

  if (showCheckout && cart.length > 0) {
    return (
      <div style={S.cartPanel}>
        <div style={{ padding: '16px 16px 0' }}>
          <button onClick={() => setShowCheckout(false)} style={{ fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>← Pedido</button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <h2 style={{ fontSize: 44, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>${total.toFixed(2)}</h2>
          {discountPercent > 0 && (
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-faint)', textDecoration: 'line-through' }}>${subtotal.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600, marginLeft: 8 }}>-{discountPercent}%</span>
            </div>
          )}
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Total a cobrar</p>
          <button onClick={() => handlePay('cash')} disabled={processing}
            style={{ ...S.payBtn, background: 'linear-gradient(135deg, #059669, #10B981)' }}>
            {processing ? 'Procesando...' : 'Efectivo'}
          </button>
          <button onClick={() => handlePay('card')} disabled={processing}
            style={{ ...S.payBtn, background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}>
            {processing ? 'Procesando...' : 'Tarjeta'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.cartPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 0' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Pedido</h2>
        {cart.length > 0 && <button onClick={() => setShowClearConfirm(true)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Limpiar</button>}
      </div>
      <div style={{ padding: '8px 16px', display: 'flex', gap: 4 }}>
        <button onClick={() => setOrderType('dine_in')}
          style={{ ...S.typeBtn, backgroundColor: orderType === 'dine_in' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)', color: orderType === 'dine_in' ? '#10B981' : '#71717A', border: `1px solid ${orderType === 'dine_in' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
          Aquí
        </button>
        <button onClick={() => setOrderType('to_go')}
          style={{ ...S.typeBtn, backgroundColor: orderType === 'to_go' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)', color: orderType === 'to_go' ? '#10B981' : '#71717A', border: `1px solid ${orderType === 'to_go' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
          Llevar
        </button>
      </div>
      <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre del cliente" style={S.nameInput} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        {cart.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', textAlign: 'center', marginTop: 40, fontSize: 13 }}>Agrega productos</p>
        ) : cart.map((item) => (
          <div key={item.cartItemId} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{item.product.name}</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${item.lineTotal}</span>
            </div>
            {item.modifiers.length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>{item.modifiers.map((m) => <span key={m.id} style={S.modTag}>{m.shortName}{m.priceAdjustment > 0 ? ` +$${m.priceAdjustment}` : ''}</span>)}</div>}
            {item.notes && <p style={{ fontSize: 11, color: '#F59E0B', margin: '4px 0 0', fontStyle: 'italic' }}>{item.notes}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <button onClick={() => updateQuantity(item.cartItemId, -1)} style={S.qtyBtn}>−</button>
              <span style={{ fontWeight: 600, fontSize: 13, minWidth: 18, textAlign: 'center', color: 'var(--text-primary)' }}>{item.quantity}</span>
              <button onClick={() => updateQuantity(item.cartItemId, 1)} style={S.qtyBtn}>+</button>
              <button onClick={() => removeFromCart(item.cartItemId)} style={{ marginLeft: 'auto', fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }}>Quitar</button>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
          {/* Discount display */}
          {discountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Subtotal</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'line-through' }}>${subtotal.toFixed(2)}</span>
            </div>
          )}
          {discountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>Descuento {discountPercent}%</span>
              <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>-${discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-muted)' }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${total.toFixed(2)}</span>
          </div>
          <button onClick={() => setShowCheckout(true)} style={S.checkoutBtn}>Cobrar ${total.toFixed(0)}</button>

          {/* Discount section */}
          {discountPercent > 0 && !showDiscountInput ? (
            /* Active discount — show with remove button */
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 12, color: '#10B981', fontWeight: 600, padding: '8px 12px', borderRadius: 8, backgroundColor: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.2)' }}>
                Descuento {discountPercent}% aplicado
              </span>
              <button onClick={() => { setDiscountPercent(0); setDiscountAuthorizer(''); }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          ) : !showDiscountInput ? (
            /* No discount — show add button */
            <button onClick={() => { setShowDiscountInput(true); setPendingDiscount(0); }}
              style={{ width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Percent size={13} />
              Agregar descuento
            </button>
          ) : (
            /* Input mode — enter percentage and authorize */
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" min="1" max="100" placeholder="%" value={pendingDiscount || ''}
                onChange={e => setPendingDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                autoFocus
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
              <button onClick={() => { if (pendingDiscount > 0) setShowOverride(true); }}
                disabled={!pendingDiscount || pendingDiscount <= 0}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #10B981, #059669)', color: '#FFF', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: pendingDiscount > 0 ? 1 : 0.4 }}>
                Autorizar
              </button>
              <button onClick={() => { setShowDiscountInput(false); setPendingDiscount(0); }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmModal open={showClearConfirm} title="¿Limpiar pedido?" message={`Se eliminarán ${cart.length} productos del pedido.`}
        confirmLabel="Sí, limpiar" cancelLabel="Cancelar" danger
        onConfirm={() => { clearCart(); setDiscountPercent(0); setShowClearConfirm(false); }} onCancel={() => setShowClearConfirm(false)} />

      <OverrideModal
        isOpen={showOverride}
        action="discount"
        actionLabel={`Autorizar descuento del ${pendingDiscount}%`}
        requestedBy="cajero"
        onAuthorized={(overrideUser) => { setDiscountPercent(pendingDiscount); setDiscountAuthorizer(overrideUser?.name || ''); setShowDiscountInput(false); setShowOverride(false); }}
        onCancel={() => setShowOverride(false)}
      />
    </div>
  );
}

// ─── Main POS Screen ────────────────────────────────────────────────────────

export default function POSScreen() {
  return (
    <div style={S.posLayout} data-pos-layout>
      <div style={S.menuSide} data-pos-menu>
        <CategoryTabs />
        <ProductGrid />
      </div>
      <CartPanel />
      <ModifierSheet />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  posLayout: { display: 'flex', height: '100%', width: '100%' },
  menuSide: { width: '75%', flex: '0 0 75%', display: 'flex', flexDirection: 'column', padding: 16, overflowY: 'auto', backgroundColor: 'var(--bg-primary)', minWidth: 0 },
  categoryBar: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  categoryTab: { padding: '8px 18px', borderRadius: 12, border: '1px solid', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s ease' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, flex: 1, alignContent: 'start' },
  productCard: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '18px 20px', borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left',
    minHeight: 100, transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
  },
  productName: { fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.3, letterSpacing: '-0.01em' },
  productPrice: { fontWeight: 600, fontSize: 15, color: 'var(--text-faint)', marginTop: 6, fontVariantNumeric: 'tabular-nums' },

  cartPanel: {
    width: '25%', flex: '0 0 25%', minWidth: 240,
    backgroundColor: 'var(--bg-secondary)',
    borderLeft: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', height: '100%',
  },
  typeBtn: { flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, transition: 'all 0.2s ease' },
  nameInput: {
    margin: '0 16px 8px', padding: '8px 12px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, outline: 'none',
    backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)',
  },
  modTag: { fontSize: 10, backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6, color: 'var(--text-muted)' },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)', cursor: 'pointer',
    fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-secondary)',
  },
  checkoutBtn: {
    width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(16,185,129,0.2)',
  },
  payBtn: {
    width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
    color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },

  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(8px)' },
  sheet: {
    width: '95%', maxWidth: 480, maxHeight: '85vh',
    backgroundColor: 'var(--bg-card)', borderRadius: 24,
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
    animation: 'fadeIn 0.2s ease-out',
  },
  sheetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 12px' },
  sheetTitle: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' },
  sheetPrice: { fontSize: 14, fontWeight: 600, color: 'var(--text-faint)' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)', cursor: 'pointer',
    fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
  },
  sheetBody: { flex: 1, overflowY: 'auto', padding: '0 24px 12px' },
  modSection: { marginBottom: 2, borderBottom: '1px solid rgba(255,255,255,0.04)' },
  modSectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' },
  modGroupTitle: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  required: { fontSize: 9, fontWeight: 600, color: '#FFF', backgroundColor: '#EF4444', padding: '1px 6px', borderRadius: 4 },
  modOptions: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 0 10px 24px' },
  modBtn: {
    padding: '8px 14px', borderRadius: 10, border: '1px solid',
    cursor: 'pointer', fontSize: 12, fontWeight: 500,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    transition: 'all 0.2s ease', minWidth: 70, position: 'relative' as const,
  },
  notesInput: {
    padding: '8px 12px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)',
  },
  addBtn: {
    margin: '0 24px 24px', padding: '13px 0', borderRadius: 14, border: 'none',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(16,185,129,0.2)',
  },
};
