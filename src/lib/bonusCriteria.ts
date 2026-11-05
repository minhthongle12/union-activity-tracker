import { supabase } from "@/lib/supabase";

export interface BonusCriterion {
  id: string;
  code: string; // e.g. "MO_HINH", "DAT_GIAI", "CAP_TW", "DANG_CAI", "KHONG_GIAN_DOC"
  name: string;
  base_points: number; // Điểm cơ sở cho mỗi lần đạt (mặc định 1.0)
  unit: string; // Đơn vị tính (ví dụ: "mô hình", "học sinh / giải thưởng", "người", "hoạt động")
  max_points?: number; // Giới hạn tối đa nếu có
  evidence_guidelines?: string; // Hướng dẫn minh chứng quy định
  sort_order: number;
  is_active: boolean;
}

// 5 Tiêu chí điểm thưởng chuẩn theo Khung tiêu chí Đội TNTP Hồ Chí Minh (từ file Excel thực tế)
export const DEFAULT_BONUS_CRITERIA: BonusCriterion[] = [
  {
    id: "bonus_mo_hinh",
    code: "MO_HINH",
    name: "Có mô hình hoặc cách làm mới, sáng tạo hiệu quả trong công tác Đội và phong trào thiếu nhi",
    base_points: 1.0,
    unit: "mô hình",
    max_points: 5.0,
    evidence_guidelines:
      "- Báo cáo kết quả mô hình sáng tạo.\n- Hình ảnh đường link bài viết phải có Logo Hội đồng Đội minh chứng rõ nội dung, thời gian, địa điểm.",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "bonus_dat_giai",
    code: "DAT_GIAI",
    name: "Có sản phẩm đạt giải từ cấp tỉnh trở lên khi tham gia các cuộc thi do Hội đồng Đội cấp trên phát động",
    base_points: 1.0,
    unit: "học sinh / giải thưởng",
    max_points: 10.0,
    evidence_guidelines:
      "- Hội đồng Đội cấp xã theo dõi.\n- Quyết định công nhận giải thưởng, giấy khen hoặc giấy chứng nhận cấp tỉnh / Trung ương.\n- Link bài viết hoặc hình ảnh minh chứng tham gia cuộc thi.\n- Lưu ý: Đơn vị có nhiều em học sinh / sản phẩm đạt giải được cộng dồn tương ứng (1 điểm cho mỗi em/sản phẩm).",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "bonus_cap_tw",
    code: "CAP_TW",
    name: "Có giáo viên hoặc học sinh được Hội đồng Đội tỉnh chọn cử tham gia hoạt động cấp Trung ương",
    base_points: 1.0,
    unit: "giáo viên / học sinh",
    max_points: 5.0,
    evidence_guidelines:
      "- Công văn triệu tập hoặc quyết định chọn cử của Hội đồng Đội tỉnh / Trung ương.\n- Báo cáo hoặc hình ảnh tham gia hoạt động cấp Trung ương.",
    sort_order: 3,
    is_active: true,
  },
  {
    id: "bonus_dang_cai",
    code: "DANG_CAI",
    name: "Đăng cai, hỗ trợ tổ chức các hoạt động của Hội đồng Đội xã",
    base_points: 1.0,
    unit: "hoạt động",
    max_points: 5.0,
    evidence_guidelines:
      "- Kế hoạch phối hợp hoặc xác nhận đăng cai / hỗ trợ cơ sở vật chất tổ chức hoạt động của Hội đồng Đội xã (ví dụ: lớp dạy bơi, ngày hội thiếu nhi, tập huấn...).",
    sort_order: 4,
    is_active: true,
  },
  {
    id: "bonus_khong_gian_doc",
    code: "KHONG_GIAN_DOC",
    name: "Phối hợp Hội đồng Đội xã xây dựng mô hình không gian đọc sách tương tác và sinh hoạt Đội",
    base_points: 1.0,
    unit: "mô hình",
    max_points: 5.0,
    evidence_guidelines:
      "- Biên bản bàn giao, hình ảnh hoặc bài viết truyền thông về không gian đọc sách tương tác và sinh hoạt Đội tại đơn vị.",
    sort_order: 5,
    is_active: true,
  },
];

const LOCAL_STORAGE_KEY = "app_bonus_criteria_catalog";

/**
 * Fetch bonus criteria from Supabase criteria_categories (prefixed with BONUS_)
 * with fallback to localStorage and default constants.
 */
export async function getBonusCriteriaList(): Promise<BonusCriterion[]> {
  try {
    const { data, error } = await supabase
      .from("criteria_categories")
      .select("*")
      .like("code", "BONUS_%")
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
      const list: BonusCriterion[] = data.map((item) => {
        let meta: any = {};
        try {
          if (item.description) {
            meta = JSON.parse(item.description);
          }
        } catch {
          meta = { evidence_guidelines: item.description };
        }

        const rawCode = (item.code || "").replace(/^BONUS_/, "");
        return {
          id: item.id,
          code: rawCode,
          name: item.name,
          base_points: Number(meta.base_points) || 1.0,
          unit: meta.unit || "lần",
          max_points: meta.max_points ? Number(meta.max_points) : undefined,
          evidence_guidelines: meta.evidence_guidelines || "",
          sort_order: item.sort_order ?? 0,
          is_active: meta.is_active !== false,
        };
      });

      // Save to localStorage as cache
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      } catch {}

      return list;
    }
  } catch (err) {
    console.warn("Could not fetch bonus criteria from Supabase:", err);
  }

  // Fallback to localStorage
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Fallback to default 5 items
  return DEFAULT_BONUS_CRITERIA;
}

/**
 * Seed or update bonus criteria into Supabase
 */
export async function saveBonusCriteriaList(criteriaList: BonusCriterion[]): Promise<void> {
  // Save to localStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(criteriaList));
  } catch {}

  // Sync to Supabase
  for (const c of criteriaList) {
    const dbCode = `BONUS_${c.code}`;
    const descPayload = JSON.stringify({
      base_points: c.base_points,
      unit: c.unit,
      max_points: c.max_points,
      evidence_guidelines: c.evidence_guidelines,
      is_active: c.is_active,
    });

    try {
      const { data: existing } = await supabase
        .from("criteria_categories")
        .select("id")
        .eq("code", dbCode)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("criteria_categories")
          .update({
            name: c.name,
            description: descPayload,
            sort_order: c.sort_order,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("criteria_categories").insert({
          code: dbCode,
          name: c.name,
          description: descPayload,
          sort_order: c.sort_order,
        });
      }
    } catch (err) {
      console.warn(`Error syncing bonus criterion ${c.code} to Supabase:`, err);
    }
  }
}

/**
 * Seed default bonus criteria if none exists
 */
export async function ensureDefaultBonusCriteria(): Promise<BonusCriterion[]> {
  const current = await getBonusCriteriaList();
  if (!current || current.length === 0) {
    await saveBonusCriteriaList(DEFAULT_BONUS_CRITERIA);
    return DEFAULT_BONUS_CRITERIA;
  }
  return current;
}
