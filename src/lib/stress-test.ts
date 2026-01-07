// Stress testing utility for simulating concurrent operations
// Run via console: window.runStressTest()

import { createComponent, updateComponent } from './offline-mutations';
import { uploadPhotoChunked } from './chunked-upload';
import { logError, getErrorLogs, exportErrorLogs } from './error-handler';

export interface StressTestConfig {
  concurrentUpdates: number;
  updateDelay: number;
  simulateSlowNetwork: boolean;
  networkLatency: number;
  includePhotoUploads: boolean;
  photoSize: number;
}

const DEFAULT_CONFIG: StressTestConfig = {
  concurrentUpdates: 5,
  updateDelay: 100,
  simulateSlowNetwork: true,
  networkLatency: 3000, // 3s delay (Slow 3G)
  includePhotoUploads: false,
  photoSize: 1024 * 1024 * 2, // 2MB
};

// Simulate network latency
async function simulateNetworkDelay(config: StressTestConfig) {
  if (config.simulateSlowNetwork) {
    await new Promise(resolve => setTimeout(resolve, config.networkLatency));
  }
}

// Create a test component
async function createTestComponent(
  index: number,
  userId: string,
  config: StressTestConfig
): Promise<boolean> {
  try {
    const componentData = {
      name: `Stress Test Component ${index}`,
      description: `Created during stress test at ${new Date().toISOString()}`,
      created_by: userId,
    };
    
    await simulateNetworkDelay(config);
    
    const result = await createComponent(componentData);
    
    if (result.error) {
      throw result.error;
    }
    
    console.log(`[Stress Test] ✓ Component ${index} created`);
    return true;
  } catch (error: any) {
    logError(`Stress Test - Create Component ${index}`, error);
    console.error(`[Stress Test] ✗ Component ${index} failed:`, error);
    return false;
  }
}

// Update a test component
async function updateTestComponent(
  componentId: string,
  index: number,
  config: StressTestConfig
): Promise<boolean> {
  try {
    const updates = {
      description: `Updated during stress test ${index} at ${new Date().toISOString()}`,
    };
    
    await simulateNetworkDelay(config);
    
    const result = await updateComponent(componentId, updates);
    
    if (result.error) {
      throw result.error;
    }
    
    console.log(`[Stress Test] ✓ Component ${index} updated`);
    return true;
  } catch (error: any) {
    logError(`Stress Test - Update Component ${index}`, error);
    console.error(`[Stress Test] ✗ Component ${index} update failed:`, error);
    return false;
  }
}

// Generate a test photo blob
function generateTestPhoto(sizeInBytes: number): File {
  // Create a canvas with some test content
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#FF6B6B');
    gradient.addColorStop(1, '#4ECDC4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add text
    ctx.fillStyle = 'white';
    ctx.font = '48px Arial';
    ctx.fillText('Stress Test Photo', 50, 300);
    ctx.font = '24px Arial';
    ctx.fillText(new Date().toISOString(), 50, 350);
  }
  
  // Convert to blob
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const blob = dataURLToBlob(dataUrl);
  
  // Pad to desired size if needed
  let finalBlob = blob;
  if (blob.size < sizeInBytes) {
    const padding = new Uint8Array(sizeInBytes - blob.size);
    finalBlob = new Blob([blob, padding], { type: 'image/jpeg' });
  }
  
  return new File([finalBlob], `stress-test-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

function dataURLToBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const contentType = parts[0].split(':')[1].split(';')[0];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  
  return new Blob([uInt8Array], { type: contentType });
}

// Upload a test photo
async function uploadTestPhoto(
  index: number,
  jobId: string,
  userId: string,
  config: StressTestConfig
): Promise<boolean> {
  try {
    const photo = generateTestPhoto(config.photoSize);
    
    await simulateNetworkDelay(config);
    
    await uploadPhotoChunked(
      photo,
      { jobId, uploadedBy: userId },
      (progress) => {
        console.log(`[Stress Test] Photo ${index} upload: ${progress.percentage}%`);
      }
    );
    
    console.log(`[Stress Test] ✓ Photo ${index} uploaded`);
    return true;
  } catch (error: any) {
    logError(`Stress Test - Upload Photo ${index}`, error);
    console.error(`[Stress Test] ✗ Photo ${index} upload failed:`, error);
    return false;
  }
}

// Run stress test
export async function runStressTest(
  userId: string,
  jobId: string,
  config: Partial<StressTestConfig> = {}
): Promise<{
  totalOperations: number;
  successful: number;
  failed: number;
  duration: number;
  errors: any[];
}> {
  const testConfig = { ...DEFAULT_CONFIG, ...config };
  
  console.log('[Stress Test] Starting stress test with config:', testConfig);
  console.log('[Stress Test] This will simulate concurrent component updates');
  
  const startTime = Date.now();
  const operations: Promise<boolean>[] = [];
  let successful = 0;
  let failed = 0;
  
  // Clear previous error logs
  const initialErrorCount = getErrorLogs().length;
  
  // Create test components concurrently
  console.log(`[Stress Test] Creating ${testConfig.concurrentUpdates} components concurrently...`);
  
  for (let i = 0; i < testConfig.concurrentUpdates; i++) {
    // Add small stagger to simulate real-world behavior
    await new Promise(resolve => setTimeout(resolve, testConfig.updateDelay));
    
    operations.push(createTestComponent(i, userId, testConfig));
    
    // Optionally include photo uploads
    if (testConfig.includePhotoUploads) {
      operations.push(uploadTestPhoto(i, jobId, userId, testConfig));
    }
  }
  
  // Wait for all operations to complete
  const results = await Promise.allSettled(operations);
  
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      successful++;
    } else {
      failed++;
    }
  });
  
  const duration = Date.now() - startTime;
  const newErrors = getErrorLogs().slice(initialErrorCount);
  
  const report = {
    totalOperations: operations.length,
    successful,
    failed,
    duration,
    errors: newErrors,
  };
  
  console.log('[Stress Test] ========== TEST COMPLETE ==========');
  console.log(`[Stress Test] Total operations: ${report.totalOperations}`);
  console.log(`[Stress Test] Successful: ${report.successful} (${Math.round((report.successful / report.totalOperations) * 100)}%)`);
  console.log(`[Stress Test] Failed: ${report.failed} (${Math.round((report.failed / report.totalOperations) * 100)}%)`);
  console.log(`[Stress Test] Duration: ${(report.duration / 1000).toFixed(2)}s`);
  console.log(`[Stress Test] Errors captured: ${report.errors.length}`);
  console.log('[Stress Test] ========================================');
  
  if (report.errors.length > 0) {
    console.log('[Stress Test] Error details:');
    report.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. [${error.httpStatus || 'N/A'}] ${error.operation}: ${error.error}`);
    });
    
    console.log('[Stress Test] Export error logs with: window.exportErrorLogs()');
  }
  
  return report;
}

// Expose to window for easy testing
if (typeof window !== 'undefined') {
  (window as any).runStressTest = (userId?: string, jobId?: string, config?: Partial<StressTestConfig>) => {
    const testUserId = userId || 'test-user-id';
    const testJobId = jobId || 'test-job-id';
    return runStressTest(testUserId, testJobId, config);
  };
  
  console.log('[Stress Test] Stress test utility loaded');
  console.log('[Stress Test] Run with: window.runStressTest(userId, jobId, config)');
  console.log('[Stress Test] Example: window.runStressTest("user123", "job123", { concurrentUpdates: 10, simulateSlowNetwork: true })');
}
