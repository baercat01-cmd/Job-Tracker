import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Calculator, Settings, Info, X, Plus, Trash2, Save, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY_LF_COST = 'trim_calculator_lf_cost';
const STORAGE_KEY_BEND_PRICE = 'trim_calculator_bend_price';
const STORAGE_KEY_MARKUP_PERCENT = 'trim_calculator_markup_percent';
const STORAGE_KEY_CUT_PRICE = 'trim_calculator_cut_price';

interface InchInput {
  id: string;
  value: string;
}

interface SavedConfig {
  id: string;
  name: string;
  job_id: string | null;
  job_name: string | null;
  inches: number[];
  bends: number;
  created_at: string;
}

export function TrimPricingCalculator() {
  // Persistent settings
  const [sheetLFCost, setSheetLFCost] = useState<string>('');
  const [pricePerBend, setPricePerBend] = useState<string>('');
  const [markupPercent, setMarkupPercent] = useState<string>('32');
  const [cutPrice, setCutPrice] = useState<string>('1.00');
  
  // Dynamic inch inputs
  const [inchInputs, setInchInputs] = useState<InchInput[]>([
    { id: '1', value: '' }
  ]);
  const [numberOfBends, setNumberOfBends] = useState<string>('');
  
  // Results (always calculated, shown even if 0)
  const [totalInches, setTotalInches] = useState(0);
  const [totalBendCost, setTotalBendCost] = useState(0);
  const [costPerInch, setCostPerInch] = useState(0);
  const [costPerBend, setCostPerBend] = useState(0);
  const [totalInchCost, setTotalInchCost] = useState(0);
  const [totalCutCost, setTotalCutCost] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  
  // Dialog states
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  
  const [tempLFCost, setTempLFCost] = useState('');
  const [tempBendPrice, setTempBendPrice] = useState('');
  const [tempMarkupPercent, setTempMarkupPercent] = useState('32');
  const [tempCutPrice, setTempCutPrice] = useState('1.00');

  // Save/Load
  const [configName, setConfigName] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [saving, setSaving] = useState(false);

  // Load saved values on mount
  useEffect(() => {
    const savedLFCost = localStorage.getItem(STORAGE_KEY_LF_COST);
    const savedBendPrice = localStorage.getItem(STORAGE_KEY_BEND_PRICE);
    const savedMarkupPercent = localStorage.getItem(STORAGE_KEY_MARKUP_PERCENT);
    const savedCutPrice = localStorage.getItem(STORAGE_KEY_CUT_PRICE);
    
    if (savedLFCost) {
      setSheetLFCost(savedLFCost);
      setTempLFCost(savedLFCost);
    }
    if (savedBendPrice) {
      setPricePerBend(savedBendPrice);
      setTempBendPrice(savedBendPrice);
    }
    if (savedMarkupPercent) {
      setMarkupPercent(savedMarkupPercent);
      setTempMarkupPercent(savedMarkupPercent);
    } else {
      setMarkupPercent('32');
      setTempMarkupPercent('32');
    }
    if (savedCutPrice) {
      setCutPrice(savedCutPrice);
      setTempCutPrice(savedCutPrice);
    } else {
      setCutPrice('1.00');
      setTempCutPrice('1.00');
    }
    
    loadJobs();
    loadSavedConfigs();
  }, []);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, job_number')
        .eq('status', 'active')
        .order('name');
      
      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadSavedConfigs() {
    try {
      // Load from localStorage for now (could be database table later)
      const saved = localStorage.getItem('trim_saved_configs');
      if (saved) {
        setSavedConfigs(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading saved configs:', error);
    }
  }

  function saveSettings() {
    const lfCost = parseFloat(tempLFCost);
    const bendPrice = parseFloat(tempBendPrice);
    const markup = parseFloat(tempMarkupPercent);
    const cut = parseFloat(tempCutPrice);
    
    if (!lfCost || lfCost <= 0) {
      toast.error('Please enter a valid sheet cost per LF');
      return;
    }
    if (!bendPrice || bendPrice <= 0) {
      toast.error('Please enter a valid price per bend');
      return;
    }
    if (markup < 0) {
      toast.error('Please enter a valid markup percentage (0 or higher)');
      return;
    }
    if (!cut || cut <= 0) {
      toast.error('Please enter a valid cut price');
      return;
    }
    
    localStorage.setItem(STORAGE_KEY_LF_COST, tempLFCost);
    localStorage.setItem(STORAGE_KEY_BEND_PRICE, tempBendPrice);
    localStorage.setItem(STORAGE_KEY_MARKUP_PERCENT, tempMarkupPercent);
    localStorage.setItem(STORAGE_KEY_CUT_PRICE, tempCutPrice);
    setSheetLFCost(tempLFCost);
    setPricePerBend(tempBendPrice);
    setMarkupPercent(tempMarkupPercent);
    setCutPrice(tempCutPrice);
    setShowSettings(false);
    toast.success('Settings saved successfully');
  }

  // Calculate trim pricing
  useEffect(() => {
    const lfCost = parseFloat(sheetLFCost);
    const bendPriceVal = parseFloat(pricePerBend);
    const markup = parseFloat(markupPercent);
    const cutPriceVal = parseFloat(cutPrice);
    const bends = parseInt(numberOfBends) || 0;

    // Sum all inch inputs
    const totalIn = inchInputs.reduce((sum, input) => {
      const val = parseFloat(input.value) || 0;
      return sum + val;
    }, 0);
    setTotalInches(totalIn);

    // If no settings configured, show 0s
    if (!lfCost || lfCost <= 0 || !bendPriceVal || bendPriceVal <= 0 || markup < 0) {
      setCostPerInch(0);
      setCostPerBend(0);
      setTotalBendCost(0);
      setTotalInchCost(0);
      setTotalCutCost(0);
      setSellingPrice(0);
      return;
    }

    // Calculate cost per inch from the 42" wide sheet
    const markupMultiplier = 1 + (markup / 100);
    const sellingPricePerLF = lfCost * markupMultiplier;
    const pricePerInch = sellingPricePerLF / 12;
    setCostPerInch(pricePerInch);
    
    // Cost per bend
    setCostPerBend(bendPriceVal);
    
    // Total bend cost = bends × price per bend
    const bendCost = bends * bendPriceVal;
    setTotalBendCost(bendCost);
    
    // Total inch cost = total inches × price per inch
    const inchCost = totalIn * pricePerInch;
    setTotalInchCost(inchCost);
    
    // Cut cost (always present)
    const cutCost = cutPriceVal || 0;
    setTotalCutCost(cutCost);
    
    // Selling price = total inch cost + total bend cost + cut cost
    setSellingPrice(inchCost + bendCost + cutCost);
  }, [sheetLFCost, pricePerBend, markupPercent, cutPrice, inchInputs, numberOfBends]);

  function addInchInput() {
    const newId = (Math.max(...inchInputs.map(i => parseInt(i.id)), 0) + 1).toString();
    setInchInputs([...inchInputs, { id: newId, value: '' }]);
  }

  function removeInchInput(id: string) {
    if (inchInputs.length === 1) {
      toast.error('At least one inch input is required');
      return;
    }
    setInchInputs(inchInputs.filter(input => input.id !== id));
  }

  function updateInchInput(id: string, value: string) {
    setInchInputs(inchInputs.map(input => 
      input.id === id ? { ...input, value } : input
    ));
  }

  function clearCalculation() {
    setInchInputs([{ id: '1', value: '' }]);
    setNumberOfBends('');
  }

  async function saveConfiguration() {
    if (!configName.trim()) {
      toast.error('Please enter a name for this configuration');
      return;
    }

    const inches = inchInputs.map(i => parseFloat(i.value) || 0).filter(v => v > 0);
    const bends = parseInt(numberOfBends) || 0;

    if (inches.length === 0) {
      toast.error('Please enter at least one inch measurement');
      return;
    }

    try {
      setSaving(true);
      
      const jobName = selectedJobId 
        ? jobs.find(j => j.id === selectedJobId)?.name || null
        : null;

      const newConfig: SavedConfig = {
        id: Date.now().toString(),
        name: configName.trim(),
        job_id: selectedJobId || null,
        job_name: jobName,
        inches,
        bends,
        created_at: new Date().toISOString(),
      };

      const updatedConfigs = [...savedConfigs, newConfig];
      localStorage.setItem('trim_saved_configs', JSON.stringify(updatedConfigs));
      setSavedConfigs(updatedConfigs);
      
      toast.success('Configuration saved successfully');
      setShowSaveDialog(false);
      setConfigName('');
      setSelectedJobId('');
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  function loadConfiguration(config: SavedConfig) {
    // Load the inches
    const newInputs = config.inches.map((value, index) => ({
      id: (index + 1).toString(),
      value: value.toString(),
    }));
    setInchInputs(newInputs);
    
    // Load bends
    setNumberOfBends(config.bends.toString());
    
    setShowLoadDialog(false);
    toast.success(`Loaded configuration: ${config.name}`);
  }

  function deleteConfiguration(configId: string) {
    if (!confirm('Delete this saved configuration?')) return;
    
    const updatedConfigs = savedConfigs.filter(c => c.id !== configId);
    localStorage.setItem('trim_saved_configs', JSON.stringify(updatedConfigs));
    setSavedConfigs(updatedConfigs);
    toast.success('Configuration deleted');
  }

  const hasSettings = sheetLFCost && pricePerBend && markupPercent;

  return (
    <>
      {/* Main Calculator */}
      <Card className="border-4 border-yellow-500 bg-gradient-to-br from-green-950 via-black to-green-900 max-w-4xl mx-auto shadow-2xl">
        <CardHeader className="pb-4 border-b-2 border-yellow-500">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-yellow-500">
              <Calculator className="w-7 h-7" />
              <span className="text-2xl font-bold">Flat Panel Trim Calculator</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowInfo(true)}
                size="sm"
                className="bg-green-800 hover:bg-green-700 text-yellow-400 border-2 border-yellow-500"
              >
                <Info className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setTempCutPrice(cutPrice);
                  setShowSettings(true);
                }}
                size="sm"
                className="bg-green-800 hover:bg-green-700 text-yellow-400 border-2 border-yellow-500"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {!hasSettings ? (
            <div className="bg-yellow-500/10 border-2 border-yellow-500 rounded-lg p-6 text-center">
              <p className="text-yellow-500 font-bold text-lg mb-3">
                Configure Settings First
              </p>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setTempCutPrice(cutPrice);
                  setShowSettings(true);
                }}
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg px-6 py-3"
              >
                <Settings className="w-5 h-5 mr-2" />
                Open Settings
              </Button>
            </div>
          ) : (
            <>
              {/* Save/Load Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex-1 bg-gradient-to-r from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-yellow-400 font-bold border-2 border-yellow-500"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Configuration
                </Button>
                <Button
                  onClick={() => setShowLoadDialog(true)}
                  className="flex-1 bg-gradient-to-r from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-yellow-400 font-bold border-2 border-yellow-500"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Load Saved ({savedConfigs.length})
                </Button>
              </div>

              {/* Steel Section - Dynamic Inch Inputs */}
              <div className="space-y-4 bg-black/30 p-5 rounded-lg border-2 border-green-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-yellow-500 uppercase tracking-wider">Steel Measurements</h3>
                  <Button
                    onClick={addInchInput}
                    size="sm"
                    className="bg-green-700 hover:bg-green-600 text-yellow-400 font-bold border border-yellow-500"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Length
                  </Button>
                </div>
                
                <div className="grid gap-3">
                  {inchInputs.map((input, index) => (
                    <div key={input.id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-xs text-yellow-400 mb-1 block">
                          Length #{index + 1} (inches)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.125"
                          value={input.value}
                          onChange={(e) => updateInchInput(input.id, e.target.value)}
                          placeholder="0"
                          className="h-12 text-center text-xl bg-white border-2 border-green-700 font-bold focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500"
                        />
                      </div>
                      {inchInputs.length > 1 && (
                        <Button
                          onClick={() => removeInchInput(input.id)}
                          size="sm"
                          variant="ghost"
                          className="mt-6 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bends Input */}
                <div className="space-y-2 pt-3 border-t border-green-800">
                  <Label className="text-yellow-400 font-semibold">Number of Bends</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={numberOfBends}
                    onChange={(e) => setNumberOfBends(e.target.value)}
                    placeholder="0"
                    className="h-12 text-center text-xl bg-white border-2 border-green-700 font-bold focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
              </div>

              {/* Results Section - Always Visible */}
              <div className="space-y-4 pt-4 border-t-4 border-yellow-500">
                {/* Calculation Details */}
                <div className="grid grid-cols-5 gap-2">
                  <div className="bg-gradient-to-br from-green-800 to-green-900 border-2 border-yellow-500 rounded-lg p-3 text-center">
                    <div className="text-yellow-400 font-bold text-xs mb-1">Total In</div>
                    <div className="text-2xl font-bold text-white">{totalInches.toFixed(2)}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-800 to-green-900 border-2 border-yellow-500 rounded-lg p-3 text-center">
                    <div className="text-yellow-400 font-bold text-xs mb-1">Total Bend $</div>
                    <div className="text-2xl font-bold text-white">${totalBendCost.toFixed(2)}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-800 to-green-900 border-2 border-yellow-500 rounded-lg p-3 text-center">
                    <div className="text-yellow-400 font-bold text-xs mb-1">$ per In</div>
                    <div className="text-2xl font-bold text-white">${costPerInch.toFixed(2)}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-800 to-green-900 border-2 border-yellow-500 rounded-lg p-3 text-center">
                    <div className="text-yellow-400 font-bold text-xs mb-1">$ Per Bend</div>
                    <div className="text-2xl font-bold text-white">${costPerBend.toFixed(2)}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-800 to-green-900 border-2 border-yellow-500 rounded-lg p-3 text-center">
                    <div className="text-yellow-400 font-bold text-xs mb-1">Total Inch $</div>
                    <div className="text-2xl font-bold text-white">${totalInchCost.toFixed(2)}</div>
                  </div>
                </div>

                {/* Cut Cost Display */}
                <div className="bg-gradient-to-br from-green-800 to-green-900 border-2 border-yellow-500 rounded-lg p-3 text-center">
                  <div className="text-yellow-400 font-bold text-sm mb-1">Cut Cost (Fixed)</div>
                  <div className="text-3xl font-bold text-white">${totalCutCost.toFixed(2)}</div>
                </div>

                {/* Final Selling Price */}
                <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 rounded-lg p-6 text-center border-4 border-yellow-400 shadow-2xl">
                  <div className="text-black font-bold text-lg mb-2">SELLING PRICE</div>
                  <div className="text-6xl font-black text-black">${sellingPrice.toFixed(2)}</div>
                  <div className="text-xs text-black/80 mt-2">Material + Bends + Cut</div>
                </div>

                {/* Clear Button */}
                <Button
                  onClick={clearCalculation}
                  variant="outline"
                  className="w-full border-2 border-red-500 text-red-400 hover:bg-red-900/20 hover:text-red-300 font-bold"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Settings className="w-6 h-6" />
              Calculator Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lf-cost" className="text-sm font-semibold text-yellow-400">
                Sheet Cost per LF (42" wide) *
              </Label>
              <p className="text-xs text-white/60">
                Enter your COST per lineal foot (before markup).
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                <Input
                  id="lf-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempLFCost}
                  onChange={(e) => setTempLFCost(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="markup-percent" className="text-sm font-semibold text-yellow-400">
                Markup Percentage *
              </Label>
              <div className="relative">
                <Input
                  id="markup-percent"
                  type="number"
                  min="0"
                  step="0.1"
                  value={tempMarkupPercent}
                  onChange={(e) => setTempMarkupPercent(e.target.value)}
                  placeholder="32"
                  className="pr-8 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bend-price" className="text-sm font-semibold text-yellow-400">
                Price per Bend *
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                <Input
                  id="bend-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempBendPrice}
                  onChange={(e) => setTempBendPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cut-price" className="text-sm font-semibold text-yellow-400">
                Cut Price *
              </Label>
              <p className="text-xs text-white/60">
                Fixed cost per cut (typically $1.00)
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                <Input
                  id="cut-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempCutPrice}
                  onChange={(e) => setTempCutPrice(e.target.value)}
                  placeholder="1.00"
                  className="pl-7 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={saveSettings}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold border-2 border-yellow-600"
              >
                Save Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettings(false)}
                className="border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-lg bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Info className="w-6 h-6" />
              How It Works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-white">
            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-400">Calculation Method:</h4>
              <div className="space-y-1 text-sm bg-black/30 p-4 rounded border-2 border-green-800">
                <p><strong className="text-yellow-400">$ per In:</strong> (Sheet Cost/LF × Markup) ÷ 12</p>
                <p><strong className="text-yellow-400">Total Inch $:</strong> Sum of all lengths × $ per In</p>
                <p><strong className="text-yellow-400">Total Bend $:</strong> Number of Bends × Price/Bend</p>
                <p><strong className="text-yellow-400">Cut Cost:</strong> Fixed charge (set in settings)</p>
                <p><strong className="text-yellow-400">Selling Price:</strong> Total Inch $ + Total Bend $ + Cut Cost</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-400">Key Features:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-white/80">
                <li>Base sheet: 42" wide × 10' long (120")</li>
                <li>Add multiple length measurements dynamically</li>
                <li>Configurable markup percentage on material cost</li>
                <li>Separate labor charge per bend</li>
                <li>Fixed cut cost included automatically</li>
                <li>Save and load configurations for different jobs</li>
              </ul>
            </div>

            <Button
              onClick={() => setShowInfo(false)}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
            >
              Got It
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Configuration Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Save className="w-6 h-6" />
              Save Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-name" className="text-yellow-400 font-semibold">
                Configuration Name *
              </Label>
              <Input
                id="config-name"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="e.g., Building A - Corner Trim"
                className="bg-white border-2 border-green-700 focus:border-yellow-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="job-select" className="text-yellow-400 font-semibold">
                Assign to Job (Optional)
              </Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger className="bg-white border-2 border-green-700 focus:border-yellow-500">
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Job Assignment</SelectItem>
                  {jobs.map(job => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number ? `${job.job_number} - ` : ''}{job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-black/30 border-2 border-green-800 rounded p-3 text-sm text-white/80">
              <p className="font-semibold text-yellow-400 mb-2">Current Configuration:</p>
              <p>• Lengths: {inchInputs.filter(i => i.value).map(i => i.value).join(', ')} inches</p>
              <p>• Bends: {numberOfBends || 0}</p>
              <p>• Selling Price: ${sellingPrice.toFixed(2)}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveConfiguration}
                disabled={saving}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSaveDialog(false)}
                className="border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Configuration Dialog */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="sm:max-w-2xl bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500 max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <FolderOpen className="w-6 h-6" />
              Load Saved Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {savedConfigs.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <p>No saved configurations yet</p>
                <p className="text-sm mt-2">Save a configuration to see it here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedConfigs.map(config => (
                  <div key={config.id} className="bg-black/30 border-2 border-green-800 rounded-lg p-4 hover:border-yellow-500 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-yellow-400 text-lg mb-1">{config.name}</h4>
                        {config.job_name && (
                          <p className="text-sm text-white/60 mb-2">Job: {config.job_name}</p>
                        )}
                        <div className="text-sm text-white/80 space-y-1">
                          <p>• Lengths: {config.inches.join(', ')} inches</p>
                          <p>• Bends: {config.bends}</p>
                          <p className="text-xs text-white/60">
                            Saved: {new Date(config.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 ml-4">
                        <Button
                          onClick={() => loadConfiguration(config)}
                          className="bg-green-700 hover:bg-green-600 text-yellow-400 font-bold border border-yellow-500"
                        >
                          Load
                        </Button>
                        <Button
                          onClick={() => deleteConfiguration(config.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-4 border-t-2 border-green-800">
            <Button
              variant="outline"
              onClick={() => setShowLoadDialog(false)}
              className="w-full border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
