import type { SupabaseClient } from '@supabase/supabase-js';

function isRpcNotInSchemaCache(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? '');
  return /schema cache|PGRST202|Could not find the function|42883|does not exist/i.test(m);
}

function isRpcArgNameMismatch(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? '');
  return /PGRST301|argument|Could not choose/i.test(m);
}

async function rpcCreatePlanJson(
  client: SupabaseClient,
  p_payload: Record<string, unknown>
): Promise<{ data: unknown; error: Error | null }> {
  let { data, error } = await client.rpc('office_create_building_plan_json', { p_payload });
  if (error && isRpcArgNameMismatch(error)) {
    ({ data, error } = await client.rpc('office_create_building_plan_json', { payload: p_payload }));
  }
  return { data, error: error as Error | null };
}

async function rpcUpdatePlanJson(
  client: SupabaseClient,
  p_payload: Record<string, unknown>
): Promise<{ data: unknown; error: Error | null }> {
  let { data, error } = await client.rpc('office_update_building_plan_json', { p_payload });
  if (error && isRpcArgNameMismatch(error)) {
    ({ data, error } = await client.rpc('office_update_building_plan_json', { payload: p_payload }));
  }
  return { data, error: error as Error | null };
}

async function rpcListPlansJson(
  client: SupabaseClient,
  p_payload: { p_job_id: string }
): Promise<{ data: unknown; error: Error | null }> {
  let { data, error } = await client.rpc('office_list_building_plans_for_job_json', { p_payload });
  if (error && isRpcArgNameMismatch(error)) {
    ({ data, error } = await client.rpc('office_list_building_plans_for_job_json', { payload: p_payload }));
  }
  return { data, error: error as Error | null };
}

/** Try single-jsonb RPCs first (OnSpace / PostgREST), then legacy multi-arg RPCs. */
export async function officeCreateBuildingPlan(
  client: SupabaseClient,
  args: {
    p_job_id: string | null | undefined;
    p_quote_id: string | null | undefined;
    p_name: string;
    p_model_json: unknown;
    p_user_id: string;
  }
) {
  const p_payload = {
    p_job_id: args.p_job_id ?? null,
    p_quote_id: args.p_quote_id ?? null,
    p_name: args.p_name,
    p_model_json: args.p_model_json,
    p_user_id: args.p_user_id,
  };
  let { data, error } = await rpcCreatePlanJson(client, p_payload);
  if (error && isRpcNotInSchemaCache(error)) {
    ({ data, error } = await client.rpc('office_create_building_plan', {
      p_job_id: args.p_job_id,
      p_quote_id: args.p_quote_id ?? null,
      p_name: args.p_name,
      p_model_json: args.p_model_json,
      p_user_id: args.p_user_id,
    }));
  }
  return { data, error };
}

export async function officeUpdateBuildingPlan(
  client: SupabaseClient,
  args: {
    p_plan_id: string;
    p_model_json: unknown;
    p_name: string;
    p_user_id: string;
  }
) {
  const p_payload = {
    p_plan_id: args.p_plan_id,
    p_model_json: args.p_model_json,
    p_name: args.p_name,
    p_user_id: args.p_user_id,
  };
  let { data, error } = await rpcUpdatePlanJson(client, p_payload);
  if (error && isRpcNotInSchemaCache(error)) {
    ({ data, error } = await client.rpc('office_update_building_plan', {
      p_plan_id: args.p_plan_id,
      p_model_json: args.p_model_json,
      p_name: args.p_name,
      p_user_id: args.p_user_id,
    }));
  }
  return { data, error };
}

export async function officeListBuildingPlansForJob(client: SupabaseClient, jobId: string) {
  const p_payload = { p_job_id: jobId };
  let { data, error } = await rpcListPlansJson(client, p_payload);
  if (error && isRpcNotInSchemaCache(error)) {
    ({ data, error } = await client.rpc('office_list_building_plans_for_job', { p_job_id: jobId }));
  }
  return { data, error };
}
