import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  ListChecks, 
  Truck, 
  AlertCircle,
  Filter,
  X,
  Palette,
  Users,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Edit2
} from 'lucide-react';
import { toast } from 'sonner';
import { EventDetailsDialog } from './EventDetailsDialog';
import { parseDateLocal } from '@/lib/date-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Import everything needed from global types
import type { CalendarEvent as GlobalCalendarEvent, CalendarEventType, Job } from '@/types';

// RENAME local interface to avoid conflict with the global CalendarEvent
interface MasterCalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string;
  jobId: string;
  jobName: string;
  jobColor: string;
  title: string;
  description: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  materialId?: string;
  subcontractorName?: string;
  subcontractorPhone?: string;
  assignedUserName?: string;
  subcontractorTrades?: string[];
}

interface MasterCalendarProps {
  onJobSelect: (jobId: string) => void;
  jobId?: string; 
}

// ... rest of your helper functions like getJobColor ...
