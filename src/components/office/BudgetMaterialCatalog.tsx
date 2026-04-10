import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { BookOpen, ListPlus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BudgetMaterialCatalogRow = {
  id: string;
  category: string | null;
  description: string;
  unit_label: string | null;
  default_quantity: number;
  default_unit_cost: number;
  default_markup_percent: number;
  default_taxable: boolean;
  notes: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

const emptyForm = () => ({
  category: '',
  description: '',
  unit_label: '',
  default_quantity: '1',
  default_unit_cost: '0',
  default_markup_percent: '10',
  default_taxable: true,
  notes: '',
});

function isMissingTableError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || '').toLowerCase();
  return msg.includes('budget_material_catalog') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

type LineItemFormShape = {
  description: string;
  quantity: string;
  unit_cost: string;
  markup_percent: string;
  taxable: boolean;
  notes: string;
};

type BudgetMaterialCatalogLineItemPickerProps = {
  onApply: (patch: Partial<LineItemFormShape>) => void;
  disabled?: boolean;
  className?: string;
};

/** Searchable list; fills the parent line-item form when an entry is chosen. */
export function BudgetMaterialCatalogLineItemPicker({
  onApply,
  disabled,
  className,
}: BudgetMaterialCatalogLineItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BudgetMaterialCatalogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_material_catalog')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('description', { ascending: true });
      if (error) throw error;
      setRows((data as BudgetMaterialCatalogRow[]) || []);
    } catch (e) {
      if (isMissingTableError(e)) {
        toast.error('Price list table is not installed. Apply the latest Supabase migration.');
      } else {
        toast.error((e as Error)?.message || 'Could not load price list');
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const grouped = useMemo(() => {
    const m = new Map<string, BudgetMaterialCatalogRow[]>();
    for (const r of rows) {
      const key = (r.category || '').trim() || 'Uncategorized';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  function applyRow(r: BudgetMaterialCatalogRow) {
    const patch: Partial<LineItemFormShape> = {
      description: r.description,
      quantity: String(r.default_quantity ?? 1),
      unit_cost: String(r.default_unit_cost ?? 0),
      markup_percent: String(r.default_markup_percent ?? 10),
      taxable: r.default_taxable,
    };
    if (r.notes?.trim()) patch.notes = r.notes.trim();
    onApply(patch);
    setOpen(false);
    toast.success('Filled from price list — adjust quantity if needed');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className={cn(className)}>
          <BookOpen className="h-4 w-4 mr-1.5" />
          Price list
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,380px)] p-0" align="end">
        <Command shouldFilter>
          <CommandInput placeholder="Search materials…" />
          <CommandList>
            <CommandEmpty>{loading ? 'Loading…' : 'No matches.'}</CommandEmpty>
            {grouped.map(([cat, items]) => (
              <CommandGroup key={cat} heading={cat}>
                {items.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`${r.description} ${r.category || ''} ${r.unit_label || ''}`}
                    onSelect={() => applyRow(r)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="font-medium text-left">{r.description}</span>
                    <span className="text-xs text-muted-foreground">
                      ${Number(r.default_unit_cost).toFixed(2)}
                      {r.unit_label ? ` / ${r.unit_label}` : ''}
                      {' · '}
                      qty {Number(r.default_quantity)}
                      {' · '}
                      markup {Number(r.default_markup_percent)}%
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type BudgetMaterialCatalogManageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** CRUD for `budget_material_catalog`. */
export function BudgetMaterialCatalogManageDialog({ open, onOpenChange }: BudgetMaterialCatalogManageDialogProps) {
  const [rows, setRows] = useState<BudgetMaterialCatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_material_catalog')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('description', { ascending: true });
      if (error) throw error;
      setRows((data as BudgetMaterialCatalogRow[]) || []);
    } catch (e) {
      if (isMissingTableError(e)) {
        toast.error('Price list table is not installed. Apply the latest Supabase migration.');
      } else {
        toast.error((e as Error)?.message || 'Could not load catalog');
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(r: BudgetMaterialCatalogRow) {
    setEditingId(r.id);
    setForm({
      category: r.category || '',
      description: r.description,
      unit_label: r.unit_label || '',
      default_quantity: String(r.default_quantity ?? 1),
      default_unit_cost: String(r.default_unit_cost ?? 0),
      default_markup_percent: String(r.default_markup_percent ?? 10),
      default_taxable: r.default_taxable,
      notes: r.notes || '',
    });
  }

  async function save() {
    const desc = form.description.trim();
    if (!desc) {
      toast.error('Description is required');
      return;
    }
    const dq = parseFloat(form.default_quantity) || 0;
    const uc = parseFloat(form.default_unit_cost) || 0;
    const mp = parseFloat(form.default_markup_percent) || 0;
    const nextSort =
      editingId != null
        ? rows.find((r) => r.id === editingId)?.sort_order ?? 0
        : (rows.reduce((m, r) => Math.max(m, r.sort_order), 0) || 0) + 1;

    const payload = {
      category: form.category.trim() || null,
      description: desc,
      unit_label: form.unit_label.trim() || null,
      default_quantity: dq,
      default_unit_cost: uc,
      default_markup_percent: mp,
      default_taxable: form.default_taxable,
      notes: form.notes.trim() || null,
      sort_order: nextSort,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('budget_material_catalog').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Updated');
      } else {
        const { error } = await supabase.from('budget_material_catalog').insert([payload]);
        if (error) throw error;
        toast.success('Added');
      }
      startNew();
      await load();
    } catch (e) {
      if (isMissingTableError(e)) {
        toast.error('Price list table is not installed. Apply the latest Supabase migration.');
      } else {
        toast.error((e as Error)?.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this price list item?')) return;
    try {
      const { error } = await supabase.from('budget_material_catalog').delete().eq('id', id);
      if (error) throw error;
      if (editingId === id) startNew();
      toast.success('Removed');
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || 'Delete failed');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Budget price list</DialogTitle>
          <DialogDescription>
            Reusable material lines with default quantity, unit cost, and markup. Use “Price list” when adding a line item
            to fill the form, then save as usual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{editingId ? 'Edit item' : 'New item'}</p>
              {editingId && (
                <Button type="button" variant="ghost" size="sm" onClick={startNew}>
                  Cancel edit
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Concrete"
                />
              </div>
              <div>
                <Label className="text-xs">Unit label</Label>
                <Input
                  value={form.unit_label}
                  onChange={(e) => setForm((f) => ({ ...f, unit_label: e.target.value }))}
                  placeholder="ea, sq ft, LF…"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Line shown on the proposal"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Default qty</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.default_quantity}
                  onChange={(e) => setForm((f) => ({ ...f, default_quantity: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Unit cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.default_unit_cost}
                  onChange={(e) => setForm((f) => ({ ...f, default_unit_cost: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Markup %</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={form.default_markup_percent}
                  onChange={(e) => setForm((f) => ({ ...f, default_markup_percent: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes; copied to line item notes when you pick from the list"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cat-taxable"
                checked={form.default_taxable}
                onCheckedChange={(c) => setForm((f) => ({ ...f, default_taxable: c === true }))}
              />
              <Label htmlFor="cat-taxable" className="text-sm font-normal cursor-pointer">
                Default taxable
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={startNew} disabled={saving}>
                <ListPlus className="h-4 w-4 mr-1" />
                New
              </Button>
              <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
                {editingId ? 'Save changes' : 'Add to list'}
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <p className="text-sm font-medium mb-2">All items {loading ? '(loading…)' : `(${rows.length})`}</p>
            <ScrollArea className="h-[min(50vh,320px)] rounded-md border">
              <ul className="p-2 space-y-2">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-2 rounded-md border bg-background p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {[r.category, r.unit_label].filter(Boolean).join(' · ') || '—'}
                        {' · '}$
                        {Number(r.default_unit_cost).toFixed(2)} × {Number(r.default_quantity)} @ {Number(r.default_markup_percent)}%
                        {r.default_taxable ? '' : ' · non-tax'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void remove(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
