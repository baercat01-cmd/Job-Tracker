
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Package, CheckCircle, ShoppingCart, Layers, PackagePlus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { MaterialsList } from './MaterialsList';
import { DocumentsView } from './DocumentsView';
import { JobMaterialsByStatus } from './JobMaterialsByStatus';
import { AllMaterialsBySheet } from './AllMaterialsBySheet';
import { MaterialsByBundle } from './MaterialsByBundle';
import { CrewOrderedMaterials } from './CrewOrderedMaterials';
import type { Job, DocumentFolder } from '@/types';

interface JobDetailsProps {
  job: Job;
  onBack: () => void;
  defaultTab?: string;
}

export function JobDetails({ job, onBack, defaultTab = 'documents' }: JobDetailsProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Update active tab when defaultTab changes (for navigation from status tags)
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);
  const [pullFromShopCount, setPullFromShopCount] = useState(0);
  const [readyForJobCount, setReadyForJobCount] = useState(0);
  const [bundlesCount, setBundlesCount] = useState(0);
  const [crewOrdersCount, setCrewOrdersCount] = useState(0);

  useEffect(() => {
    loadMaterialCounts();
    loadBundlesCount();
    loadCrewOrdersCount();
    
    // Subscribe to material changes
    const materialsChannel = supabase
      .channel('job_materials_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_items' },
        () => {
          loadMaterialCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(materialsChannel);
    };
  }, [job.id]);

  async function loadMaterialCounts() {
    try {
      // Get workbooks for this job
      const { data: workbooksData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working');

      const workbookIds = (workbooksData || []).map(wb => wb.id);

      if (workbookIds.length === 0) {
        setPullFromShopCount(0);
        setReadyForJobCount(0);
        return;
      }

      // Get sheets for these workbooks
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select('id')
        .in('workbook_id', workbookIds);

      const sheetIds = (sheetsData || []).map(s => s.id);

      if (sheetIds.length === 0) {
        setPullFromShopCount(0);
        setReadyForJobCount(0);
        return;
      }

      // Count materials with pull_from_shop status
      const { data: pullData } = await supabase
        .from('material_items')
        .select('id')
        .in('sheet_id', sheetIds)
        .eq('status', 'pull_from_shop');

      setPullFromShopCount(pullData?.length || 0);

      // Count materials with ready_for_job status
      const { data: readyData } = await supabase
        .from('material_items')
        .select('id')
        .in('sheet_id', sheetIds)
        .eq('status', 'ready_for_job');

      setReadyForJobCount(readyData?.length || 0);
    } catch (error) {
      console.error('Error loading material counts:', error);
    }
  }

  async function loadBundlesCount() {
    try {
      const { data: bundlesData } = await supabase
        .from('material_bundles')
        .select('id')
        .eq('job_id', job.id);

      setBundlesCount(bundlesData?.length || 0);
    } catch (error) {
      console.error('Error loading bundles count:', error);
    }
  }

  async function loadCrewOrdersCount() {
    try {
      // Get workbooks for this job
      const { data: workbooksData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working');

      const workbookIds = (workbooksData || []).map(wb => wb.id);

      if (workbookIds.length === 0) {
        setCrewOrdersCount(0);
        return;
      }

      // Get sheets for these workbooks
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select('id')
        .in('workbook_id', workbookIds);

      const sheetIds = (sheetsData || []).map(s => s.id);

      if (sheetIds.length === 0) {
        setCrewOrdersCount(0);
        return;
      }

      // Count materials ordered by crew
      const { data: ordersData } = await supabase
        .from('material_items')
        .select('id')
        .in('sheet_id', sheetIds)
        .not('requested_by', 'is', null);

      setCrewOrdersCount(ordersData?.length || 0);
    } catch (error) {
      console.error('Error loading crew orders count:', error);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 gap-1 mb-6">
          <TabsTrigger value="pull_from_shop" className="flex items-center gap-1 text-xs sm:text-sm">
            <Package className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden lg:inline">Pull Shop</span>
            <span className="lg:hidden">Pull</span>
            {pullFromShopCount > 0 && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                {pullFromShopCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ready_for_job" className="flex items-center gap-1 text-xs sm:text-sm">
            <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden lg:inline">Ready</span>
            <span className="lg:hidden">Ready</span>
            {readyForJobCount > 0 && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                {readyForJobCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all_materials" className="flex items-center gap-1 text-xs sm:text-sm">
            <Layers className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">All</span>
            <span className="sm:hidden">All</span>
          </TabsTrigger>
          <TabsTrigger value="bundles" className="flex items-center gap-1 text-xs sm:text-sm">
            <PackagePlus className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Bundles</span>
            <span className="sm:hidden">Pkgs</span>
            {bundlesCount > 0 && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                {bundlesCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="crew_orders" className="flex items-center gap-1 text-xs sm:text-sm">
            <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Orders</span>
            <span className="sm:hidden">Orders</span>
            {crewOrdersCount > 0 && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                {crewOrdersCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pull_from_shop">
          <JobMaterialsByStatus job={job} status="pull_from_shop" />
        </TabsContent>

        <TabsContent value="ready_for_job">
          <JobMaterialsByStatus job={job} status="ready_for_job" />
        </TabsContent>

        <TabsContent value="all_materials">
          <AllMaterialsBySheet job={job} />
        </TabsContent>

        <TabsContent value="bundles">
          <MaterialsByBundle job={job} />
        </TabsContent>

        <TabsContent value="crew_orders">
          <CrewOrderedMaterials job={job} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
