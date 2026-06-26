import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DishIngredientRow {
  ingredientId: string;
  name: string;
  slug: string;
  quantity: string | null;
  unit: string | null;
  isOptional: boolean;
  preparationNote: string | null;
  position: number;
}

interface DishCategoryRow {
  categoryId: string;
  name: string;
  slug: string;
  isPrimary: boolean;
}

interface DishPreparationRow {
  id?: string;
  methodId: string;
  methodName: string;
  methodSlug: string;
  steps: string | null;
  durationMinutes: number | null;
  difficulty: number | null;
  sequenceOrder: number;
}

interface DishCore {
  id: string;
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  longDescription: string | null;
  originGeoId: string | null;
  originDateEarliest: number | null;
  originDateLatest: number | null;
  status: 'draft' | 'published' | 'archived';
  viewCount: number;
  updatedAt: string;
  originName?: string | null;
}

interface AdminDishResponse {
  dish: DishCore;
  ingredients: DishIngredientRow[];
  categories: DishCategoryRow[];
  preparations: DishPreparationRow[];
}

interface AdminLookups {
  ingredients: { id: string; name: string; slug: string; category: string | null }[];
  categories: { id: string; name: string; slug: string }[];
  preparationMethods: { id: string; name: string; slug: string }[];
  countries: { id: string; name: string; isoCode: string | null }[];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchAdmin(path: string, apiBase: string, adminKey: string) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { 'X-Admin-Key': adminKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? 'Request failed');
  }
  return res.json() as Promise<unknown>;
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = 'basic' | 'ingredients' | 'preparation' | 'categories';

const TABS: { id: Tab; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'preparation', label: 'Preparation' },
  { id: 'categories', label: 'Categories' },
];

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  dishSlug: string;
  apiBase: string;
  initialDish: AdminDishResponse['dish'] | null;
  lookups: AdminLookups | null;
}

