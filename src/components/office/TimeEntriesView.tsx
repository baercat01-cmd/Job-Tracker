import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, User, Calendar, ChevronDown, ChevronRight, Users, Briefcase, ListChecks } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function TimeEntriesView() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'job' | 'user' | 'component' | 'day'>('job');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  function toggleItem(id: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function expandAll() {
    const allIds = new Set<string>();
    if (viewMode === 'job') {
      Object.keys(groupedByJob).forEach(id => allIds.add(id));
    } else if (viewMode === 'user') {
      Object.keys(groupedByUser).forEach(id => allIds.add(id));
    } else if (viewMode === 'component') {
      Object.keys(groupedByComponent).forEach(id => allIds.add(id));
    } else if (viewMode === 'day') {
      Object.keys(groupedByDay).forEach(id => allIds.add(id));
    }
    setExpandedItems(allIds);
  }

  function collapseAll() {
    setExpandedItems(new Set());
  }

  useEffect(() => {
    loadTimeEntries();
  }, []);

  async function loadTimeEntries() {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          jobs(id, job_number, name, client_name),
          components(id, name),
          user_profiles(id, username, email)
        `)
        .order('start_time', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading time entries:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
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

  // Group entries by different criteria
  const groupedByJob = entries.reduce((acc, entry) => {
    const jobId = entry.jobs?.id || 'unknown';
    if (!acc[jobId]) {
      acc[jobId] = {
        job: entry.jobs,
        entries: [],
        totalManHours: 0,
      };
    }
    acc[jobId].entries.push(entry);
    acc[jobId].totalManHours += (entry.total_hours || 0) * (entry.crew_count || 1);
    return acc;
  }, {} as Record<string, any>);

  const groupedByUser = entries.reduce((acc, entry) => {
    const userId = entry.user_profiles?.id || 'unknown';
    if (!acc[userId]) {
      acc[userId] = {
        user: entry.user_profiles,
        entries: [],
        totalManHours: 0,
      };
    }
    acc[userId].entries.push(entry);
    acc[userId].totalManHours += (entry.total_hours || 0) * (entry.crew_count || 1);
    return acc;
  }, {} as Record<string, any>);

  const groupedByComponent = entries.reduce((acc, entry) => {
    const componentId = entry.components?.id || 'unknown';
    if (!acc[componentId]) {
      acc[componentId] = {
        component: entry.components,
        entries: [],
        totalManHours: 0,
      };
    }
    acc[componentId].entries.push(entry);
    acc[componentId].totalManHours += (entry.total_hours || 0) * (entry.crew_count || 1);
    return acc;
  }, {} as Record<string, any>);

  const groupedByDay = entries.reduce((acc, entry) => {
    const date = new Date(entry.start_time).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = {
        date,
        entries: [],
        totalManHours: 0,
      };
    }
    acc[date].entries.push(entry);
    acc[date].totalManHours += (entry.total_hours || 0) * (entry.crew_count || 1);
    return acc;
  }, {} as Record<string, any>);

  function renderEntry(entry: any) {
    return (
      <div
        key={entry.id}
        className="bg-muted/50 rounded-md p-3 space-y-2"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {viewMode !== 'job' && entry.jobs && (
                <span className="text-sm font-medium">
                  {entry.jobs.name || entry.jobs.job_number} - {entry.jobs.client_name}
                </span>
              )}
              {viewMode !== 'component' && entry.components && (
                <Badge variant="secondary">{entry.components.name}</Badge>
              )}
              {entry.is_manual && (
                <Badge variant="outline" className="text-xs">Manual</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(entry.start_time)} • {formatTime(entry.start_time)}
            </p>
            {viewMode !== 'user' && entry.user_profiles && (
              <p className="text-xs text-muted-foreground">
                By {entry.user_profiles.username || entry.user_profiles.email}
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0 ml-4">
            <p className="font-bold">{((entry.total_hours || 0) * (entry.crew_count || 1)).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">man-hours</p>
            <p className="text-xs text-muted-foreground">{entry.crew_count} crew</p>
          </div>
        </div>
        {entry.worker_names && entry.worker_names.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Workers:</p>
            <div className="flex flex-wrap gap-1">
              {entry.worker_names.map((name: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {name}
                </Badge>
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
          <p className="text-muted-foreground">Loading time entries...</p>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">No time entries found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Time Entries</h2>
          <p className="text-sm text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} total
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="job" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            <span className="hidden sm:inline">By Job</span>
          </TabsTrigger>
          <TabsTrigger value="user" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">By User</span>
          </TabsTrigger>
          <TabsTrigger value="component" className="flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            <span className="hidden sm:inline">By Component</span>
          </TabsTrigger>
          <TabsTrigger value="day" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">By Day</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="job" className="space-y-3 mt-6">
          {Object.entries(groupedByJob).map(([jobId, group]: [string, any]) => {
            const isExpanded = expandedItems.has(jobId);
            return (
              <Collapsible
                key={jobId}
                open={isExpanded}
                onOpenChange={() => toggleItem(jobId)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between p-4 bg-muted/30">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div className="text-left">
                            <h3 className="font-bold text-lg">
                              {group.job?.name || group.job?.job_number || 'Unknown Job'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            {group.totalManHours.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">man-hours</p>
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 space-y-2 bg-card">
                      {group.entries.map(renderEntry)}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </TabsContent>

        <TabsContent value="user" className="space-y-3 mt-6">
          {Object.entries(groupedByUser).map(([userId, group]: [string, any]) => {
            const isExpanded = expandedItems.has(userId);
            return (
              <Collapsible
                key={userId}
                open={isExpanded}
                onOpenChange={() => toggleItem(userId)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between p-4 bg-muted/30">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div className="text-left">
                            <h3 className="font-bold text-lg">
                              {group.user?.username || group.user?.email || 'Unknown User'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            {group.totalManHours.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">man-hours</p>
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 space-y-2 bg-card">
                      {group.entries.map(renderEntry)}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </TabsContent>

        <TabsContent value="component" className="space-y-3 mt-6">
          {Object.entries(groupedByComponent).map(([componentId, group]: [string, any]) => {
            const isExpanded = expandedItems.has(componentId);
            return (
              <Collapsible
                key={componentId}
                open={isExpanded}
                onOpenChange={() => toggleItem(componentId)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between p-4 bg-muted/30">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div className="text-left">
                            <h3 className="font-bold text-lg">
                              {group.component?.name || 'Unknown Component'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            {group.totalManHours.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">man-hours</p>
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 space-y-2 bg-card">
                      {group.entries.map(renderEntry)}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </TabsContent>

        <TabsContent value="day" className="space-y-3 mt-6">
          {Object.entries(groupedByDay)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, group]: [string, any]) => {
              const isExpanded = expandedItems.has(date);
              return (
                <Collapsible
                  key={date}
                  open={isExpanded}
                  onOpenChange={() => toggleItem(date)}
                >
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <button className="w-full hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between p-4 bg-muted/30">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            )}
                            <div className="text-left">
                              <h3 className="font-bold text-lg">
                                {formatDate(date)}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">
                              {group.totalManHours.toFixed(1)}
                            </p>
                            <p className="text-sm text-muted-foreground">man-hours</p>
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 space-y-2 bg-card">
                        {group.entries.map(renderEntry)}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
