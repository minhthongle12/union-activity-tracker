-- ============================================================
-- SỬA LỖI & TẠO TÀI KHOẢN ADMIN
-- Copy toàn bộ nội dung file này và chạy trong Supabase SQL Editor
-- ============================================================

-- Đảm bảo có ràng buộc UNIQUE cho code trong criteria_library (nếu chưa có)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_criteria_library_code'
    ) THEN
        ALTER TABLE public.criteria_library ADD CONSTRAINT uq_criteria_library_code UNIQUE (code);
    END IF;
END;
$$;

-- 1. Cập nhật lại hàm seed_initial_data kiểm tra an toàn bằng IF NOT EXISTS
CREATE OR REPLACE FUNCTION public.seed_initial_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org1_id UUID;
    v_org2_id UUID;
    v_org3_id UUID;
    v_cat1_id UUID;
    v_cat2_id UUID;
    v_cat3_id UUID;
BEGIN
    -- 1. Tạo các đơn vị Đoàn cơ sở mẫu
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE code = 'DCS-01') THEN
        INSERT INTO public.organizations (code, name, description, contact_name, contact_phone)
        VALUES ('DCS-01', 'Đoàn phường Tân Định', 'Đoàn TNCS HCM phường Tân Định, Quận 1', 'Nguyễn Văn A', '0901234567');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE code = 'DCS-02') THEN
        INSERT INTO public.organizations (code, name, description, contact_name, contact_phone)
        VALUES ('DCS-02', 'Đoàn phường Đa Kao', 'Đoàn TNCS HCM phường Đa Kao, Quận 1', 'Trần Thị B', '0912345678');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE code = 'DCS-03') THEN
        INSERT INTO public.organizations (code, name, description, contact_name, contact_phone)
        VALUES ('DCS-03', 'Đoàn phường Bến Nghé', 'Đoàn TNCS HCM phường Bến Nghé, Quận 1', 'Lê Văn C', '0923456789');
    END IF;

    SELECT id INTO v_org1_id FROM public.organizations WHERE code = 'DCS-01' LIMIT 1;
    SELECT id INTO v_org2_id FROM public.organizations WHERE code = 'DCS-02' LIMIT 1;
    SELECT id INTO v_org3_id FROM public.organizations WHERE code = 'DCS-03' LIMIT 1;

    -- 2. Tạo nhóm tiêu chí mẫu
    IF NOT EXISTS (SELECT 1 FROM public.criteria_categories WHERE code = 'NC1') THEN
        INSERT INTO public.criteria_categories (code, name, description, sort_order)
        VALUES ('NC1', 'Nhóm 1: Công tác tổ chức', 'Các tiêu chí về công tác tổ chức Đoàn', 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_categories WHERE code = 'NC2') THEN
        INSERT INTO public.criteria_categories (code, name, description, sort_order)
        VALUES ('NC2', 'Nhóm 2: Phong trào thanh niên', 'Các tiêu chí về phong trào thanh niên', 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_categories WHERE code = 'NC3') THEN
        INSERT INTO public.criteria_categories (code, name, description, sort_order)
        VALUES ('NC3', 'Nhóm 3: Công tác tuyên truyền', 'Các tiêu chí về công tác tuyên truyền giáo dục', 3);
    END IF;

    SELECT id INTO v_cat1_id FROM public.criteria_categories WHERE code = 'NC1' LIMIT 1;
    SELECT id INTO v_cat2_id FROM public.criteria_categories WHERE code = 'NC2' LIMIT 1;
    SELECT id INTO v_cat3_id FROM public.criteria_categories WHERE code = 'NC3' LIMIT 1;

    -- 3. Tạo tiêu chí mẫu trong thư viện gốc nếu chưa có
    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '1.1') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat1_id, '1.1', 'Đại hội Đoàn các cấp', 'Tổ chức Đại hội Đoàn cơ sở đúng tiến độ, đúng quy trình', 'Đạt: 10 điểm nếu tổ chức đúng hạn, đủ quy trình. Trừ 2 điểm nếu trễ hạn.', 10.00, TRUE, TRUE, TRUE, 'Ban Tổ chức', 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '1.2') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat1_id, '1.2', 'Phát triển đoàn viên mới', 'Kết nạp đoàn viên mới theo chỉ tiêu năm', 'Đạt 100% chỉ tiêu: 8 điểm. Mỗi 10% thiếu trừ 1 điểm.', 8.00, TRUE, TRUE, FALSE, 'Ban Tổ chức', 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '1.3') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat1_id, '1.3', 'Quản lý đoàn viên', 'Cập nhật sổ đoàn viên, quản lý đoàn phí', 'Đầy đủ sổ sách: 5 điểm. Thiếu 1 loại trừ 1 điểm.', 5.00, TRUE, FALSE, FALSE, 'Ban Tổ chức', 3);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '2.1') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat2_id, '2.1', 'Chiến dịch tình nguyện hè', 'Tổ chức chiến dịch tình nguyện hè theo kế hoạch', 'Tổ chức đúng kế hoạch: 10 điểm. Mỗi hoạt động thiếu trừ 2 điểm.', 10.00, TRUE, TRUE, TRUE, 'Ban Phong trào', 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '2.2') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat2_id, '2.2', 'Ngày Chủ nhật xanh', 'Tổ chức Ngày Chủ nhật xanh theo lịch quy định', 'Đủ 4 đợt: 8 điểm. Mỗi đợt thiếu trừ 2 điểm.', 8.00, TRUE, TRUE, TRUE, 'Ban Phong trào', 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '2.3') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat2_id, '2.3', 'Hoạt động an sinh xã hội', 'Thực hiện các hoạt động an sinh xã hội tại địa phương', 'Đạt chỉ tiêu: 6 điểm. Vượt chỉ tiêu: +1 điểm.', 7.00, FALSE, TRUE, TRUE, 'Ban Phong trào', 3);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '3.1') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat3_id, '3.1', 'Tuyên truyền trên mạng xã hội', 'Đăng bài tuyên truyền trên fanpage Đoàn', 'Đủ 12 bài/năm: 6 điểm. Mỗi bài thiếu trừ 0.5 điểm.', 6.00, FALSE, FALSE, TRUE, 'Ban Tuyên giáo', 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.criteria_library WHERE code = '3.2') THEN
        INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
        VALUES (v_cat3_id, '3.2', 'Sinh hoạt chính trị', 'Tổ chức sinh hoạt chính trị tư tưởng cho đoàn viên', 'Đủ 4 buổi/năm: 5 điểm. Mỗi buổi thiếu trừ 1.25 điểm.', 5.00, TRUE, TRUE, FALSE, 'Ban Tuyên giáo', 2);
    END IF;