export function AdminDishEditor({ dishSlug, apiBase, initialDish, lookups }: Props) {
  const adminKey = (typeof window !== 'undefined'
    ? (window as unknown as { ENV_ADMIN_KEY?: string }).ENV_ADMIN_KEY ?? ''
    : '') || (typeof import.meta !== 'undefined' ? (import.meta as { env?: { ADMIN_KEY?: string } }).env?.ADMIN_KEY ?? '' : '');

  // Load full dish + lookups if not provided
  const [dishData, setDishData] = useState<AdminDishResponse | null>(
    initialDish ? { dish: initialDish, ingredients: [], categories: [], preparations: [] } : null,
  );
  const [lookupsData, setLookupsData] = useState<AdminLookups | null>(lookups);
  const [loading, setLoading] = useState(!initialDish || !lookups);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (dishData && lookupsData) return;
    Promise.all([
      fetchAdmin(`/api/admin/dishes/${encodeURIComponent(dishSlug)}`, apiBase, adminKey) as Promise<AdminDishResponse>,
      fetchAdmin('/api/admin/lookups', apiBase, adminKey) as Promise<AdminLookups>,
    ])
      .then(([d, l]) => {
        setDishData(d);
        setLookupsData(l);
        setLoading(false);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, [dishSlug]);

  // Form state
  const [activeTab, setActiveTab] = useState<Tab>('basic');
  const [canonicalName, setCanonicalName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [originGeoId, setOriginGeoId] = useState<string>('');
  const [originDateEarliest, setOriginDateEarliest] = useState<string>('');
  const [originDateLatest, setOriginDateLatest] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');

  // Ingredients
  const [ingredients, setIngredients] = useState<DishIngredientRow[]>([]);

  // Preparation
  const [preparations, setPreparations] = useState<DishPreparationRow[]>([]);

  // Categories
  const [categories, setCategories] = useState<DishCategoryRow[]>([]);

  // Dirty tracking
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Sync from loaded dish data
  useEffect(() => {
    if (!dishData) return;
    setCanonicalName(dishData.dish.canonicalName ?? '');
    setShortDescription(dishData.dish.shortDescription ?? '');
    setLongDescription(dishData.dish.longDescription ?? '');
    setOriginGeoId(dishData.dish.originGeoId ?? '');
    setOriginDateEarliest(dishData.dish.originDateEarliest != null ? String(dishData.dish.originDateEarliest) : '');
    setOriginDateLatest(dishData.dish.originDateLatest != null ? String(dishData.dish.originDateLatest) : '');
    setStatus(dishData.dish.status ?? 'draft');
    setIngredients(dishData.ingredients ?? []);
    setPreparations(dishData.preparations ?? []);
    setCategories(dishData.categories ?? []);
    setDirty(false);
  }, [dishData]);

  // ─── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const body = {
        canonicalName: canonicalName || undefined,
        shortDescription: shortDescription || undefined,
        longDescription: longDescription || undefined,
        originGeoId: originGeoId || undefined,
        originDateEarliest: originDateEarliest ? parseInt(originDateEarliest, 10) : undefined,
        originDateLatest: originDateLatest ? parseInt(originDateLatest, 10) : undefined,
        status,
        ingredients: ingredients.map((ing, i) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity || undefined,
          unit: ing.unit || undefined,
          isOptional: ing.isOptional,
          preparationNote: ing.preparationNote || undefined,
          position: i,
        })),
        preparations: preparations.map((p, i) => ({
          methodId: p.methodId,
          steps: p.steps || undefined,
          durationMinutes: p.durationMinutes || undefined,
          difficulty: p.difficulty || undefined,
          sequenceOrder: i,
        })),
        categories: categories.map((c) => ({
          categoryId: c.categoryId,
          isPrimary: c.isPrimary,
        })),
      };
      const res = await fetch(
        `${apiBase}/api/dishes/${encodeURIComponent(dishSlug)}`,
        {
          method: 'PUT',
          headers: { 'X-Admin-Key': adminKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error((err as { message?: string }).message ?? 'Save failed');
      }
      setSaveMsg({ type: 'ok', text: 'Saved successfully' });
      setDirty(false);
      // Reload to get server-generated timestamps
      const updated = (await fetchAdmin(`/api/admin/dishes/${encodeURIComponent(dishSlug)}`, apiBase, adminKey)) as AdminDishResponse;
      setDishData(updated);
    } catch (err: unknown) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }, [canonicalName, shortDescription, longDescription, originGeoId, originDateEarliest, originDateLatest, status, ingredients, preparations, categories]);

  if (loading) {
    return (
      <div className="wrap" style={{ paddingTop: '2rem' }}>
        <p className="sub">Loading dish data…</p>
      </div>
    );
  }

  if (loadError || !dishData || !lookupsData) {
    return (
      <div className="wrap" style={{ paddingTop: '2rem' }}>
        <div className="alert alert-error">
          <strong>Failed to load dish:</strong> {loadError ?? 'Unknown error'}
          <a href="/admin/dishes" style={{ marginLeft: '1rem' }}>← Back to list</a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="wrap" style={{ paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: '1.5rem', margin: 0 }}>
              {canonicalName || <em style={{ color: 'var(--sub)' }}>Untitled dish</em>}
            </h1>
            <p className="mono-sub" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
              /dishes/{dishSlug}
              {dirty && <span style={{ color: 'var(--accent)', marginLeft: '0.5rem' }}>● unsaved</span>}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {saveMsg && (
              <span
                style={{
                  color: saveMsg.type === 'ok' ? '#2d7a4f' : '#b91c1c',
                  fontSize: '0.875rem',
                }}
              >
                {saveMsg.text}
              </span>
            )}
            <button
              className="btn btn-accent"
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{ opacity: dirty ? 1 : 0.5 }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="wrap" style={{ borderBottom: '1px solid var(--line)', marginBottom: '1.5rem' }}>
        <div className="edit-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`edit-tab${activeTab === tab.id ? ' edit-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.id === 'ingredients' && ingredients.length > 0 && (
                <span className="tab-badge">{ingredients.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="wrap" style={{ maxWidth: '800px', paddingBottom: '4rem' }}>

        {/* ── BASIC ── */}
        {activeTab === 'basic' && (
          <div className="edit-section">
            <div className="field-group">
              <label className="field-label" htmlFor="canonicalName">Dish name *</label>
              <input
                id="canonicalName"
                className="input"
                value={canonicalName}
                onChange={(e) => { setCanonicalName(e.target.value); setDirty(true); }}
                placeholder="e.g. Moussaka"
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="shortDescription">Short description</label>
              <textarea
                id="shortDescription"
                className="input"
                rows={3}
                value={shortDescription}
                onChange={(e) => { setShortDescription(e.target.value); setDirty(true); }}
                placeholder="One-sentence description shown in lists and cards."
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="longDescription">Long description</label>
              <textarea
                id="longDescription"
                className="input"
                rows={6}
                value={longDescription}
                onChange={(e) => { setLongDescription(e.target.value); setDirty(true); }}
                placeholder="Full article text. Can include history, cultural context, etc."
              />
            </div>

            <div className="field-row">
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="originGeoId">Origin country</label>
                <select
                  id="originGeoId"
                  className="input"
                  value={originGeoId}
                  onChange={(e) => { setOriginGeoId(e.target.value); setDirty(true); }}
                >
                  <option value="">— unknown —</option>
                  {lookupsData.countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="field-group" style={{ width: '120px' }}>
                <label className="field-label" htmlFor="originDateEarliest">From year</label>
                <input
                  id="originDateEarliest"
                  className="input"
                  type="number"
                  min="0"
                  max="2100"
                  value={originDateEarliest}
                  onChange={(e) => { setOriginDateEarliest(e.target.value); setDirty(true); }}
                  placeholder="1880"
                />
              </div>

              <div className="field-group" style={{ width: '120px' }}>
                <label className="field-label" htmlFor="originDateLatest">To year</label>
                <input
                  id="originDateLatest"
                  className="input"
                  type="number"
                  min="0"
                  max="2100"
                  value={originDateLatest}
                  onChange={(e) => { setOriginDateLatest(e.target.value); setDirty(true); }}
                  placeholder="1920"
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="status">Status</label>
              <select
                id="status"
                className="input"
                style={{ maxWidth: '200px' }}
                value={status}
                onChange={(e) => { setStatus(e.target.value as typeof status); setDirty(true); }}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="edit-meta">
              <span>Views: {dishData.dish.viewCount}</span>
              <span>Updated: {new Date(dishData.dish.updatedAt).toLocaleDateString()}</span>
              <span>ID: {dishData.dish.id.slice(0, 8)}…</span>
            </div>
          </div>
        )}

        {/* ── INGREDIENTS ── */}
        {activeTab === 'ingredients' && (
          <div className="edit-section">
            <p className="sub" style={{ marginBottom: '1rem' }}>
              Link ingredients to this dish. Search by name, set quantity and unit.
            </p>

            {ingredients.length === 0 && (
              <p style={{ color: 'var(--sub)', fontStyle: 'italic' }}>No ingredients linked.</p>
            )}

            <table className="edit-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th style={{ width: '100px' }}>Quantity</th>
                  <th style={{ width: '100px' }}>Unit</th>
                  <th style={{ width: '80px' }}>Optional</th>
                  <th style={{ width: '200px' }}>Prep note</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, i) => (
                  <IngredientRow
                    key={ing.ingredientId + i}
                    ing={ing}
                    lookups={lookupsData.ingredients}
                    onChange={(updated) => {
                      const next = [...ingredients];
                      next[i] = updated;
                      setIngredients(next);
                      setDirty(true);
                    }}
                    onRemove={() => {
                      setIngredients(ingredients.filter((_, j) => j !== i));
                      setDirty(true);
                    }}
                  />
                ))}
              </tbody>
            </table>

            <AddIngredientRow
              existingIds={new Set(ingredients.map((i) => i.ingredientId))}
              allIngredients={lookupsData.ingredients}
              onAdd={(newIng) => {
                setIngredients([...ingredients, { ...newIng, position: ingredients.length }]);
                setDirty(true);
              }}
            />
          </div>
        )}

        {/* ── PREPARATION ── */}
        {activeTab === 'preparation' && (
          <div className="edit-section">
            <p className="sub" style={{ marginBottom: '1rem' }}>
              Assign a primary preparation method (how the dish is cooked).
            </p>

            {preparations.length === 0 && (
              <p style={{ color: 'var(--sub)', fontStyle: 'italic' }}>No preparation method assigned.</p>
            )}

            {preparations.map((prep, i) => (
              <div key={prep.methodId + i} className="prep-block">
                <div className="field-row">
                  <div className="field-group" style={{ flex: 1 }}>
                    <label className="field-label" htmlFor={`prep-method-${i}`}>Method</label>
                    <select
                      id={`prep-method-${i}`}
                      className="input"
                      value={prep.methodId}
                      onChange={(e) => {
                        const m = lookupsData.preparationMethods.find((m) => m.id === e.target.value);
                        if (!m) return;
                        setPreparations(preparations.map((p, j) =>
                          j === i ? { ...p, methodId: m.id, methodName: m.name, methodSlug: m.slug } : p,
                        ));
                        setDirty(true);
                      }}
                    >
                      <option value="">— select method —</option>
                      {lookupsData.preparationMethods.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group" style={{ width: '100px' }}>
                    <label className="field-label" htmlFor={`prep-dur-${i}`}>Duration (min)</label>
                    <input
                      id={`prep-dur-${i}`}
                      className="input"
                      type="number"
                      min="1"
                      value={prep.durationMinutes ?? ''}
                      onChange={(e) => {
                        setPreparations(preparations.map((p, j) =>
                          j === i ? { ...p, durationMinutes: e.target.value ? parseInt(e.target.value, 10) : null } : p,
                        ));
                        setDirty(true);
                      }}
                    />
                  </div>

                  <div className="field-group" style={{ width: '120px' }}>
                    <label className="field-label" htmlFor={`prep-diff-${i}`}>Difficulty (1–5)</label>
                    <input
                      id={`prep-diff-${i}`}
                      className="input"
                      type="number"
                      min="1"
                      max="5"
                      value={prep.difficulty ?? ''}
                      onChange={(e) => {
                        setPreparations(preparations.map((p, j) =>
                          j === i ? { ...p, difficulty: e.target.value ? parseInt(e.target.value, 10) : null } : p,
                        ));
                        setDirty(true);
                      }}
                    />
                  </div>

                  <button
                    className="btn-ghost btn-remove"
                    style={{ marginTop: '1.5rem' }}
                    onClick={() => { setPreparations(preparations.filter((_, j) => j !== i)); setDirty(true); }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor={`prep-steps-${i}`}>Steps</label>
                  <textarea
                    id={`prep-steps-${i}`}
                    className="input"
                    rows={4}
                    value={prep.steps ?? ''}
                    onChange={(e) => {
                      setPreparations(preparations.map((p, j) =>
                        j === i ? { ...p, steps: e.target.value || null } : p,
                      ));
                      setDirty(true);
                    }}
                    placeholder="Step-by-step instructions..."
                  />
                </div>
              </div>
            ))}

            <button
              className="btn btn-outline"
              onClick={() => {
                setPreparations([
                  ...preparations,
                  { methodId: '', methodName: '', methodSlug: '', steps: null, durationMinutes: null, difficulty: null, sequenceOrder: preparations.length },
                ]);
                setDirty(true);
              }}
            >
              + Add preparation method
            </button>
          </div>
        )}

        {/* ── CATEGORIES ── */}
        {activeTab === 'categories' && (
          <div className="edit-section">
            <p className="sub" style={{ marginBottom: '1rem' }}>
              Assign dish-type categories and families. One category can be marked primary.
            </p>

            {categories.length === 0 && (
              <p style={{ color: 'var(--sub)', fontStyle: 'italic' }}>No categories assigned.</p>
            )}

            <div className="cat-grid">
              {lookupsData.categories.map((cat) => {
                const assigned = categories.find((c) => c.categoryId === cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`cat-chip${assigned ? ' cat-chip-on' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      style={{ display: 'none' }}
                      checked={!!assigned}
                      onChange={() => {
                        if (assigned) {
                          setCategories(categories.filter((c) => c.categoryId !== cat.id));
                        } else {
                          setCategories([...categories, { categoryId: cat.id, name: cat.name, slug: cat.slug, isPrimary: categories.length === 0 }]);
                        }
                        setDirty(true);
                      }}
                    />
                    {cat.name}
                    {assigned?.isPrimary && <span className="cat-primary-badge">primary</span>}
                  </label>
                );
              })}
            </div>

            {categories.length > 1 && (
              <div style={{ marginTop: '1rem' }}>
                <p className="field-label" style={{ marginBottom: '0.5rem' }}>Primary category</p>
                {categories.map((cat) => (
                  <label key={cat.categoryId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="primary-category"
                      checked={cat.isPrimary}
                      onChange={() => {
                        setCategories(categories.map((c) => ({ ...c, isPrimary: c.categoryId === cat.categoryId })));
                        setDirty(true);
                      }}
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ingredient row ────────────────────────────────────────────────────────────

interface IngredientRowProps {
  ing: DishIngredientRow;
  lookups: { id: string; name: string; slug: string }[];
  onChange: (updated: DishIngredientRow) => void;
  onRemove: () => void;
}

function IngredientRow({ ing, lookups, onChange, onRemove }: IngredientRowProps) {
  return (
    <tr>
      <td>
        <select
          className="input"
          style={{ minWidth: '160px' }}
          value={ing.ingredientId}
          onChange={(e) => {
            const sel = lookups.find((l) => l.id === e.target.value);
            if (!sel) return;
            onChange({ ...ing, ingredientId: sel.id, name: sel.name, slug: sel.slug });
          }}
        >
          <option value="">— ingredient —</option>
          {lookups.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          className="input"
          style={{ width: '80px' }}
          value={ing.quantity ?? ''}
          onChange={(e) => onChange({ ...ing, quantity: e.target.value || null })}
          placeholder="2"
        />
      </td>
      <td>
        <input
          className="input"
          style={{ width: '80px' }}
          value={ing.unit ?? ''}
          onChange={(e) => onChange({ ...ing, unit: e.target.value || null })}
          placeholder="cups"
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={ing.isOptional}
          onChange={(e) => onChange({ ...ing, isOptional: e.target.checked })}
        />
      </td>
      <td>
        <input
          className="input"
          value={ing.preparationNote ?? ''}
          onChange={(e) => onChange({ ...ing, preparationNote: e.target.value || null })}
          placeholder="finely diced"
        />
      </td>
      <td>
        <button className="btn-ghost btn-remove" onClick={onRemove} title="Remove">✕</button>
      </td>
    </tr>
  );
}

// ─── Add ingredient row ────────────────────────────────────────────────────────

interface AddIngredientRowProps {
  existingIds: Set<string>;
  allIngredients: { id: string; name: string; slug: string }[];
  onAdd: (ing: DishIngredientRow) => void;
}

function AddIngredientRow({ existingIds, allIngredients, onAdd }: AddIngredientRowProps) {
  const [selectedId, setSelectedId] = useState('');

  const available = allIngredients.filter((i) => !existingIds.has(i.id));

  if (available.length === 0) {
    return <p className="sub" style={{ marginTop: '0.5rem' }}>All ingredients already assigned.</p>;
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
      <select
        className="input"
        style={{ flex: 1, maxWidth: '300px' }}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="">— add ingredient —</option>
        {available.map((i) => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>
      <button
        className="btn btn-outline"
        disabled={!selectedId}
        onClick={() => {
          const sel = allIngredients.find((i) => i.id === selectedId);
          if (!sel) return;
          onAdd({ ingredientId: sel.id, name: sel.name, slug: sel.slug, quantity: null, unit: null, isOptional: false, preparationNote: null, position: 0 });
          setSelectedId('');
        }}
      >
        + Add
      </button>
    </div>
  );
}
