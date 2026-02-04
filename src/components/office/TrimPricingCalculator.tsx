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
import { Calculator, Settings, Info, X, Eraser } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY_LF_COST = 'trim_calculator_lf_cost';
const STORAGE_KEY_BEND_PRICE = 'trim_calculator_bend_price';
const STORAGE_KEY_MARKUP_PERCENT = 'trim_calculator_markup_percent';

export function TrimPricingCalculator() {
  // Persistent settings
  const [sheetLFCost, setSheetLFCost] = useState<string>('');
  const [pricePerBend, setPricePerBend] = useState<string>('');
  const [markupPercent, setMarkupPercent] = useState<string>('32');
  
  // Calculation inputs (6 width columns like Excel + bends + cut)
  const [width1, setWidth1] = useState<string>('0');
  const [width2, setWidth2] = useState<string>('0');
  const [width3, setWidth3] = useState<string>('0');
  const [width4, setWidth4] = useState<string>('0');
  const [width5, setWidth5] = useState<string>('0');
  const [width6, setWidth6] = useState<string>('0');
  const [numberOfBends, setNumberOfBends] = useState<string>('0');
  const [cutCount, setCutCount] = useState<string>('1');
  
  // Calculated results (always visible)
  const [totalInches, setTotalInches] = useState(0);
  const [pricePerInch, setPricePerInch] = useState(0);
  const [totalBendCost, setTotalBendCost] = useState(0);
  const [totalInchCost, setTotalInchCost] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  
  // Dialog states
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tempLFCost, setTempLFCost] = useState('');
  const [tempBendPrice, setTempBendPrice] = useState('');
  const [tempMarkupPercent, setTempMarkupPercent] = useState('32');

  // Load saved values on mount
  useEffect(() => {
    const savedLFCost = localStorage.getItem(STORAGE_KEY_LF_COST);
    const savedBendPrice = localStorage.getItem(STORAGE_KEY_BEND_PRICE);
    const savedMarkupPercent = localStorage.getItem(STORAGE_KEY_MARKUP_PERCENT);
    
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
      // Default to 32% if not set
      setMarkupPercent('32');
      setTempMarkupPercent('32');
    }
  }, []);

  // Save settings to localStorage
  function saveSettings() {
    const lfCost = parseFloat(tempLFCost);
    const bendPrice = parseFloat(tempBendPrice);
    const markup = parseFloat(tempMarkupPercent);
    
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
    
    localStorage.setItem(STORAGE_KEY_LF_COST, tempLFCost);
    localStorage.setItem(STORAGE_KEY_BEND_PRICE, tempBendPrice);
    localStorage.setItem(STORAGE_KEY_MARKUP_PERCENT, tempMarkupPercent);
    setSheetLFCost(tempLFCost);
    setPricePerBend(tempBendPrice);
    setMarkupPercent(tempMarkupPercent);
    setShowSettings(false);
    toast.success('Settings saved successfully');
  }

  // Calculate trim pricing (runs on every input change)
  useEffect(() => {
    const lfCost = parseFloat(sheetLFCost) || 0;
    const bendPriceVal = parseFloat(pricePerBend) || 0;
    const markup = parseFloat(markupPercent) || 0;
    
    const w1 = parseFloat(width1) || 0;
    const w2 = parseFloat(width2) || 0;
    const w3 = parseFloat(width3) || 0;
    const w4 = parseFloat(width4) || 0;
    const w5 = parseFloat(width5) || 0;
    const w6 = parseFloat(width6) || 0;
    const bends = parseFloat(numberOfBends) || 0;

    // Total In = sum of all width inputs
    const totalIn = w1 + w2 + w3 + w4 + w5 + w6;
    setTotalInches(totalIn);

    // $ per In = (sheet LF COST × (1 + markup%)) / 12 (convert LF to inches)
    const markupMultiplier = 1 + (markup / 100);
    const sellingPricePerLF = lfCost * markupMultiplier;
    const pricePerIn = sellingPricePerLF / 12;
    setPricePerInch(pricePerIn);
    
    // Total Bend $ = Bends × $ Per Bend
    const bendCost = bends * bendPriceVal;
    setTotalBendCost(bendCost);
    
    // Total Inch $ = Total In × $ per In
    const inchCost = totalIn * pricePerIn;
    setTotalInchCost(inchCost);
    
    // Selling Price = Total Inch $ + Total Bend $
    const finalPrice = inchCost + bendCost;
    setSellingPrice(finalPrice);
  }, [sheetLFCost, pricePerBend, markupPercent, width1, width2, width3, width4, width5, width6, numberOfBends]);

  function clearCalculation() {
    setWidth1('0');
    setWidth2('0');
    setWidth3('0');
    setWidth4('0');
    setWidth5('0');
    setWidth6('0');
    setNumberOfBends('0');
    setCutCount('1');
  }

  const hasSettings = sheetLFCost && pricePerBend && markupPercent;

  return (
    <>
      {/* Main Calculator - Excel Style Layout */}
      <Card className="border-2 border-green-800 bg-gradient-to-br from-slate-900 to-black max-w-5xl mx-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Calculator className="w-6 h-6" />
              Trim Pricing Calculator
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowInfo(true)}
                size="sm"
                variant="ghost"
                className="text-yellow-500 hover:text-yellow-400 hover:bg-green-900/20"
              >
                <Info className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setShowSettings(true);
                }}
                size="sm"
                variant="ghost"
                className="text-yellow-500 hover:text-yellow-400 hover:bg-green-900/20"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasSettings ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
              <p className="text-yellow-500 font-semibold">
                Please configure settings first
              </p>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setShowSettings(true);
                }}
                className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                <Settings className="w-4 h-4 mr-2" />
                Open Settings
              </Button>
            </div>
          ) : (
            <>
              {/* Input Section - Excel Style */}
              <div className="space-y-3">
                {/* Header Row */}
                <div className="grid grid-cols-9 gap-2 text-center">
                  <div className="col-span-6 bg-teal-700 border border-teal-600 rounded p-2">
                    <div className="text-xs font-bold text-white">STEEL</div>
                    <div className="text-xs text-teal-200">Inches</div>
                  </div>
                  <div className="bg-teal-700 border border-teal-600 rounded p-2">
                    <div className="text-xs font-bold text-white">Bends</div>
                  </div>
                  <div className="bg-teal-700 border border-teal-600 rounded p-2">
                    <div className="text-xs font-bold text-white">Cut</div>
                  </div>
                  <div className="bg-teal-700 border border-teal-600 rounded p-2">
                    <div className="text-xs font-bold text-white">Actions</div>
                  </div>
                </div>

                {/* Input Row */}
                <div className="grid grid-cols-9 gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.125"
                    value={width1}
                    onChange={(e) => setWidth1(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.125"
                    value={width2}
                    onChange={(e) => setWidth2(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.125"
                    value={width3}
                    onChange={(e) => setWidth3(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.125"
                    value={width4}
                    onChange={(e) => setWidth4(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.125"
                    value={width5}
                    onChange={(e) => setWidth5(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.125"
                    value={width6}
                    onChange={(e) => setWidth6(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={numberOfBends}
                    onChange={(e) => setNumberOfBends(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={cutCount}
                    onChange={(e) => setCutCount(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-cyan-50 border-green-800"
                  />
                  <Button
                    onClick={clearCalculation}
                    variant="outline"
                    className="h-12 border-green-800 text-white hover:bg-green-900/20"
                    title="Clear all inputs"
                  >
                    <Eraser className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Calculation Results - Always Visible */}
              <div className="space-y-3 pt-4 border-t-2 border-green-800">
                {/* Intermediate Calculations */}
                <div className="grid grid-cols-5 gap-3 text-center">
                  <div className="bg-cyan-100 border-2 border-slate-400 rounded p-3">
                    <div className="text-xs text-slate-600 font-semibold mb-1">Total In</div>
                    <div className="text-2xl font-bold text-slate-900">{totalInches.toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-100 border-2 border-slate-400 rounded p-3">
                    <div className="text-xs text-slate-600 font-semibold mb-1">Total Bend $</div>
                    <div className="text-2xl font-bold text-slate-900">${totalBendCost.toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-100 border-2 border-red-400 rounded p-3">
                    <div className="text-xs text-red-700 font-semibold mb-1">$ per In</div>
                    <div className="text-2xl font-bold text-red-700">${pricePerInch.toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-100 border-2 border-red-400 rounded p-3">
                    <div className="text-xs text-red-700 font-semibold mb-1">$ Per Bend</div>
                    <div className="text-2xl font-bold text-red-700">${(parseFloat(pricePerBend) || 0).toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-100 border-2 border-green-600 rounded p-3">
                    <div className="text-xs text-green-800 font-semibold mb-1">Total Inch $</div>
                    <div className="text-2xl font-bold text-green-800">${totalInchCost.toFixed(2)}</div>
                  </div>
                </div>

                {/* Final Selling Price */}
                <div className="bg-teal-700 border-2 border-teal-600 rounded-lg p-6">
                  <div className="text-sm text-teal-200 mb-2 font-semibold text-center">SELLING PRICE</div>
                  <div className="text-5xl font-bold text-white text-center">${sellingPrice.toFixed(2)}</div>
                  <div className="text-sm text-teal-200 mt-3 text-center">
                    = Total Inch $ (${totalInchCost.toFixed(2)}) + Total Bend $ (${totalBendCost.toFixed(2)})
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-2 border-green-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Settings className="w-5 h-5" />
              Calculator Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lf-cost" className="text-sm font-semibold text-white">
                Sheet Cost per LF (42" wide) *
              </Label>
              <p className="text-xs text-white/60">
                Enter your COST per lineal foot (before markup). Your markup percentage will be applied automatically.
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="lf-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempLFCost}
                  onChange={(e) => setTempLFCost(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-green-800"
                />
              </div>
              {tempLFCost && tempMarkupPercent && (
                <p className="text-xs text-green-500 font-semibold">
                  Selling price: ${(parseFloat(tempLFCost) * (1 + parseFloat(tempMarkupPercent) / 100)).toFixed(2)}/LF (with {tempMarkupPercent}% markup)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="markup-percent" className="text-sm font-semibold text-white">
                Markup Percentage *
              </Label>
              <p className="text-xs text-white/60">
                Enter your markup percentage on material cost (e.g., 32 for 32%).
              </p>
              <div className="relative">
                <Input
                  id="markup-percent"
                  type="number"
                  min="0"
                  step="0.1"
                  value={tempMarkupPercent}
                  onChange={(e) => setTempMarkupPercent(e.target.value)}
                  placeholder="32"
                  className="pr-8 h-11 text-base bg-white border-green-800"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bend-price" className="text-sm font-semibold text-white">
                Price per Bend *
              </Label>
              <p className="text-xs text-white/60">
                Enter the charge per bend (labor + overhead).
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="bend-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempBendPrice}
                  onChange={(e) => setTempBendPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-green-800"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={saveSettings}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                Save Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettings(false)}
                className="border-green-800 text-white hover:bg-green-900/20"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-lg bg-slate-900 border-2 border-green-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Info className="w-5 h-5" />
              How It Works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-white">
            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-500">Calculation Formula:</h4>
              <div className="space-y-1 text-sm bg-black/30 p-3 rounded border border-green-800/50 font-mono">
                <p>1. Total Inches = Bends × Width</p>
                <p>2. Total LF = Total Inches ÷ 12</p>
                <p>3. Selling Price/LF = Cost/LF × (1 + Markup%/100)</p>
                <p>4. Material Price = Total LF × Selling Price/LF</p>
                <p>5. Bend Price = Bends × Price/Bend</p>
                <p>6. Total = Material + Bend Price</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-500">Key Details:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-white/80">
                <li>Sheet width: 42 inches</li>
                <li>Standard pieces: 10 feet long</li>
                <li>Configurable markup percentage on material cost</li>
                <li>Separate charge for labor (bending)</li>
                <li>Price calculated by cutting 10' strips to specified width × number of bends</li>
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
    </>
  );
}