END;
$$;


-- 2. Tạo tài khoản Admin và nạp dữ liệu
DO $$
DECLARE
    new_admin_id UUID := gen_random_uuid();
    admin_email TEXT := 'admin@union.internal';
    admin_username TEXT := 'admin';
    admin_password TEXT := 'admin123';
BEGIN
    -- Kiểm tra nếu admin chưa có trong auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
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
            new_admin_id,
            'authenticated',
            'authenticated',
            admin_email,
            crypt(admin_password, gen_salt('bf')),
            now(),
            now(),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"username":"admin","display_name":"Quản trị viên cấp cao"}',
            now(),
            now(),
            '',
            '',
            '',
            ''
        );

        INSERT INTO public.profiles (
            id,
            username,
            display_name,
            role,
            organization_id,
            is_active
        ) VALUES (
            new_admin_id,
            admin_username,
            'Quản trị viên Hệ thống',
            'admin',
            NULL,
            TRUE
        ) ON CONFLICT (username) DO NOTHING;

        RAISE NOTICE 'Đã tạo tài khoản admin: username=admin, password=%', admin_password;
    ELSE
        RAISE NOTICE 'Tài khoản admin đã tồn tại trong auth.users.';
    END IF;

    -- Chạy nạp dữ liệu mẫu
    PERFORM public.seed_initial_data();
    RAISE NOTICE 'Nạp dữ liệu mẫu thành công!';
END;
$$;
