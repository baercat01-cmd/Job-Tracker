import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Users, Calendar, ChevronDown, ChevronRight, TrendingUp, Target, Camera, FileText, AlertCircle, Package, Activity, Briefcase, Building2, MapPin, FileCheck, ArrowLeft, Edit, DollarSign, FileSpreadsheet, Mail, Printer, Upload } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MaterialsManagement } from './MaterialsManagement';
import { JobComponents } from './JobComponents';
import { JobSchedule } from './JobSchedule';
import { JobDocuments } from './JobDocuments';
import { JobPhotosView } from './JobPhotosView';
import { JobFinancials } from './JobFinancials';
import { CustomerPortalManagement } from './CustomerPortalManagement';
import { SubcontractorEstimatesManagement } from './SubcontractorEstimatesManagement';
import { JobCommunications } from './JobCommunications';
import { JobZohoOrders } from './JobZohoOrders';

import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { format } from 'date-fns';

import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';

interface JobDetailedViewProps {
  job: Job;
  onBack?: () => void;
  onEdit?: () => void;
  initialTab?: string;
}

interface ComponentWorkEntry {
  id: string;
  component_id: string;
  component_name: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  crew_count: number;
  is_manual: boolean;
  notes: string | null;
  worker_names: string[] | null;
  user_name: string;
  photos: Array<{
    id: string;
    photo_url: string;
    caption: string | null;
  }>;
}

interface ComponentSummary {
  component_id: string;
  component_name: string;
  total_duration: number;
  total_man_hours: number;
  entry_count: number;
  entries: ComponentWorkEntry[];
}

interface DateGroup {
  date: string;
  total_man_hours: number;
  components: ComponentSummary[];
}

interface ComponentGroup {
  component_id: string;
  component_name: string;
  total_duration: number;
  total_man_hours: number;
  entry_count: number;
  dates: DateSummary[];
}

interface DateSummary {
  date: string;
  total_duration: number;
  total_man_hours: number;
  entries: ComponentWorkEntry[];
}

interface PersonGroup {
  user_name: string;
  total_duration: number;
  total_man_hours: number;
  entry_count: number;
  dates: DateSummary[];
  component_hours: number;
  clock_in_hours: number;
}

interface MaterialsPricingBreakdownProps {
  jobId: string;
}

