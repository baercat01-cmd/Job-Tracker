import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Search, 
  Package,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { InventoryImport } from '@/components/office/InventoryImport';
import { useNavigate } from 'react-router-dom';

interface InventoryItem {
  id: string;
  sku: string;
  item_name: string;
  rate: number | null;
  account: string;
  category: string;
  smartbuild_data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export default function AdminInventoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('materials_master')
        .select('*')
        .order('category', { ascending: true })
        .order('item_name', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  // Get unique categories
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category || 'Uncategorized'))).sort()];

  // Filter items
  const filteredItems = items.filter(item => {
    // Category filter
    if (selectedCategory !== 'All' && item.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        item.item_name.toLowerCase().includes(search) ||
        item.sku.toLowerCase().includes(search) ||
        item.account.toLowerCase().includes(search) ||
        (item.category || '').toLowerCase().includes(search)
      );
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/office')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Inventory Master</h1>
              <p className="text-muted-foreground">
                Source of truth from Items.csv
              </p>
            </div>
          </div>
          <Button onClick={loadItems} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Import Section */}
        <InventoryImport />

        {/* Search & Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by item name, SKU, account, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Category Tabs */}
              <div className="border-b">
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {categories.map(category => {
                    const count = category === 'All' 
                      ? items.length 
                      : items.filter(i => (i.category || 'Uncategorized') === category).length;
                    
                    return (
                      <Button
                        key={category}
                        variant={selectedCategory === category ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory(category)}
                        className={selectedCategory === category ? 'bg-yellow-500 hover:bg-yellow-600 text-black font-bold' : ''}
                      >
                        {category}
                        <Badge 
                          variant="secondary" 
                          className={`ml-2 ${selectedCategory === category ? 'bg-yellow-700 text-white' : ''}`}
                        >
                          {count}
                        </Badge>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {filteredItems.length.toLocaleString()} items showing
                </span>
                <span>•</span>
                <span>{items.length.toLocaleString()} total items</span>
                <span>•</span>
                <span>{categories.length - 1} categories</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card className="border-2">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 450px)' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-slate-900 text-white z-10">
                <TableRow className="hover:bg-slate-900">
                  <TableHead className="text-white font-bold">SKU</TableHead>
                  <TableHead className="text-white font-bold">Item Name</TableHead>
                  <TableHead className="text-white font-bold">Category</TableHead>
                  <TableHead className="text-white font-bold">Account</TableHead>
                  <TableHead className="text-white font-bold text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
                      <p className="text-muted-foreground">Loading inventory...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>{searchTerm ? 'No items found matching your search' : 'No items in inventory'}</p>
                      <p className="text-sm mt-2">Upload Items.csv to get started</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item, index) => (
                    <TableRow
                      key={item.id}
                      className={index % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}
                    >
                      <TableCell className="font-mono text-sm font-semibold">
                        {item.sku}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.item_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.category || 'Uncategorized'}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.account || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.rate ? (
                          <span className="font-semibold text-green-700">
                            ${item.rate.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
