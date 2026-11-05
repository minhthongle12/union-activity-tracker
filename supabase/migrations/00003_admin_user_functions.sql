-- ============================================================
-- UNION ACTIVITY TRACKER – MIGRATION 00003: ADMIN USER MANAGEMENT FUNCTIONS
-- HỆ THỐNG QUẢN LÝ TIÊU CHÍ & MINH CHỨNG CÔNG TÁC ĐOÀN
-- ============================================================
-- Migration: 00003_admin_user_functions.sql
-- Description: Cung cấp các hàm bảo mật (SECURITY DEFINER) cho phép
--              Quản trị viên tạo tài khoản, đặt lại mật khẩu và xoá
--              tài khoản người dùng mà không cần phơi bày Service Key.
-- ============================================================

-- ------------------------------------------------------------
-- 1. admin_create_user: Tạo tài khoản người dùng mới
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_username        TEXT,
    p_password        TEXT,
    p_display_name    TEXT,
    p_role            TEXT DEFAULT 'user',
    p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role public.user_role;
    v_norm_username TEXT;
    v_internal_email TEXT;
    v_new_user_id UUID := gen_random_uuid();
    v_role_enum public.user_role;
    v_result JSONB;
BEGIN
    -- 1. Kiểm tra quyền của người gọi (bắt buộc là admin)
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền tạo tài khoản người dùng.';
    END IF;

    -- 2. Chuẩn hoá dữ liệu đầu vào
    v_norm_username := lower(trim(p_username));
    IF v_norm_username IS NULL OR length(v_norm_username) < 3 THEN
        RAISE EXCEPTION 'Tên đăng nhập phải có ít nhất 3 ký tự.';
    END IF;

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'Mật khẩu phải có ít nhất 6 ký tự.';
    END IF;

    IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
        RAISE EXCEPTION 'Tên hiển thị không được để trống.';
    END IF;

    -- Kiểm tra vai trò
    BEGIN
        v_role_enum := p_role::public.user_role;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Vai trò không hợp lệ (chỉ chấp nhận admin hoặc user).';
    END;

    IF v_role_enum = 'user' AND p_organization_id IS NULL THEN
        RAISE EXCEPTION 'Tài khoản người dùng cơ sở bắt buộc phải thuộc về một đơn vị Đoàn.';
    END IF;

    -- 3. Kiểm tra xem username đã tồn tại chưa
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_norm_username) THEN
        RAISE EXCEPTION 'Tên đăng nhập "%" đã tồn tại trên hệ thống.', v_norm_username;
    END IF;

    v_internal_email := v_norm_username || '@union.internal';

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_internal_email) THEN
        RAISE EXCEPTION 'Email nội bộ "%" đã tồn tại trong hệ thống xác thực.', v_internal_email;
    END IF;

    -- 4. Tạo tài khoản trong auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_user_id,
        'authenticated',
        'authenticated',
        v_internal_email,
        crypt(p_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', v_norm_username, 'display_name', trim(p_display_name)),
        now(),
        now(),
        '',
        '',
        '',
        ''
    );

    -- 5. Tạo hồ sơ trong public.profiles
    INSERT INTO public.profiles (
        id,
        username,
        display_name,
        role,
        organization_id,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_new_user_id,
        v_norm_username,
        trim(p_display_name),
        v_role_enum,
        CASE WHEN v_role_enum = 'admin' THEN NULL ELSE p_organization_id END,
        TRUE,
        now(),
        now()
    );

    -- 6. Ghi nhật ký hệ thống (audit log)
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        auth.uid(),
        'CREATE_USER',
        'profiles',
        v_new_user_id,
        jsonb_build_object(
            'username', v_norm_username,
            'display_name', trim(p_display_name),
            'role', v_role_enum,
            'organization_id', p_organization_id
        )
    );

    v_result := jsonb_build_object(
        'id', v_new_user_id,
        'username', v_norm_username,
        'display_name', trim(p_display_name),
        'role', v_role_enum,
        'organization_id', p_organization_id,
        'is_active', true
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_create_user IS 'Quản trị viên tạo tài khoản người dùng mới kèm mật khẩu và phân quyền';

-- ------------------------------------------------------------
-- 2. admin_reset_password: Đặt lại mật khẩu người dùng
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_password(
    p_user_id      UUID,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role public.user_role;
    v_target_username TEXT;
BEGIN
    -- 1. Kiểm tra quyền của người gọi
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền đặt lại mật khẩu.';
    END IF;

    -- 2. Kiểm tra dữ liệu đầu vào
    IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Mật khẩu mới phải có ít nhất 6 ký tự.';
    END IF;

    SELECT username INTO v_target_username
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_target_username IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy người dùng có ID: %', p_user_id;
    END IF;

    -- 3. Cập nhật mật khẩu trong auth.users
    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;

    -- 4. Ghi audit log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        auth.uid(),
        'RESET_PASSWORD',
        'profiles',
        p_user_id,
        jsonb_build_object('username', v_target_username)
    );

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_reset_password IS 'Quản trị viên đặt lại mật khẩu tài khoản người dùng';

-- ------------------------------------------------------------
-- 3. admin_delete_user: Xoá tài khoản người dùng
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role public.user_role;
    v_target_username TEXT;
BEGIN
    -- 1. Kiểm tra quyền của người gọi
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền xoá tài khoản.';
    END IF;

    -- Không được tự xoá chính mình
    IF auth.uid() = p_user_id THEN
        RAISE EXCEPTION 'Bạn không thể tự xoá tài khoản đang đăng nhập của chính mình.';
    END IF;

    SELECT username INTO v_target_username
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_target_username IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy người dùng cần xoá.';
    END IF;

    -- 2. Xoá khỏi auth.users (CASCADE sẽ xoá profile và dữ liệu liên quan)
    DELETE FROM auth.users WHERE id = p_user_id;

    -- 3. Ghi audit log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        auth.uid(),
        'DELETE_USER',
        'profiles',
        p_user_id,
        jsonb_build_object('deleted_username', v_target_username)
    );

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_delete_user IS 'Quản trị viên xoá tài khoản người dùng khỏi hệ thống';

-- Cấp quyền thực thi cho người dùng đã đăng nhập (phân quyền chi tiết đã kiểm tra bên trong thân hàm)
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

