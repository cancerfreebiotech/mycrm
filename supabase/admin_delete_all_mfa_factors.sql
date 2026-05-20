-- admin_delete_all_mfa_factors
-- Deletes ALL MFA factors (verified + unverified) for a given auth user.
-- Called from /api/admin/users/[id]/reset-mfa.
--
-- Why this RPC exists: service.auth.admin.mfa.listFactors() hides unverified
-- factors in some Auth versions, so the previous reset-mfa endpoint could not
-- clear half-enrolled users. This function bypasses that by deleting directly.
--
-- Security: SECURITY DEFINER + service_role-only execute grant.

CREATE OR REPLACE FUNCTION public.admin_delete_all_mfa_factors(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_all_mfa_factors(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_all_mfa_factors(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_delete_all_mfa_factors(uuid) IS
'Deletes ALL MFA factors (verified + unverified) for a user. Called from /api/admin/users/[id]/reset-mfa. Service role only.';