function MaterialsPricingBreakdown({ jobId }: MaterialsPricingBreakdownProps) {
  const [loading, setLoading] = useState(true);
  const [sheetBreakdowns, setSheetBreakdowns] = useState<any[]>([]);
  const [totals, setTotals] = useState({ totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 });

  useEffect(() => {
    loadMaterialsBreakdown();
  }, [jobId]);

  async function loadMaterialsBreakdown() {
    try {
      setLoading(true);

      // Get the working workbook for this job
      const { data: workbookData, error: workbookError } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('status', 'working')
        .maybeSingle();

      if (workbookError) throw workbookError;
      if (!workbookData) {
        setLoading(false);
        return;
      }

      // Get all sheets for this workbook
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbookData.id)
        .order('order_index');

      if (sheetsError) throw sheetsError;

      const sheetIds = (sheetsData || []).map(s => s.id);

      // Get all items for these sheets
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds);

      if (itemsError) throw itemsError;

      // Calculate breakdown by sheet and category
      const breakdowns = (sheetsData || []).map(sheet => {
        const sheetItems = (itemsData || []).filter(item => item.sheet_id === sheet.id);

        // Group by category
        const categoryMap = new Map<string, any[]>();
        sheetItems.forEach(item => {
          const category = item.category || 'Uncategorized';
          if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
          }
          categoryMap.get(category)!.push(item);
        });

        // Calculate totals per category
        const categories = Array.from(categoryMap.entries()).map(([categoryName, items]) => {
          const totalCost = items.reduce((sum, item) => {
            const cost = (item.cost_per_unit || 0) * (item.quantity || 0);
            return sum + cost;
          }, 0);

          const totalPrice = items.reduce((sum, item) => {
            const price = (item.price_per_unit || 0) * (item.quantity || 0);
            return sum + price;
          }, 0);

          const profit = totalPrice - totalCost;
          const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

          return {
            name: categoryName,
            itemCount: items.length,
            totalCost,
            totalPrice,
            profit,
            margin,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // Calculate sheet totals
        const sheetTotalCost = categories.reduce((sum, cat) => sum + cat.totalCost, 0);
        const sheetTotalPrice = categories.reduce((sum, cat) => sum + cat.totalPrice, 0);
        const sheetProfit = sheetTotalPrice - sheetTotalCost;
        const sheetMargin = sheetTotalPrice > 0 ? (sheetProfit / sheetTotalPrice) * 100 : 0;

        return {
          sheetName: sheet.sheet_name,
          categories,
          totalCost: sheetTotalCost,
          totalPrice: sheetTotalPrice,
          profit: sheetProfit,
          margin: sheetMargin,
        };
      });

      setSheetBreakdowns(breakdowns);

      // Calculate grand totals
      const grandTotalCost = breakdowns.reduce((sum, sheet) => sum + sheet.totalCost, 0);
      const grandTotalPrice = breakdowns.reduce((sum, sheet) => sum + sheet.totalPrice, 0);
      const grandProfit = grandTotalPrice - grandTotalCost;
      const grandMargin = grandTotalPrice > 0 ? (grandProfit / grandTotalPrice) * 100 : 0;

      setTotals({
        totalCost: grandTotalCost,
        totalPrice: grandTotalPrice,
        totalProfit: grandProfit,
        profitMargin: grandMargin,
      });

    } catch (error: any) {
      console.error('Error loading materials breakdown:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading materials pricing...</p>
        </CardContent>
      </Card>
    );
  }

  if (sheetBreakdowns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Materials Pricing Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          No materials data available for this job
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b-2">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-700" />
          Materials Pricing Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Grand Totals */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide mb-1">Total Cost</p>
            <p className="text-2xl font-bold">${totals.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide mb-1">Total Price</p>
            <p className="text-2xl font-bold">${totals.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide mb-1">Total Profit</p>
            <p className="text-2xl font-bold text-yellow-400">${totals.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide mb-1">Profit Margin</p>
            <p className="text-2xl font-bold text-green-400">{totals.profitMargin.toFixed(1)}%</p>
          </div>
        </div>

        {/* Breakdown by Sheet */}
        {sheetBreakdowns.map((sheet, sheetIndex) => (
          <Collapsible key={sheetIndex} defaultOpen={sheetIndex === 0}>
            <div className="border-2 border-slate-200 rounded-lg overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <div className="bg-gradient-to-r from-blue-100 to-blue-50 p-4 flex items-center justify-between hover:from-blue-200 hover:to-blue-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-blue-700" />
                    <h3 className="font-bold text-lg text-blue-900">{sheet.sheetName}</h3>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-blue-700">Cost</p>
                      <p className="font-bold text-blue-900">${sheet.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-blue-700">Price</p>
                      <p className="font-bold text-blue-900">${sheet.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-blue-700">Profit</p>
                      <p className="font-bold text-green-700">${sheet.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-blue-700">Margin</p>
                      <p className="font-bold text-green-700">{sheet.margin.toFixed(1)}%</p>
                    </div>
                    <ChevronDown className="w-5 h-5 text-blue-700" />
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 bg-white">
                  <div className="space-y-3">
                    {sheet.categories.map((category: any, catIndex: number) => (
                      <div key={catIndex} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <h4 className="font-semibold text-slate-900">{category.name}</h4>
                            <Badge variant="outline" className="text-xs">{category.itemCount} items</Badge>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Cost</p>
                              <p className="font-semibold">${category.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Price</p>
                              <p className="font-semibold">${category.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Profit</p>
                              <p className="font-semibold text-green-700">${category.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className="text-right min-w-[60px]">
                              <p className="text-xs text-muted-foreground">Margin</p>
                              <p className={`font-bold ${
                                category.margin >= 25 ? 'text-green-600' :
                                category.margin >= 15 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {category.margin.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}

interface DailyLog {
  id: string;
  log_date: string;
  weather: string | null;
  weather_details: any;
  crew_count: number | null;
  components_worked: any[];
  time_summary: any[];
  issues: any[];
  material_requests_structured: any[];
  client_summary: string | null;
  final_notes: string | null;
  user_name: string;
  created_at: string;
}

export function JobDetailedView({ job, onBack, onEdit, initialTab = 'overview' }: JobDetailedViewProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [componentGroups, setComponentGroups] = useState<ComponentGroup[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonGroup[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [totalManHours, setTotalManHours] = useState(0);
  const [totalClockInHours, setTotalClockInHours] = useState(0);
  const [totalComponentHours, setTotalComponentHours] = useState(0);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'date' | 'component' | 'person'>('date');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [materialCount, setMaterialCount] = useState(0);
  const [issueCount, setIssueCount] = useState(0);
  const [crewMembers, setCrewMembers] = useState<string[]>([]);
  const [firstWorkDate, setFirstWorkDate] = useState<string | null>(null);
  const [lastWorkDate, setLastWorkDate] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [crewOrdersCount, setCrewOrdersCount] = useState(0);
  const [emailStats, setEmailStats] = useState({ total: 0, customer: 0, vendor: 0, subcontractor: 0, unread: 0 });
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingToWorkDrive, setUploadingToWorkDrive] = useState(false);
  const [workDriveUploadProgress, setWorkDriveUploadProgress] = useState<string>('');

  function toggleDate(date: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  function toggleComponent(componentKey: string) {
    setExpandedComponents(prev => {
      const next = new Set(prev);
      if (next.has(componentKey)) {
        next.delete(componentKey);
      } else {
        next.add(componentKey);
      }
      return next;
    });
  }

  function toggleLog(logId: string) {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }

  function expandAllComponents() {
    const allDates = new Set(dateGroups.map(g => g.date));
    const allComponents = new Set<string>();
    dateGroups.forEach(dateGroup => {
      dateGroup.components.forEach(comp => {
        allComponents.add(`${dateGroup.date}-${comp.component_id}`);
      });
    });
    setExpandedDates(allDates);
    setExpandedComponents(allComponents);
  }

  function collapseAllComponents() {
    setExpandedDates(new Set());
    setExpandedComponents(new Set());
  }

  function expandAllLogs() {
    setExpandedLogs(new Set(dailyLogs.map(l => l.id)));
  }

  function collapseAllLogs() {
    setExpandedLogs(new Set());
  }

  useEffect(() => {
    loadData();
    loadNotifications();
    
    // Subscribe to new notifications
    const notificationsChannel = supabase
      .channel('job_notifications')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `job_id=eq.${job.id}`
        }, 
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    // Subscribe to crew orders (material changes)
    const materialsChannel = supabase
      .channel('job_materials_changes')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'materials',
          filter: `job_id=eq.${job.id}`
        },
        () => {
          loadJobStats(); // Reload stats to update crew orders count
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(materialsChannel);
    };
  }, [job.id]);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadComponentWork(),
        loadDailyLogs(),
        loadJobStats(),
        loadRecentActivity(),
      ]);
    } catch (error) {
      console.error('Error loading job details:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadJobStats() {
    try {
      // Load photos count
      const { data: photosData } = await supabase
        .from('photos')
        .select('id')
        .eq('job_id', job.id);
      setPhotoCount(photosData?.length || 0);

      // Load materials count
      const { data: materialsData } = await supabase
        .from('materials')
        .select('id')
        .eq('job_id', job.id);
      setMaterialCount(materialsData?.length || 0);

      // Load crew orders count (pending field requests)
      const { data: crewOrdersData } = await supabase
        .from('materials')
        .select('id')
        .eq('job_id', job.id)
        .in('import_source', ['field_catalog', 'field_custom'])
        .eq('status', 'not_ordered');
      setCrewOrdersCount(crewOrdersData?.length || 0);

      // Load issues from daily logs
      const { data: logsData } = await supabase
        .from('daily_logs')
        .select('issues')
        .eq('job_id', job.id);
      const totalIssues = (logsData || []).reduce((sum, log) => {
        return sum + (Array.isArray(log.issues) ? log.issues.length : 0);
      }, 0);
      setIssueCount(totalIssues);

      // Load email stats
      const { data: emailsData } = await supabase
        .from('job_emails')
        .select('entity_category, is_read')
        .eq('job_id', job.id);
      
      const total = emailsData?.length || 0;
      const customer = emailsData?.filter(e => e.entity_category === 'customer').length || 0;
      const vendor = emailsData?.filter(e => e.entity_category === 'vendor').length || 0;
      const subcontractor = emailsData?.filter(e => e.entity_category === 'subcontractor').length || 0;
      const unread = emailsData?.filter(e => !e.is_read && e.entity_category).length || 0;
      
      setEmailStats({ total, customer, vendor, subcontractor, unread });
    } catch (error) {
      console.error('Error loading job stats:', error);
    }
  }

  async function loadRecentActivity() {
    try {
      const activities: any[] = [];

      // Get recent time entries
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(5);

      (timeEntries || []).forEach((entry: any) => {
        activities.push({
          type: 'time_entry',
          timestamp: entry.created_at,
          description: `${entry.user_profiles?.username || 'Unknown'} logged ${entry.total_hours?.toFixed(2)}h on ${entry.components?.name || 'Unknown'}`,
          icon: 'clock',
        });
      });

      // Get recent photos
      const { data: photos } = await supabase
        .from('photos')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(3);

      (photos || []).forEach((photo: any) => {
        activities.push({
          type: 'photo',
          timestamp: photo.created_at,
          description: `${photo.user_profiles?.username || 'Unknown'} uploaded a photo`,
          icon: 'camera',
        });
      });

      // Get recent logs
      const { data: logs } = await supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(3);

      (logs || []).forEach((log: any) => {
        activities.push({
          type: 'daily_log',
          timestamp: log.created_at,
          description: `${log.user_profiles?.username || 'Unknown'} submitted daily log`,
          icon: 'file',
        });
      });

      // Sort by timestamp and take top 10
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activities.slice(0, 10));
    } catch (error) {
      console.error('Error loading recent activity:', error);
    }
  }

  async function loadNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async function handleNotificationClick(notification: any) {
    // Mark as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);

    loadNotifications();
  }

  async function handleWorkDrivePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB');
      return;
    }

    setUploadingToWorkDrive(true);
    setWorkDriveUploadProgress('Reading image...');

    try {
      // Convert file to base64
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result as string;
          
          setWorkDriveUploadProgress('Uploading to WorkDrive...');

          // Upload to WorkDrive via Edge Function
          const { data, error } = await supabase.functions.invoke('workdrive-operations', {
            body: {
              action: 'upload_file',
              jobId: job.id,
              fileName: file.name,
              fileData: base64Data,
              fileType: file.type,
            },
          });

          if (error) {
            let errorMessage = error.message;
            if (error instanceof FunctionsHttpError) {
              try {
                const statusCode = error.context?.status ?? 500;
                const textContent = await error.context?.text();
                errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
              } catch {
                errorMessage = error.message || 'Failed to read response';
              }
            }
            throw new Error(errorMessage);
          }

          console.log('WorkDrive upload success:', data);
          toast.success('Photo uploaded to WorkDrive!');
          setWorkDriveUploadProgress('');
          
          // Reset file input
          event.target.value = '';
        } catch (uploadError: any) {
          console.error('WorkDrive upload error:', uploadError);
          toast.error('Failed to upload to WorkDrive: ' + uploadError.message);
          setWorkDriveUploadProgress('');
        } finally {
          setUploadingToWorkDrive(false);
        }
      };

      reader.onerror = () => {
        toast.error('Failed to read image file');
        setUploadingToWorkDrive(false);
        setWorkDriveUploadProgress('');
      };

      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error('Error preparing upload:', error);
      toast.error('Failed to prepare image: ' + error.message);
      setUploadingToWorkDrive(false);
      setWorkDriveUploadProgress('');
    }
  }

  async function loadComponentWork() {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username),
          photos:photos!time_entry_id(id, photo_url, caption)
        `)
        .eq('job_id', job.id)
        .order('start_time', { ascending: false });

      if (error) throw error;

      // Group by date, then by component (for date view)
      const dateMap = new Map<string, Map<string, ComponentSummary>>();
      // Group by component, then by date (for component view)
      const componentMap = new Map<string, Map<string, DateSummary>>();
      // Group by person, then by date (for person view)
      const personMap = new Map<string, Map<string, DateSummary>>();

      // Track totals for clock-in and component time
      let clockInManHours = 0;
      let componentManHours = 0;

      (data || []).forEach((entry: any) => {
        const date = new Date(entry.start_time).toISOString().split('T')[0];
        const componentId = entry.component_id;
        const componentName = entry.components?.name || 'Unknown Component';
        const userName = entry.user_profiles?.username || 'Unknown';
        const duration = entry.total_hours || 0;
        const crewCount = entry.crew_count || 1;
        const manHours = duration * crewCount;

        // Track clock-in vs component hours
        if (componentId === null) {
          clockInManHours += manHours;
        } else {
          componentManHours += manHours;
        }

        const workEntry: ComponentWorkEntry = {
          id: entry.id,
          component_id: componentId,
          component_name: componentName,
          start_time: entry.start_time,
          end_time: entry.end_time,
          total_hours: duration,
          crew_count: crewCount,
          is_manual: entry.is_manual,
          notes: entry.notes,
          worker_names: entry.worker_names,
          user_name: userName,
          photos: entry.photos || [],
        };

        // Date view grouping
        if (!dateMap.has(date)) {
          dateMap.set(date, new Map());
        }
        const componentsForDate = dateMap.get(date)!;
        if (componentsForDate.has(componentId)) {
          const existing = componentsForDate.get(componentId)!;
          existing.total_duration += duration;
          existing.total_man_hours += manHours;
          existing.entry_count += 1;
          existing.entries.push(workEntry);
        } else {
          componentsForDate.set(componentId, {
            component_id: componentId,
            component_name: componentName,
            total_duration: duration,
            total_man_hours: manHours,
            entry_count: 1,
            entries: [workEntry],
          });
        }

        // Component view grouping
        if (!componentMap.has(componentId)) {
          componentMap.set(componentId, new Map());
        }
        const datesForComponent = componentMap.get(componentId)!;
        if (datesForComponent.has(date)) {
          const existing = datesForComponent.get(date)!;
          existing.total_duration += duration;
          existing.total_man_hours += manHours;
          existing.entries.push(workEntry);
        } else {
          datesForComponent.set(date, {
            date,
            total_duration: duration,
            total_man_hours: manHours,
            entries: [workEntry],
          });
        }

        // Person view grouping
        if (!personMap.has(userName)) {
          personMap.set(userName, new Map());
        }
        const datesForPerson = personMap.get(userName)!;
        if (datesForPerson.has(date)) {
          const existing = datesForPerson.get(date)!;
          existing.total_duration += duration;
          existing.total_man_hours += manHours;
          existing.entries.push(workEntry);
        } else {
          datesForPerson.set(date, {
            date,
            total_duration: duration,
            total_man_hours: manHours,
            entries: [workEntry],
          });
        }
      });

      // Convert date view to array
      const dateGroupsArray: DateGroup[] = Array.from(dateMap.entries())
        .map(([date, componentsMap]) => {
          const components = Array.from(componentsMap.values()).sort(
            (a, b) => b.total_man_hours - a.total_man_hours
          );
          const total_man_hours = components.reduce((sum, c) => sum + c.total_man_hours, 0);
          return {
            date,
            total_man_hours,
            components,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      setDateGroups(dateGroupsArray);

      // Convert component view to array
      const componentGroupsArray: ComponentGroup[] = Array.from(componentMap.entries())
        .map(([componentId, datesMap]) => {
          const dates = Array.from(datesMap.entries())
            .map(([date, summary]) => summary)
            .sort((a, b) => b.date.localeCompare(a.date));
          const total_duration = dates.reduce((sum, d) => sum + d.total_duration, 0);
          const total_man_hours = dates.reduce((sum, d) => sum + d.total_man_hours, 0);
          const entry_count = dates.reduce((sum, d) => sum + d.entries.length, 0);
          const componentName = dates[0]?.entries[0]?.component_name || 'Unknown';
          return {
            component_id: componentId,
            component_name: componentName,
            total_duration,
            total_man_hours,
            entry_count,
            dates,
          };
        })
        .sort((a, b) => b.total_man_hours - a.total_man_hours);

      setComponentGroups(componentGroupsArray);

      // Convert person view to array
      const personGroupsArray: PersonGroup[] = Array.from(personMap.entries())
        .map(([userName, datesMap]) => {
          const dates = Array.from(datesMap.entries())
            .map(([date, summary]) => summary)
            .sort((a, b) => b.date.localeCompare(a.date));
          const total_duration = dates.reduce((sum, d) => sum + d.total_duration, 0);
          const total_man_hours = dates.reduce((sum, d) => sum + d.total_man_hours, 0);
          const entry_count = dates.reduce((sum, d) => sum + d.entries.length, 0);
          
          // Calculate component vs clock-in hours for this user
          let component_hours = 0;
          let clock_in_hours = 0;
          dates.forEach(dateSummary => {
            dateSummary.entries.forEach(entry => {
              const entryManHours = entry.total_hours * entry.crew_count;
              if (entry.component_id === null) {
                clock_in_hours += entryManHours;
              } else {
                component_hours += entryManHours;
              }
            });
          });
          
          return {
            user_name: userName,
            total_duration,
            total_man_hours,
            entry_count,
            dates,
            component_hours,
            clock_in_hours,
          };
        })
        .sort((a, b) => b.total_man_hours - a.total_man_hours);

      setPersonGroups(personGroupsArray);
      
      const totalDur = dateGroupsArray.reduce(
        (sum, dg) => sum + dg.components.reduce((s, c) => s + c.total_duration, 0), 
        0
      );
      const totalMan = dateGroupsArray.reduce((sum, dg) => sum + dg.total_man_hours, 0);
      
      setTotalDuration(totalDur);
      setTotalManHours(totalMan);
      setTotalClockInHours(clockInManHours);
      setTotalComponentHours(componentManHours);

      // Extract crew members
      const uniqueUsers = new Set<string>();
      (data || []).forEach((entry: any) => {
        if (entry.user_profiles?.username) {
          uniqueUsers.add(entry.user_profiles.username);
        }
      });
      setCrewMembers(Array.from(uniqueUsers));

      // Get first and last work dates
      if (data && data.length > 0) {
        const dates = data.map((entry: any) => new Date(entry.start_time).getTime());
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        setFirstWorkDate(minDate.toISOString().split('T')[0]);
        setLastWorkDate(maxDate.toISOString().split('T')[0]);
      }
    } catch (error) {
      console.error('Error loading component work:', error);
    }
  }

  async function loadDailyLogs() {
    try {
      const { data, error } = await supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('log_date', { ascending: false });

      if (error) throw error;

      const logs: DailyLog[] = (data || []).map((log: any) => ({
        id: log.id,
        log_date: log.log_date,
        weather: log.weather,
        weather_details: log.weather_details,
        crew_count: log.crew_count,
        components_worked: log.components_worked || [],
        time_summary: log.time_summary || [],
        issues: log.issues || [],
        material_requests_structured: log.material_requests_structured || [],
        client_summary: log.client_summary,
        final_notes: log.final_notes,
        user_name: log.user_profiles?.username || 'Unknown',
        created_at: log.created_at,
      }));

      setDailyLogs(logs);
    } catch (error) {
      console.error('Error loading daily logs:', error);
    }
  }

  function formatDate(dateString: string): string {
    // Parse as local date by adding time component
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  }

  function formatTimeAgo(timestamp: string): string {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(timestamp.split('T')[0]);
  }

  function calculateDaysActive(): number {
    if (!firstWorkDate || !lastWorkDate) return 0;
    const start = new Date(firstWorkDate).getTime();
    const end = new Date(lastWorkDate).getTime();
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }

  async function printJobHours() {
    setExporting(true);

    try {
      // Load all time entries for this job
      const { data: allEntries, error: entriesError } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username, email)
        `)
        .eq('job_id', job.id)
        .eq('is_active', false)
        .order('start_time', { ascending: true });

      if (entriesError) throw entriesError;

      if (!allEntries || allEntries.length === 0) {
        toast.error('No time entries to print');
        setExporting(false);
        return;
      }

      // Group entries by user
      const userMap = new Map<string, any>();
      
      allEntries.forEach(entry => {
        const userId = entry.user_id;
        const userName = entry.user_profiles?.username || entry.user_profiles?.email || 'Unknown User';
        
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            userId,
            userName,
            totalHours: 0,
            entries: [],
          });
        }
        
        const userData = userMap.get(userId)!;
        userData.totalHours += entry.total_hours || 0;
        userData.entries.push({
          date: format(new Date(entry.start_time), 'MMM d, yyyy'),
          component: entry.components?.name || 'Clock In/Out',
          startTime: format(new Date(entry.start_time), 'h:mm a'),
          endTime: entry.end_time ? format(new Date(entry.end_time), 'h:mm a') : '-',
          hours: (entry.total_hours || 0).toFixed(2),
          crewCount: entry.crew_count || 1,
          notes: entry.notes || '',
          isManual: entry.is_manual,
        });
      });

      const users = Array.from(userMap.values()).sort((a, b) => 
        a.userName.localeCompare(b.userName)
      );

      const pdfData = {
        title: 'Job Hours Report',
        jobName: job.name,
        clientName: job.client_name,
        address: job.address,
        totalHours: totalManHours.toFixed(2),
        users,
      };

      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: {
          type: 'job-hours',
          data: pdfData,
        },
      });

      if (error) {
        if (error instanceof FunctionsHttpError) {
          const errorText = await error.context.text();
          throw new Error(errorText || error.message);
        }
        throw error;
      }

      // Open HTML in new window with print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data);
        printWindow.document.close();
      } else {
        toast.error('Please allow popups to print');
      }

      toast.success('Print dialog opened');
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error(error.message || 'Failed to generate print preview');
    } finally {
      setExporting(false);
    }
  }

  function renderWorkEntry(entry: ComponentWorkEntry) {
    return (
      <div
        key={entry.id}
        className="bg-muted/50 rounded-md p-3 space-y-2"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {viewMode === 'person' && (
                <span className="font-medium text-sm">{entry.component_name}</span>
              )}
              {entry.is_manual && (
                <Badge variant="outline" className="text-xs">
                  Manual
                </Badge>
              )}
              {!entry.is_manual && (
                <span className="text-sm text-muted-foreground">
                  {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              By {entry.user_name}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold">{(entry.total_hours * entry.crew_count).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">man-hours</p>
            <p className="text-xs text-muted-foreground">{entry.crew_count} crew</p>
          </div>
        </div>

        {entry.worker_names && entry.worker_names.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Workers:</p>
            <div className="flex flex-wrap gap-1">
              {entry.worker_names.map((name, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {entry.photos && entry.photos.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Photos ({entry.photos.length}):</p>
            <div className="grid grid-cols-3 gap-2">
              {entry.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.photo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || 'Time entry photo'}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {entry.notes && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notes:</p>
            <p className="text-sm">{entry.notes}</p>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading job dashboard...</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate progress using clock-in time only
  const estimatedHours = job.estimated_hours || 0;
  const actualHours = totalDuration;
  const actualManHours = totalManHours;
  const progressPercent = estimatedHours > 0 ? Math.min((totalClockInHours / estimatedHours) * 100, 100) : 0;
  const isOverBudget = totalClockInHours > estimatedHours && estimatedHours > 0;
  const remainingHours = Math.max(estimatedHours - totalClockInHours, 0);

  return (
    <div className="min-h-screen bg-background">
      <Tabs defaultValue={initialTab} className="w-full">
        {/* Main Navigation Tabs - Fixed at Top with Black, Gold, Dark Green Theme */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-black border-b-4 border-yellow-600 shadow-2xl">
          <div className="flex items-center gap-2 px-4">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="text-yellow-100 hover:text-yellow-400 hover:bg-green-900/50"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Jobs
              </Button>
            )}
          </div>
          <TabsList className="grid w-full grid-cols-11 h-16 rounded-none bg-gradient-to-r from-green-900 via-black to-green-900">
            <TabsTrigger 
              value="overview" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Activity className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger 
              value="financials" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <DollarSign className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Financials</span>
            </TabsTrigger>
            <TabsTrigger 
              value="components" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Target className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Components</span>
            </TabsTrigger>
            <TabsTrigger 
              value="schedule" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Calendar className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Schedule</span>
            </TabsTrigger>
            <TabsTrigger 
              value="documents" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <FileText className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger 
              value="materials" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all relative"
            >
              <Package className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Materials</span>
              {crewOrdersCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="ml-1 sm:ml-2 bg-red-600 text-white font-bold animate-pulse text-xs"
                >
                  {crewOrdersCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="orders" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <FileSpreadsheet className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Orders</span>
            </TabsTrigger>
            <TabsTrigger 
              value="photos" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Camera className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Photos</span>
            </TabsTrigger>
            <TabsTrigger 
              value="subcontractors" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Briefcase className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Subs</span>
            </TabsTrigger>
            <TabsTrigger 
              value="customer-portal" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Users className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Portal</span>
            </TabsTrigger>
            <TabsTrigger 
              value="communications" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Mail className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">Email</span>
            </TabsTrigger>
          </TabsList>

        </div>
        
        {/* Add spacer to prevent content from hiding under fixed header */}
        {/* Total height: 64px (main tabs) */}
        <div className="h-16" />

        {/* Floating WorkDrive Camera Button - Fixed Position, Always Visible */}
        {job.workdrive_folder_id && (
          <div className="fixed bottom-6 right-6 z-40">
            <input
              type="file"
              id="workdrive-camera-input"
              accept="image/*"
              capture="environment"
              onChange={handleWorkDrivePhotoUpload}
              className="hidden"
              disabled={uploadingToWorkDrive}
            />
            <label htmlFor="workdrive-camera-input">
              <Button
                size="lg"
                disabled={uploadingToWorkDrive}
                className="h-16 w-16 rounded-full shadow-2xl bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 cursor-pointer"
                asChild
              >
                <div className="flex items-center justify-center">
                  {uploadingToWorkDrive ? (
                    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-8 h-8 text-white" />
                  )}
                </div>
              </Button>
            </label>
            {uploadingToWorkDrive && workDriveUploadProgress && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/80 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">
                {workDriveUploadProgress}
              </div>
            )}
          </div>
        )}

        {/* Overview Tab */}
        <TabsContent value="overview" className="w-full">
          <div className="max-w-7xl mx-auto space-y-6 pt-4 px-4">
            {/* Job Header */}
            <Card className="border-2">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-slate-50 border-b-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-3xl font-bold mb-2 flex items-center gap-3">
                      <Building2 className="w-8 h-8 text-blue-600" />
                      {job.name}
                    </CardTitle>
                    <div className="space-y-1">
                      <p className="text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {job.address}
                      </p>
                      {job.description && (
                        <p className="text-muted-foreground">{job.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant={job.status === 'active' ? 'default' : 'secondary'} className="text-sm">
                      {job.status}
                    </Badge>
                    {onEdit && (
                      <Button variant="outline" size="sm" onClick={onEdit}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Job
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Email Communications Quick Access */}
            <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-6 h-6 text-blue-600" />
                    Email Communications
                  </CardTitle>
                  <Button
                    onClick={() => setShowEmailDialog(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Open Email Center
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  <div className="text-center p-3 bg-white rounded-lg border">
                    <p className="text-2xl font-bold text-blue-600">{emailStats.total}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Emails</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg border">
                    <p className="text-2xl font-bold text-green-600">{emailStats.customer}</p>
                    <p className="text-xs text-muted-foreground mt-1">Customers</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg border">
                    <p className="text-2xl font-bold text-orange-600">{emailStats.vendor}</p>
                    <p className="text-xs text-muted-foreground mt-1">Vendors</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg border">
                    <p className="text-2xl font-bold text-blue-600">{emailStats.subcontractor}</p>
                    <p className="text-xs text-muted-foreground mt-1">Subcontractors</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg border">
                    <p className="text-2xl font-bold text-red-600">{emailStats.unread}</p>
                    <p className="text-xs text-muted-foreground mt-1">Unread</p>
                  </div>
                </div>
                {emailStats.unread > 0 && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <p className="text-sm text-red-800 font-medium">
                      You have {emailStats.unread} unread {emailStats.unread === 1 ? 'message' : 'messages'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card 
                className="cursor-pointer hover:shadow-lg hover:border-blue-400 transition-all"
                onClick={printJobHours}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Total Hours</p>
                      <p className="text-3xl font-bold">{totalManHours.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground mt-1">man-hours logged</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Clock className="w-10 h-10 text-blue-600" />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={exporting}
                        onClick={(e) => {
                          e.stopPropagation();
                          printJobHours();
                        }}
                        className="h-7 text-xs"
                      >
                        {exporting ? (
                          <>
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                            Printing...
                          </>
                        ) : (
                          <>
                            <Printer className="w-3 h-3 mr-1" />
                            Print
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Crew Members</p>
                      <p className="text-3xl font-bold">{crewMembers.length}</p>
                      <p className="text-xs text-muted-foreground mt-1">active workers</p>
                    </div>
                    <Users className="w-10 h-10 text-green-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Photos</p>
                      <p className="text-3xl font-bold">{photoCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">uploaded</p>
                    </div>
                    <Camera className="w-10 h-10 text-purple-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Daily Logs</p>
                      <p className="text-3xl font-bold">{dailyLogs.length}</p>
                      <p className="text-xs text-muted-foreground mt-1">submitted</p>
                    </div>
                    <FileText className="w-10 h-10 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Progress Card */}
            {estimatedHours > 0 && (
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Project Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Estimated Hours</p>
                      <p className="text-2xl font-bold">{estimatedHours.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Actual Hours</p>
                      <p className="text-2xl font-bold">{totalClockInHours.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className={`text-2xl font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                        {isOverBudget ? '+' : ''}{remainingHours.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm font-medium">{progressPercent.toFixed(1)}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-3" />
                  </div>
                  {isOverBudget && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <p className="font-semibold text-red-900">Over Budget</p>
                        <p className="text-sm text-red-700">
                          This job has exceeded the estimated hours by {Math.abs(remainingHours).toFixed(1)} hours
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Timeline Card */}
            {(firstWorkDate || lastWorkDate) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">First Activity</p>
                      <p className="font-semibold">{firstWorkDate ? formatDate(firstWorkDate) : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Latest Activity</p>
                      <p className="font-semibold">{lastWorkDate ? formatDate(lastWorkDate) : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Days Active</p>
                      <p className="font-semibold">{calculateDaysActive()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {recentActivity.map((activity, idx) => (
                      <div key={idx} className="flex items-start gap-3 pb-3 border-b last:border-0">
                        <div className="mt-1">
                          {activity.icon === 'clock' && <Clock className="w-4 h-4 text-blue-600" />}
                          {activity.icon === 'camera' && <Camera className="w-4 h-4 text-purple-600" />}
                          {activity.icon === 'file' && <FileText className="w-4 h-4 text-orange-600" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm">{activity.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTimeAgo(activity.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No recent activity</p>
                )}
              </CardContent>
            </Card>

            {/* Crew Members List */}
            {crewMembers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Crew Members ({crewMembers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {crewMembers.map((member, idx) => (
                      <Badge key={idx} variant="secondary" className="text-sm px-3 py-1">
                        {member}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Issues Alert */}
            {issueCount > 0 && (
              <Card className="border-2 border-yellow-200 bg-yellow-50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-yellow-600 mt-1" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-900">Active Issues</h3>
                      <p className="text-sm text-yellow-700 mt-1">
                        There are {issueCount} reported issues in daily logs that may need attention.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {job.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="w-5 h-5" />
                    Job Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{job.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="financials" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobFinancials job={job} />
          </div>
        </TabsContent>

        <TabsContent value="components" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobComponents job={job} onUpdate={() => {}} />
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobSchedule job={job} />
          </div>
        </TabsContent>

        <TabsContent value="documents" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobDocuments job={job} onUpdate={() => {}} />
          </div>
        </TabsContent>

        <TabsContent value="photos" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobPhotosView job={job} />
          </div>
        </TabsContent>

        <TabsContent value="materials" className="space-y-4 pt-4 px-2">
          {profile?.id && (
            <MaterialsManagement job={job} userId={profile.id} />
          )}
        </TabsContent>

        <TabsContent value="orders" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobZohoOrders jobId={job.id} />
          </div>
        </TabsContent>

        <TabsContent value="subcontractors" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <SubcontractorEstimatesManagement jobId={job.id} />
          </div>
        </TabsContent>

        <TabsContent value="customer-portal" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <CustomerPortalManagement job={job} />
          </div>
        </TabsContent>

        <TabsContent value="communications" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobCommunications job={job} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Email Communications Modal - Custom Implementation */}
      {showEmailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEmailDialog(false)} />
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-[95vw] max-h-[95vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-4 border-b-4 border-blue-800 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-6 h-6" />
                  <div>
                    <h2 className="text-xl font-bold">Email Communications Center</h2>
                    <p className="text-blue-100 text-sm">{job.name}</p>
                  </div>
                </div>
                <Button onClick={() => setShowEmailDialog(false)} variant="ghost" className="text-white hover:bg-white/10">
                  ✕ Close
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-slate-50 p-6">
              <JobCommunications job={job} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
