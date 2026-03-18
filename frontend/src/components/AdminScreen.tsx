import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import * as api from '../api';
import type { RecipeCostCard } from '../api';

type AdminTab = 'products' | 'categories' | 'modifiers' | 'inventory' | 'users' | 'audit';

// ─── Tooltip Component ──────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}>
      {children}
      <span style={{
        width: 18, height: 18, borderRadius: 9, backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)',
        fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginLeft: 4, cursor: 'help', flexShrink: 0,
      }}>?</span>
      {show && (
        <span style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: 'var(--accent)', color: 'var(--accent-text)', padding: '8px 12px', borderRadius: 8,
          fontSize: 12, fontWeight: 500, whiteSpace: 'normal', width: 220, zIndex: 50,
          boxShadow: '0 4px 12px var(--shadow)', lineHeight: 1.4, textAlign: 'left',
        }}>{text}</span>
      )}
    </span>
  );
}

// ─── Shared Styles ─────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto', backgroundColor: 'var(--bg-primary)' },
  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', borderRadius: 10, border: '1px solid transparent', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s ease' },
  tabActive: { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981', borderColor: 'rgba(16,185,129,0.25)' },
  tabInactive: { backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' },
  card: { backgroundColor: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: 'var(--text-primary)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 },
  item: { padding: 14, borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' },
  itemSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  btn: { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnPrimary: { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' },
  btnDanger: { backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' },
  btnSecondary: { backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' },
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' },
  formRow: { display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' as const },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 80 },
  badge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 },
};

// ─── Products Manager with Recipe Cost Card ─────────────────────────────────

function ProductsManager() {
  const { products, categories, inventory, modifierGroups, reloadMenu, fetchInventory } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', shortName: '', price: '', categoryId: '', modifierGroupIds: [] as string[] });
  const [recipeForm, setRecipeForm] = useState<Array<{ inventoryItemId: string; quantity: string }>>([]);
  const [showRecipe, setShowRecipe] = useState<string | null>(null);
  const [recipeItems, setRecipeItems] = useState<Array<{ inventory_item_id: string; quantity: number; item_name: string; unit: string }>>([]);
  const [costCard, setCostCard] = useState<RecipeCostCard | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  useEffect(() => { fetchInventory(); }, []);

  const resetForm = () => { setForm({ name: '', shortName: '', price: '', categoryId: categories[0]?.id || '', modifierGroupIds: [] }); setEditId(null); setShowForm(false); };

  const handleSave = async () => {
    if (!form.name || !form.price || !form.categoryId) return;
    if (editId) {
      await api.updateProduct(editId, { name: form.name, shortName: form.shortName, price: parseFloat(form.price), categoryId: form.categoryId, modifierGroupIds: form.modifierGroupIds });
    } else {
      await api.createProduct({ name: form.name, shortName: form.shortName, price: parseFloat(form.price), categoryId: form.categoryId, modifierGroupIds: form.modifierGroupIds });
    }
    await reloadMenu();
    resetForm();
  };

  const handleEdit = (p: typeof products[0]) => {
    setForm({ name: p.name, shortName: p.short_name, price: p.price.toString(), categoryId: p.category_id, modifierGroupIds: p.modifierGroupIds });
    setEditId(p.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await api.deleteProduct(id);
    await reloadMenu();
  };

  const loadRecipe = async (productId: string) => {
    const r = await api.fetchProductRecipe(productId);
    setRecipeItems(r);
    setRecipeForm(r.map(x => ({ inventoryItemId: x.inventory_item_id, quantity: x.quantity.toString() })));
    setShowRecipe(productId);
    // Load cost card
    loadCostCard(productId);
  };

  const loadCostCard = async (productId: string) => {
    setCostLoading(true);
    try {
      const cc = await api.fetchRecipeCost(productId);
      setCostCard(cc);
    } catch { setCostCard(null); }
    setCostLoading(false);
  };

  const saveRecipe = async () => {
    if (!showRecipe) return;
    await api.updateProductRecipe(showRecipe, recipeForm.filter(r => r.inventoryItemId && r.quantity).map(r => ({ inventoryItemId: r.inventoryItemId, quantity: parseFloat(r.quantity) })));
    await reloadMenu();
    // Reload cost card after save
    loadCostCard(showRecipe);
  };

  const toggleModGroup = (gid: string) => {
    setForm(f => ({
      ...f,
      modifierGroupIds: f.modifierGroupIds.includes(gid) ? f.modifierGroupIds.filter(x => x !== gid) : [...f.modifierGroupIds, gid],
    }));
  };

  // Live cost calculation from current recipe form
  const liveRecipeCost = recipeForm.reduce((sum, r) => {
    if (!r.inventoryItemId || !r.quantity) return sum;
    const inv = inventory.find(i => i.id === r.inventoryItemId);
    if (!inv || inv.batches.length === 0) return sum;
    const costPerUnit = inv.batches[0]?.cost_per_unit || 0;
    return sum + parseFloat(r.quantity || '0') * costPerUnit;
  }, 0);

  const priceForCost = showRecipe ? (products.find(p => p.id === showRecipe)?.price || 0) : 0;
  const liveMargin = priceForCost > 0 ? ((priceForCost - liveRecipeCost) / priceForCost * 100) : 0;
  const liveProfit = priceForCost - liveRecipeCost;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={S.title}>Productos ({products.length})</h3>
        <button onClick={() => { resetForm(); setShowForm(true); }} style={{ ...S.btn, ...S.btnPrimary }}>+ Nuevo Producto</button>
      </div>

      {showForm && (
        <div style={S.card}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{editId ? 'Editar' : 'Nuevo'} Producto</h4>
          <div style={S.formRow}>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Nombre del producto *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} />
              <Tooltip text="Nombre que aparecera en el menu y en los tickets (ej: Latte, Americano, Croissant)."><span /></Tooltip>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Abreviatura" value={form.shortName} onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))} style={S.input} />
              <Tooltip text="Codigo corto para el KDS y tickets (ej: LATTE, AMRCNO)."><span /></Tooltip>
            </div>
          </div>
          <div style={S.formRow}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Precio *" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={S.input} />
              <Tooltip text="Precio de venta al publico en MXN."><span /></Tooltip>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} style={{ ...S.select, flex: 1 }}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Tooltip text="Categoria del menu. Determina la estacion KDS."><span /></Tooltip>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <Tooltip text="Grupos de opciones que aplican a este producto.">
              <span style={S.label}>Grupos de modificadores:</span>
            </Tooltip>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {modifierGroups.map(g => (
                <button key={g.id} onClick={() => toggleModGroup(g.id)}
                  style={{ ...S.badge, backgroundColor: form.modifierGroupIds.includes(g.id) ? 'var(--accent)' : 'var(--bg-hover)', color: form.modifierGroupIds.includes(g.id) ? 'var(--accent-text)' : 'var(--text-secondary)', cursor: 'pointer', border: 'none' }}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} style={{ ...S.btn, ...S.btnPrimary }}>Guardar</button>
            <button onClick={resetForm} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ─── Recipe Editor with LIVE Cost Card ─── */}
      {showRecipe && (
        <div style={S.card}>
          <Tooltip text="Define los insumos que se consumen al vender este producto. El costo se calcula en tiempo real.">
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Receta: {products.find(p => p.id === showRecipe)?.name}
            </h4>
          </Tooltip>

          {/* Interactive recipe table */}
          <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12 }}>
            {/* Table header */}
            <div style={{ display: 'flex', padding: '8px 12px', backgroundColor: 'var(--bg-hover)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>
              <span style={{ flex: 3 }}>Insumo</span>
              <span style={{ width: 90, textAlign: 'center' }}>Cantidad</span>
              <span style={{ width: 70, textAlign: 'center' }}>Unidad</span>
              <span style={{ width: 90, textAlign: 'right' }}>Costo/u</span>
              <span style={{ width: 90, textAlign: 'right' }}>Costo linea</span>
              <span style={{ width: 40 }}></span>
            </div>

            {recipeForm.map((r, i) => {
              const inv = inventory.find(it => it.id === r.inventoryItemId);
              const costPerUnit = inv && inv.batches.length > 0 ? inv.batches[0].cost_per_unit : 0;
              const qty = parseFloat(r.quantity) || 0;
              const lineCost = qty * costPerUnit;

              return (
                <div key={i} style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', backgroundColor: 'var(--bg-card)' }}>
                  <div style={{ flex: 3 }}>
                    <select value={r.inventoryItemId} onChange={e => { const nf = [...recipeForm]; nf[i].inventoryItemId = e.target.value; setRecipeForm(nf); }} style={{ ...S.select, width: '100%', fontSize: 12 }}>
                      <option value="">-- Seleccionar insumo --</option>
                      {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 90, textAlign: 'center' }}>
                    <input type="number" value={r.quantity} onChange={e => { const nf = [...recipeForm]; nf[i].quantity = e.target.value; setRecipeForm(nf); }} style={{ ...S.input, width: 70, textAlign: 'center', fontSize: 12 }} />
                  </div>
                  <span style={{ width: 70, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{inv?.unit || '-'}</span>
                  <span style={{ width: 90, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>${costPerUnit.toFixed(4)}</span>
                  <span style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: 700, color: lineCost > 0 ? 'var(--text-primary)' : 'var(--text-faint)' }}>${lineCost.toFixed(2)}</span>
                  <div style={{ width: 40, textAlign: 'center' }}>
                    <button onClick={() => setRecipeForm(f => f.filter((_, j) => j !== i))} style={{ ...S.btn, ...S.btnDanger, padding: '2px 8px', fontSize: 11 }}>x</button>
                  </div>
                </div>
              );
            })}

            {recipeForm.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                Sin insumos. Agrega insumos para ver el costeo.
              </div>
            )}
          </div>

          {/* ─── LIVE Cost Card Totals ─── */}
          <div style={{
            backgroundColor: 'var(--bg-tertiary)', border: '2px solid var(--border)',
            borderRadius: 10, padding: 16, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>TARJETA DE COSTOS</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Precio venta: ${priceForCost.toFixed(0)} MXN</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)' }}>${liveRecipeCost.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>Costo Total Receta</div>
              </div>
              <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>${liveProfit.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>Ganancia Bruta</div>
              </div>
              <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{
                  fontSize: 22, fontWeight: 800,
                  color: liveMargin >= 70 ? 'var(--success)' : liveMargin >= 50 ? 'var(--warning)' : 'var(--danger)',
                }}>
                  {liveMargin.toFixed(1)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>Margen Utilidad</div>
              </div>
            </div>
            {liveMargin < 50 && liveRecipeCost > 0 && (
              <div style={{ marginTop: 8, padding: '6px 12px', backgroundColor: 'var(--danger-bg)', borderRadius: 6, fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
                ⚠ Margen bajo. Revisa los costos de insumos o ajusta el precio de venta.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setRecipeForm(f => [...f, { inventoryItemId: '', quantity: '' }])} style={{ ...S.btn, ...S.btnSecondary }}>+ Insumo</button>
            <button onClick={saveRecipe} style={{ ...S.btn, ...S.btnPrimary }}>Guardar Receta</button>
            <button onClick={() => { setShowRecipe(null); setCostCard(null); }} style={{ ...S.btn, ...S.btnSecondary }}>Cerrar</button>
          </div>
        </div>
      )}

      <div style={S.grid}>
        {products.map(p => {
          const cat = categories.find(c => c.id === p.category_id);
          return (
            <div key={p.id} style={S.item}>
              <div>
                <div style={S.itemName}>{p.name}</div>
                <div style={S.itemSub}>${p.price} - {cat?.name || '?'} - {p.recipe.length} insumos</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => loadRecipe(p.id)} style={{ ...S.btn, ...S.btnSecondary, padding: '4px 8px', fontSize: 11 }}>Receta</button>
                <button onClick={() => handleEdit(p)} style={{ ...S.btn, ...S.btnSecondary, padding: '4px 8px', fontSize: 11 }}>Editar</button>
                <button onClick={() => handleDelete(p.id)} style={{ ...S.btn, ...S.btnDanger, padding: '4px 8px', fontSize: 11 }}>Eliminar</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Categories Manager ────────────────────────────────────────────────────

function CategoriesManager() {
  const { categories, reloadMenu } = useStore();
  const [form, setForm] = useState({ name: '', color: '#78350F', kdsStation: 'bar', sortOrder: '0' });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleSave = async () => {
    if (!form.name) return;
    if (editId) {
      await api.updateCategory(editId, { name: form.name, color: form.color, kdsStation: form.kdsStation, sortOrder: parseInt(form.sortOrder) });
    } else {
      await api.createCategory({ name: form.name, color: form.color, kdsStation: form.kdsStation, sortOrder: parseInt(form.sortOrder) });
    }
    await reloadMenu();
    setShowForm(false); setEditId(null); setForm({ name: '', color: '#78350F', kdsStation: 'bar', sortOrder: '0' });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={S.title}>Categorias ({categories.length})</h3>
        <button onClick={() => setShowForm(true)} style={{ ...S.btn, ...S.btnPrimary }}>+ Nueva Categoria</button>
      </div>
      {showForm && (
        <div style={S.card}>
          <div style={S.formRow}>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Nombre de la categoria *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} />
              <Tooltip text="Nombre visible en el menu del POS."><span /></Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
              <Tooltip text="Color que identifica esta categoria."><span /></Tooltip>
            </div>
          </div>
          <div style={S.formRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <select value={form.kdsStation} onChange={e => setForm(f => ({ ...f, kdsStation: e.target.value }))} style={S.select}>
                <option value="bar">Barra</option>
                <option value="kitchen">Cocina</option>
                <option value="none">Sin KDS</option>
              </select>
              <Tooltip text="Estacion KDS para esta categoria."><span /></Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Orden" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} style={{ ...S.input, width: 80 }} />
              <Tooltip text="Orden de aparicion en el menu."><span /></Tooltip>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} style={{ ...S.btn, ...S.btnPrimary }}>Guardar</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={S.grid}>
        {categories.map(c => (
          <div key={c.id} style={{ ...S.item, borderLeft: `4px solid ${c.color}` }}>
            <div>
              <div style={S.itemName}>{c.name}</div>
              <div style={S.itemSub}>KDS: {c.kds_station} | Orden: {c.sort_order}</div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => { setForm({ name: c.name, color: c.color, kdsStation: c.kds_station, sortOrder: String(c.sort_order) }); setEditId(c.id); setShowForm(true); }} style={{ ...S.btn, ...S.btnSecondary, padding: '4px 8px', fontSize: 11 }}>Editar</button>
              <button onClick={async () => { await api.deleteCategory(c.id); reloadMenu(); }} style={{ ...S.btn, ...S.btnDanger, padding: '4px 8px', fontSize: 11 }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Inventory Items Manager ───────────────────────────────────────────────

function InventoryManager() {
  const { inventory, fetchInventory } = useStore();
  const [form, setForm] = useState({ name: '', unit: 'pz', isPerishable: false, minimumStock: '0' });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [receiveFor, setReceiveFor] = useState<string | null>(null);
  const [receiveForm, setReceiveForm] = useState({ quantity: '', costPerUnit: '', expiresAt: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const [receiveErrors, setReceiveErrors] = useState<string[]>([]);

  useEffect(() => { fetchInventory(); }, []);

  const handleSave = async () => {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push('Nombre es obligatorio');
    if (!form.unit) errs.push('Unidad es obligatoria');
    if (!form.minimumStock || parseFloat(form.minimumStock) < 0) errs.push('Stock minimo es obligatorio (>= 0)');
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    if (editId) {
      await api.updateInventoryItem(editId, { name: form.name, unit: form.unit, isPerishable: form.isPerishable, minimumStock: parseFloat(form.minimumStock) });
    } else {
      await api.createInventoryItem({ name: form.name, unit: form.unit, isPerishable: form.isPerishable, minimumStock: parseFloat(form.minimumStock) });
    }
    await fetchInventory();
    setShowForm(false); setEditId(null); setForm({ name: '', unit: 'pz', isPerishable: false, minimumStock: '0' });
  };

  const handleReceive = async () => {
    const errs: string[] = [];
    if (!receiveFor) return;
    if (!receiveForm.quantity || parseFloat(receiveForm.quantity) <= 0) errs.push('Cantidad es obligatoria (> 0)');
    if (!receiveForm.costPerUnit || parseFloat(receiveForm.costPerUnit) <= 0) errs.push('Costo por unidad es obligatorio (> 0)');
    const invItem = inventory.find(i => i.id === receiveFor);
    if (invItem?.isPerishable && !receiveForm.expiresAt) errs.push('Fecha de caducidad es obligatoria para productos perecederos');
    if (errs.length > 0) { setReceiveErrors(errs); return; }
    setReceiveErrors([]);
    await api.receiveInventory({
      inventoryItemId: receiveFor,
      quantity: parseFloat(receiveForm.quantity),
      costPerUnit: parseFloat(receiveForm.costPerUnit) || 0,
      expiresAt: receiveForm.expiresAt || undefined,
    });
    await fetchInventory();
    setReceiveFor(null);
    setReceiveForm({ quantity: '', costPerUnit: '', expiresAt: '' });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={S.title}>Insumos ({inventory.length})</h3>
        <button onClick={() => { setShowForm(true); setEditId(null); }} style={{ ...S.btn, ...S.btnPrimary }}>+ Nuevo Insumo</button>
      </div>
      {showForm && (
        <div style={S.card}>
          {errors.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 12px', backgroundColor: 'var(--danger-bg)', borderRadius: 8, fontSize: 12, color: 'var(--danger)' }}>
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <div style={S.formRow}>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Nombre del insumo *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} />
              <Tooltip text="El nombre interno del insumo/materia prima."><span /></Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={S.select}>
                <option value="pz">Piezas</option><option value="g">Gramos</option>
                <option value="ml">Mililitros</option><option value="kg">Kilogramos</option>
                <option value="L">Litros</option><option value="oz">Onzas</option>
              </select>
              <Tooltip text="Unidad de control del insumo."><span /></Tooltip>
            </div>
          </div>
          <div style={S.formRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={form.isPerishable} onChange={e => setForm(f => ({ ...f, isPerishable: e.target.checked }))} /> Perecedero
              </label>
              <Tooltip text="Marca si tiene fecha de caducidad."><span /></Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Stock minimo" type="number" value={form.minimumStock} onChange={e => setForm(f => ({ ...f, minimumStock: e.target.value }))} style={{ ...S.input, width: 120 }} />
              <Tooltip text="Cantidad minima para alertas."><span /></Tooltip>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} style={{ ...S.btn, ...S.btnPrimary }}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
          </div>
        </div>
      )}
      {receiveFor && (
        <div style={S.card}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Recibir Lote: {inventory.find(i => i.id === receiveFor)?.name}</h4>
          {receiveErrors.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 12px', backgroundColor: 'var(--danger-bg)', borderRadius: 8, fontSize: 12, color: 'var(--danger)' }}>
              {receiveErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <div style={S.formRow}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Cantidad *" type="number" value={receiveForm.quantity} onChange={e => setReceiveForm(f => ({ ...f, quantity: e.target.value }))} style={S.input} />
              <Tooltip text="Unidades recibidas del proveedor."><span /></Tooltip>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Costo/unidad *" type="number" step="0.01" value={receiveForm.costPerUnit} onChange={e => setReceiveForm(f => ({ ...f, costPerUnit: e.target.value }))} style={S.input} />
              <Tooltip text="Costo por unidad individual."><span /></Tooltip>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input type="date" value={receiveForm.expiresAt} onChange={e => setReceiveForm(f => ({ ...f, expiresAt: e.target.value }))} style={S.input} />
              <Tooltip text={inventory.find(i => i.id === receiveFor)?.isPerishable ? "OBLIGATORIO para perecederos." : "Opcional para no perecederos."}><span /></Tooltip>
              {inventory.find(i => i.id === receiveFor)?.isPerishable && <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700 }}>*</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReceive} style={{ ...S.btn, ...S.btnPrimary }}>Recibir</button>
            <button onClick={() => setReceiveFor(null)} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
        {inventory.map(inv => (
          <div key={inv.id} style={{ ...S.item, borderLeft: `4px solid ${inv.stock < inv.minimumStock ? '#EF4444' : '#10B981'}`, flexDirection: 'column' as const, gap: 8, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={S.itemName}>{inv.name}</div>
                <div style={S.itemSub}>Stock: {inv.stock.toFixed(inv.unit === 'pz' ? 0 : 1)} {inv.unit} | Mín: {inv.minimumStock} {inv.unit}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => setReceiveFor(inv.id)} style={{ ...S.btn, ...S.btnPrimary, padding: '4px 8px', fontSize: 11 }}>+Lote</button>
                <button onClick={() => { setForm({ name: inv.name, unit: inv.unit, isPerishable: inv.isPerishable, minimumStock: String(inv.minimumStock) }); setEditId(inv.id); setShowForm(true); }} style={{ ...S.btn, ...S.btnSecondary, padding: '4px 8px', fontSize: 11 }}>Editar</button>
                <button onClick={async () => { if (confirm(`¿Eliminar "${inv.name}" del inventario?`)) { await api.deleteInventoryItem(inv.id); fetchInventory(); } }} style={{ ...S.btn, ...S.btnDanger, padding: '4px 8px', fontSize: 11 }}>Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Users Manager ─────────────────────────────────────────────────────────

function UsersManager() {
  type UserRow = { id: string; name: string; role: string; operator_type?: string | null; is_active: number };
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ name: '', pin: '', role: 'operador', operatorType: 'cajero' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => { setUsers(await api.fetchUsers()); };
  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ name: '', pin: '', role: 'operador', operatorType: 'cajero' }); setEditingId(null); setShowForm(false); setShowPin(false); };

  const startEdit = (u: UserRow) => {
    setForm({ name: u.name, pin: '', role: u.role, operatorType: u.operator_type || 'cajero' });
    setEditingId(u.id);
    setShowForm(true);
    setShowPin(false);
  };

  const handleSave = async () => {
    if (!form.name) return;
    if (!editingId && form.pin.length !== 6) return;
    if (editingId) {
      const payload: any = { name: form.name, role: form.role };
      if (form.role === 'operador') payload.operatorType = form.operatorType;
      if (form.pin.length === 6) payload.pin = form.pin;
      await api.updateUser(editingId, payload);
    } else {
      if (form.pin.length !== 6) return;
      const payload: any = { name: form.name, pin: form.pin, role: form.role };
      if (form.role === 'operador') payload.operatorType = form.operatorType;
      await api.createUser(payload);
    }
    await load();
    resetForm();
  };

  const handleDelete = async (id: string) => {
    try { await api.deleteUser(id); await load(); } catch (e: any) { alert(e.message); }
    setDeleting(null);
  };

  const toggleActive = async (u: UserRow) => {
    await api.updateUser(u.id, { isActive: !u.is_active });
    await load();
  };

  const roleLabel = (u: UserRow) => {
    if (u.role === 'admin') return 'Administrador';
    if (u.role === 'supervisor') return 'Supervisor';
    if (u.role === 'operador') {
      if (u.operator_type === 'cajero') return 'Cajero';
      if (u.operator_type === 'barista') return 'Barista';
      if (u.operator_type === 'cocina') return 'Cocina';
      return 'Operador';
    }
    return u.role;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={S.title}>Usuarios ({users.length})</h3>
        <button onClick={() => { resetForm(); setShowForm(true); }} style={{ ...S.btn, ...S.btnPrimary }}>+ Nuevo Usuario</button>
      </div>

      {showForm && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            {editingId ? 'Editar Usuario' : 'Nuevo Usuario'}
          </div>
          <div style={{ ...S.formRow, flexWrap: 'wrap' as const }} data-admin-form>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Nombre</label>
              <input placeholder="Nombre completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} />
            </div>
            <div style={{ flex: '0 1 160px', position: 'relative' as const }}>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                PIN {editingId && '(dejar vacío para no cambiar)'}
              </label>
              <div style={{ position: 'relative' as const }}>
                <input type={showPin ? 'text' : 'password'} placeholder="6 dígitos" maxLength={6}
                  value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                  style={{ ...S.input, paddingRight: 36 }} />
                <button onClick={() => setShowPin(!showPin)} type="button"
                  style={{ position: 'absolute' as const, right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 14, padding: 0 }}>
                  {showPin ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div style={{ flex: '0 1 140px' }}>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Rol</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={S.select}>
                <option value="admin">Administrador</option>
                <option value="supervisor">Supervisor</option>
                <option value="operador">Operador</option>
              </select>
            </div>
            {form.role === 'operador' && (
              <div style={{ flex: '0 1 160px' }}>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Tipo</label>
                <select value={form.operatorType} onChange={e => setForm(f => ({ ...f, operatorType: e.target.value }))} style={S.select}>
                  <option value="cajero">Cajero</option>
                  <option value="barista">Barista (KDS Barra)</option>
                  <option value="cocina">Cocina (KDS Cocina)</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} style={{ ...S.btn, ...S.btnPrimary }}>{editingId ? 'Guardar cambios' : 'Crear usuario'}</button>
            <button onClick={resetForm} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={S.grid} data-admin-grid>
        {users.map(u => (
          <div key={u.id} style={{ ...S.item, opacity: u.is_active ? 1 : 0.5, flexDirection: 'column' as const, alignItems: 'stretch', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={S.itemName}>{u.name}</div>
                <div style={S.itemSub}>{roleLabel(u)} {!u.is_active && '· Inactivo'}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => startEdit(u)} style={{ ...S.btn, ...S.btnSecondary, padding: '4px 8px', fontSize: 11 }}>Editar</button>
                <button onClick={() => toggleActive(u)} style={{ ...S.btn, padding: '4px 8px', fontSize: 11, backgroundColor: u.is_active ? 'var(--warning-bg)' : 'var(--success-bg)', color: u.is_active ? 'var(--warning)' : 'var(--success)', border: 'none' }}>
                  {u.is_active ? 'Desactivar' : 'Activar'}
                </button>
                {u.role !== 'admin' && (
                  deleting === u.id ? (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => handleDelete(u.id)} style={{ ...S.btn, ...S.btnDanger, padding: '4px 8px', fontSize: 10 }}>Confirmar</button>
                      <button onClick={() => setDeleting(null)} style={{ ...S.btn, ...S.btnSecondary, padding: '4px 8px', fontSize: 10 }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleting(u.id)} style={{ ...S.btn, ...S.btnDanger, padding: '4px 8px', fontSize: 11 }}>Eliminar</button>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dynamic Modifiers Manager (Multi-option) ──────────────────────────────

function ModifiersManager() {
  const { modifierGroups, reloadMenu } = useStore();
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', selectionType: 'single', isRequired: false, minSelections: '0', maxSelections: '1' });

  // Dynamic multi-option creation
  const [showBatchCreate, setShowBatchCreate] = useState<string | null>(null);
  const [optionCount, setOptionCount] = useState(3);
  const [dynamicOptions, setDynamicOptions] = useState<Array<{ name: string; shortName: string; priceAdjustment: string; isDefault: boolean }>>([]);
  const [batchStep, setBatchStep] = useState<'count' | 'fill'>('count');

  // Single modifier add
  const [showModForm, setShowModForm] = useState<string | null>(null);
  const [modForm, setModForm] = useState({ name: '', shortName: '', priceAdjustment: '0', isDefault: false });

  const handleSaveGroup = async () => {
    if (!groupForm.name) return;
    await api.createModifierGroup({
      name: groupForm.name,
      selectionType: groupForm.selectionType,
      isRequired: groupForm.isRequired,
      minSelections: parseInt(groupForm.minSelections) || 0,
      maxSelections: parseInt(groupForm.maxSelections) || (groupForm.selectionType === 'multiple' ? 5 : 1),
    });
    await reloadMenu();
    setShowGroupForm(false);
    setGroupForm({ name: '', selectionType: 'single', isRequired: false, minSelections: '0', maxSelections: '1' });
  };

  const handleSaveMod = async () => {
    if (!showModForm || !modForm.name) return;
    await api.createModifier({ groupId: showModForm, name: modForm.name, shortName: modForm.shortName, priceAdjustment: parseFloat(modForm.priceAdjustment) || 0, isDefault: modForm.isDefault });
    await reloadMenu();
    setShowModForm(null); setModForm({ name: '', shortName: '', priceAdjustment: '0', isDefault: false });
  };

  // Start batch creation flow
  const startBatchCreate = (groupId: string) => {
    setShowBatchCreate(groupId);
    setOptionCount(3);
    setDynamicOptions([]);
    setBatchStep('count');
  };

  // Generate dynamic fields
  const generateFields = () => {
    const opts = Array.from({ length: optionCount }, (_, i) => ({
      name: '', shortName: '', priceAdjustment: '0', isDefault: i === 0,
    }));
    setDynamicOptions(opts);
    setBatchStep('fill');
  };

  // Save all batch options
  const saveBatchOptions = async () => {
    if (!showBatchCreate) return;
    for (const opt of dynamicOptions) {
      if (!opt.name.trim()) continue;
      await api.createModifier({
        groupId: showBatchCreate,
        name: opt.name,
        shortName: opt.shortName || opt.name.slice(0, 5).toUpperCase(),
        priceAdjustment: parseFloat(opt.priceAdjustment) || 0,
        isDefault: opt.isDefault,
      });
    }
    await reloadMenu();
    setShowBatchCreate(null);
    setDynamicOptions([]);
    setBatchStep('count');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={S.title}>Grupos de Modificadores ({modifierGroups.length})</h3>
        <button onClick={() => setShowGroupForm(true)} style={{ ...S.btn, ...S.btnPrimary }}>+ Nuevo Grupo</button>
      </div>

      {/* Group creation form */}
      {showGroupForm && (
        <div style={S.card}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Nuevo Grupo de Modificadores</h4>
          <div style={S.formRow}>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <input placeholder="Nombre del grupo (ej: Hielo, Syrups)" value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} style={S.input} />
              <Tooltip text="Nombre del grupo de opciones (ej: 'Hielo' con Sin/Poco/Normal/Extra)."><span /></Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <select value={groupForm.selectionType} onChange={e => {
                const st = e.target.value;
                setGroupForm(f => ({
                  ...f, selectionType: st,
                  maxSelections: st === 'multiple' ? '3' : '1',
                  minSelections: st === 'multiple' ? '0' : '0',
                }));
              }} style={S.select}>
                <option value="single">Seleccion unica</option>
                <option value="multiple">Seleccion multiple</option>
              </select>
              <Tooltip text="'Unica' = solo una opcion. 'Multiple' = varias simultaneas."><span /></Tooltip>
            </div>
          </div>
          {groupForm.selectionType === 'multiple' && (
            <div style={S.formRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={S.label}>Min:</span>
                <input type="number" min="0" value={groupForm.minSelections} onChange={e => setGroupForm(f => ({ ...f, minSelections: e.target.value }))} style={{ ...S.input, width: 60 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={S.label}>Max:</span>
                <input type="number" min="1" value={groupForm.maxSelections} onChange={e => setGroupForm(f => ({ ...f, maxSelections: e.target.value }))} style={{ ...S.input, width: 60 }} />
              </div>
            </div>
          )}
          <div style={S.formRow}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={groupForm.isRequired} onChange={e => setGroupForm(f => ({ ...f, isRequired: e.target.checked }))} /> Requerido
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSaveGroup} style={{ ...S.btn, ...S.btnPrimary }}>Crear</button>
            <button onClick={() => setShowGroupForm(false)} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ─── Dynamic Batch Create Modal ─── */}
      {showBatchCreate && (
        <div style={{ ...S.card, border: '2px solid var(--accent)' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Crear Opciones: {modifierGroups.find(g => g.id === showBatchCreate)?.name}
          </h4>

          {batchStep === 'count' ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
                ¿Cuantas opciones quieres agregar a este grupo?
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                {[2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => setOptionCount(n)}
                    style={{
                      width: 40, height: 40, borderRadius: 8,
                      border: optionCount === n ? '2px solid var(--accent)' : '1px solid var(--border)',
                      backgroundColor: optionCount === n ? 'var(--accent)' : 'var(--bg-card)',
                      color: optionCount === n ? 'var(--accent-text)' : 'var(--text-primary)',
                      fontWeight: 700, fontSize: 16, cursor: 'pointer',
                    }}>
                    {n}
                  </button>
                ))}
                <input type="number" min="2" max="10" value={optionCount}
                  onChange={e => setOptionCount(Math.max(2, Math.min(10, parseInt(e.target.value) || 2)))}
                  style={{ ...S.input, width: 60, textAlign: 'center' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={generateFields} style={{ ...S.btn, ...S.btnPrimary }}>Continuar</button>
                <button onClick={() => setShowBatchCreate(null)} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Nombra cada opcion. El cajero vera estas opciones como botones (radio/select).
              </p>
              {/* Header */}
              <div style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const }}>
                <span style={{ width: 30 }}>#</span>
                <span style={{ flex: 2 }}>Nombre</span>
                <span style={{ flex: 1 }}>Abreviatura</span>
                <span style={{ width: 80 }}>Ajuste $</span>
                <span style={{ width: 70 }}>Default</span>
              </div>
              {dynamicOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ width: 30, fontSize: 13, fontWeight: 700, color: 'var(--text-faint)' }}>{i + 1}</span>
                  <input placeholder={`Opcion ${i + 1} (ej: Sin hielo)`} value={opt.name}
                    onChange={e => { const opts = [...dynamicOptions]; opts[i].name = e.target.value; setDynamicOptions(opts); }}
                    style={{ ...S.input, flex: 2 }} />
                  <input placeholder="ABREV" value={opt.shortName}
                    onChange={e => { const opts = [...dynamicOptions]; opts[i].shortName = e.target.value; setDynamicOptions(opts); }}
                    style={{ ...S.input, flex: 1 }} />
                  <input type="number" placeholder="0" value={opt.priceAdjustment}
                    onChange={e => { const opts = [...dynamicOptions]; opts[i].priceAdjustment = e.target.value; setDynamicOptions(opts); }}
                    style={{ ...S.input, width: 80 }} />
                  <label style={{ width: 70, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-primary)' }}>
                    <input type="radio" name="defaultOpt" checked={opt.isDefault}
                      onChange={() => {
                        const opts = dynamicOptions.map((o, j) => ({ ...o, isDefault: j === i }));
                        setDynamicOptions(opts);
                      }} />
                    Def
                  </label>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={saveBatchOptions} style={{ ...S.btn, ...S.btnPrimary }}>Guardar Todas</button>
                <button onClick={() => setBatchStep('count')} style={{ ...S.btn, ...S.btnSecondary }}>Atras</button>
                <button onClick={() => setShowBatchCreate(null)} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Single modifier add */}
      {showModForm && (
        <div style={S.card}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Nuevo Modificador en: {modifierGroups.find(g => g.id === showModForm)?.name}</h4>
          <div style={S.formRow}>
            <input placeholder="Nombre (ej: Sin Hielo)" value={modForm.name} onChange={e => setModForm(f => ({ ...f, name: e.target.value }))} style={{ ...S.input, flex: 2 }} />
            <input placeholder="Abreviatura" value={modForm.shortName} onChange={e => setModForm(f => ({ ...f, shortName: e.target.value }))} style={{ ...S.input, flex: 1 }} />
            <input placeholder="Ajuste $" type="number" value={modForm.priceAdjustment} onChange={e => setModForm(f => ({ ...f, priceAdjustment: e.target.value }))} style={{ ...S.input, width: 80 }} />
          </div>
          <div style={S.formRow}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={modForm.isDefault} onChange={e => setModForm(f => ({ ...f, isDefault: e.target.checked }))} /> Por defecto
            </label>
            <Tooltip text="Si esta marcado, se selecciona automaticamente."><span /></Tooltip>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSaveMod} style={{ ...S.btn, ...S.btnPrimary }}>Crear</button>
            <button onClick={() => setShowModForm(null)} style={{ ...S.btn, ...S.btnSecondary }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Groups list */}
      {modifierGroups.map(g => (
        <div key={g.id} style={{ ...S.card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{g.name}</span>
              <span style={{ ...S.badge, backgroundColor: g.isRequired ? 'var(--danger-bg)' : 'var(--bg-hover)', color: g.isRequired ? 'var(--danger)' : 'var(--text-muted)' }}>
                {g.isRequired ? 'Requerido' : 'Opcional'}
              </span>
              <span style={{ ...S.badge, backgroundColor: g.selectionType === 'multiple' ? 'var(--info-bg)' : 'var(--bg-hover)', color: g.selectionType === 'multiple' ? 'var(--info)' : 'var(--text-muted)' }}>
                {g.selectionType === 'multiple' ? `Multiple (${g.minSelections}-${g.maxSelections})` : 'Unica'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => startBatchCreate(g.id)} style={{ ...S.btn, backgroundColor: '#7C3AED', color: '#FFF', padding: '4px 10px', fontSize: 11 }}>+ Multi Opciones</button>
              <button onClick={() => setShowModForm(g.id)} style={{ ...S.btn, ...S.btnPrimary, padding: '4px 8px', fontSize: 11 }}>+ Uno</button>
              <button onClick={async () => { await api.deleteModifierGroup(g.id); reloadMenu(); }} style={{ ...S.btn, ...S.btnDanger, padding: '4px 8px', fontSize: 11 }}>Eliminar</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {g.modifiers.map(m => (
              <div key={m.id} style={{ padding: '6px 10px', borderRadius: 6, backgroundColor: 'var(--bg-hover)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</span>
                {m.priceAdjustment > 0 && <span style={{ color: 'var(--success)' }}>+${m.priceAdjustment}</span>}
                {m.isDefault && <span style={{ ...S.badge, backgroundColor: 'var(--info-bg)', color: 'var(--info)' }}>Default</span>}
                <button onClick={async () => { await api.deleteModifier(m.id); reloadMenu(); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: 0 }}>x</button>
              </div>
            ))}
            {g.modifiers.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>Sin opciones — agrega modificadores</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Audit Log Viewer ─────────────────────────────────────────────────────

function AuditViewer() {
  const [logs, setLogs] = useState<api.AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [filterRole, setFilterRole] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const load = useCallback((role: string, action: string, from: string, to: string) => {
    const filters: api.AuditFilters = { limit: 50 };
    if (role) filters.role = role;
    if (action) filters.action = action;
    if (from) (filters as any).from = from;
    if (to) (filters as any).to = to;
    api.fetchAuditLog(filters).then(r => { setLogs(r.logs); setTotal(r.total); });
  }, []);

  // Debounced filter: waits 400ms after last change before querying
  useEffect(() => {
    const timer = setTimeout(() => {
      load(filterRole, filterAction, filterFrom, filterTo);
    }, 400);
    return () => clearTimeout(timer);
  }, [filterRole, filterAction, filterFrom, filterTo, load]);

  const actionLabel = (a: string) => {
    const map: Record<string, string> = {
      login: 'Inicio sesión', login_failed: 'Login fallido',
      order_created: 'Orden creada', waste_registered: 'Merma registrada',
      product_created: 'Producto creado', product_updated: 'Producto editado', product_deleted: 'Producto eliminado',
      category_created: 'Categoría creada', category_updated: 'Categoría editada', category_deleted: 'Categoría eliminada',
      inventory_received: 'Inventario recibido', inventory_item_created: 'Insumo creado', inventory_item_updated: 'Insumo editado',
      user_created: 'Usuario creado', user_updated: 'Usuario editado',
      recipe_updated: 'Receta editada', modifier_group_created: 'Grupo mod. creado',
      modifier_created: 'Modificador creado', modifier_deleted: 'Modificador eliminado',
      override_authorized: 'Override autorizado', override_denied: 'Override denegado',
      order_cancelled: 'Orden cancelada',
    };
    return map[a] || a;
  };

  const actionColor = (a: string) => {
    if (a.includes('created')) return { bg: 'var(--success-bg)', color: 'var(--success)' };
    if (a.includes('deleted')) return { bg: 'var(--danger-bg)', color: 'var(--danger)' };
    if (a.includes('updated')) return { bg: 'var(--warning-bg)', color: 'var(--warning)' };
    if (a === 'login') return { bg: 'var(--info-bg)', color: 'var(--info)' };
    if (a === 'login_failed') return { bg: 'var(--danger-bg)', color: 'var(--danger)' };
    return { bg: 'var(--info-bg)', color: 'var(--info)' };
  };

  const ACTIONS = [
    { value: '', label: 'Todas las acciones' },
    { value: 'order_created', label: 'Ordenes creadas' },
    { value: 'order_cancelled', label: 'Ordenes canceladas' },
    { value: 'waste_registered', label: 'Mermas registradas' },
    { value: 'login', label: 'Inicios de sesión' },
    { value: 'login_failed', label: 'Logins fallidos' },
    { value: 'override_authorized', label: 'Override autorizado' },
    { value: 'override_denied', label: 'Override denegado' },
    { value: 'product_created', label: 'Productos creados' },
    { value: 'product_updated', label: 'Productos editados' },
    { value: 'inventory_received', label: 'Inventario recibido' },
    { value: 'recipe_updated', label: 'Recetas editadas' },
    { value: 'user_created', label: 'Usuarios creados' },
  ];

  const ROLES = [
    { value: '', label: 'Todos los roles' },
    { value: 'admin', label: 'Administrador' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'operador', label: 'Operador' },
  ];

  return (
    <div>
      <h3 style={S.title}>Registro de Auditoría ({total} registros)</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...S.select, minWidth: 160 }}>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ ...S.select, minWidth: 180 }}>
          {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Desde</label>
          <input type="datetime-local" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ ...S.input, width: 200 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Hasta</label>
          <input type="datetime-local" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ ...S.input, width: 200 }} />
        </div>
        {(filterRole || filterAction || filterFrom || filterTo) && (
          <button onClick={() => { setFilterRole(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); }} style={{ ...S.btn, ...S.btnSecondary, fontSize: 12 }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-hover)' }}>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Usuario</th>
              <th style={thStyle}>Acción</th>
              <th style={thStyle}>Entidad</th>
              <th style={thStyle}>Detalles</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-faint)', padding: 24 }}>Sin registros con estos filtros</td></tr>
            ) : logs.map(l => {
              const ac = actionColor(l.action);
              return (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={tdStyle}>{new Date(l.created_at).toLocaleString('es-MX')}</td>
                  <td style={tdStyle}><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.user_name || '-'}</span></td>
                  <td style={tdStyle}><span style={{ ...S.badge, backgroundColor: ac.bg, color: ac.color }}>{actionLabel(l.action)}</span></td>
                  <td style={tdStyle}>{l.entity_type || '-'}</td>
                  <td style={{ ...tdStyle, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.details ? (typeof l.details === 'string' ? l.details : JSON.stringify(l.details)) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 };
const tdStyle: React.CSSProperties = { padding: '8px 12px', color: 'var(--text-muted)' };

// ─── Main Admin Screen ─────────────────────────────────────────────────────

export default function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>('products');
  const { currentUser } = useStore();

  if (currentUser?.role !== 'admin') {
    return (
      <div style={{ ...S.container, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600 }}>Acceso denegado. Solo administradores pueden acceder.</p>
      </div>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: 'products', label: 'Productos' },
    { id: 'categories', label: 'Categorías' },
    { id: 'modifiers', label: 'Modificadores' },
    { id: 'inventory', label: 'Insumos' },
    { id: 'users', label: 'Usuarios' },
    { id: 'audit', label: 'Auditoría' },
  ];

  return (
    <div style={S.container}>
      <div style={S.tabs}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.tab, ...(tab === t.id ? S.tabActive : S.tabInactive) }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'products' && <ProductsManager />}
      {tab === 'categories' && <CategoriesManager />}
      {tab === 'modifiers' && <ModifiersManager />}
      {tab === 'inventory' && <InventoryManager />}
      {tab === 'users' && <UsersManager />}
      {tab === 'audit' && <AuditViewer />}
    </div>
  );
}
