import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, FileSpreadsheet, Brain } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface TimeEntry {
  id: string;
  component_id: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  crew_count: number;
  user_id: string;
  is_manual: boolean;
  notes: string;
  worker_names: string[];
  components: { name: string };
  user_profiles: { username: string };
}

interface DailyLog {
  id: string;
  log_date: string;
  weather: string;
  weather_details: any;
  components_worked: any[];
  time_summary: any[];
  issues: any[];
  material_requests_structured: any[];
  client_summary: string;
  final_notes: string;
  crew_count: number;
  created_by: string;
  user_profiles: { username: string };
}

export function DataExport() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [exportingMaterials, setExportingMaterials] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load jobs');
    }
  }

  async function exportJob(format: 'pdf' | 'xlsx' | 'notebooklm') {
    if (!selectedJob) {
      toast.error('Please select a job');
      return;
    }

    setLoading(true);

    try {
      const job = jobs.find(j => j.id === selectedJob);
      if (!job) throw new Error('Job not found');

      // Fetch all time entries for this job (no date filter)
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username)
        `)
        .eq('job_id', selectedJob)
        .order('start_time');

      if (timeError) throw timeError;

      // Fetch all daily logs
      const { data: dailyLogs, error: logsError } = await supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', selectedJob)
        .order('log_date');

      if (logsError) throw logsError;

      // Export based on format
      switch (format) {
        case 'pdf':
          await exportToPDF(job, timeEntries as TimeEntry[], dailyLogs as DailyLog[]);
          break;
        case 'xlsx':
          await exportToXLSX(job, timeEntries as TimeEntry[], dailyLogs as DailyLog[]);
          break;
        case 'notebooklm':
          await exportToNotebookLM(job, timeEntries as TimeEntry[], dailyLogs as DailyLog[]);
          break;
      }

      toast.success(`Job data exported successfully as ${format.toUpperCase()}`);
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setLoading(false);
    }
  }

  async function exportToPDF(job: Job, timeEntries: TimeEntry[], dailyLogs: DailyLog[]) {
    toast.loading('Generating PDF...', { id: 'pdf-gen' });
    
    try {
      // Import jsPDF dynamically
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'pt', 'letter');
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const usableWidth = pageWidth - (margin * 2);
      let yPosition = margin;
      
      // Helper function to add new page if needed
      const checkPageBreak = (requiredSpace: number) => {
        if (yPosition + requiredSpace > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };
      
      // Helper to add text with word wrap
      const addText = (text: string, fontSize: number, isBold = false, maxWidth?: number) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, maxWidth || usableWidth);
        lines.forEach((line: string) => {
          checkPageBreak(fontSize * 1.2);
          doc.text(line, margin, yPosition);
          yPosition += fontSize * 1.2;
        });
      };
      
      // Calculate component totals
      const componentTotals = new Map<string, { hours: number; crewHours: number; entries: number }>();
      timeEntries.forEach(entry => {
        const componentName = entry.components?.name || 'Unknown Component';
        const existing = componentTotals.get(componentName) || { hours: 0, crewHours: 0, entries: 0 };
        const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
        componentTotals.set(componentName, {
          hours: existing.hours + (entry.total_hours || 0),
          crewHours: existing.crewHours + crewHours,
          entries: existing.entries + 1
        });
      });
      
      const totalActualHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.hours, 0);
      const totalCrewHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.crewHours, 0);
      
      // Title
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(45, 95, 63);
      doc.text(`Job Report: ${job.name}`, margin, yPosition);
      yPosition += 35;
      
      // Job Info
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(`Client: ${job.client_name}`, margin, yPosition);
      yPosition += 15;
      if (job.job_number) {
        doc.text(`Job Number: ${job.job_number}`, margin, yPosition);
        yPosition += 15;
      }
      doc.text(`Address: ${job.address}`, margin, yPosition);
      yPosition += 15;
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
      yPosition += 25;
      
      // Summary Section
      checkPageBreak(80);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(45, 95, 63);
      doc.text('Summary', margin, yPosition);
      yPosition += 20;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Actual Hours: ${totalActualHours.toFixed(2)}`, margin, yPosition);
      yPosition += 15;
      doc.text(`Total Crew Hours: ${totalCrewHours.toFixed(2)}`, margin, yPosition);
      yPosition += 15;
      doc.text(`Total Time Entries: ${timeEntries.length}`, margin, yPosition);
      yPosition += 15;
      doc.text(`Daily Logs: ${dailyLogs.length}`, margin, yPosition);
      yPosition += 25;
      
      // Component Breakdown Table
      if (componentTotals.size > 0) {
        checkPageBreak(100);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(45, 95, 63);
        doc.text('Component Breakdown', margin, yPosition);
        yPosition += 20;
        
        // Table header
        doc.setFillColor(45, 95, 63);
        doc.rect(margin, yPosition, usableWidth, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Component', margin + 5, yPosition + 13);
        doc.text('Entries', margin + usableWidth * 0.6, yPosition + 13);
        doc.text('Hours', margin + usableWidth * 0.75, yPosition + 13);
        doc.text('Crew Hours', margin + usableWidth * 0.85, yPosition + 13);
        yPosition += 20;
        
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        Array.from(componentTotals.entries())
          .sort((a, b) => b[1].crewHours - a[1].crewHours)
          .forEach(([component, totals], index) => {
            checkPageBreak(18);
            if (index % 2 === 0) {
              doc.setFillColor(249, 249, 249);
              doc.rect(margin, yPosition - 12, usableWidth, 18, 'F');
            }
            doc.text(component.substring(0, 40), margin + 5, yPosition);
            doc.text(totals.entries.toString(), margin + usableWidth * 0.6, yPosition);
            doc.text(totals.hours.toFixed(2), margin + usableWidth * 0.75, yPosition);
            doc.text(totals.crewHours.toFixed(2), margin + usableWidth * 0.85, yPosition);
            yPosition += 18;
          });
        yPosition += 15;
      }
      
      // Detailed Time Entries Section
      if (timeEntries.length > 0) {
        checkPageBreak(50);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(45, 95, 63);
        doc.text('Detailed Time Entries', margin, yPosition);
        yPosition += 20;
        
        // Group time entries by date
        const entriesByDate = new Map<string, TimeEntry[]>();
        timeEntries.forEach(entry => {
          const date = formatDate(entry.start_time);
          if (!entriesByDate.has(date)) {
            entriesByDate.set(date, []);
          }
          entriesByDate.get(date)?.push(entry);
        });
        
        // Sort dates (most recent first)
        const sortedDates = Array.from(entriesByDate.keys()).sort((a, b) => {
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateB.getTime() - dateA.getTime();
        });
        
        sortedDates.forEach((date, dateIndex) => {
          const entries = entriesByDate.get(date) || [];
          
          checkPageBreak(80);
          
          // Date header with green background
          doc.setFillColor(45, 95, 63);
          doc.rect(margin, yPosition, usableWidth, 25, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(date, margin + 10, yPosition + 16);
          yPosition += 30;
          
          // Table header
          doc.setFillColor(220, 220, 220);
          doc.rect(margin, yPosition, usableWidth, 18, 'F');
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          
          const col1 = margin + 5;
          const col2 = margin + usableWidth * 0.35;
          const col3 = margin + usableWidth * 0.50;
          const col4 = margin + usableWidth * 0.60;
          const col5 = margin + usableWidth * 0.70;
          const col6 = margin + usableWidth * 0.82;
          const col7 = margin + usableWidth * 0.92;
          
          doc.text('Component', col1, yPosition + 12);
          doc.text('Worker', col2, yPosition + 12);
          doc.text('Hours', col3, yPosition + 12);
          doc.text('Crew', col4, yPosition + 12);
          doc.text('Crew Hrs', col5, yPosition + 12);
          doc.text('Method', col6, yPosition + 12);
          yPosition += 18;
          
          doc.setFont('helvetica', 'normal');
          
          entries.forEach((entry, entryIndex) => {
            const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
            const hasNotes = entry.notes && entry.notes.trim();
            const hasWorkers = entry.worker_names && entry.worker_names.length > 0;
            const extraHeight = (hasNotes || hasWorkers) ? 12 : 0;
            
            checkPageBreak(20 + extraHeight);
            
            // Alternating row background
            if (entryIndex % 2 === 0) {
              doc.setFillColor(249, 249, 249);
              doc.rect(margin, yPosition - 12, usableWidth, 18 + extraHeight, 'F');
            }
            
            // Entry data
            doc.setFontSize(8);
            doc.text((entry.components?.name || 'Unknown').substring(0, 25), col1, yPosition);
            doc.text((entry.user_profiles?.username || 'Unknown').substring(0, 15), col2, yPosition);
            doc.text((entry.total_hours || 0).toFixed(2), col3, yPosition);
            doc.text((entry.crew_count || 1).toString(), col4, yPosition);
            doc.setFont('helvetica', 'bold');
            doc.text(crewHours.toFixed(2), col5, yPosition);
            doc.setFont('helvetica', 'normal');
            doc.text(entry.is_manual ? 'Manual' : 'Timer', col6, yPosition);
            yPosition += 15;
            
            // Add notes/workers beneath if present
            if (hasWorkers) {
              doc.setFontSize(7);
              doc.setTextColor(100, 100, 100);
              doc.setFont('helvetica', 'bold');
              doc.text('Workers:', col1, yPosition);
              doc.setFont('helvetica', 'normal');
              const workersText = entry.worker_names.join(', ');
              doc.text(workersText.substring(0, 80), col1 + 30, yPosition);
              yPosition += 10;
              doc.setTextColor(0, 0, 0);
            }
            
            if (hasNotes) {
              doc.setFontSize(7);
              doc.setTextColor(100, 100, 100);
              doc.setFont('helvetica', 'bold');
              doc.text('Notes:', col1, yPosition);
              doc.setFont('helvetica', 'normal');
              const notesText = entry.notes.substring(0, 80);
              doc.text(notesText, col1 + 25, yPosition);
              yPosition += 10;
              doc.setTextColor(0, 0, 0);
            }
            
            yPosition += 3;
          });
          
          // Add space between dates
          yPosition += 10;
        });
      }
      
      // Daily Logs Section
      if (dailyLogs.length > 0) {
        checkPageBreak(50);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(45, 95, 63);
        doc.text('Daily Activity Logs', margin, yPosition);
        yPosition += 20;
        
        dailyLogs.forEach((log, index) => {
          checkPageBreak(80);
          
          // Date header
          doc.setFillColor(45, 95, 63);
          doc.rect(margin, yPosition, usableWidth, 25, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(`📅 ${formatDate(log.log_date)}`, margin + 10, yPosition + 17);
          yPosition += 30;
          
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          
          // Log details
          if (log.user_profiles?.username) {
            doc.text(`Logged by: ${log.user_profiles.username}`, margin + 5, yPosition);
            yPosition += 12;
          }
          if (log.crew_count) {
            doc.text(`Crew Count: ${log.crew_count}`, margin + 5, yPosition);
            yPosition += 12;
          }
          if (log.weather_details || log.weather) {
            const weather = log.weather_details 
              ? `${log.weather_details.description || log.weather || ''} ${log.weather_details.temp_f ? `(${log.weather_details.temp_f}°F)` : ''}`.trim()
              : log.weather || '';
            doc.text(`Weather: ${weather}`, margin + 5, yPosition);
            yPosition += 12;
          }
          
          yPosition += 5;
          
          // Components worked
          if (log.components_worked && log.components_worked.length > 0) {
            checkPageBreak(30);
            doc.setFont('helvetica', 'bold');
            doc.text('Components Worked:', margin + 5, yPosition);
            yPosition += 12;
            doc.setFont('helvetica', 'normal');
            log.components_worked.forEach(comp => {
              checkPageBreak(12);
              doc.text(`• ${comp.name || comp}`, margin + 15, yPosition);
              yPosition += 12;
            });
            yPosition += 3;
          }
          
          // Time summary
          if (log.time_summary && log.time_summary.length > 0) {
            checkPageBreak(30);
            doc.setFont('helvetica', 'bold');
            doc.text('Time Breakdown:', margin + 5, yPosition);
            yPosition += 12;
            doc.setFont('helvetica', 'normal');
            log.time_summary.forEach(entry => {
              checkPageBreak(12);
              const crewHours = parseFloat(entry.hours) * entry.crew_count;
              doc.text(`• ${entry.component_name || entry.name}: ${entry.hours} hrs × ${entry.crew_count} crew = ${crewHours.toFixed(2)} man-hrs`, margin + 15, yPosition);
              yPosition += 12;
            });
            yPosition += 3;
          }
          
          // Work performed (client summary)
          if (log.client_summary) {
            checkPageBreak(20);
            doc.setFont('helvetica', 'bold');
            doc.text('Work Performed:', margin + 5, yPosition);
            yPosition += 12;
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(log.client_summary, usableWidth - 10);
            lines.forEach((line: string) => {
              checkPageBreak(12);
              doc.text(line, margin + 5, yPosition);
              yPosition += 12;
            });
            yPosition += 3;
          }
          
          // Issues
          if (log.issues && log.issues.length > 0) {
            checkPageBreak(30);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(200, 0, 0);
            doc.text('Issues Encountered:', margin + 5, yPosition);
            yPosition += 12;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            log.issues.forEach(issue => {
              checkPageBreak(12);
              doc.text(`• ${issue.description || issue}`, margin + 15, yPosition);
              yPosition += 12;
            });
            yPosition += 3;
          }
          
          // Material requests
          if (log.material_requests_structured && log.material_requests_structured.length > 0) {
            checkPageBreak(30);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(200, 100, 0);
            doc.text('Materials Requested:', margin + 5, yPosition);
            yPosition += 12;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            log.material_requests_structured.forEach(req => {
              checkPageBreak(12);
              let reqText = `• ${req.item}: ${req.quantity}`;
              if (req.priority) reqText += ` (Priority: ${req.priority})`;
              doc.text(reqText, margin + 15, yPosition);
              yPosition += 12;
            });
            yPosition += 3;
          }
          
          // Final notes
          if (log.final_notes) {
            checkPageBreak(20);
            doc.setFont('helvetica', 'bold');
            doc.text('Additional Notes:', margin + 5, yPosition);
            yPosition += 12;
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(log.final_notes, usableWidth - 10);
            lines.forEach((line: string) => {
              checkPageBreak(12);
              doc.text(line, margin + 5, yPosition);
              yPosition += 12;
            });
            yPosition += 3;
          }
          
          yPosition += 10;
        });
      }
      
      // Save PDF
      const filename = `${job.name.replace(/[^a-z0-9]/gi, '_')}_Report.pdf`;
      doc.save(filename);
      
      toast.success('PDF downloaded successfully!', { id: 'pdf-gen' });
    } catch (err: any) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF. Please try Excel export instead.', { id: 'pdf-gen' });
    }
  }

  function generateHTMLReport(job: Job, timeEntries: TimeEntry[], dailyLogs: DailyLog[]): string {
    // Calculate component totals
    const componentTotals = new Map<string, { hours: number; crewHours: number; entries: number }>();
    
    timeEntries.forEach(entry => {
      const componentName = entry.components?.name || 'Unknown Component';
      const existing = componentTotals.get(componentName) || { hours: 0, crewHours: 0, entries: 0 };
      const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
      
      componentTotals.set(componentName, {
        hours: existing.hours + (entry.total_hours || 0),
        crewHours: existing.crewHours + crewHours,
        entries: existing.entries + 1
      });
    });

    const totalActualHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.hours, 0);
    const totalCrewHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.crewHours, 0);

    let html = `
      <h1>Job Report: ${job.name}</h1>
      
      <div class="summary-box">
        <strong>Client:</strong> ${job.client_name}<br>
        ${job.job_number ? `<strong>Job Number:</strong> ${job.job_number}<br>` : ''}
        <strong>Address:</strong> ${job.address}<br>
        <strong>Status:</strong> ${job.status || 'Active'}<br>
        <strong>Generated:</strong> ${new Date().toLocaleString()}
      </div>

      ${job.description ? `<p><strong>Description:</strong> ${job.description}</p>` : ''}

      <h2>Summary</h2>
      <div class="summary-box">
        <strong>Total Actual Hours:</strong> ${totalActualHours.toFixed(2)} hours<br>
        <strong>Total Crew Hours:</strong> ${totalCrewHours.toFixed(2)} hours<br>
        <strong>Total Time Entries:</strong> ${timeEntries.length}<br>
        <strong>Daily Logs:</strong> ${dailyLogs.length}
      </div>

      <h2>Component Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Entries</th>
            <th>Actual Hours</th>
            <th>Crew Hours</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from(componentTotals.entries())
            .sort((a, b) => b[1].crewHours - a[1].crewHours)
            .map(([component, totals]) => `
              <tr>
                <td>${component}</td>
                <td>${totals.entries}</td>
                <td>${totals.hours.toFixed(2)}</td>
                <td>${totals.crewHours.toFixed(2)}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>

      <h2>Daily Activity Logs</h2>
      ${dailyLogs.length === 0 ? '<p class="meta">No daily logs recorded.</p>' : dailyLogs.map((log, index) => `
        ${index > 0 ? '<div class="day-separator"></div>' : ''}
        <div class="log-entry">
          <div class="log-header">
            📅 ${formatDate(log.log_date)} - Day ${index + 1}
          </div>
          <div class="log-meta">
            <strong>👤 Logged by:</strong> ${log.user_profiles?.username || 'Unknown'}<br>
            <strong>👷 Crew Count:</strong> ${log.crew_count || 'Not specified'}
            ${log.weather_details ? `<br><strong>🌤️ Weather:</strong> ${log.weather_details.description || log.weather || 'Not recorded'} ${log.weather_details.temp_f ? `(${log.weather_details.temp_f}°F)` : ''}` : ''}
          </div>
          
          ${log.components_worked && log.components_worked.length > 0 ? `
            <p><strong>Components Worked:</strong> ${log.components_worked.map(c => c.name || c).join(', ')}</p>
          ` : ''}

          ${log.time_summary && log.time_summary.length > 0 ? `
            <p><strong>Time Summary:</strong></p>
            <ul>
              ${log.time_summary.map(t => `<li>${t.component_name || t.name}: ${t.hours} hours (${t.crew_count} crew = ${(parseFloat(t.hours) * t.crew_count).toFixed(2)} crew hours)</li>`).join('')}
            </ul>
          ` : ''}

          ${log.client_summary ? `<p><strong>Work Performed:</strong><br>${log.client_summary}</p>` : ''}

          ${log.issues && log.issues.length > 0 ? `
            <p><strong>Issues:</strong></p>
            <ul>
              ${log.issues.map(i => `<li>${i.description || i}</li>`).join('')}
            </ul>
          ` : ''}

          ${log.material_requests_structured && log.material_requests_structured.length > 0 ? `
            <p><strong>Material Requests:</strong></p>
            <ul>
              ${log.material_requests_structured.map(r => `<li>${r.item}: ${r.quantity}${r.priority ? ` (Priority: ${r.priority})` : ''}</li>`).join('')}
            </ul>
          ` : ''}

          ${log.final_notes ? `<p><strong>Notes:</strong><br>${log.final_notes}</p>` : ''}
        </div>
      `).join('')}

      <h2>Detailed Time Entries</h2>
      ${timeEntries.length === 0 ? '<p class="meta">No time entries recorded.</p>' : (() => {
        // Group time entries by date
        const entriesByDate = new Map<string, typeof timeEntries>();
        timeEntries.forEach(entry => {
          const date = formatDate(entry.start_time);
          if (!entriesByDate.has(date)) {
            entriesByDate.set(date, []);
          }
          entriesByDate.get(date)?.push(entry);
        });
        
        // Sort dates (most recent first)
        const sortedDates = Array.from(entriesByDate.keys()).sort((a, b) => {
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateB.getTime() - dateA.getTime();
        });
        
        return sortedDates.map((date, dateIndex) => {
          const entries = entriesByDate.get(date) || [];
          const totalHoursForDate = entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
          const totalCrewHoursForDate = entries.reduce((sum, e) => sum + ((e.total_hours || 0) * (e.crew_count || 1)), 0);
          
          return `
            ${dateIndex > 0 ? '<div class="day-separator"></div>' : ''}
            <div class="log-entry">
              <div class="log-header">
                📅 ${date}
              </div>
              <div class="log-meta">
                <strong>📊 Entries:</strong> ${entries.length} | 
                <strong>⏱️ Total Hours:</strong> ${totalHoursForDate.toFixed(2)} | 
                <strong>👥 Total Crew Hours:</strong> ${totalCrewHoursForDate.toFixed(2)}
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th style="width: 25%;">Component</th>
                    <th style="width: 15%;">Worker</th>
                    <th style="width: 10%;">Hours</th>
                    <th style="width: 8%;">Crew</th>
                    <th style="width: 12%;">Man-Hrs</th>
                    <th style="width: 10%;">Method</th>
                    <th style="width: 20%;">Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${entries.map(entry => {
                    const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
                    const workers = entry.worker_names && entry.worker_names.length > 0 ? entry.worker_names.join(', ') : '';
                    const notes = entry.notes || '';
                    const details = [workers, notes].filter(Boolean).join(' • ');
                    
                    return `
                      <tr>
                        <td>${entry.components?.name || 'Unknown'}</td>
                        <td>${entry.user_profiles?.username || 'Unknown'}</td>
                        <td>${(entry.total_hours || 0).toFixed(2)}</td>
                        <td>${entry.crew_count || 1}</td>
                        <td><strong>${crewHours.toFixed(2)}</strong></td>
                        <td>${entry.is_manual ? 'Manual' : 'Timer'}</td>
                        <td style="font-size: 7.5pt;">${details || '—'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        }).join('');
      })()}
    `;

    return html;
  }

  async function exportToXLSX(job: Job, timeEntries: TimeEntry[], dailyLogs: DailyLog[]) {
    // Calculate component totals
    const componentTotals = new Map<string, { hours: number; crewHours: number; entries: number }>();
    
    timeEntries.forEach(entry => {
      const componentName = entry.components?.name || 'Unknown Component';
      const existing = componentTotals.get(componentName) || { hours: 0, crewHours: 0, entries: 0 };
      const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
      
      componentTotals.set(componentName, {
        hours: existing.hours + (entry.total_hours || 0),
        crewHours: existing.crewHours + crewHours,
        entries: existing.entries + 1
      });
    });

    const totalActualHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.hours, 0);
    const totalCrewHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.crewHours, 0);

    // Create CSV content (Excel-compatible)
    let csv = '';

    // Job Summary Sheet Header
    csv += `JOB SUMMARY\n`;
    csv += `Job Name,${escapeCSV(job.name)}\n`;
    csv += `Client,${escapeCSV(job.client_name)}\n`;
    csv += `Job Number,${escapeCSV(job.job_number || 'N/A')}\n`;
    csv += `Address,${escapeCSV(job.address)}\n`;
    csv += `Status,${escapeCSV(job.status || 'Active')}\n`;
    csv += `Generated,${new Date().toLocaleString()}\n`;
    if (job.description) {
      csv += `Description,${escapeCSV(job.description)}\n`;
    }
    csv += `\n`;
    csv += `Total Actual Hours,${totalActualHours.toFixed(2)}\n`;
    csv += `Total Crew Hours,${totalCrewHours.toFixed(2)}\n`;
    csv += `Total Time Entries,${timeEntries.length}\n`;
    csv += `Daily Logs,${dailyLogs.length}\n`;
    csv += `\n\n`;

    // Component Breakdown
    csv += `COMPONENT BREAKDOWN\n`;
    csv += `Component,Entries,Actual Hours,Crew Hours\n`;
    Array.from(componentTotals.entries())
      .sort((a, b) => b[1].crewHours - a[1].crewHours)
      .forEach(([component, totals]) => {
        csv += `${escapeCSV(component)},${totals.entries},${totals.hours.toFixed(2)},${totals.crewHours.toFixed(2)}\n`;
      });
    csv += `\n\n`;

    // Time Entries
    csv += `DETAILED TIME ENTRIES\n`;
    csv += `Date,Component,Worker,Hours,Crew Count,Crew Hours,Method,Workers,Notes\n`;
    timeEntries.forEach(entry => {
      const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
      const workers = entry.worker_names && entry.worker_names.length > 0 ? entry.worker_names.join('; ') : '';
      csv += `${formatDate(entry.start_time)},${escapeCSV(entry.components?.name || 'Unknown')},${escapeCSV(entry.user_profiles?.username || 'Unknown')},${(entry.total_hours || 0).toFixed(2)},${entry.crew_count || 1},${crewHours.toFixed(2)},${entry.is_manual ? 'Manual' : 'Timer'},${escapeCSV(workers)},${escapeCSV(entry.notes || '')}\n`;
    });
    csv += `\n\n`;

    // Daily Logs
    csv += `DAILY ACTIVITY LOGS\n`;
    csv += `Date,Logged By,Crew Count,Weather,Components Worked,Work Summary,Issues,Materials Requested,Notes\n`;
    dailyLogs.forEach(log => {
      const weather = log.weather_details 
        ? `${log.weather_details.description || log.weather || ''} ${log.weather_details.temp_f ? `(${log.weather_details.temp_f}°F)` : ''}`.trim()
        : log.weather || '';
      const components = log.components_worked && log.components_worked.length > 0 
        ? log.components_worked.map(c => c.name || c).join('; ')
        : '';
      const issues = log.issues && log.issues.length > 0
        ? log.issues.map(i => i.description || i).join('; ')
        : '';
      const materials = log.material_requests_structured && log.material_requests_structured.length > 0
        ? log.material_requests_structured.map(r => `${r.item} (${r.quantity})`).join('; ')
        : '';
      
      csv += `${formatDate(log.log_date)},${escapeCSV(log.user_profiles?.username || 'Unknown')},${log.crew_count || ''},${escapeCSV(weather)},${escapeCSV(components)},${escapeCSV(log.client_summary || '')},${escapeCSV(issues)},${escapeCSV(materials)},${escapeCSV(log.final_notes || '')}\n`;
    });

    // Download CSV file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.name.replace(/[^a-z0-9]/gi, '_')}_Report.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeCSV(str: string): string {
    if (!str) return '';
    const text = String(str);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  async function exportAllMaterials() {
    setExportingMaterials(true);

    try {
      // Fetch all materials with job info and category info
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select(`
          *,
          jobs(id, name, client_name, job_number),
          materials_categories(name)
        `)
        .order('created_at', { ascending: false });

      if (materialsError) throw materialsError;

      if (!materialsData || materialsData.length === 0) {
        toast.error('No materials found in the system');
        return;
      }

      // Status labels
      const STATUS_LABELS: Record<string, string> = {
        needed: 'Needed',
        not_ordered: 'Not Ordered',
        ordered: 'Ordered',
        ready_for_job: 'Ready for Job',
        ready_to_pull: 'Pull from Shop',
        at_job: 'At Job',
        installed: 'Installed',
        missing: 'Missing',
      };

      // Create CSV headers
      const headers = [
        'Job Name',
        'Client Name',
        'Job Number',
        'Category',
        'Material Name',
        'Quantity',
        'Length',
        'Status',
        'Use Case',
        'Notes',
        'Date Needed By',
        'Order By Date',
        'Pull By Date',
        'Delivery Date',
        'Actual Delivery Date',
        'Created At',
        'Updated At'
      ];

      const csvRows = [headers.join(',')];

      // Add each material as a row
      materialsData.forEach((material: any) => {
        const row = [
          escapeCSV(material.jobs?.name || 'Unknown Job'),
          escapeCSV(material.jobs?.client_name || ''),
          escapeCSV(material.jobs?.job_number || ''),
          escapeCSV(material.materials_categories?.name || 'Uncategorized'),
          escapeCSV(material.name || ''),
          material.quantity || 0,
          escapeCSV(material.length || ''),
          escapeCSV(STATUS_LABELS[material.status] || material.status || 'Not Ordered'),
          escapeCSV(material.use_case || ''),
          escapeCSV(material.notes || ''),
          material.date_needed_by || '',
          material.order_by_date || '',
          material.pull_by_date || '',
          material.delivery_date || '',
          material.actual_delivery_date || '',
          material.created_at ? new Date(material.created_at).toLocaleDateString() : '',
          material.updated_at ? new Date(material.updated_at).toLocaleDateString() : ''
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `All_Materials_Export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${materialsData.length} materials from all jobs`);
    } catch (error: any) {
      console.error('Error exporting materials:', error);
      toast.error('Failed to export materials');
    } finally {
      setExportingMaterials(false);
    }
  }

  async function exportToNotebookLM(job: Job, timeEntries: TimeEntry[], dailyLogs: DailyLog[]) {
    let report = '';

    // Header optimized for NotebookLM
    report += `# ${job.name}\n\n`;
    report += `## Job Information\n\n`;
    report += `- **Client**: ${job.client_name}\n`;
    if (job.job_number) report += `- **Job Number**: ${job.job_number}\n`;
    report += `- **Address**: ${job.address}\n`;
    report += `- **Status**: ${job.status || 'Active'}\n`;
    if (job.description) report += `- **Description**: ${job.description}\n`;
    report += `- **Report Generated**: ${new Date().toLocaleString()}\n\n`;

    report += `---\n\n`;

    // Calculate component totals
    const componentTotals = new Map<string, { hours: number; crewHours: number; entries: number }>();
    
    timeEntries.forEach(entry => {
      const componentName = entry.components?.name || 'Unknown Component';
      const existing = componentTotals.get(componentName) || { hours: 0, crewHours: 0, entries: 0 };
      const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
      
      componentTotals.set(componentName, {
        hours: existing.hours + (entry.total_hours || 0),
        crewHours: existing.crewHours + crewHours,
        entries: existing.entries + 1
      });
    });

    const totalActualHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.hours, 0);
    const totalCrewHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.crewHours, 0);

    // Job Summary
    report += `## Summary\n\n`;
    report += `- **Total Actual Hours**: ${totalActualHours.toFixed(2)} hours\n`;
    report += `- **Total Crew Hours**: ${totalCrewHours.toFixed(2)} hours (accounting for multiple workers)\n`;
    report += `- **Total Time Entries**: ${timeEntries.length}\n`;
    report += `- **Daily Logs**: ${dailyLogs.length}\n\n`;

    // Component Breakdown
    report += `## Component Breakdown\n\n`;
    report += `Work was performed on the following components:\n\n`;
    
    Array.from(componentTotals.entries())
      .sort((a, b) => b[1].crewHours - a[1].crewHours)
      .forEach(([component, totals]) => {
        report += `### ${component}\n\n`;
        report += `- **Number of Time Entries**: ${totals.entries}\n`;
        report += `- **Actual Hours Logged**: ${totals.hours.toFixed(2)} hours\n`;
        report += `- **Total Crew Hours**: ${totals.crewHours.toFixed(2)} hours\n`;
        report += `- **Average Crew Size**: ${(totals.crewHours / totals.hours).toFixed(2)} workers\n\n`;
      });

    report += `---\n\n`;

    // Daily Activity Logs
    report += `## Daily Activity Logs\n\n`;
    report += `Detailed daily reports from the field:\n\n`;

    if (dailyLogs.length === 0) {
      report += `*No daily logs have been recorded for this job.*\n\n`;
    } else {
      dailyLogs.forEach((log, index) => {
        report += `### ${formatDate(log.log_date)}\n\n`;
        
        // Metadata
        report += `**Log Details:**\n`;
        report += `- Logged by: ${log.user_profiles?.username || 'Unknown'}\n`;
        report += `- Crew count: ${log.crew_count || 'Not specified'}\n`;
        
        if (log.weather_details) {
          const weather = log.weather_details;
          report += `- Weather conditions: ${weather.description || log.weather || 'Not recorded'}`;
          if (weather.temp_f) {
            report += ` (Temperature: ${weather.temp_f}°F)`;
          }
          report += `\n`;
        } else if (log.weather) {
          report += `- Weather: ${log.weather}\n`;
        }
        report += `\n`;

        // Components worked
        if (log.components_worked && log.components_worked.length > 0) {
          report += `**Components worked on:**\n`;
          log.components_worked.forEach(comp => {
            report += `- ${comp.name || comp}\n`;
          });
          report += `\n`;
        }

        // Time summary
        if (log.time_summary && log.time_summary.length > 0) {
          report += `**Time breakdown for the day:**\n`;
          log.time_summary.forEach(entry => {
            const crewHours = parseFloat(entry.hours) * entry.crew_count;
            report += `- ${entry.component_name || entry.name}: ${entry.hours} hours with ${entry.crew_count} crew (${crewHours.toFixed(2)} crew hours)\n`;
          });
          report += `\n`;
        }

        // Work performed
        if (log.client_summary) {
          report += `**Work performed:**\n\n${log.client_summary}\n\n`;
        }

        // Issues
        if (log.issues && log.issues.length > 0) {
          report += `**Issues and notes:**\n`;
          log.issues.forEach(issue => {
            report += `- ${issue.description || issue}\n`;
          });
          report += `\n`;
        }

        // Material requests
        if (log.material_requests_structured && log.material_requests_structured.length > 0) {
          report += `**Materials requested:**\n`;
          log.material_requests_structured.forEach(req => {
            report += `- ${req.item}: ${req.quantity}`;
            if (req.priority) report += ` (Priority: ${req.priority})`;
            report += `\n`;
          });
          report += `\n`;
        }

        // Additional notes
        if (log.final_notes) {
          report += `**Additional notes:**\n\n${log.final_notes}\n\n`;
        }

        report += `---\n\n`;
      });
    }

    // Detailed Time Entries
    report += `## Detailed Time Entries\n\n`;
    report += `Complete record of all time tracked on this job:\n\n`;
    
    if (timeEntries.length === 0) {
      report += `*No time entries have been recorded for this job.*\n\n`;
    } else {
      // Group by component
      const entriesByComponent = new Map<string, TimeEntry[]>();
      timeEntries.forEach(entry => {
        const componentName = entry.components?.name || 'Unknown Component';
        if (!entriesByComponent.has(componentName)) {
          entriesByComponent.set(componentName, []);
        }
        entriesByComponent.get(componentName)?.push(entry);
      });

      Array.from(entriesByComponent.entries())
        .sort((a, b) => {
          const aTotal = a[1].reduce((sum, e) => sum + ((e.total_hours || 0) * (e.crew_count || 1)), 0);
          const bTotal = b[1].reduce((sum, e) => sum + ((e.total_hours || 0) * (e.crew_count || 1)), 0);
          return bTotal - aTotal;
        })
        .forEach(([componentName, entries]) => {
          report += `### ${componentName}\n\n`;
          
          entries.forEach((entry, index) => {
            const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
            
            report += `**Entry ${index + 1}** (${formatDate(entry.start_time)})\n`;
            report += `- Worker: ${entry.user_profiles?.username || 'Unknown'}\n`;
            report += `- Hours logged: ${(entry.total_hours || 0).toFixed(2)} hours\n`;
            report += `- Crew count: ${entry.crew_count || 1}\n`;
            report += `- Total crew hours: ${crewHours.toFixed(2)} hours\n`;
            report += `- Entry method: ${entry.is_manual ? 'Manual entry' : 'Timer-based'}\n`;
            
            if (entry.worker_names && entry.worker_names.length > 0) {
              report += `- Workers present: ${entry.worker_names.join(', ')}\n`;
            }
            
            if (entry.notes) {
              report += `- Notes: ${entry.notes}\n`;
            }
            
            report += `\n`;
          });
        });
    }

    // Download as markdown file
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.name.replace(/[^a-z0-9]/gi, '_')}_NotebookLM.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Export Data</h2>
        <p className="text-muted-foreground">
          Download complete job information, materials lists, and other data exports
        </p>
      </div>

      {/* Export All Materials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Export All Materials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Complete materials list includes:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>✓ All materials from all jobs</li>
              <li>✓ Job name, client, and job number</li>
              <li>✓ Category, quantity, length, and status</li>
              <li>✓ All dates (needed by, order by, delivery, etc.)</li>
              <li>✓ Use case, notes, and timestamps</li>
            </ul>
          </div>

          <Button
            onClick={exportAllMaterials}
            disabled={exportingMaterials}
            size="lg"
            className="w-full"
          >
            {exportingMaterials ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Exporting Materials...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download All Materials as CSV
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Complete Job
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="job-select">Select Job</Label>
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger id="job-select">
                <SelectValue placeholder="Choose a job to export..." />
              </SelectTrigger>
              <SelectContent>
                {jobs.map(job => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.name} - {job.client_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Export includes:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>✓ Complete job summary with component breakdown</li>
              <li>✓ Daily activity logs with weather and crew notes</li>
              <li>✓ Detailed time entries by component and worker</li>
              <li>✓ All data for the entire job (not filtered by date)</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t">
            <Button
              onClick={() => exportJob('pdf')}
              disabled={loading || !selectedJob}
              variant="outline"
              size="lg"
              className="h-auto py-4 flex-col items-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileText className="w-8 h-8" />
              )}
              <div className="text-center">
                <div className="font-semibold">PDF</div>
                <div className="text-xs text-muted-foreground">Print-ready report</div>
              </div>
            </Button>

            <Button
              onClick={() => exportJob('xlsx')}
              disabled={loading || !selectedJob}
              variant="outline"
              size="lg"
              className="h-auto py-4 flex-col items-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileSpreadsheet className="w-8 h-8" />
              )}
              <div className="text-center">
                <div className="font-semibold">Excel (CSV)</div>
                <div className="text-xs text-muted-foreground">Spreadsheet format</div>
              </div>
            </Button>

            <Button
              onClick={() => exportJob('notebooklm')}
              disabled={loading || !selectedJob}
              variant="outline"
              size="lg"
              className="h-auto py-4 flex-col items-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Brain className="w-8 h-8" />
              )}
              <div className="text-center">
                <div className="font-semibold">NotebookLM</div>
                <div className="text-xs text-muted-foreground">AI-optimized format</div>
              </div>
            </Button>
          </div>

          <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="font-semibold mb-1">💡 Format Guide:</p>
            <ul className="space-y-1 ml-4">
              <li><strong>PDF:</strong> Best for printing, sharing, and archiving. Opens print dialog in browser.</li>
              <li><strong>Excel (CSV):</strong> For data analysis, budgeting, and payroll processing. Opens in Excel/Google Sheets.</li>
              <li><strong>NotebookLM:</strong> Optimized markdown format for Google's NotebookLM AI assistant.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
