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
import { Calculator, Settings, Info, X } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY_LF_COST = 'trim_calculator_lf_cost';
const STORAGE_KEY_BEND_PRICE = 'trim_calculator_bend_price';
const STORAGE_KEY_MARKUP_PERCENT = 'trim_calculator_markup_percent';

export function TrimPricingCalculator() {
  // Persistent settings
  const [sheetLFCost, setSheetLFCost] = useState<string>('');
  const [pricePerBend, setPricePerBend] = useState<string>('');
  const [markupPercent, setMarkupPercent] = useState<string>('32');
  
  // Calculation inputs - 7 inch columns like Excel
  const [inch1, setInch1] = useState<string>('');
  const [inch2, setInch2] = useState<string>('');
  const [inch3, setInch3] = useState<string>('');
  const [inch4, setInch4] = useState<string>('');
  const [inch5, setInch5] = useState<string>('');
  const [inch6, setInch6] = useState<string>('');
  const [inch7, setInch7] = useState<string>('');
  const [numberOfBends, setNumberOfBends] = useState<string>('');
  const [numberOfCuts, setNumberOfCuts] = useState<string>('');
  
  // Results (always calculated, shown even if 0)
  const [totalInches, setTotalInches] = useState(0);
  const [totalBendCost, setTotalBendCost] = useState(0);
  const [costPerInch, setCostPerInch] = useState(0);
  const [costPerBend, setCostPerBend] = useState(0);
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

  // Calculate trim pricing - matches Excel formulas
  useEffect(() => {
    const lfCost = parseFloat(sheetLFCost);
    const bendPriceVal = parseFloat(pricePerBend);
    const markup = parseFloat(markupPercent);
    const bends = parseInt(numberOfBends) || 0;

    // Sum all inch inputs
    const i1 = parseFloat(inch1) || 0;
    const i2 = parseFloat(inch2) || 0;
    const i3 = parseFloat(inch3) || 0;
    const i4 = parseFloat(inch4) || 0;
    const i5 = parseFloat(inch5) || 0;
    const i6 = parseFloat(inch6) || 0;
    const i7 = parseFloat(inch7) || 0;
    
    const totalIn = i1 + i2 + i3 + i4 + i5 + i6 + i7;
    setTotalInches(totalIn);

    // If no settings configured, show 0s
    if (!lfCost || lfCost <= 0 || !bendPriceVal || bendPriceVal <= 0 || markup < 0) {
      setCostPerInch(0);
      setCostPerBend(0);
      setTotalBendCost(0);
      setTotalInchCost(0);
      setSellingPrice(0);
      return;
    }

    // Calculate cost per inch from the 42" wide sheet
    // Sheet is 42" wide, 10' long = 120" long
    // Cost per LF with markup
    const markupMultiplier = 1 + (markup / 100);
    const sellingPricePerLF = lfCost * markupMultiplier;
    
    // Cost per inch = (selling price per LF / 12 inches)
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
    
    // Selling price = total inch cost + total bend cost
    setSellingPrice(inchCost + bendCost);
  }, [sheetLFCost, pricePerBend, markupPercent, inch1, inch2, inch3, inch4, inch5, inch6, inch7, numberOfBends, numberOfCuts]);

  function clearCalculation() {
    setInch1('');
    setInch2('');
    setInch3('');
    setInch4('');
    setInch5('');
    setInch6('');
    setInch7('');
    setNumberOfBends('');
    setNumberOfCuts('');
  }

  const hasSettings = sheetLFCost && pricePerBend && markupPercent;

  return (
    <>
      {/* Main Compact Calculator */}
      <Card className="border-2 border-green-800 bg-gradient-to-br from-slate-900 to-black max-w-4xl mx-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Calculator className="w-6 h-6" />
              Flat Panel Trim Calculator
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
              {/* Steel Section - Inch Inputs (7 columns like Excel) */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider">Steel</h3>
                <div className="grid grid-cols-7 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Inches</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={inch1}
                      onChange={(e) => setInch1(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Inches</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={inch2}
                      onChange={(e) => setInch2(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Inches</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={inch3}
                      onChange={(e) => setInch3(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Inches</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={inch4}
                      onChange={(e) => setInch4(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Inches</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={inch5}
                      onChange={(e) => setInch5(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Inches</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={inch6}
                      onChange={(e) => setInch6(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Inches</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={inch7}
                      onChange={(e) => setInch7(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                </div>

                {/* Bends and Cut */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Bends</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={numberOfBends}
                      onChange={(e) => setNumberOfBends(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/80">Cut</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={numberOfCuts}
                      onChange={(e) => setNumberOfCuts(e.target.value)}
                      placeholder="0"
                      className="h-10 text-center bg-cyan-100 border-green-800 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Results Section - Always Visible */}
              <div className="space-y-3 pt-3 border-t-2 border-green-800">
                {/* Calculation Details */}
                <div className="grid grid-cols-5 gap-2 text-xs">
                  <div className="bg-cyan-50 border border-cyan-300 rounded p-2 text-center">
                    <div className="text-cyan-700 font-semibold mb-1">Total In</div>
                    <div className="text-lg font-bold text-cyan-900">{totalInches.toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-50 border border-cyan-300 rounded p-2 text-center">
                    <div className="text-cyan-700 font-semibold mb-1">Total Bend $</div>
                    <div className="text-lg font-bold text-cyan-900">${totalBendCost.toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-50 border border-cyan-300 rounded p-2 text-center">
                    <div className="text-cyan-700 font-semibold mb-1">$ per In</div>
                    <div className="text-lg font-bold text-cyan-900">${costPerInch.toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-50 border border-cyan-300 rounded p-2 text-center">
                    <div className="text-cyan-700 font-semibold mb-1">$ Per Bend</div>
                    <div className="text-lg font-bold text-cyan-900">${costPerBend.toFixed(2)}</div>
                  </div>
                  <div className="bg-cyan-50 border border-cyan-300 rounded p-2 text-center">
                    <div className="text-cyan-700 font-semibold mb-1">Total Inch $</div>
                    <div className="text-lg font-bold text-cyan-900">${totalInchCost.toFixed(2)}</div>
                  </div>
                </div>

                {/* Final Selling Price */}
                <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-lg p-4 text-center">
                  <div className="text-white/90 text-sm font-semibold mb-1">SELLING PRICE</div>
                  <div className="text-5xl font-bold text-white">${sellingPrice.toFixed(2)}</div>
                </div>

                {/* Clear Button */}
                <Button
                  onClick={clearCalculation}
                  variant="outline"
                  className="w-full border-green-800 text-white hover:bg-green-900/20"
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
              <h4 className="font-semibold text-yellow-500">How It Works:</h4>
              <div className="space-y-1 text-sm bg-black/30 p-3 rounded border border-green-800/50">
                <p><strong>Steel Section:</strong> Enter measurements in the 7 "Inches" columns</p>
                <p><strong>Total In:</strong> Sum of all inch columns</p>
                <p><strong>$ per In:</strong> (Sheet Cost/LF × Markup) ÷ 12</p>
                <p><strong>Total Inch $:</strong> Total Inches × $ per In</p>
                <p><strong>Total Bend $:</strong> Number of Bends × Price/Bend</p>
                <p><strong>Selling Price:</strong> Total Inch $ + Total Bend $</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-500">Key Details:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-white/80">
                <li>Base sheet: 42" wide × 10' long (120")</li>
                <li>Configurable markup percentage on material cost</li>
                <li>Separate labor charge per bend</li>
                <li>Enter individual inch measurements across 7 columns</li>
                <li>All calculation boxes update in real-time</li>
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
