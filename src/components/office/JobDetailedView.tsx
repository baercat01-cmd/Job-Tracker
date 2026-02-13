import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Users, Calendar, ChevronDown, ChevronRight, TrendingUp, Target, Camera, FileText, AlertCircle, Package, Activity, Briefcase, Building2, MapPin, FileCheck, ArrowLeft, Edit, DollarSign, FileSpreadsheet } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MaterialsManagement } from './MaterialsManagement';
import { JobComponents } from './JobComponents';
import { JobSchedule } from './JobSchedule';
import { JobDocuments } from './JobDocuments';
import { MaterialOrdersManagement } from './MaterialOrdersManagement';
import { JobPhotosView } from './JobPhotosView';
import { JobFinancials } from './JobFinancials';
import { CustomerPortalManagement } from './CustomerPortalManagement';
import { SubcontractorEstimatesManagement } from './SubcontractorEstimatesManagement';
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
          <TabsList className="grid w-full grid-cols-8 h-16 rounded-none bg-gradient-to-r from-green-900 via-black to-green-900">
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
          </TabsList>
          <TabsList className="grid w-full grid-cols-1 h-12 rounded-none bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 mt-0">
            <TabsTrigger 
              value="customer-portal" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Users className="w-5 h-5 sm:mr-2" />
              <span>Customer Portal</span>
            </TabsTrigger>
          </TabsList>
          <TabsList className="grid w-full grid-cols-1 h-12 rounded-none bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 mt-0">
            <TabsTrigger 
              value="orders" 
              className="font-bold text-sm sm:text-base text-yellow-100 hover:text-yellow-400 data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-600 data-[state=active]:to-yellow-500 data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Package className="w-5 h-5 sm:mr-2" />
              <span>Material Orders</span>
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Add spacer to prevent content from hiding under fixed header */}
        <div className="h-16" />

        {/* Overview Tab - Wrapped in max-width container */}
        <TabsContent value="overview" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
          <Card>
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Building2 className="w-6 h-6" />
                  {job.name}
                </CardTitle>
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onEdit}
                    className="flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Job Info
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Basic Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Job Number</label>
                        <p className="font-medium">{job.job_number || 'Not assigned'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Client Name</label>
                        <p className="font-medium">{job.client_name}</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Status</label>
                        <Badge className="mt-1" variant={job.status === 'active' ? 'default' : 'secondary'}>
                          {job.status}
                        </Badge>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Internal Job</label>
                        <p className="font-medium">{job.is_internal ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Location</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          Address
                        </label>
                        <p className="font-medium">{job.address}</p>
                      </div>
                      {job.gps_lat && job.gps_lng && (
                        <div>
                          <label className="text-xs text-muted-foreground">GPS Coordinates</label>
                          <p className="font-mono text-sm">{job.gps_lat}, {job.gps_lng}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Project Timeline</h3>
                    <div className="space-y-3">
                      {job.projected_start_date && (
                        <div>
                          <label className="text-xs text-muted-foreground">Projected Start Date</label>
                          <p className="font-medium">{new Date(job.projected_start_date).toLocaleDateString()}</p>
                        </div>
                      )}
                      {job.projected_end_date && (
                        <div>
                          <label className="text-xs text-muted-foreground">Projected End Date</label>
                          <p className="font-medium">{new Date(job.projected_end_date).toLocaleDateString()}</p>
                        </div>
                      )}
                      {firstWorkDate && (
                        <div>
                          <label className="text-xs text-muted-foreground">First Work Date</label>
                          <p className="font-medium">{new Date(firstWorkDate).toLocaleDateString()}</p>
                        </div>
                      )}
                      {lastWorkDate && (
                        <div>
                          <label className="text-xs text-muted-foreground">Last Work Date</label>
                          <p className="font-medium">{new Date(lastWorkDate).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Estimated Hours</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Budget</label>
                        <p className="text-2xl font-bold text-primary">{estimatedHours.toFixed(2)} hrs</p>
                      </div>
                    </div>
                  </div>
                </div>
                {job.description && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</h3>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-4">{job.description}</p>
                  </div>
                )}
                {job.notes && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-4">{job.notes}</p>
                  </div>
                )}
                <div className="md:col-span-2 pt-4 border-t">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                    {job.updated_at && job.updated_at !== job.created_at && (
                      <span>Last Updated: {new Date(job.updated_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
      
      {/* Key Metrics Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Clock-In Hours</p>
                <p className="text-2xl font-bold">{totalClockInHours.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Man-Hours</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Clock className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Component Hours</p>
                <p className="text-2xl font-bold">{totalComponentHours.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Task Breakdown</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Days Active</p>
                <p className="text-2xl font-bold">{calculateDaysActive()}</p>
                <p className="text-xs text-muted-foreground">{dateGroups.length} logged</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Crew Members</p>
                <p className="text-2xl font-bold">{crewMembers.length}</p>
                <p className="text-xs text-muted-foreground">Team Size</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Briefcase className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Photos</p>
                <p className="text-2xl font-bold">{photoCount}</p>
                <p className="text-xs text-muted-foreground">Uploaded</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Camera className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Components</p>
                <p className="text-2xl font-bold">{componentGroups.length}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Materials</p>
                <p className="text-2xl font-bold">{materialCount}</p>
                <p className="text-xs text-muted-foreground">Items</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Issues</p>
                <p className="text-2xl font-bold">{issueCount}</p>
                <p className="text-xs text-muted-foreground">Reported</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <AlertCircle className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Progress */}
      {estimatedHours > 0 && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="w-5 h-5 text-primary" />
              Project Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-primary/5 rounded-lg border">
                <div className="text-3xl font-bold text-primary">{estimatedHours.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Estimated Hours</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg border">
                <div className="text-3xl font-bold">{totalClockInHours.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Clock-In Hours</p>
              </div>
              <div className={`p-4 rounded-lg border ${
                isOverBudget 
                  ? 'bg-destructive/10 border-destructive/30' 
                  : 'bg-success/10 border-success/30'
              }`}>
                <div className={`text-3xl font-bold ${
                  isOverBudget ? 'text-destructive' : 'text-success'
                }`}>
                  {isOverBudget ? '+' : ''}{(totalClockInHours - estimatedHours).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
                  {isOverBudget ? 'Over Budget' : 'Remaining'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress (Clock-In Hours)</span>
                <span className={`font-bold ${
                  isOverBudget ? 'text-destructive' : 'text-primary'
                }`}>
                  {progressPercent.toFixed(2)}%
                </span>
              </div>
              <Progress 
                value={progressPercent} 
                className="h-4"
              />
              {isOverBudget && (
                <p className="text-xs text-destructive font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Clock-in hours exceed estimate
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
              <div className="text-sm">
                <p className="text-muted-foreground">Days Logged</p>
                <p className="font-bold text-lg">{dateGroups.length}</p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">Avg Clock-In/Day</p>
                <p className="font-bold text-lg">
                  {dateGroups.length > 0 ? (totalClockInHours / dateGroups.length).toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">Component Hours</p>
                <p className="font-bold text-lg">{totalComponentHours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Component Breakdown */}
      {componentGroups.filter(comp => comp.component_id !== null).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Component Breakdown
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Shows how component hours fit within total clock-in hours ({totalClockInHours.toFixed(2)} hrs)
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {componentGroups
              .filter(comp => comp.component_id !== null)
              .slice(0, 5)
              .map((comp) => {
                // Calculate percentage based on clock-in hours (100% baseline)
                const percentage = totalClockInHours > 0 ? (comp.total_man_hours / totalClockInHours) * 100 : 0;
                return (
                  <div key={comp.component_id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{comp.component_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{comp.total_man_hours.toFixed(2)} hrs</span>
                        <span className="font-bold text-primary w-12 text-right">{percentage.toFixed(0)}%</span>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b last:border-b-0 last:pb-0">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    {activity.icon === 'clock' && <Clock className="w-4 h-4 text-muted-foreground" />}
                    {activity.icon === 'camera' && <Camera className="w-4 h-4 text-muted-foreground" />}
                    {activity.icon === 'file' && <FileText className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTimeAgo(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
          </div>
        </TabsContent>

        {/* Financials Tab */}
        <TabsContent value="financials" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobFinancials job={job} />
          </div>
        </TabsContent>

        {/* Components Tab */}
        <TabsContent value="components" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobComponents job={job} onUpdate={() => {}} />
          </div>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobSchedule job={job} />
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobDocuments job={job} onUpdate={() => {}} />
          </div>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <JobPhotosView job={job} />
          </div>
        </TabsContent>

        {/* Materials Tab - Full Width for Spreadsheet */}
        <TabsContent value="materials" className="space-y-2 pt-4 px-2">
          {profile?.id && (
            <MaterialsManagement job={job} userId={profile.id} />
          )}
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <MaterialOrdersManagement jobId={job.id} />
          </div>
        </TabsContent>

        {/* Subcontractors Tab */}
        <TabsContent value="subcontractors" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <SubcontractorEstimatesManagement jobId={job.id} />
          </div>
        </TabsContent>

        {/* Customer Portal Tab */}
        <TabsContent value="customer-portal" className="w-full">
          <div className="max-w-7xl mx-auto space-y-4 pt-4 px-4">
            <CustomerPortalManagement job={job} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
