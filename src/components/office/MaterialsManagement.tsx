import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Edit, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  FileSpreadsheet,
  Upload,
  ChevronDownIcon,
  Search,
  X,
  Image as ImageIcon,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ListChecks,
  Calendar,
  ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import type { Job } from '@/types';


interface Material {
  id: string;
  category_id: string;
  name: string;
  quantity: number;
  length: string | null;
  status: string;
  notes: string | null;
  use_case: string | null;
  import_source?: string;
  date_needed_by?: string | null;
  order_by_date?: string | null;
  pull_by_date?: string | null;
  delivery_date?: string | null;
  actual_delivery_date?: string | null;
  ordered_by?: string | null;
  order_requested_at?: string | null;
}

interface Category {
  id: string;
  name: string;
  order_index: number;
  materials: Material[];
  sheet_image_url?: string | null;
}

interface MaterialsManagementProps {
  job: Job;
  userId: string;
}

const STATUS_OPTIONS = [
  { value: 'not_ordered', label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered', label: 'Ordered', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'at_shop', label: 'At Shop', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'installed', label: 'Installed', color: 'bg-slate-800 text-white border-slate-800' },
  { value: 'missing', label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
}

export function MaterialsManagement({ job, userId }: MaterialsManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'useCase' | 'quantity' | 'length'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categorySheetImage, setCategorySheetImage] = useState<File | null>(null);
  const [categorySheetPreview, setCategorySheetPreview] = useState<string | null>(null);
  
  // Material modal
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('');
  const [materialLength, setMaterialLength] = useState('');
  const [materialUseCase, setMaterialUseCase] = useState('');
  const [materialStatus, setMaterialStatus] = useState('not_ordered');
  
  // Status change dialog with dates
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusChangeMaterial, setStatusChangeMaterial] = useState<Material | null>(null);
  const [newStatus, setNewStatus] = useState('not_ordered');
  const [orderByDate, setOrderByDate] = useState('');
  const [pullByDate, setPullByDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [dateNotes, setDateNotes] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);
  
  // Bulk status change
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState('not_ordered');
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);
  
  // CSV upload
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvCategories, setCsvCategories] = useState<string[]>([]);
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    category: string;
    name: string;
    useCase: string;
    quantity: string;
    length: string;
  }>({ category: '', name: '', useCase: '', quantity: '', length: '' });
  const [importStep, setImportStep] = useState<'columns' | 'categories'>('columns');
  const [fileExtension, setFileExtension] = useState<string>('');

  useEffect(() => {
    loadMaterials();
  }, [job.id]);

  async function loadMaterials() {
    try {
      setLoading(true);
      
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('materials_categories')
        .select('*')
        .eq('job_id', job.id)
        .order('order_index');

      if (categoriesError) throw categoriesError;

      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select('*')
        .eq('job_id', job.id)
        .order('name');

      if (materialsError) throw materialsError;

      const categoriesWithMaterials: Category[] = (categoriesData || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        order_index: cat.order_index,
        sheet_image_url: (cat as any).sheet_image_url,
        materials: (materialsData || []).filter((m: any) => m.category_id === cat.id),
      }));

      setCategories(categoriesWithMaterials);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function openAddCategory() {
    setEditingCategory(null);
    setCategoryName('');
    setCategorySheetImage(null);
    setCategorySheetPreview(null);
    setShowCategoryModal(true);
  }

  function openEditCategory(category: Category) {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategorySheetImage(null);
    setCategorySheetPreview(category.sheet_image_url || null);
    setShowCategoryModal(true);
  }

  function handleSheetImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setCategorySheetImage(file);
    const previewUrl = URL.createObjectURL(file);
    setCategorySheetPreview(previewUrl);
  }

  function removeSheetImage() {
    if (categorySheetPreview && categorySheetPreview.startsWith('blob:')) {
      URL.revokeObjectURL(categorySheetPreview);
    }
    setCategorySheetImage(null);
    setCategorySheetPreview(null);
  }

  async function saveCategory() {
    if (!categoryName.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    try {
      let sheetImageUrl: string | null = null;

      // Upload sheet image if provided
      if (categorySheetImage) {
        const fileExt = categorySheetImage.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${job.id}/material-sheets/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('job-files')
          .upload(filePath, categorySheetImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('job-files')
          .getPublicUrl(filePath);

        sheetImageUrl = publicUrl;
      }

      if (editingCategory) {
        // Update existing
        const updateData: any = { name: categoryName.trim() };
        if (sheetImageUrl) {
          updateData.sheet_image_url = sheetImageUrl;
        }

        const { error } = await supabase
          .from('materials_categories')
          .update(updateData)
          .eq('id', editingCategory.id);

        if (error) throw error;
        toast.success('Category updated');
      } else {
        // Create new
        const maxOrder = Math.max(...categories.map(c => c.order_index), -1);
        
        const { error } = await supabase
          .from('materials_categories')
          .insert({
            job_id: job.id,
            name: categoryName.trim(),
            order_index: maxOrder + 1,
            created_by: userId,
            sheet_image_url: sheetImageUrl,
          });

        if (error) throw error;
        toast.success('Category created');
      }

      setShowCategoryModal(false);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to save category');
      console.error(error);
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!confirm('Delete this category and all its materials?')) return;

    try {
      const { error } = await supabase
        .from('materials_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;
      toast.success('Category deleted');
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to delete category');
      console.error(error);
    }
  }

  async function moveCategoryUp(category: Category) {
    const prevCategory = categories
      .filter(c => c.order_index < category.order_index)
      .sort((a, b) => b.order_index - a.order_index)[0];

    if (!prevCategory) return;

    try {
      await supabase
        .from('materials_categories')
        .update({ order_index: prevCategory.order_index })
        .eq('id', category.id);

      await supabase
        .from('materials_categories')
        .update({ order_index: category.order_index })
        .eq('id', prevCategory.id);

      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder');
      console.error(error);
    }
  }

  async function moveCategoryDown(category: Category) {
    const nextCategory = categories
      .filter(c => c.order_index > category.order_index)
      .sort((a, b) => a.order_index - b.order_index)[0];

    if (!nextCategory) return;

    try {
      await supabase
        .from('materials_categories')
        .update({ order_index: nextCategory.order_index })
        .eq('id', category.id);

      await supabase
        .from('materials_categories')
        .update({ order_index: category.order_index })
        .eq('id', nextCategory.id);

      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder');
      console.error(error);
    }
  }

  function openAddMaterial(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setEditingMaterial(null);
    setMaterialName('');
    setMaterialQuantity('');
    setMaterialLength('');
    setMaterialUseCase('');
    setMaterialStatus('not_ordered');
    setShowMaterialModal(true);
  }

  function openEditMaterial(material: Material) {
    setSelectedCategoryId(material.category_id);
    setEditingMaterial(material);
    setMaterialName(material.name);
    setMaterialQuantity(material.quantity.toString());
    setMaterialLength(material.length || '');
    setMaterialUseCase((material as any).use_case || '');
    setMaterialStatus(material.status);
    setShowMaterialModal(true);
  }

  async function saveMaterial() {
    if (!materialName.trim() || !materialQuantity) {
      toast.error('Please enter material name and quantity');
      return;
    }

    try {
      if (editingMaterial) {
        // Update existing
        const { error } = await supabase
          .from('materials')
          .update({
            name: materialName.trim(),
            quantity: parseFloat(materialQuantity),
            length: materialLength.trim() || null,
            use_case: materialUseCase.trim() || null,
            status: materialStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingMaterial.id);

        if (error) throw error;
        toast.success('Material updated');
      } else {
        // Create new - mark as manual entry
        const { error } = await supabase
          .from('materials')
          .insert({
            job_id: job.id,
            category_id: selectedCategoryId,
            name: materialName.trim(),
            quantity: parseFloat(materialQuantity),
            length: materialLength.trim() || null,
            use_case: materialUseCase.trim() || null,
            status: materialStatus,
            created_by: userId,
            import_source: 'manual',
          });

        if (error) throw error;
        toast.success('Material added');
      }

      setShowMaterialModal(false);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to save material');
      console.error(error);
    }
  }

  async function deleteMaterial(materialId: string) {
    if (!confirm('Delete this material?')) return;

    try {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', materialId);

      if (error) throw error;
      toast.success('Material deleted');
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to delete material');
      console.error(error);
    }
  }

  function handleStatusChange(material: Material, newStatusValue: string) {
    setStatusChangeMaterial(material);
    setNewStatus(newStatusValue);
    
    // Pre-populate existing dates
    setOrderByDate(material.order_by_date || '');
    setPullByDate(material.pull_by_date || '');
    setDeliveryDate(material.delivery_date || '');
    setActualDeliveryDate(material.actual_delivery_date || '');
    setDateNotes('');
    
    // Set default dates based on status
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    if (newStatusValue === 'ordered' && !material.order_by_date) {
      setOrderByDate(tomorrowStr);
      setDeliveryDate(tomorrowStr);
    } else if (newStatusValue === 'at_shop' && !material.pull_by_date) {
      setPullByDate(tomorrowStr);
    } else if (newStatusValue === 'at_job' && !material.actual_delivery_date) {
      setActualDeliveryDate(new Date().toISOString().split('T')[0]);
    }
    
    setShowStatusDialog(true);
  }

  async function confirmStatusChange() {
    if (!statusChangeMaterial) return;

    setSubmittingStatus(true);
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Update dates based on status
      if (newStatus === 'ordered') {
        if (orderByDate) updateData.order_by_date = orderByDate;
        if (deliveryDate) updateData.delivery_date = deliveryDate;
        updateData.ordered_by = userId;
        updateData.order_requested_at = new Date().toISOString();
      } else if (newStatus === 'at_shop') {
        if (pullByDate) updateData.pull_by_date = pullByDate;
      } else if (newStatus === 'at_job') {
        if (actualDeliveryDate) updateData.actual_delivery_date = actualDeliveryDate;
      }

      if (dateNotes) {
        updateData.notes = dateNotes;
      }

      const { error } = await supabase
        .from('materials')
        .update(updateData)
        .eq('id', statusChangeMaterial.id);

      if (error) throw error;

      toast.success(`Status updated to ${getStatusLabel(newStatus)}`);
      setShowStatusDialog(false);
      setStatusChangeMaterial(null);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    } finally {
      setSubmittingStatus(false);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // CSV upload logic (keeping existing implementation)
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    setFileExtension(fileExt || '');
    
    if (fileExt === 'xlsx' || fileExt === 'xls') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          const allRows: any[] = [];
          let commonHeaders: string[] = [];
          
          for (let i = 0; i < workbook.SheetNames.length; i++) {
            const sheetName = workbook.SheetNames[i];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length < 2) continue;

            const headers = (jsonData[0] as any[]).map(h => String(h || '').trim());
            
            if (i === 0 || commonHeaders.length === 0) {
              commonHeaders = headers;
            }
            
            const sheetRows = jsonData.slice(1).map((row: any) => {
              const rowObj: any = {};
              headers.forEach((header, index) => {
                rowObj[header] = String(row[index] || '').trim();
              });
              
              const categoryHeader = headers.find(h => /category|type|group/i.test(h));
              if (!categoryHeader) {
                rowObj['Category'] = sheetName;
              } else if (!rowObj[categoryHeader]) {
                rowObj[categoryHeader] = sheetName;
              }
              
              return rowObj;
            }).filter(row => {
              const hasData = Object.values(row).some(val => val !== '' && val !== sheetName);
              return hasData;
            });
            
            allRows.push(...sheetRows);
          }
          
          if (allRows.length === 0) {
            toast.error('Excel file contains no valid data rows');
            return;
          }
          
          if (!commonHeaders.find(h => /category|type|group/i.test(h))) {
            commonHeaders.unshift('Category');
          }

          setCsvColumns(commonHeaders);
          setCsvData(allRows);

          const autoMapping = {
            category: commonHeaders.find(c => /category|type|group/i.test(c)) || 'Category',
            name: commonHeaders.find(c => /name|material|item|description/i.test(c)) || '',
            useCase: commonHeaders.find(c => /use.case|usage|use|purpose|application/i.test(c)) || '',
            quantity: commonHeaders.find(c => /quantity|qty|amount|count/i.test(c)) || '',
            length: commonHeaders.find(c => /length|size|dimension/i.test(c)) || '',
          };
          
          setColumnMapping(autoMapping);
          setImportStep('columns');
          setShowCsvDialog(true);
          
          toast.success(`Loaded ${workbook.SheetNames.length} worksheet(s) with ${allRows.length} total rows`);
        } catch (error: any) {
          toast.error('Failed to parse Excel file');
          console.error('Excel parse error:', error);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            toast.error('CSV file must have at least a header row and one data row');
            return;
          }

          const headers = lines[0].split(',').map(h => h.trim());
          const rows = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const row: any = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            return row;
          });

          setCsvColumns(headers);
          setCsvData(rows);

          const autoMapping = {
            category: headers.find(c => /category|type|group/i.test(c)) || '',
            name: headers.find(c => /name|material|item|description/i.test(c)) || '',
            useCase: headers.find(c => /use.case|usage|use|purpose|application/i.test(c)) || '',
            quantity: headers.find(c => /quantity|qty|amount|count/i.test(c)) || '',
            length: headers.find(c => /length|size|dimension/i.test(c)) || '',
          };
          
          setColumnMapping(autoMapping);
          setImportStep('columns');
          setShowCsvDialog(true);
        } catch (error: any) {
          toast.error('Failed to parse CSV file');
          console.error('CSV parse error:', error);
        }
      };
      reader.readAsText(file);
    }
    
    e.target.value = '';
  }

  function proceedToCategories() {
    if (!columnMapping.category || !columnMapping.name || !columnMapping.quantity) {
      toast.error('Please map Category, Name, and Quantity columns');
      return;
    }

    const uniqueCategories = Array.from(
      new Set(
        csvData
          .map((row: any) => row[columnMapping.category])
          .filter(Boolean)
          .map(String)
      )
    ) as string[];

    setCsvCategories(uniqueCategories);
    
    const initialMapping: Record<string, string> = {};
    uniqueCategories.forEach(csvCat => {
      const existingMatch = categories.find(
        c => c.name.toLowerCase() === csvCat.toLowerCase()
      );
      if (existingMatch) {
        initialMapping[csvCat] = existingMatch.id;
      } else {
        initialMapping[csvCat] = 'CREATE_NEW';
      }
    });
    setCategoryMapping(initialMapping);
    setImportStep('categories');
  }

  function downloadCategoryTemplate(category: Category) {
    const headers = ['Category', 'Material', 'Use Case', 'Quantity', 'Length'];
    
    let rows: string[][];
    if (category.materials.length > 0) {
      rows = category.materials.map(m => [
        category.name,
        m.name,
        (m as any).use_case || '',
        m.quantity.toString(),
        m.length || '',
      ]);
    } else {
      rows = [
        [category.name, 'Example Material 1', 'Foundation work', '100', '8ft'],
        [category.name, 'Example Material 2', 'Framing', '50', '12ft'],
        [category.name, 'Example Material 3', 'Roofing installation', '200', '16ft'],
      ];
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fileName = `${category.name.replace(/\s+/g, '_')}_materials_${job.name.replace(/\s+/g, '_')}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`${category.name} template downloaded`);
  }

  function downloadAllTemplate() {
    const headers = ['Category', 'Material', 'Use Case', 'Quantity', 'Length'];
    const exampleRows = [
      ['Lumber', '2x4 Stud', 'Wall framing', '100', '8ft'],
      ['Lumber', '2x6 Joist', 'Floor joists', '50', '12ft'],
      ['Steel', 'I-Beam', 'Main support', '20', '20ft'],
      ['Roofing', 'Metal Panel', 'Roof covering', '200', '16ft'],
      ['Hardware', 'Bolts 1/2"', 'General fastening', '500', ''],
    ];

    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `materials_template_${job.name.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Template downloaded - open in Excel, fill it out, and save as CSV');
  }

  async function processCsvImport() {
    setUploading(true);
    try {
      const categoriesToCreate = Object.entries(categoryMapping)
        .filter(([_, value]) => value === 'CREATE_NEW')
        .map(([key]) => key);

      const newCategoryIds: Record<string, string> = {};
      
      for (const catName of categoriesToCreate) {
        const maxOrder = Math.max(...categories.map(c => c.order_index), -1);
        const { data, error } = await supabase
          .from('materials_categories')
          .insert({
            job_id: job.id,
            name: catName,
            order_index: maxOrder + 1 + categoriesToCreate.indexOf(catName),
            created_by: userId,
          })
          .select()
          .single();

        if (error) throw error;
        newCategoryIds[catName] = data.id;
      }

      const finalMapping: Record<string, string> = {};
      Object.entries(categoryMapping).forEach(([excelCat, value]) => {
        if (value === 'CREATE_NEW') {
          finalMapping[excelCat] = newCategoryIds[excelCat];
        } else {
          finalMapping[excelCat] = value;
        }
      });

      const importSource = fileExtension === 'csv' ? 'csv_import' : 'excel_import';
      const categoryIdsBeingImported = Object.values(finalMapping);

      let deleted = 0;
      for (const categoryId of categoryIdsBeingImported) {
        const { data: deletedMaterials, error: deleteError } = await supabase
          .from('materials')
          .delete()
          .eq('job_id', job.id)
          .eq('category_id', categoryId)
          .in('import_source', ['csv_import', 'excel_import'])
          .eq('status', 'not_ordered')
          .select('id');

        if (deleteError) throw deleteError;
        deleted += deletedMaterials?.length || 0;
      }

      const materialsToInsert: any[] = [];
      let skipped = 0;
      let preserved = 0;

      for (const row of csvData) {
        const category = String(row[columnMapping.category] || '').trim();
        const name = String(row[columnMapping.name] || '').trim();
        const quantityStr = String(row[columnMapping.quantity] || '0');
        const quantity = parseFloat(quantityStr) || 0;
        const length = columnMapping.length ? String(row[columnMapping.length] || '').trim() : '';
        const useCase = columnMapping.useCase ? String(row[columnMapping.useCase] || '').trim() : '';

        if (!category || !name || quantity === 0) {
          skipped++;
          continue;
        }

        const categoryId = finalMapping[category];
        if (!categoryId) {
          skipped++;
          continue;
        }

        const { data: existingManual } = await supabase
          .from('materials')
          .select('id, import_source, status')
          .eq('job_id', job.id)
          .eq('category_id', categoryId)
          .eq('name', name)
          .eq('length', length || null)
          .limit(1)
          .single();

        if (existingManual) {
          const shouldPreserve = 
            existingManual.import_source === 'manual' || 
            existingManual.status !== 'not_ordered';

          if (shouldPreserve) {
            preserved++;
            continue;
          }
        }

        materialsToInsert.push({
          job_id: job.id,
          category_id: categoryId,
          name,
          quantity,
          length: length || null,
          use_case: useCase || null,
          status: 'not_ordered',
          created_by: userId,
          import_source: importSource,
        });
      }

      if (materialsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('materials')
          .insert(materialsToInsert);
        if (insertError) throw insertError;
      }

      const messageParts = [];
      if (deleted > 0) messageParts.push(`${deleted} replaced`);
      if (materialsToInsert.length > 0) messageParts.push(`${materialsToInsert.length} imported`);
      if (preserved > 0) messageParts.push(`${preserved} preserved`);
      if (skipped > 0) messageParts.push(`${skipped} skipped`);
      
      const message = `Import complete: ${messageParts.join(', ')}`;
      
      toast.success(message);
      setShowCsvDialog(false);
      loadMaterials();
    } catch (error: any) {
      toast.error(`Import failed: ${error.message}`);
      console.error('Import error:', error);
    } finally {
      setUploading(false);
    }
  }

  function getFilteredAndSortedMaterials(categoryMaterials: Material[]) {
    let filtered = categoryMaterials.filter(material => {
      const matchesSearch = searchTerm === '' || 
        material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (material.use_case && material.use_case.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (material.length && material.length.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || material.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      let compareA: any;
      let compareB: any;

      switch (sortBy) {
        case 'name':
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
        case 'useCase':
          compareA = (a.use_case || '').toLowerCase();
          compareB = (b.use_case || '').toLowerCase();
          break;
        case 'quantity':
          compareA = a.quantity;
          compareB = b.quantity;
          break;
        case 'length':
          compareA = (a.length || '').toLowerCase();
          compareB = (b.length || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (compareA < compareB) return sortDirection === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }

  function handleSort(column: 'name' | 'useCase' | 'quantity' | 'length') {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  }

  function SortIcon({ column }: { column: 'name' | 'useCase' | 'quantity' | 'length' }) {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-primary" />
      : <ArrowDown className="w-4 h-4 text-primary" />;
  }

  const filteredCategories = filterCategory === 'all' 
    ? categories 
    : categories.filter(cat => cat.id === filterCategory);

  async function quickMarkAsOnSite(materialId: string) {
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
      toast.success('Marked as on-site');
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    }
  }

  async function bulkChangeStatus() {
    setBulkStatusUpdating(true);
    try {
      let materialsToUpdate: string[] = [];
      
      if (filterCategory === 'all') {
        categories.forEach(category => {
          const filtered = getFilteredAndSortedMaterials(category.materials);
          materialsToUpdate.push(...filtered.map(m => m.id));
        });
      } else {
        const category = categories.find(c => c.id === filterCategory);
        if (category) {
          const filtered = getFilteredAndSortedMaterials(category.materials);
          materialsToUpdate.push(...filtered.map(m => m.id));
        }
      }

      if (materialsToUpdate.length === 0) {
        toast.error('No materials to update');
        return;
      }

      const { error } = await supabase
        .from('materials')
        .update({ 
          status: bulkStatusTarget, 
          updated_at: new Date().toISOString() 
        })
        .in('id', materialsToUpdate);

      if (error) throw error;

      toast.success(`Updated ${materialsToUpdate.length} material(s) to "${getStatusLabel(bulkStatusTarget)}"`);
      setShowBulkStatusDialog(false);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update materials');
      console.error(error);
    } finally {
      setBulkStatusUpdating(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading materials...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search materials, usage, or length..."
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

            {/* Category Filter */}
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Category Tabs */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b">
          <Button
            variant={filterCategory === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('all')}
            className={filterCategory === 'all' ? 'gradient-primary' : ''}
          >
            All Sections
            <Badge variant="secondary" className="ml-2">
              {categories.reduce((sum, cat) => sum + cat.materials.length, 0)}
            </Badge>
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={filterCategory === cat.id ? 'default' : 'outline'}
              onClick={() => setFilterCategory(cat.id)}
              className={filterCategory === cat.id ? 'gradient-primary' : ''}
            >
              {cat.name}
              <Badge variant="secondary" className="ml-2">
                {cat.materials.length}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={openAddCategory} className="gradient-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
        <Button
          onClick={downloadAllTemplate}
          variant="outline"
          className="bg-green-50 hover:bg-green-100 border-green-300"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Download Template (All)
        </Button>
        <Button
          onClick={() => document.getElementById('csv-upload')?.click()}
          variant="outline"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import Excel/CSV
        </Button>
        <input
          id="csv-upload"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleCsvUpload}
          className="hidden"
        />
      </div>

      {/* Categories List - continues in next message due to character limit */}
      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
            {categories.length === 0 ? (
              <>
                <p className="mb-4">No material categories yet.</p>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Quick Start:</p>
                  <ol className="text-left max-w-md mx-auto space-y-1">
                    <li>1. Click "Add Category" and optionally upload a material sheet image</li>
                    <li>2. Use "Import Excel/CSV" to bulk import materials</li>
                    <li>3. Or add materials manually to each category</li>
                  </ol>
                </div>
              </>
            ) : (
              <p>No categories match your current filters</p>
            )}
          </CardContent>
        </Card>
      ) : (
        filteredCategories.map((category, index) => {
          const filteredMaterials = getFilteredAndSortedMaterials(category.materials);
          if (filteredMaterials.length === 0 && (searchTerm || filterStatus !== 'all')) {
            return null;
          }
          
          return (
          <Card key={category.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-lg">{category.name}</CardTitle>
                    {category.sheet_image_url && (
                      <Badge variant="outline" className="text-xs">
                        <ImageIcon className="w-3 h-3 mr-1" />
                        Has Sheet
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {filteredMaterials.length} / {category.materials.length} material{category.materials.length !== 1 ? 's' : ''}
                    </Badge>
                    {category.sheet_image_url && (
                      <a
                        href={category.sheet_image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        View Sheet Image
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadCategoryTemplate(category);
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-green-50 hover:bg-green-100 border-green-300 text-green-700"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-1" />
                    Download Template
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterCategory(category.id);
                      setShowBulkStatusDialog(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-700"
                  >
                    <ListChecks className="w-4 h-4 mr-1" />
                    Change All Status
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveCategoryUp(category)}
                    disabled={index === 0}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveCategoryDown(category)}
                    disabled={index === filteredCategories.length - 1}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditCategory(category)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteCategory(category.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {category.sheet_image_url && (
                <div className="p-3 border-b bg-muted/20">
                  <a
                    href={category.sheet_image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={category.sheet_image_url}
                      alt={`${category.name} material sheet`}
                      className="w-full h-auto rounded-lg border hover:opacity-90 transition-opacity cursor-pointer max-h-48 object-contain bg-white"
                    />
                  </a>
                </div>
              )}
              
              {filteredMaterials.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No materials match your search
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b-2">
                      <tr>
                        <th className="text-left p-3 font-semibold text-sm">
                          <button
                            onClick={() => handleSort('name')}
                            className="flex items-center gap-2 hover:text-primary transition-colors"
                          >
                            Material
                            <SortIcon column="name" />
                          </button>
                        </th>
                        
                        <th className="text-left p-3 font-semibold text-sm">
                          <button
                            onClick={() => handleSort('useCase')}
                            className="flex items-center gap-2 hover:text-primary transition-colors"
                          >
                            Usage
                            <SortIcon column="useCase" />
                          </button>
                        </th>
                        
                        <th className="text-left p-3 font-semibold text-sm w-24">
                          <button
                            onClick={() => handleSort('quantity')}
                            className="flex items-center gap-2 hover:text-primary transition-colors"
                          >
                            Qty
                            <SortIcon column="quantity" />
                          </button>
                        </th>
                        
                        <th className="text-left p-3 font-semibold text-sm w-28">
                          <button
                            onClick={() => handleSort('length')}
                            className="flex items-center gap-2 hover:text-primary transition-colors"
                          >
                            Length
                            <SortIcon column="length" />
                          </button>
                        </th>
                        
                        <th className="text-left p-3 font-semibold text-sm w-48">
                          Status & Timeline
                        </th>
                        
                        <th className="text-right p-3 font-semibold text-sm w-24">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredMaterials.map((material) => (
                        <tr key={material.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3">
                            <span className="font-medium text-base">{material.name}</span>
                          </td>
                          
                          <td className="p-3">
                            {material.use_case ? (
                              <span className="text-sm text-muted-foreground">
                                {material.use_case}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50 italic">—</span>
                            )}
                          </td>
                          
                          <td className="p-3">
                            <span className="font-semibold text-sm">{material.quantity}</span>
                          </td>
                          
                          <td className="p-3">
                            {material.length ? (
                              <span className="text-sm font-medium">{material.length}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50 italic">—</span>
                            )}
                          </td>
                          
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {material.status !== 'at_job' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => quickMarkAsOnSite(material.id)}
                                  className="h-8 text-xs font-semibold border-2 border-green-300 text-green-700 hover:bg-green-50 transition-all flex-shrink-0"
                                  title="Quick mark as on-site"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                  On-Site
                                </Button>
                              )}
                              
                              <Select
                                value={material.status}
                                onValueChange={(value) => handleStatusChange(material, value)}
                              >
                                <SelectTrigger 
                                  className={`h-auto min-h-8 text-xs font-semibold border-2 rounded-md ${getStatusColor(material.status)} hover:shadow-md cursor-pointer transition-all flex-1`}
                                >
                                  <div className="w-full py-1.5 text-left space-y-0.5">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${STATUS_OPTIONS.find(s => s.value === material.status)?.color.replace('bg-', 'bg-')}`} />
                                        <span className="font-bold">{getStatusLabel(material.status)}</span>
                                      </div>
                                      <ChevronDownIcon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                                    </div>
                                    
                                    {/* Delivery Date - Prominent Display */}
                                    {(material.delivery_date || material.actual_delivery_date) && (
                                      <div className="bg-black/10 rounded px-1.5 py-0.5 mt-0.5">
                                        {material.actual_delivery_date ? (
                                          <div className="flex items-center gap-1 text-[10px] font-bold">
                                            <span>✅</span>
                                            <span>Delivered: {new Date(material.actual_delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                          </div>
                                        ) : material.delivery_date ? (
                                          <div className="flex items-center gap-1 text-[10px] font-bold">
                                            <span>🚚</span>
                                            <span>Delivery: {new Date(material.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                          </div>
                                        ) : null}
                                      </div>
                                    )}
                                    
                                    {/* Material Flow Timeline */}
                                    {(material.order_by_date || material.order_requested_at || material.pull_by_date) && (
                                      <div className="text-[10px] opacity-85 font-normal space-y-0.5 pt-1 border-t border-current/20">
                                        {material.order_by_date && (
                                          <div className="flex items-center gap-1">
                                            <span className="opacity-70">📋</span>
                                            <span>Order by: {new Date(material.order_by_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                          </div>
                                        )}
                                        {material.order_requested_at && (
                                          <div className="flex items-center gap-1">
                                            <span className="opacity-70">📦</span>
                                            <span>Ordered: {new Date(material.order_requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                          </div>
                                        )}
                                        {material.pull_by_date && (
                                          <div className="flex items-center gap-1">
                                            <span className="opacity-70">🏪</span>
                                            <span>Pull by: {new Date(material.pull_by_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </SelectTrigger>
                                <SelectContent className="min-w-[180px]">
                                  {STATUS_OPTIONS.map((option) => (
                                    <SelectItem 
                                      key={option.value} 
                                      value={option.value} 
                                      className="text-sm cursor-pointer"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className={`w-4 h-4 rounded border-2 ${option.color}`} />
                                        <span className="font-medium">{option.label}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openEditMaterial(material)}
                                title="Edit material"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => deleteMaterial(material.id)}
                                title="Delete material"
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              <div className="p-3 pt-2 border-t bg-muted/10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddMaterial(category.id)}
                  className="w-full h-8"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Material
                </Button>
              </div>
            </CardContent>
          </Card>
          );
        })
      )}

      {/* Status Change Dialog with Date Tracking */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Update Material Status & Timeline
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              <p className="font-semibold text-base">{statusChangeMaterial?.name}</p>
              {statusChangeMaterial?.use_case && (
                <p className="text-sm text-muted-foreground mt-1">Use: {statusChangeMaterial.use_case}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span>Qty: <span className="font-semibold">{statusChangeMaterial?.quantity}</span></span>
                {statusChangeMaterial?.length && (
                  <span>Length: <span className="font-semibold">{statusChangeMaterial.length}</span></span>
                )}
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm font-medium mb-1">Status Change:</p>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(statusChangeMaterial?.status || 'not_ordered')}>
                    {getStatusLabel(statusChangeMaterial?.status || 'not_ordered')}
                  </Badge>
                  <span>→</span>
                  <Badge className={getStatusColor(newStatus)}>
                    {getStatusLabel(newStatus)}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Date inputs based on status */}
            {newStatus === 'ordered' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="order-by-date" className="flex items-center gap-2">
                    📋 Order By Date
                  </Label>
                  <Input
                    id="order-by-date"
                    type="date"
                    value={orderByDate}
                    onChange={(e) => setOrderByDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Deadline to place this order</p>
                </div>
                <div>
                  <Label htmlFor="delivery-date" className="flex items-center gap-2">
                    🚚 Expected Delivery Date
                  </Label>
                  <Input
                    id="delivery-date"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Target delivery date to job site</p>
                </div>
              </div>
            )}

            {newStatus === 'at_shop' && (
              <div>
                <Label htmlFor="pull-by-date" className="flex items-center gap-2">
                  🏪 Pull By Date
                </Label>
                <Input
                  id="pull-by-date"
                  type="date"
                  value={pullByDate}
                  onChange={(e) => setPullByDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">When to pull this material from shop</p>
              </div>
            )}

            {newStatus === 'at_job' && (
              <div>
                <Label htmlFor="actual-delivery-date" className="flex items-center gap-2">
                  ✅ Actual Delivery Date
                </Label>
                <Input
                  id="actual-delivery-date"
                  type="date"
                  value={actualDeliveryDate}
                  onChange={(e) => setActualDeliveryDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">When material arrived at job site</p>
              </div>
            )}

            <div>
              <Label htmlFor="date-notes">Notes (Optional)</Label>
              <Input
                id="date-notes"
                value={dateNotes}
                onChange={(e) => setDateNotes(e.target.value)}
                placeholder="Any additional notes..."
                className="h-10"
              />
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t">
              <Button
                onClick={confirmStatusChange}
                disabled={submittingStatus}
                className="h-12 gradient-primary"
              >
                {submittingStatus ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Confirm Update
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowStatusDialog(false)}
                disabled={submittingStatus}
                className="h-12"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Lumber, Steel, Roofing..."
              />
            </div>
            
            <div>
              <Label htmlFor="category-sheet">Material Sheet Image (Optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Upload a photo or screenshot of your material sheet for reference
              </p>
              <input
                id="category-sheet"
                type="file"
                accept="image/*"
                onChange={handleSheetImageSelect}
                className="hidden"
              />
              {categorySheetPreview ? (
                <div className="space-y-2">
                  <div className="relative inline-block">
                    <img
                      src={categorySheetPreview}
                      alt="Sheet preview"
                      className="max-w-full h-auto max-h-48 rounded-lg border"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={removeSheetImage}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('category-sheet')?.click()}
                  >
                    Change Image
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('category-sheet')?.click()}
                  className="w-full"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Upload Sheet Image
                </Button>
              )}
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCategoryModal(false)}>
                Cancel
              </Button>
              <Button onClick={saveCategory} className="gradient-primary">
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Modal */}
      <Dialog open={showMaterialModal} onOpenChange={setShowMaterialModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? 'Edit Material' : 'Add Material'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="material-name">Material Name *</Label>
              <Input
                id="material-name"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g., 2x4 Lumber"
              />
            </div>
            <div>
              <Label htmlFor="material-use-case">Use Case</Label>
              <Input
                id="material-use-case"
                value={materialUseCase}
                onChange={(e) => setMaterialUseCase(e.target.value)}
                placeholder="e.g., Wall framing, Floor joists, etc."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="material-quantity">Quantity *</Label>
                <Input
                  id="material-quantity"
                  type="number"
                  value={materialQuantity}
                  onChange={(e) => setMaterialQuantity(e.target.value)}
                  placeholder="0"
                  step="0.01"
                />
              </div>
              <div>
                <Label htmlFor="material-length">Length</Label>
                <Input
                  id="material-length"
                  value={materialLength}
                  onChange={(e) => setMaterialLength(e.target.value)}
                  placeholder="e.g., 8ft"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="material-status">Status</Label>
              <Select value={materialStatus} onValueChange={setMaterialStatus}>
                <SelectTrigger id="material-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowMaterialModal(false)}>
                Cancel
              </Button>
              <Button onClick={saveMaterial} className="gradient-primary">
                {editingMaterial ? 'Update' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Change Dialog */}
      <Dialog open={showBulkStatusDialog} onOpenChange={setShowBulkStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5" />
              Change All Materials Status
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-3 rounded-md">
              <p className="text-sm text-muted-foreground">
                {filterCategory === 'all' ? (
                  <>This will update all materials across all categories that match your current filters (search & status).</>
                ) : (
                  <>This will update all materials in the selected category that match your current filters (search & status).</>
                )}
              </p>
              <div className="mt-2 text-sm font-semibold">
                Materials affected: {
                  filterCategory === 'all' 
                    ? categories.reduce((sum, cat) => sum + getFilteredAndSortedMaterials(cat.materials).length, 0)
                    : getFilteredAndSortedMaterials(categories.find(c => c.id === filterCategory)?.materials || []).length
                }
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-status">Change all materials to:</Label>
              <Select value={bulkStatusTarget} onValueChange={setBulkStatusTarget}>
                <SelectTrigger id="bulk-status" className="h-10">
                  <div className={`flex items-center gap-2 ${getStatusColor(bulkStatusTarget)}`}>
                    <span className="font-semibold">{getStatusLabel(bulkStatusTarget)}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border-2 ${option.color}`} />
                        <span className="font-medium">{option.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4 flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowBulkStatusDialog(false)}
                disabled={bulkStatusUpdating}
              >
                Cancel
              </Button>
              <Button
                onClick={bulkChangeStatus}
                disabled={bulkStatusUpdating}
                className="gradient-orange"
              >
                {bulkStatusUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  <>
                    <ListChecks className="w-4 h-4 mr-2" />
                    Update All
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog - keeping existing CSV implementation */}
      <Dialog open={showCsvDialog} onOpenChange={setShowCsvDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Materials from File</DialogTitle>
          </DialogHeader>

          {importStep === 'columns' && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Found {csvData.length} rows. Map your CSV columns to material fields.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Column Mapping</Label>
                
                <div className="space-y-2">
                  <Label htmlFor="category-col">Category Column *</Label>
                  <Select
                    value={columnMapping.category}
                    onValueChange={(value) => setColumnMapping({ ...columnMapping, category: value })}
                  >
                    <SelectTrigger id="category-col">
                      <SelectValue placeholder="Select column for category" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvColumns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name-col">Material Name Column *</Label>
                  <Select
                    value={columnMapping.name}
                    onValueChange={(value) => setColumnMapping({ ...columnMapping, name: value })}
                  >
                    <SelectTrigger id="name-col">
                      <SelectValue placeholder="Select column for name" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvColumns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="use-case-col">Use Case Column (Optional)</Label>
                  <Select
                    value={columnMapping.useCase || '__none__'}
                    onValueChange={(value) => setColumnMapping({ ...columnMapping, useCase: value === '__none__' ? '' : value })}
                  >
                    <SelectTrigger id="use-case-col">
                      <SelectValue placeholder="Select column for use case" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvColumns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity-col">Quantity Column *</Label>
                  <Select
                    value={columnMapping.quantity}
                    onValueChange={(value) => setColumnMapping({ ...columnMapping, quantity: value })}
                  >
                    <SelectTrigger id="quantity-col">
                      <SelectValue placeholder="Select column for quantity" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvColumns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="length-col">Length Column (Optional)</Label>
                  <Select
                    value={columnMapping.length || '__none__'}
                    onValueChange={(value) => setColumnMapping({ ...columnMapping, length: value === '__none__' ? '' : value })}
                  >
                    <SelectTrigger id="length-col">
                      <SelectValue placeholder="Select column for length" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvColumns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {columnMapping.category && columnMapping.name && columnMapping.quantity && (
                <div className="border rounded-md p-3 max-h-60 overflow-y-auto">
                  <p className="text-sm font-medium mb-2">Preview (first 5 rows):</p>
                  <div className="space-y-1 text-xs">
                    {csvData.slice(0, 5).map((row: any, idx: number) => (
                      <div key={idx} className="text-muted-foreground font-mono">
                        [{row[columnMapping.category]}] {row[columnMapping.name]}
                        {columnMapping.useCase && row[columnMapping.useCase] && 
                          ` - Use: ${row[columnMapping.useCase]}`}
                        {' - '}Qty: {row[columnMapping.quantity]}
                        {columnMapping.length && row[columnMapping.length] && 
                          ` - Length: ${row[columnMapping.length]}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowCsvDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={proceedToCategories}
                  className="gradient-primary"
                >
                  Next: Map Categories
                </Button>
              </div>
            </div>
          )}

          {importStep === 'categories' && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Found {csvCategories.length} categories. Map them to existing categories or create new ones.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Category Mapping</Label>
                {csvCategories.map((csvCat) => (
                  <div key={csvCat} className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-sm font-normal">{csvCat}</Label>
                    </div>
                    <div className="flex-1">
                      <Select
                        value={categoryMapping[csvCat]}
                        onValueChange={(value) => {
                          setCategoryMapping({
                            ...categoryMapping,
                            [csvCat]: value,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CREATE_NEW">
                            🆕 Create "{csvCat}"
                          </SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border rounded-md p-3 max-h-60 overflow-y-auto">
                <p className="text-sm font-medium mb-2">Ready to import {csvData.length} materials</p>
                <div className="space-y-1 text-xs">
                  {csvData.slice(0, 10).map((row: any, idx: number) => (
                    <div key={idx} className="text-muted-foreground">
                      [{row[columnMapping.category]}] {row[columnMapping.name]}
                      {columnMapping.useCase && row[columnMapping.useCase] && 
                        ` - Use: ${row[columnMapping.useCase]}`}
                      {' - '}Qty: {row[columnMapping.quantity]}
                      {columnMapping.length && row[columnMapping.length] && 
                        ` - Length: ${row[columnMapping.length]}`}
                    </div>
                  ))}
                  {csvData.length > 10 && (
                    <div className="text-muted-foreground italic">
                      ... and {csvData.length - 10} more
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setImportStep('columns')}
                  disabled={uploading}
                >
                  Back
                </Button>
                <Button
                  onClick={processCsvImport}
                  disabled={uploading}
                  className="gradient-primary"
                >
                  {uploading ? 'Importing...' : 'Import Materials'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
