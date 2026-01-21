import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, CheckCircle2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { cleanMaterialLength } from '@/lib/utils';

interface Material {
  id: string;
  name: string;
  quantity: number;
  length: string | null;
  use_case: string | null;
  status: string;
  job_id: string;
  category_id: string;
}

interface MaterialWithJob extends Material {
  job_name: string;
  client_name: string;
  category_name: string;
}

interface ShopMaterialsViewProps {
  userId: string;
}

const STATUS_OPTIONS = [
  { value: 'pull_from_shop', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'at_shop', label: 'Ready for Job', color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
}

export function ShopMaterialsView({ userId }: ShopMaterialsViewProps) {
  const [materials, setMaterials] = useState<MaterialWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterJob, setFilterJob] = useState('all');
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    loadMaterials();
    loadJobs();
    
    // Subscribe to material changes
    const channel = supabase
      .channel('shop_materials_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'materials' },
        () => {
          loadMaterials();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadMaterials() {
    try {
      setLoading(true);
      
      console.log('🔍 Loading materials with pull_from_shop status...');
      
      // Get all materials with status "pull_from_shop" from active jobs
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select(`
          *,
          jobs!inner(
            id,
            name,
            client_name,
            status
          ),
          materials_categories!inner(
            name
          )
        `)
        .eq('status', 'pull_from_shop')
        .eq('jobs.status', 'active')
        .order('name'); // Order by material name instead

      if (materialsError) {
        console.error('❌ Error loading materials:', materialsError);
        throw materialsError;
      }

      console.log(`✅ Found ${materialsData?.length || 0} materials with pull_from_shop status`);
      if (materialsData && materialsData.length > 0) {
        console.log('📦 Materials:', materialsData);
      }

      const materialsWithJob = (materialsData || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        quantity: m.quantity,
        length: m.length,
        use_case: m.use_case,
        status: m.status,
        job_id: m.job_id,
        category_id: m.category_id,
        job_name: m.jobs.name,
        client_name: m.jobs.client_name,
        category_name: m.materials_categories.name,
      }));

      setMaterials(materialsWithJob);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  async function updateMaterialStatus(materialId: string, newStatus: string) {
    try {
      console.log(`🔄 Updating material ${materialId} to status: ${newStatus}`);
      
      const { error } = await supabase
        .from('materials')
        .update({ 
          status: newStatus, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);

      if (error) {
        console.error('❌ Error updating material status:', error);
        throw error;
      }

      console.log('✅ Material status updated successfully');
      toast.success(`Material marked as ${getStatusLabel(newStatus)}`);
      loadMaterials();
    } catch (error: any) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material status');
    }
  }

  const filteredMaterials = materials.filter(material => {
    const matchesSearch = searchTerm === '' || 
      material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (material.use_case && material.use_case.toLowerCase().includes(searchTerm.toLowerCase())) ||
      material.job_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesJob = filterJob === 'all' || material.job_id === filterJob;
    
    return matchesSearch && matchesJob;
  });

  // Group materials by job
  const materialsByJob = filteredMaterials.reduce((acc, material) => {
    const jobKey = material.job_id;
    if (!acc[jobKey]) {
      acc[jobKey] = {
        job_id: material.job_id,
        job_name: material.job_name,
        client_name: material.client_name,
        materials: [],
      };
    }
    acc[jobKey].materials.push(material);
    return acc;
  }, {} as Record<string, { job_id: string; job_name: string; client_name: string; materials: MaterialWithJob[] }>);

  const jobGroups = Object.values(materialsByJob);

  if (loading) {
    return <div className="text-center py-8">Loading materials...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Package className="w-6 h-6 text-purple-600" />
                Materials to Pull from Shop
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Process materials and mark them as ready for job sites
              </p>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {filteredMaterials.length} {filteredMaterials.length === 1 ? 'item' : 'items'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Search & Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search materials, job, or client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Job Filter */}
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger>
                <SelectValue placeholder="All Jobs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs.map(job => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.name} - {job.client_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Materials List Grouped by Job */}
      {filteredMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {searchTerm || filterJob !== 'all' 
                ? 'No materials found matching your filters' 
                : 'No materials to pull from shop'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Materials with "Pull from Shop" status will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobGroups.map((group) => (
            <Card key={group.job_id} className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-purple-500/10 to-purple-500/5 border-b-2 border-purple-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">{group.job_name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Client: {group.client_name}
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-semibold">
                    {group.materials.length} {group.materials.length === 1 ? 'item' : 'items'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left p-3 font-semibold">Category</th>
                        <th className="text-left p-3 font-semibold">Material</th>
                        <th className="text-left p-3 font-semibold">Use Case</th>
                        <th className="text-center p-3 font-semibold">Quantity</th>
                        <th className="text-center p-3 font-semibold">Length</th>
                        <th className="text-center p-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.materials.map((material) => (
                        <tr key={material.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <Badge variant="outline">{material.category_name}</Badge>
                          </td>
                          <td className="p-3 font-medium">{material.name}</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {material.use_case || '-'}
                          </td>
                          <td className="p-3 text-center font-semibold">
                            {material.quantity}
                          </td>
                          <td className="p-3 text-center">
                            {cleanMaterialLength(material.length) || '-'}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-center">
                              <Button
                                size="sm"
                                onClick={() => updateMaterialStatus(material.id, 'at_shop')}
                                className="gradient-primary"
                              >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Mark Ready
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
