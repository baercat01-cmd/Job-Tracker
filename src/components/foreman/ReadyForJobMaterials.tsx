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
import { Package, Search, X, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

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

interface ReadyForJobMaterialsProps {
  userId: string;
  currentJobId?: string;
}

export function ReadyForJobMaterials({ userId, currentJobId }: ReadyForJobMaterialsProps) {
  const [materials, setMaterials] = useState<MaterialWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterJob, setFilterJob] = useState(currentJobId || 'all');
  const [jobs, setJobs] = useState<any[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMaterials();
    loadJobs();
    
    // Subscribe to material changes
    const channel = supabase
      .channel('ready_materials_changes')
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
        .eq('is_internal', false)
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
      
      // Get all materials with status "at_shop" (Ready for Job) from active jobs
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
        .eq('status', 'at_shop')
        .eq('jobs.status', 'active')
        .eq('jobs.is_internal', false)
        .order('name');

      if (materialsError) throw materialsError;

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

  async function markAsAtJob(materialId: string, materialName: string) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          status: 'at_job', 
          actual_delivery_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);

      if (error) throw error;

      toast.success(`${materialName} marked as at job`);
      loadMaterials();
    } catch (error: any) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material status');
    }
  }

  function toggleJobExpanded(jobId: string) {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
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
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full lg:max-w-3xl lg:mx-auto">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Package className="w-6 h-6 text-blue-600" />
                Ready for Job
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Materials at shop ready to go to job sites
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
                : 'No materials ready for job'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Materials with "Ready for Job" status will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobGroups.map((group) => (
            <Card key={group.job_id} className="overflow-hidden">
              <CardHeader 
                className="bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-b-2 border-blue-500/20 cursor-pointer hover:bg-blue-500/15 transition-colors"
                onClick={() => toggleJobExpanded(group.job_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    {expandedJobs.has(group.job_id) ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="text-xl font-bold">{group.job_name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Client: {group.client_name}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-semibold">
                    {group.materials.length} {group.materials.length === 1 ? 'item' : 'items'}
                  </Badge>
                </div>
              </CardHeader>
              
              {expandedJobs.has(group.job_id) && (
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
                              {material.length || '-'}
                            </td>
                            <td className="p-3">
                              <div className="flex justify-center">
                                <Button
                                  size="sm"
                                  onClick={() => markAsAtJob(material.id, material.name)}
                                  className="gradient-primary"
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  At Job
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
