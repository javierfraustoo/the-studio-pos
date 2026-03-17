import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { CartItemModifier } from '../store/useStore';
import type { Product } from '../api';
import ConfirmModal from './ConfirmModal';

// ─── Category Tabs ──────────────────────────────────────────────────────────

function CategoryTabs() {
  const { selectedCategory, setSelectedCategory, categories } = useStore();
  return (
    <div style={styles.categoryBar}>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => setSelectedCategory(cat.id)}
          style={{
            ...styles.categoryTab,
            backgroundColor: selectedCategory === cat.id ? cat.color : 'var(--bg-hover)',
            color: selectedCategory === cat.id ? '#FFF' : 'var(--text-secondary)',
          }}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}

// ─── Product Grid (compact rectangles for touch) ────────────────────────────

function ProductGrid() {
  const { selectedCategory, products, categories, openModifierSheet, addToCart } = useStore();
  const filtered = products.filter((p) => p.category_id === selectedCategory);
  const cat = categories.find((c) => c.id === selectedCategory);

  const handleTap = (product: Product) => {
    openModifierSheet(product);
  };

  return (
    <div style={styles.grid}>
      {filtered.map((p) => (
        <button
          key={p.id}
          onClick={() => handleTap(p)}
          style={{ ...styles.productCard, borderLeft: `4px solid ${cat?.color || '#78350F'}` }}
        >
          <span style={styles.productName}>{p.name}</span>
          <span style={styles.productPrice}>${p.price}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Modifier & Notes Sheet (centered modal, collapsible) ───────────────────

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
        if (sel.includes(mod.id)) {
          mods.push({ id: mod.id, name: mod.name, shortName: mod.shortName, priceAdjustment: mod.priceAdjustment });
        }
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
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHeader}>
          <div>
            <h2 style={styles.sheetTitle}>{product.name}</h2>
            <span style={styles.sheetPrice}>${(product.price + modTotal).toFixed(0)} MXN</span>
          </div>
          <button onClick={handleClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.sheetBody}>
          {groups.map((group) => {
            const isCollapsed = collapsed[group.id] || false;
            const summary = getGroupSummary(group.id);
            return (
              <div key={group.id} style={styles.modSection}>
                <button onClick={() => toggleCollapse(group.id)} style={styles.modSectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>{isCollapsed ? '▸' : '▾'}</span>
                    <span style={styles.modGroupTitle}>{group.name}</span>
                    {group.isRequired && <span style={styles.required}>requerido</span>}
                  </div>
                  {summary && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{summary}</span>}
                </button>
                {!isCollapsed && (
                  <div style={styles.modOptions}>
                    {group.modifiers.map((mod) => {
                      const isSel = (selected[group.id] || []).includes(mod.id);
                      return (
                        <button key={mod.id} onClick={() => toggleModifier(group.id, mod.id, group.selectionType)}
                          style={{ ...styles.modBtn, backgroundColor: isSel ? 'var(--accent)' : 'var(--bg-secondary)', color: isSel ? 'var(--accent-text)' : 'var(--text-primary)', borderColor: isSel ? 'var(--accent)' : 'var(--border)' }}>
                          {isSel && <span style={{ position: 'absolute', top: 3, right: 5, fontSize: 10, fontWeight: 800 }}>✓</span>}
                          <span style={{ fontWeight: 600 }}>{mod.name}</span>
                          {mod.priceAdjustment > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>+${mod.priceAdjustment}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* UNIVERSAL NOTES — available for ALL products */}
          <div style={styles.modSection}>
            <button onClick={() => toggleCollapse('__notes__')} style={styles.modSectionHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>{collapsed['__notes__'] ? '▸' : '▾'}</span>
                <span style={styles.modGroupTitle}>Notas</span>
              </div>
              {notes && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{notes.substring(0, 25)}...</span>}
            </button>
            {!collapsed['__notes__'] && (
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Extra caliente, sin crema, calentar croissant..."
                style={{ ...styles.notesInput, margin: '0 0 12px 24px', width: 'calc(100% - 24px)' }} />
            )}
          </div>
        </div>

        <button onClick={handleAdd} style={styles.addBtn}>
          Agregar al pedido — ${(product.price + modTotal).toFixed(0)}
        </button>
      </div>
    </div>
  );
}

// ─── Cart Panel ─────────────────────────────────────────────────────────────

function CartPanel() {
  const { cart, removeFromCart, updateQuantity, clearCart, cartSubtotal, processOrder } = useStore();
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState<'dine_in' | 'to_go'>('dine_in');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ orderNumber: number; total: number; paymentMethod: string } | null>(null);

  const subtotal = cartSubtotal();

  const handlePay = async (method: string) => {
    setProcessing(true);
    try {
      const order = await processOrder(method, customerName, orderType);
      if (order) setLastOrder({ orderNumber: order.order_number, total: order.total, paymentMethod: order.payment_method });
    } catch (err) {
      console.error(err);
    }
    setProcessing(false);
  };

  if (lastOrder) {
    return (
      <div style={styles.cartPanel}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'var(--success-bg)', color: 'var(--success)', fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Orden #{lastOrder.orderNumber}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>{lastOrder.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'} — ${lastOrder.total.toFixed(2)}</p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>Recibo impreso · Enviado a KDS</p>
          <button onClick={() => setLastOrder(null)} style={{ ...styles.checkoutBtn, marginTop: 24 }}>Nueva orden</button>
        </div>
      </div>
    );
  }

  if (showCheckout && cart.length > 0) {
    return (
      <div style={styles.cartPanel}>
        <div style={{ padding: '16px 16px 0' }}>
          <button onClick={() => setShowCheckout(false)} style={{ fontSize: 14, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>← Pedido</button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <h2 style={{ fontSize: 42, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>${subtotal.toFixed(2)}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Total a cobrar</p>
          <button onClick={() => handlePay('cash')} disabled={processing} style={{ ...styles.payBtn, backgroundColor: '#065F46' }}>{processing ? 'Procesando...' : 'Efectivo'}</button>
          <button onClick={() => handlePay('card')} disabled={processing} style={{ ...styles.payBtn, backgroundColor: '#1E40AF' }}>{processing ? 'Procesando...' : 'Tarjeta'}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.cartPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px 0' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Pedido</h2>
        {cart.length > 0 && <button onClick={() => setShowClearConfirm(true)} style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>Limpiar</button>}
      </div>
      <div style={{ padding: '8px 16px', display: 'flex', gap: 6 }}>
        <button onClick={() => setOrderType('dine_in')} style={{ ...styles.typeBtn, backgroundColor: orderType === 'dine_in' ? 'var(--accent)' : 'var(--bg-hover)', color: orderType === 'dine_in' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>Aqui</button>
        <button onClick={() => setOrderType('to_go')} style={{ ...styles.typeBtn, backgroundColor: orderType === 'to_go' ? 'var(--accent)' : 'var(--bg-hover)', color: orderType === 'to_go' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>Llevar</button>
      </div>
      <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre del cliente" style={styles.nameInput} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        {cart.length === 0 ? <p style={{ color: 'var(--text-faint)', textAlign: 'center', marginTop: 40, fontSize: 13 }}>Agrega productos</p> : cart.map((item) => (
          <div key={item.cartItemId} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{item.product.name}</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>${item.lineTotal}</span>
            </div>
            {item.modifiers.length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>{item.modifiers.map((m) => <span key={m.id} style={styles.modTag}>{m.shortName}{m.priceAdjustment > 0 ? ` +$${m.priceAdjustment}` : ''}</span>)}</div>}
            {item.notes && <p style={{ fontSize: 11, color: 'var(--warning)', margin: '3px 0 0', fontStyle: 'italic' }}>📝 {item.notes}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <button onClick={() => updateQuantity(item.cartItemId, -1)} style={styles.qtyBtn}>−</button>
              <span style={{ fontWeight: 600, fontSize: 13, minWidth: 18, textAlign: 'center', color: 'var(--text-primary)' }}>{item.quantity}</span>
              <button onClick={() => updateQuantity(item.cartItemId, 1)} style={styles.qtyBtn}>+</button>
              <button onClick={() => removeFromCart(item.cartItemId)} style={{ marginLeft: 'auto', fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>Quitar</button>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Total</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>${subtotal.toFixed(2)}</span>
          </div>
          <button onClick={() => setShowCheckout(true)} style={styles.checkoutBtn}>Cobrar ${subtotal.toFixed(0)}</button>
        </div>
      )}

      <ConfirmModal open={showClearConfirm} title="¿Limpiar pedido?" message={`Se eliminaran ${cart.length} productos del pedido.`}
        confirmLabel="Si, limpiar" cancelLabel="Cancelar" danger
        onConfirm={() => { clearCart(); setShowClearConfirm(false); }} onCancel={() => setShowClearConfirm(false)} />
    </div>
  );
}

// ─── Main POS Screen ────────────────────────────────────────────────────────

export default function POSScreen() {
  return (
    <div style={styles.posLayout}>
      <div style={styles.menuSide}>
        <CategoryTabs />
        <ProductGrid />
      </div>
      <CartPanel />
      <ModifierSheet />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  posLayout: { display: 'flex', height: '100%' },
  menuSide: { flex: 1, minWidth: '75%', display: 'flex', flexDirection: 'column', padding: 16, overflowY: 'auto', backgroundColor: 'var(--bg-primary)' },
  categoryBar: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  categoryTab: { padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },

  // Product grid — compact touch-friendly rectangles
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, flex: 1, alignContent: 'start' },
  productCard: { display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left', minHeight: 60, transition: 'box-shadow 0.15s' },
  productName: { fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.2 },
  productPrice: { fontWeight: 500, fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },

  // Cart — strict 25vw of screen, compact sidebar
  cartPanel: { width: '25vw', maxWidth: '25vw', minWidth: 220, backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0, flexGrow: 0, flexBasis: '25vw' },
  typeBtn: { flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  nameInput: { margin: '0 16px 8px', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' },
  modTag: { fontSize: 10, backgroundColor: 'var(--bg-hover)', padding: '2px 5px', borderRadius: 4, color: 'var(--text-secondary)' },
  qtyBtn: { width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' },
  checkoutBtn: { width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  payBtn: { width: '100%', padding: '14px 0', borderRadius: 10, border: 'none', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' },

  // Modifier Sheet
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  sheet: { width: '95%', maxWidth: 500, maxHeight: '85vh', backgroundColor: 'var(--bg-card)', borderRadius: 18, display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' },
  sheetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 10px' },
  sheetTitle: { fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  sheetPrice: { fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, border: '1px solid var(--border)', backgroundColor: 'var(--bg-hover)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' },
  sheetBody: { flex: 1, overflowY: 'auto', padding: '0 22px 12px' },
  modSection: { marginBottom: 2, borderBottom: '1px solid var(--border-light)' },
  modSectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' },
  modGroupTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  required: { fontSize: 9, fontWeight: 600, color: '#FFF', backgroundColor: '#EF4444', padding: '1px 5px', borderRadius: 4 },
  modOptions: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 0 10px 22px' },
  modBtn: { padding: '8px 14px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transition: 'all 0.15s', minWidth: 70, position: 'relative' as const },
  notesInput: { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' },
  addBtn: { margin: '0 22px 22px', padding: '12px 0', borderRadius: 10, border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
};
