# Proposal Number Fix Summary

## Problem
The proposal numbering system was generating completely new base numbers (XXXXX) for each proposal, even when multiple proposals belonged to the same job. 

**Expected behavior:** 
- Job 1 proposals: `26001-1`, `26001-2`, `26001-3` (same base number, incrementing version)
- Job 2 proposals: `26002-1`, `26002-2` (same base number, incrementing version)

**Previous incorrect behavior:**
- Job 1 proposals: `26001-1`, `26015-1`, `26023-1` (different base numbers)

## Solution Implemented

### 1. Database Function Updates

#### Updated `generate_proposal_number()` function
- **Changed parameter:** From `p_base_number` to `p_job_id`
- **New logic:**
  1. If `job_id` is provided and the job already has proposals:
     - Extract the base number from the first proposal for that job
     - Find the highest version number for that job
     - Increment the version and return: `{base_number}-{next_version}`
  2. If `job_id` is NULL or job has no proposals:
     - Generate a new base number (highest existing + 1)
     - Return: `{new_base_number}-1`

#### Updated `assign_proposal_number_on_insert()` trigger
- Now passes `NEW.job_id` to `generate_proposal_number()`
- Ensures proposal numbers are generated with job context

### 2. Frontend Updates

#### QuoteIntakeForm.tsx
- Changed `generateProposalNumber()` to accept `jobId` parameter instead of `baseNumber`
- Updated RPC call to pass `p_job_id` instead of `p_base_number`
- When generating numbers for new quotes, passes `data.job_id` if available

#### QuotesView.tsx
- Updated `createNewVersion()` to fetch current quote's `job_id` 
- Ensures new proposal versions maintain the same base number

## Testing Results

```sql
-- Test 1: Existing job (has proposals 26002-1)
SELECT generate_proposal_number('8c62c6d0-a51f-450c-995b-054e5d664d11');
-- Result: 26002-2 ✅ (correct - same base, incremented version)

-- Test 2: New job (no proposals)
SELECT generate_proposal_number('00000000-0000-0000-0000-000000000000');
-- Result: 26025-1 ✅ (correct - new base number)

-- Test 3: No job_id provided
SELECT generate_proposal_number(NULL);
-- Result: 26025-1 ✅ (correct - new base number)
```

## Workflow Examples

### Scenario 1: New Job → Multiple Proposals
1. Create new job (no proposals yet)
2. Create first proposal → Gets `26030-1`
3. Create second proposal for same job → Gets `26030-2`
4. Create third proposal for same job → Gets `26030-3`

### Scenario 2: Quote Submitted → Converted to Job → New Proposals
1. Submit quote (no job yet) → Gets `26031-1`
2. Quote converted to job → Retains `26031-1`
3. Create new proposal for this job → Gets `26031-2`
4. Create another proposal → Gets `26031-3`

## Files Modified

1. **Database:**
   - `generate_proposal_number()` function - Updated logic to use job_id
   - `assign_proposal_number_on_insert()` trigger - Passes job_id to function

2. **Frontend:**
   - `src/components/office/QuoteIntakeForm.tsx` - Updated generateProposalNumber() calls
   - `src/components/office/QuotesView.tsx` - Updated createNewVersion() to maintain base number

## Notes

- The base number (XXXXX) now stays with the job throughout its lifecycle
- The version number (-X) increments for each new proposal created for that job
- Existing proposals are not affected - only new proposals will follow this pattern
- If a quote is created without a job_id, it gets a new base number
- When the quote is later linked to a job, subsequent proposals for that job will use the same base number
