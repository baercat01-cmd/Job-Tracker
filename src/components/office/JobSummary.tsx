import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Camera, TrendingUp, Users, Calendar } from 'lucide-react';
import type { Job } from '@/types';

interface JobSummaryProps {
  job: Job;
}

interface ComponentTimeSummary {
  component_id: string;
  component_name: string;
  total_hours: number;
  entry_count: number;
  total_crew_hours: number; // hours * crew count
}

interface PhotoSummary {
  id: string;
  photo_url: string;
  photo_date: string;
  component_name?: string;
  uploaded_by: string;
  caption?: string;
}

interface UserComponentSummary {
  component_id: string;
  component_name: string;
  total_hours: number;
  entry_count: number;
}

interface UserSummary {
  user_id: string;
  username: string;
  total_hours: number;
  components: UserComponentSummary[];
}

export function JobSummary({ job }: JobSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [componentSummary, setComponentSummary] = useState<ComponentTimeSummary[]>([]);
  const [userSummary, setUserSummary] = useState<UserSummary[]>([]);
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [totalCrewHours, setTotalCrewHours] = useState(0);
  const [uniqueDates, setUniqueDates] = useState(0);

  useEffect(() => {
    loadSummaryData();
  }, [job.id]);

  async function loadSummaryData() {
    setLoading(true);
    try {
      await Promise.all([
        loadComponentTimeSummary(),
        loadUserSummary(),
        loadPhotos(),
      ]);
    } catch (error) {
      console.error('Error loading summary:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadComponentTimeSummary() {
    try {
      const { data: timeEntries, error } = await supabase
        .from('time_entries')
        .select(`
          component_id,
          total_hours,
          crew_count,
          start_time,
          components(name)
        `)
        .eq('job_id', job.id)
        .not('total_hours', 'is', null);

      if (error) throw error;

      // Group by component
      const componentMap = new Map<string, ComponentTimeSummary>();
      const datesSet = new Set<string>();

      (timeEntries || []).forEach((entry: any) => {
        const componentId = entry.component_id;
        const componentName = entry.components?.name || 'Unknown Component';
        const hours = entry.total_hours || 0;
        const crewCount = entry.crew_count || 1;
        const crewHours = hours * crewCount;
        
        // Track unique dates
        if (entry.start_time) {
          const date = new Date(entry.start_time).toISOString().split('T')[0];
          datesSet.add(date);
        }

        if (componentMap.has(componentId)) {
          const existing = componentMap.get(componentId)!;
          existing.total_hours += hours;
          existing.entry_count += 1;
          existing.total_crew_hours += crewHours;
        } else {
          componentMap.set(componentId, {
            component_id: componentId,
            component_name: componentName,
            total_hours: hours,
            entry_count: 1,
            total_crew_hours: crewHours,
          });
        }
      });

      const summaryArray = Array.from(componentMap.values()).sort(
        (a, b) => b.total_hours - a.total_hours
      );

      const grandTotal = summaryArray.reduce((sum, item) => sum + item.total_hours, 0);
      const grandCrewTotal = summaryArray.reduce((sum, item) => sum + item.total_crew_hours, 0);

      setComponentSummary(summaryArray);
      setTotalHours(grandTotal);
      setTotalCrewHours(grandCrewTotal);
      setUniqueDates(datesSet.size);
    } catch (error) {
      console.error('Error loading component time summary:', error);
    }
  }

  async function loadUserSummary() {
    try {
      const { data: timeEntries, error } = await supabase
        .from('time_entries')
        .select(`
          user_id,
          component_id,
          total_hours,
          user_profiles(username),
          components(name)
        `)
        .eq('job_id', job.id)
        .not('total_hours', 'is', null);

      if (error) throw error;

      // Group by user
      const userMap = new Map<string, UserSummary>();

      (timeEntries || []).forEach((entry: any) => {
        const userId = entry.user_id;
        const username = entry.user_profiles?.username || 'Unknown User';
        const componentId = entry.component_id;
        const componentName = entry.components?.name || 'Unknown Component';
        const hours = entry.total_hours || 0;

        if (userMap.has(userId)) {
          const userSummary = userMap.get(userId)!;
          userSummary.total_hours += hours;

          // Find or create component entry
          const existingComponent = userSummary.components.find(
            (c) => c.component_id === componentId
          );

          if (existingComponent) {
            existingComponent.total_hours += hours;
            existingComponent.entry_count += 1;
          } else {
            userSummary.components.push({
              component_id: componentId,
              component_name: componentName,
              total_hours: hours,
              entry_count: 1,
            });
          }
        } else {
          userMap.set(userId, {
            user_id: userId,
            username: username,
            total_hours: hours,
            components: [
              {
                component_id: componentId,
                component_name: componentName,
                total_hours: hours,
                entry_count: 1,
              },
            ],
          });
        }
      });

      const summaryArray = Array.from(userMap.values()).sort(
        (a, b) => b.total_hours - a.total_hours
      );

      // Sort components within each user
      summaryArray.forEach((user) => {
        user.components.sort((a, b) => b.total_hours - a.total_hours);
      });

      setUserSummary(summaryArray);
    } catch (error) {
      console.error('Error loading user summary:', error);
    }
  }

  async function loadPhotos() {
    try {
      const { data: photosData, error } = await supabase
        .from('photos')
        .select(`
          id,
          photo_url,
          photo_date,
          caption,
          components(name),
          user_profiles(username, email)
        `)
        .eq('job_id', job.id)
        .order('photo_date', { ascending: false });

      if (error) throw error;

      const photosSummary: PhotoSummary[] = (photosData || []).map((photo: any) => ({
        id: photo.id,
        photo_url: photo.photo_url,
        photo_date: photo.photo_date,
        component_name: photo.components?.name,
        uploaded_by: photo.user_profiles?.username || photo.user_profiles?.email || 'Unknown',
        caption: photo.caption,
      }));

      setPhotos(photosSummary);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading job summary...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{totalCrewHours.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Total Man-Hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{componentSummary.length}</p>
            <p className="text-sm text-muted-foreground">Components</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{uniqueDates}</p>
            <p className="text-sm text-muted-foreground">Work Days</p>
          </CardContent>
        </Card>
      </div>

      {/* User Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Time by User
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userSummary.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No time entries recorded yet
            </p>
          ) : (
            <div className="space-y-6">
              {userSummary.map((user) => (
                <div key={user.user_id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-lg">{user.username}</p>
                        <p className="text-sm text-muted-foreground">
                          {user.components.length} component{user.components.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">{user.total_hours.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Hours Logged</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {user.components.map((component) => (
                      <div
                        key={component.component_id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{component.component_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {component.entry_count} {component.entry_count === 1 ? 'entry' : 'entries'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{component.total_hours.toFixed(2)}h</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Component Time Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Time by Component
          </CardTitle>
        </CardHeader>
        <CardContent>
          {componentSummary.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No time entries recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {componentSummary.map((component) => {
                const percentage = totalCrewHours > 0 ? (component.total_crew_hours / totalCrewHours) * 100 : 0;
                return (
                  <div key={component.component_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{component.component_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {component.entry_count} {component.entry_count === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{component.total_crew_hours.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">man-hours</p>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {percentage.toFixed(2)}% of total man-hours
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photos Gallery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            All Photos ({photos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No photos uploaded yet
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <div key={photo.id} className="group relative">
                  <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                    <img
                      src={photo.photo_url}
                      alt={photo.caption || 'Job photo'}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      onClick={() => window.open(photo.photo_url, '_blank')}
                    />
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium">
                      {new Date(photo.photo_date).toLocaleDateString()}
                    </p>
                    {photo.component_name && (
                      <Badge variant="secondary" className="text-xs">
                        {photo.component_name}
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      By {photo.uploaded_by}
                    </p>
                    {photo.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {photo.caption}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
