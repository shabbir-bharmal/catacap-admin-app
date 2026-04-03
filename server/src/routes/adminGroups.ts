import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, buildSortClause } from "../utils/softDelete.js";
import crypto from "crypto";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.resolve(process.cwd(), "server", "uploads");

const STAGE_LABELS: Record<number, string> = {
  1: "Private",
  2: "Public",
  3: "Closed - Invested",
  4: "Closed - Not Invested",
  5: "New",
  6: "Compliance Review",
  7: "Completed - Ongoing",
  8: "Vetting",
  9: "Completed - Ongoing/Private",
};

const COMPLETED_STAGES = [3, 7, 9];
const PUBLIC_STAGES = [2, 7];

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const page = params.currentPage;
    const pageSize = params.perPage;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    softDeleteFilter("g", params.isDeleted, conditions);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const groupsResult = await pool.query(
      `SELECT g.id, g.name, g.identifier, g.is_deactivated, g.is_corporate_group,
              g.is_private_group, g.featured_group, g.leaders, g.group_themes,
              g.meta_title, g.meta_description, g.deleted_at,
              g.deleted_by
       FROM groups g
       ${whereClause}`,
      values
    );

    if (groupsResult.rows.length === 0) {
      res.json({ items: [], totalCount: 0 });
      return;
    }

    const groups = groupsResult.rows;
    const groupIds = groups.map((g: any) => g.id);

    const allLeaderIds: string[] = [];
    for (const g of groups) {
      if (g.leaders) {
        try {
          const parsed = JSON.parse(g.leaders);
          for (const l of parsed) {
            if (l.UserId || l.userId) allLeaderIds.push(l.UserId || l.userId);
          }
        } catch {}
      }
    }

    let leaderNameLookup: Record<string, string> = {};
    if (allLeaderIds.length > 0) {
      const uniqueIds = [...new Set(allLeaderIds)];
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(", ");
      const leaderResult = await pool.query(
        `SELECT id, COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') as full_name FROM users WHERE id IN (${placeholders})`,
        uniqueIds
      );
      for (const row of leaderResult.rows) {
        leaderNameLookup[row.id] = row.full_name;
      }
    }

    const memberPlaceholders = groupIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
    const memberResult = await pool.query(
      `SELECT group_to_follow_id, COUNT(*) as cnt
       FROM requests
       WHERE group_to_follow_id IN (${memberPlaceholders})
         AND status = 'accepted'
         AND (is_deleted IS NULL OR is_deleted = false)
       GROUP BY group_to_follow_id`,
      groupIds
    );
    const memberCounts: Record<number, number> = {};
    for (const row of memberResult.rows) {
      memberCounts[row.group_to_follow_id] = parseInt(row.cnt);
    }

    const cgPlaceholders = groupIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
    const cgResult = await pool.query(
      `SELECT cg.groups_id, c.id as campaign_id, c.is_active, c.stage
       FROM campaign_groups cg
       JOIN campaigns c ON cg.campaigns_id = c.id
       WHERE cg.groups_id IN (${cgPlaceholders})`,
      groupIds
    );

    const campaignsByGroup: Record<number, any[]> = {};
    for (const row of cgResult.rows) {
      if (!campaignsByGroup[row.groups_id]) campaignsByGroup[row.groups_id] = [];
      campaignsByGroup[row.groups_id].push(row);
    }

    let deletedByLookup: Record<string, string> = {};
    const deletedByIds = groups.filter((g: any) => g.deleted_by).map((g: any) => g.deleted_by);
    if (deletedByIds.length > 0) {
      const uniqueDeletedIds = [...new Set(deletedByIds)] as string[];
      const dPlaceholders = uniqueDeletedIds.map((_, i) => `$${i + 1}`).join(", ");
      const dResult = await pool.query(
        `SELECT id, COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') as full_name FROM users WHERE id IN (${dPlaceholders})`,
        uniqueDeletedIds
      );
      for (const row of dResult.rows) {
        deletedByLookup[row.id] = row.full_name;
      }
    }

    let result = groups.map((g: any) => {
      let leaderNames: string[] = [];
      if (g.leaders) {
        try {
          const parsed = JSON.parse(g.leaders);
          leaderNames = parsed
            .map((l: any) => {
              const uid = l.UserId || l.userId;
              return uid && leaderNameLookup[uid] ? leaderNameLookup[uid] : null;
            })
            .filter(Boolean);
        } catch {}
      }

      const campaigns = campaignsByGroup[g.id] || [];
      const activeCampaigns = campaigns.filter((c: any) => c.is_active === true);
      const completedCampaigns = campaigns.filter((c: any) => COMPLETED_STAGES.includes(c.stage));
      const allCampaignIds = new Set([
        ...activeCampaigns.map((c: any) => c.campaign_id),
        ...completedCampaigns.map((c: any) => c.campaign_id),
      ]);

      return {
        id: g.id,
        name: g.name,
        identifier: g.identifier,
        isDeactivated: g.is_deactivated || false,
        isCorporateGroup: g.is_corporate_group || false,
        isPrivateGroup: g.is_private_group || false,
        featuredGroup: g.featured_group || false,
        leader: leaderNames.join(", "),
        member: memberCounts[g.id] || 0,
        groupThemes: g.group_themes,
        investment: allCampaignIds.size,
        metaTitle: g.meta_title,
        metaDescription: g.meta_description,
        deletedAt: g.deleted_at,
        deletedBy: g.deleted_by ? deletedByLookup[g.deleted_by] || null : null,
      };
    });

    const searchValue = params.searchValue?.trim().toLowerCase();
    if (searchValue) {
      result = result.filter(
        (u: any) =>
          (u.name || "").toLowerCase().includes(searchValue) ||
          (u.leader || "").toLowerCase().includes(searchValue)
      );
    }

    const totalCount = result.length;

    const sortField = params.sortField?.toLowerCase();
    const sortFn = (a: any, b: any): number => {
      let valA: any, valB: any;
      switch (sortField) {
        case "groupname":
          valA = (a.name || "").toLowerCase();
          valB = (b.name || "").toLowerCase();
          break;
        case "membercount":
          valA = a.member;
          valB = b.member;
          break;
        case "investmentcount":
          valA = a.investment;
          valB = b.investment;
          break;
        case "status":
          valA = a.isPrivateGroup ? 1 : 0;
          valB = b.isPrivateGroup ? 1 : 0;
          break;
        case "active":
          valA = a.isDeactivated ? 1 : 0;
          valB = b.isDeactivated ? 1 : 0;
          break;
        case "featuredgroup":
          valA = a.featuredGroup ? 1 : 0;
          valB = b.featuredGroup ? 1 : 0;
          break;
        case "corporategroup":
          valA = a.isCorporateGroup ? 1 : 0;
          valB = b.isCorporateGroup ? 1 : 0;
          if (isAsc) return valB - valA;
          return valA - valB;
        default:
          valA = (a.name || "").toLowerCase();
          valB = (b.name || "").toLowerCase();
          break;
      }
      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    };

    result.sort(sortFn);

    const items = result.slice((page - 1) * pageSize, page * pageSize);
    res.json({ items, totalCount });
  } catch (err) {
    console.error("Get admin groups error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/export", async (req: Request, res: Response) => {
  try {
    const groupsResult = await pool.query(
      `SELECT g.id, g.name, g.identifier, g.is_deactivated, g.is_corporate_group,
              g.is_private_group, g.featured_group, g.leaders, g.group_themes
       FROM groups g
       ORDER BY g.id DESC`
    );

    const groups = groupsResult.rows;
    const groupIds = groups.map((g: any) => g.id);

    const allLeaderIds: string[] = [];
    for (const g of groups) {
      if (g.leaders) {
        try {
          const parsed = JSON.parse(g.leaders);
          for (const l of parsed) {
            if (l.UserId || l.userId) allLeaderIds.push(l.UserId || l.userId);
          }
        } catch {}
      }
    }

    let leaderNameLookup: Record<string, string> = {};
    if (allLeaderIds.length > 0) {
      const uniqueIds = [...new Set(allLeaderIds)];
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(", ");
      const leaderResult = await pool.query(
        `SELECT id, COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') as full_name FROM users WHERE id IN (${placeholders})`,
        uniqueIds
      );
      for (const row of leaderResult.rows) {
        leaderNameLookup[row.id] = row.full_name;
      }
    }

    let memberCounts: Record<number, number> = {};
    if (groupIds.length > 0) {
      const memberPlaceholders = groupIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const memberResult = await pool.query(
        `SELECT group_to_follow_id, COUNT(*) as cnt
         FROM requests
         WHERE group_to_follow_id IN (${memberPlaceholders})
           AND status = 'accepted'
           AND (is_deleted IS NULL OR is_deleted = false)
         GROUP BY group_to_follow_id`,
        groupIds
      );
      for (const row of memberResult.rows) {
        memberCounts[row.group_to_follow_id] = parseInt(row.cnt);
      }
    }

    let campaignsByGroup: Record<number, any[]> = {};
    if (groupIds.length > 0) {
      const cgPlaceholders = groupIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const cgResult = await pool.query(
        `SELECT cg.groups_id, c.id as campaign_id, c.is_active, c.stage
         FROM campaign_groups cg
         JOIN campaigns c ON cg.campaigns_id = c.id
         WHERE cg.groups_id IN (${cgPlaceholders})`,
        groupIds
      );
      for (const row of cgResult.rows) {
        if (!campaignsByGroup[row.groups_id]) campaignsByGroup[row.groups_id] = [];
        campaignsByGroup[row.groups_id].push(row);
      }
    }

    const themeIds: number[] = [];
    for (const g of groups) {
      if (g.group_themes) {
        const ids = g.group_themes.split(",").map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));
        themeIds.push(...ids);
      }
    }

    let themeLookup: Record<number, string> = {};
    if (themeIds.length > 0) {
      const uniqueThemeIds = [...new Set(themeIds)];
      const tPlaceholders = uniqueThemeIds.map((_, i) => `$${i + 1}`).join(", ");
      const themeResult = await pool.query(
        `SELECT id, name FROM themes WHERE id IN (${tPlaceholders})`,
        uniqueThemeIds
      );
      for (const row of themeResult.rows) {
        themeLookup[row.id] = row.name;
      }
    }

    const requestOrigin = req.headers.origin || "";

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("InvestmentNotes");

    const headers = ["Group Name", "Group URL", "Group Leader(s)", "Member Count", "Investment Count", "Status", "Active", "Corporate Group", "Featured Group", "Themes"];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });

    for (const g of groups) {
      let leaderNames: string[] = [];
      if (g.leaders) {
        try {
          const parsed = JSON.parse(g.leaders);
          leaderNames = parsed
            .map((l: any) => {
              const uid = l.UserId || l.userId;
              return uid && leaderNameLookup[uid] ? leaderNameLookup[uid] : null;
            })
            .filter(Boolean);
        } catch {}
      }

      const campaigns = campaignsByGroup[g.id] || [];
      const activeCampaigns = campaigns.filter((c: any) => c.is_active === true);
      const completedCampaigns = campaigns.filter((c: any) => COMPLETED_STAGES.includes(c.stage));
      const allCampaignIds = new Set([
        ...activeCampaigns.map((c: any) => c.campaign_id),
        ...completedCampaigns.map((c: any) => c.campaign_id),
      ]);

      const groupThemeNames: string[] = [];
      if (g.group_themes) {
        const ids = g.group_themes.split(",").map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));
        for (const id of ids) {
          if (themeLookup[id]) groupThemeNames.push(themeLookup[id]);
        }
      }

      const url = g.identifier ? `${requestOrigin}/group/${g.identifier}` : `${requestOrigin}/group/${g.id}`;

      worksheet.addRow([
        g.name || "",
        url,
        leaderNames.join(", "),
        memberCounts[g.id] || 0,
        allCampaignIds.size,
        g.is_private_group ? "Private" : "Public",
        g.is_deactivated ? "False" : "True",
        g.is_corporate_group ? "True" : "",
        g.featured_group ? "True" : "",
        groupThemeNames.join(", "),
      ]);
    }

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 60);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Groups.xlsx"');
    res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (err) {
    console.error("Export groups error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/leaders-and-champions", async (req: Request, res: Response) => {
  try {
    const userName = ((req.query.userName as string) || "").trim().toLowerCase();
    const groupId = parseInt((req.query.groupId as string) || "0", 10);
    const type = ((req.query.type as string) || "").trim().toLowerCase();

    if (!userName) {
      res.json({ success: false, message: "Username required." });
      return;
    }

    const ownerResult = await pool.query(
      `SELECT owner_id FROM groups WHERE id = $1`,
      [groupId]
    );
    const groupOwnerId = ownerResult.rows[0]?.owner_id;

    if (type === "leaders") {
      const groupAdminRoleResult = await pool.query(
        `SELECT id FROM roles WHERE name = 'GroupAdmin'`
      );
      const groupAdminRoleId = groupAdminRoleResult.rows[0]?.id;

      if (!groupAdminRoleId) {
        res.json([]);
        return;
      }

      const result = await pool.query(
        `SELECT u.id, COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as "fullName", u.picture_file_name as "pictureFileName"
         FROM users u
         WHERE u.is_active = true
           AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = $1)
           AND ($2 IS NULL OR u.id != $2)
           AND LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE $3`,
        [groupAdminRoleId, groupOwnerId || null, `%${userName}%`]
      );
      res.json(result.rows);
    } else if (type === "champions") {
      const result = await pool.query(
        `SELECT DISTINCT u.id, COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as "fullName",
                u.picture_file_name as "pictureFileName", u.date_created as "dateCreated"
         FROM requests r
         JOIN users u ON r.request_owner_id = u.id
         WHERE r.group_to_follow_id = $1
           AND r.status = 'accepted'
           AND u.is_active = true
           AND ($2 IS NULL OR u.id != $2)
           AND LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE $3`,
        [groupId, groupOwnerId || null, `%${userName}%`]
      );
      res.json(result.rows);
    } else {
      res.json({ success: false, message: "Invalid type specified. Please use 'leaders' or 'champions'." });
    }
  } catch (err) {
    console.error("Search leaders/champions error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/leaders-and-champions", async (req: Request, res: Response) => {
  try {
    const dto = req.body;
    const groupId = parseInt((req.query.groupId as string) || "0", 10);
    const type = ((req.query.type as string) || "").trim().toLowerCase();

    if (!dto) {
      res.json({ success: false, message: "Invalid request payload." });
      return;
    }

    if (!type) {
      res.json({ success: false, message: "Type is required." });
      return;
    }

    const groupResult = await pool.query(
      `SELECT id, leaders, champions_and_catalysts, owner_id FROM groups WHERE id = $1`,
      [groupId]
    );
    if (groupResult.rows.length === 0) {
      res.json({ success: false, message: "Group not found." });
      return;
    }

    const group = groupResult.rows[0];

    if (type === "leaders") {
      let leaders: any[] = [];
      if (group.leaders) {
        try { leaders = JSON.parse(group.leaders); } catch {}
      }

      const existing = leaders.find((x: any) => (x.UserId || x.userId) === dto.UserId);
      if (existing) {
        existing.RoleAndTitle = dto.RoleAndTitle;
        existing.Description = dto.Description;
        existing.LinkedInUrl = dto.LinkedInUrl;
      } else {
        leaders.push({
          UserId: dto.UserId,
          RoleAndTitle: dto.RoleAndTitle,
          Description: dto.Description,
          LinkedInUrl: dto.LinkedInUrl,
        });

        const leaderGroupExists = await pool.query(
          `SELECT id FROM leader_groups WHERE group_id = $1 AND user_id = $2 AND (is_deleted IS NULL OR is_deleted = false)`,
          [groupId, dto.UserId]
        );
        if (leaderGroupExists.rows.length === 0) {
          await pool.query(
            `INSERT INTO leader_groups (user_id, group_id) VALUES ($1, $2)`,
            [dto.UserId, groupId]
          );
        }
      }

      await pool.query(`UPDATE groups SET leaders = $1 WHERE id = $2`, [JSON.stringify(leaders), groupId]);

      const enriched = await enrichMembers(leaders, group.owner_id);
      res.json(enriched);
    } else if (type === "champions") {
      let champions: any[] = [];
      if (group.champions_and_catalysts) {
        try { champions = JSON.parse(group.champions_and_catalysts); } catch {}
      }

      const existing = champions.find((x: any) => (x.UserId || x.userId) === dto.UserId);
      if (existing) {
        existing.RoleAndTitle = dto.RoleAndTitle;
        existing.Description = dto.Description;
        existing.MemberSince = dto.MemberSince;
      } else {
        champions.push({
          UserId: dto.UserId,
          RoleAndTitle: dto.RoleAndTitle,
          Description: dto.Description,
          MemberSince: dto.MemberSince,
        });
      }

      await pool.query(`UPDATE groups SET champions_and_catalysts = $1 WHERE id = $2`, [JSON.stringify(champions), groupId]);

      const enriched = await enrichMembers(champions);
      res.json(enriched);
    } else {
      res.status(400).json({ success: false, message: "Invalid type." });
    }
  } catch (err) {
    console.error("Save leaders/champions error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/leaders-and-champions", async (req: Request, res: Response) => {
  try {
    const groupId = parseInt((req.query.groupId as string) || "0", 10);
    const userId = (req.query.userId as string) || "";
    const type = ((req.query.type as string) || "").trim().toLowerCase();

    if (!userId) {
      res.json({ success: false, message: "User Id is required." });
      return;
    }

    if (!type) {
      res.json({ success: false, message: "Type is required." });
      return;
    }

    const groupResult = await pool.query(
      `SELECT id, leaders, champions_and_catalysts, owner_id FROM groups WHERE id = $1`,
      [groupId]
    );
    if (groupResult.rows.length === 0) {
      res.json({ success: false, message: "Group not found." });
      return;
    }

    const group = groupResult.rows[0];

    if (type === "leaders") {
      let leaders: any[] = [];
      if (group.leaders) {
        try { leaders = JSON.parse(group.leaders); } catch {}
      }

      leaders = leaders.filter((x: any) => (x.UserId || x.userId) !== userId);

      await pool.query(
        `DELETE FROM leader_groups WHERE group_id = $1 AND user_id = $2 AND ($3 IS NULL OR user_id != $3)`,
        [groupId, userId, group.owner_id]
      );

      await pool.query(`UPDATE groups SET leaders = $1 WHERE id = $2`, [JSON.stringify(leaders), groupId]);

      const enriched = await enrichMembers(leaders);
      res.json(enriched);
    } else if (type === "champions") {
      let champions: any[] = [];
      if (group.champions_and_catalysts) {
        try { champions = JSON.parse(group.champions_and_catalysts); } catch {}
      }

      champions = champions.filter((x: any) => (x.UserId || x.userId) !== userId);

      await pool.query(`UPDATE groups SET champions_and_catalysts = $1 WHERE id = $2`, [JSON.stringify(champions), groupId]);

      const enriched = await enrichMembers(champions);
      res.json(enriched);
    } else {
      res.status(400).json({ success: false, message: "Invalid type." });
    }
  } catch (err) {
    console.error("Delete leaders/champions error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:groupId/leaders", async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(String(req.params.groupId), 10);
    const groupResult = await pool.query(
      `SELECT id, leaders, owner_id FROM groups WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      res.json({ success: false, message: "Group not found." });
      return;
    }

    const group = groupResult.rows[0];
    const leaders = await processGroupMembers(group.leaders, group.owner_id);
    res.json({ leaders });
  } catch (err) {
    console.error("Get group leaders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:groupId/champions", async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(String(req.params.groupId), 10);
    const groupResult = await pool.query(
      `SELECT id, champions_and_catalysts FROM groups WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      res.json({ success: false, message: "Group not found." });
      return;
    }

    const group = groupResult.rows[0];
    const champions = await processGroupMembers(group.champions_and_catalysts);
    res.json({ champions });
  } catch (err) {
    console.error("Get group champions error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/settings", async (req: Request, res: Response) => {
  try {
    const id = parseInt((req.query.id as string) || "0", 10);
    const featuredGroup = req.query.featuredGroup as string | undefined;
    const isCorporateGroup = req.query.isCorporateGroup as string | undefined;

    if (id <= 0) {
      res.json({ success: false, message: "Group id is required." });
      return;
    }

    const groupResult = await pool.query(`SELECT id FROM groups WHERE id = $1`, [id]);
    if (groupResult.rows.length === 0) {
      res.json({ success: false, message: "Group not found." });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (featuredGroup !== undefined && featuredGroup !== "undefined") {
      updates.push(`featured_group = $${paramIdx++}`);
      values.push(featuredGroup === "true");
    }

    if (isCorporateGroup !== undefined && isCorporateGroup !== "undefined") {
      updates.push(`is_corporate_group = $${paramIdx++}`);
      values.push(isCorporateGroup === "true");
    }

    if (updates.length === 0) {
      res.status(200).send();
      return;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE groups SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
      values
    );

    if (result.rowCount && result.rowCount > 0) {
      res.status(200).send();
    } else {
      res.status(400).send();
    }
  } catch (err) {
    console.error("Update group settings error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:identifier", async (req: Request, res: Response) => {
  try {
    const identifier = String(req.params.identifier);

    if (identifier === "export" || identifier === "leaders-and-champions" || identifier === "settings") {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const isGroupId = /^\d+$/.test(identifier);
    const groupId = isGroupId ? parseInt(identifier, 10) : null;

    let groupResult = await pool.query(
      `SELECT g.*, u.first_name as owner_first_name, u.last_name as owner_last_name, u.id as owner_user_id
       FROM groups g
       LEFT JOIN users u ON g.owner_id = u.id
       WHERE g.identifier = $1 ${isGroupId ? "OR g.id = $2" : ""}`,
      isGroupId ? [identifier, groupId] : [identifier]
    );

    if (groupResult.rows.length === 0) {
      const slugResult = await pool.query(
        `SELECT reference_id FROM slugs WHERE type = 1 AND value = $1`,
        [identifier]
      );
      if (slugResult.rows.length > 0 && slugResult.rows[0].reference_id) {
        groupResult = await pool.query(
          `SELECT g.*, u.first_name as owner_first_name, u.last_name as owner_last_name, u.id as owner_user_id
           FROM groups g
           LEFT JOIN users u ON g.owner_id = u.id
           WHERE g.id = $1`,
          [slugResult.rows[0].reference_id]
        );
      }
    }

    if (groupResult.rows.length === 0) {
      res.status(404).json({ message: "Group not found" });
      return;
    }

    const group = groupResult.rows[0];

    const leaders = await processGroupMembers(group.leaders, group.owner_user_id);
    const champions = await processGroupMembers(group.champions_and_catalysts);

    const cgResult = await pool.query(
      `SELECT c.id, c.name, c.image_file_name, c.stage, c.is_active
       FROM campaign_groups cg
       JOIN campaigns c ON cg.campaigns_id = c.id
       WHERE cg.groups_id = $1`,
      [group.id]
    );

    const campaigns = cgResult.rows;
    const activeCampaigns = campaigns.filter((c: any) => c.is_active === true);
    const completedCampaigns = campaigns.filter((c: any) => COMPLETED_STAGES.includes(c.stage));

    let currentBalance: number | null = null;
    if (group.original_balance != null) {
      const allocResult = await pool.query(
        `SELECT COALESCE(SUM(balance), 0) as total FROM group_account_balances WHERE group_id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
        [group.id]
      );
      const allocatedTotal = parseFloat(allocResult.rows[0].total) || 0;

      const investedResult = await pool.query(
        `SELECT COALESCE(SUM(old_value - new_value), 0) as total
         FROM account_balance_change_logs
         WHERE group_id = $1
           AND investment_name IS NOT NULL
           AND (transaction_status IS NULL OR transaction_status != 'Rejected')
           AND (is_deleted IS NULL OR is_deleted = false)`,
        [group.id]
      );
      const investedTotal = parseFloat(investedResult.rows[0].total) || 0;

      currentBalance = parseFloat(group.original_balance) - (allocatedTotal + investedTotal);
    }

    const groupCampaignIds = campaigns.map((c: any) => c.id);

    let totalMembers = 0;
    let totalInvestmentAmount = 0;

    if (groupCampaignIds.length > 0) {
      const placeholders = groupCampaignIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const totalMembersResult = await pool.query(
        `SELECT COUNT(DISTINCT r.user_email) as total
         FROM recommendations r
         WHERE r.campaign_id IN (${placeholders})
           AND (LOWER(r.status) = 'approved' OR LOWER(r.status) = 'pending')
           AND r.amount > 0
           AND r.user_email IS NOT NULL AND r.user_email != ''`,
        groupCampaignIds
      );
      totalMembers = parseInt(totalMembersResult.rows[0]?.total) || 0;

      const totalInvestmentResult = await pool.query(
        `SELECT COALESCE(SUM(r.amount), 0) as total
         FROM recommendations r
         WHERE r.campaign_id IN (${placeholders})
           AND (LOWER(r.status) = 'approved' OR LOWER(r.status) = 'pending')
           AND r.amount > 0
           AND r.user_email IS NOT NULL AND r.user_email != ''`,
        groupCampaignIds
      );
      totalInvestmentAmount = parseFloat(totalInvestmentResult.rows[0]?.total) || 0;
    }

    const userRoleResult = await pool.query(`SELECT id FROM roles WHERE name = 'User'`);
    const userRoleId = userRoleResult.rows[0]?.id;
    let totalUsersAccountBalance = 0;
    if (userRoleId) {
      const balResult = await pool.query(
        `SELECT COALESCE(SUM(u.account_balance), 0) as total
         FROM users u
         WHERE EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = $1)`,
        [userRoleId]
      );
      totalUsersAccountBalance = parseFloat(balResult.rows[0]?.total) || 0;
    }

    const completedInvResult = await pool.query(
      `SELECT COUNT(*) as total FROM completed_investments_details`
    ).catch(() => ({ rows: [{ total: 0 }] }));
    const completedInvestments = parseInt(completedInvResult.rows[0]?.total) || 0;

    const groupData = {
      id: group.id,
      name: group.name,
      identifier: group.identifier,
      description: group.description,
      website: group.website,
      didYouKnow: group.did_you_know,
      videoLink: group.video_link,
      ourWhyDescription: group.our_why_description,
      isApprouveRequired: group.is_approuve_required,
      isPrivateGroup: group.is_private_group,
      isDeactivated: group.is_deactivated,
      pictureFileName: group.picture_file_name,
      backgroundPictureFileName: group.background_picture_file_name,
      originalBalance: group.original_balance ? parseFloat(group.original_balance) : null,
      currentBalance,
      isCorporateGroup: group.is_corporate_group,
      featuredGroup: group.featured_group,
      groupThemes: group.group_themes,
      metaTitle: group.meta_title,
      metaDescription: group.meta_description,
      isOwner: false,
      isFollowing: false,
      isFollowPending: false,
      isLeader: false,
      activeCampaigns: activeCampaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        imageFileName: c.image_file_name,
        stage: STAGE_LABELS[c.stage] || String(c.stage),
      })),
      completedCampaigns: completedCampaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        imageFileName: c.image_file_name,
        stage: STAGE_LABELS[c.stage] || String(c.stage),
      })),
      campaigns: campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        imageFileName: c.image_file_name,
        stage: c.stage,
      })),
    };

    res.json({
      group: groupData,
      leaders: leaders || [],
      champions: champions || [],
      totalMembers,
      totalInvestedByMembers: Math.round(totalInvestmentAmount + totalUsersAccountBalance),
      completedInvestments,
    });
  } catch (err) {
    console.error("Get group by identifier error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const groupData = req.body;

    if (groupData.identifier) {
      const normalized = groupData.identifier.trim().toLowerCase();

      const existsInGroup = await pool.query(
        `SELECT id FROM groups WHERE LOWER(TRIM(identifier)) = $1 AND id != $2`,
        [normalized, id]
      );
      if (existsInGroup.rows.length > 0) {
        res.status(400).json({ message: "Identifier already exists." });
        return;
      }

      const existsInSlug = await pool.query(
        `SELECT id FROM slugs WHERE type = 1 AND value = $1 AND reference_id != $2`,
        [normalized, id]
      );
      if (existsInSlug.rows.length > 0) {
        res.status(400).json({ message: "Identifier already exists." });
        return;
      }
    }

    const existingGroup = await pool.query(`SELECT * FROM groups WHERE id = $1`, [id]);
    if (existingGroup.rows.length === 0) {
      res.status(400).json({ message: "Group not found." });
      return;
    }

    const existing = existingGroup.rows[0];

    if (existing.identifier && existing.identifier.trim()) {
      await pool.query(
        `INSERT INTO slugs (reference_id, type, value, created_at) VALUES ($1, 1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [id, existing.identifier]
      );
    }

    let pictureFileName = existing.picture_file_name;
    if (groupData.pictureFileName !== undefined && groupData.pictureFileName !== existing.picture_file_name) {
      pictureFileName = handleBase64Image(groupData.pictureFileName, existing.picture_file_name);
    }

    let backgroundPictureFileName = existing.background_picture_file_name;
    if (groupData.backgroundPictureFileName !== undefined && groupData.backgroundPictureFileName !== existing.background_picture_file_name) {
      backgroundPictureFileName = handleBase64Image(groupData.backgroundPictureFileName, existing.background_picture_file_name);
    }

    await pool.query(
      `UPDATE groups SET
        name = $1,
        website = $2,
        description = $3,
        our_why_description = $4,
        did_you_know = $5,
        video_link = $6,
        is_approuve_required = $7,
        is_deactivated = $8,
        identifier = $9,
        is_corporate_group = $10,
        is_private_group = $11,
        group_themes = $12,
        meta_title = $13,
        meta_description = $14,
        picture_file_name = $15,
        background_picture_file_name = $16,
        modified_at = NOW()
      WHERE id = $17`,
      [
        groupData.name ?? existing.name,
        groupData.website ?? existing.website,
        groupData.description ?? existing.description,
        groupData.ourWhyDescription ?? existing.our_why_description,
        groupData.didYouKnow ?? existing.did_you_know,
        groupData.videoLink ?? existing.video_link,
        groupData.isApprouveRequired ?? existing.is_approuve_required,
        groupData.isDeactivated ?? existing.is_deactivated,
        groupData.identifier ?? existing.identifier,
        groupData.isCorporateGroup ?? existing.is_corporate_group,
        groupData.isPrivateGroup ?? existing.is_private_group,
        groupData.groupThemes ?? existing.group_themes,
        groupData.metaTitle ?? existing.meta_title,
        groupData.metaDescription ?? existing.meta_description,
        pictureFileName,
        backgroundPictureFileName,
        id,
      ]
    );

    res.status(200).send();
  } catch (err) {
    console.error("Update group error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    if (!adminUser?.isSuperAdmin) {
      res.status(403).json({ message: "Only SuperAdmin can delete groups." });
      return;
    }

    const id = parseInt(String(req.params.id), 10);

    const entity = await pool.query(`SELECT id FROM groups WHERE id = $1`, [id]);
    if (entity.rows.length === 0) {
      res.json({ success: false, message: "Group not found." });
      return;
    }

    const deletedBy = adminUser?.id || null;

    await pool.query(
      `UPDATE groups SET is_deleted = true, deleted_at = NOW(), deleted_by = $2 WHERE id = $1`,
      [id, deletedBy]
    );

    res.json({ success: true, message: "Group deleted successfully." });
  } catch (err) {
    console.error("Delete group error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/users", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const searchValue = ((req.query.searchValue as string) || (req.query.SearchValue as string) || "").trim().toLowerCase();
    const sortField = ((req.query.sortField as string) || (req.query.SortField as string) || "").toLowerCase();
    const sortDirection = ((req.query.sortDirection as string) || (req.query.SortDirection as string) || "").toLowerCase();
    const isAsc = sortDirection === "asc";

    let searchCondition = "";
    const values: any[] = [id];
    let paramIdx = 2;

    if (searchValue) {
      searchCondition = `AND (LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx})`;
      values.push(`%${searchValue}%`);
      paramIdx++;
    }

    let orderClause: string;
    switch (sortField) {
      case "fullname":
        orderClause = `u.first_name ${isAsc ? "ASC" : "DESC"}, u.last_name ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "datecreated":
        orderClause = `u.date_created ${isAsc ? "ASC" : "DESC"}`;
        break;
      default:
        orderClause = `u.first_name ASC, u.last_name ASC`;
    }

    const result = await pool.query(
      `SELECT DISTINCT u.id, COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as "fullName",
              u.user_name as "userName", u.email, u.date_created as "dateCreated",
              gab.id as gab_id, gab.balance as gab_balance
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       JOIN requests req ON req.request_owner_id = u.id
       LEFT JOIN group_account_balances gab ON gab.user_id = u.id AND gab.group_id = $1
         AND (gab.is_deleted IS NULL OR gab.is_deleted = false)
       WHERE r.name = 'User'
         AND req.group_to_follow_id = $1
         AND req.status = 'accepted'
         AND (req.is_deleted IS NULL OR req.is_deleted = false)
         ${searchCondition}
       ORDER BY ${orderClause}`,
      values
    );

    const users = result.rows.map((row: any) => ({
      id: row.id,
      fullName: row.fullName,
      userName: row.userName,
      email: row.email,
      dateCreated: row.dateCreated,
      groupAccountBalance: row.gab_id
        ? { id: row.gab_id, balance: parseFloat(row.gab_balance) || 0 }
        : null,
    }));

    res.json(users);
  } catch (err) {
    console.error("Get group users error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/transaction-history/export", async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(String(req.params.id), 10);

    const result = await pool.query(
      `SELECT user_name, change_date, investment_name, payment_type, old_value, new_value, zip_code, comment
       FROM account_balance_change_logs
       WHERE group_id = $1
       ORDER BY id DESC`,
      [groupId]
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("AccountBalanceHistory");

    const headers = ["UserName", "ChangeDate", "InvestmentName", "PaymentType", "OldValue", "NewValue", "ZipCode", "Comment"];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => { cell.font = { bold: true }; });

    for (const row of result.rows) {
      const changeDate = row.change_date
        ? new Date(row.change_date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
        : "";

      const dataRow = worksheet.addRow([
        row.user_name || "",
        changeDate,
        row.investment_name || "",
        row.payment_type || "",
        row.old_value != null ? parseFloat(row.old_value) : 0,
        row.new_value != null ? parseFloat(row.new_value) : 0,
        row.zip_code || "",
        row.comment || "",
      ]);

      dataRow.getCell(5).numFmt = "$#,##0.00";
      dataRow.getCell(6).numFmt = "$#,##0.00";
    }

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 10;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="AccountBalanceHistory.xlsx"');
    res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (err) {
    console.error("Export group transaction history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/transaction-history", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const sortField = ((req.query.sortField as string) || (req.query.SortField as string) || "").toLowerCase();
    const sortDirection = ((req.query.sortDirection as string) || (req.query.SortDirection as string) || "").toLowerCase();
    const isAsc = sortDirection === "asc";

    let orderClause: string;
    switch (sortField) {
      case "changedate":
        orderClause = `change_date ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "investmentname":
        orderClause = `investment_name ${isAsc ? "ASC" : "DESC"}`;
        break;
      default:
        orderClause = `change_date DESC`;
    }

    const result = await pool.query(
      `SELECT id, user_name as "userName", change_date as "changeDate",
              old_value as "oldValue", new_value as "newValue", investment_name as "investmentName"
       FROM account_balance_change_logs
       WHERE group_id = $1
       ORDER BY ${orderClause}`,
      [id]
    );

    const items = result.rows.map((row: any) => ({
      id: row.id,
      userName: row.userName,
      changeDate: row.changeDate,
      oldValue: row.oldValue != null ? parseFloat(row.oldValue) : null,
      newValue: row.newValue != null ? parseFloat(row.newValue) : null,
      investmentName: row.investmentName,
    }));

    res.json(items);
  } catch (err) {
    console.error("Get group transaction history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/:id/transaction-history", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const email = (req.query.email as string) || "";
    const accountBalance = parseFloat((req.query.accountBalance as string) || "0");
    const comment = (req.query.comment as string) || "";

    if (!email) {
      res.json({ success: false, message: "User email required." });
      return;
    }

    const groupResult = await pool.query(`SELECT id, original_balance FROM groups WHERE id = $1`, [id]);
    if (groupResult.rows.length === 0) {
      res.json({ success: false, message: "Group not found." });
      return;
    }
    const group = groupResult.rows[0];

    const allocResult = await pool.query(
      `SELECT COALESCE(SUM(balance), 0) as total FROM group_account_balances WHERE group_id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );
    const allocatedTotal = parseFloat(allocResult.rows[0].total) || 0;

    const investedResult = await pool.query(
      `SELECT COALESCE(SUM(old_value - new_value), 0) as total
       FROM account_balance_change_logs
       WHERE group_id = $1
         AND investment_name IS NOT NULL
         AND (transaction_status IS NULL OR transaction_status != 'Rejected')
         AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );
    const investedTotal = parseFloat(investedResult.rows[0].total) || 0;

    let currentBal = group.original_balance ? parseFloat(group.original_balance) : 0;
    if (currentBal !== 0) {
      currentBal = currentBal - (allocatedTotal + investedTotal);
    }

    if (currentBal - accountBalance < 0) {
      res.json({ success: false, message: "Group current balance value can't be less than 0." });
      return;
    }

    let groupBalance = await pool.query(
      `SELECT gab.id, gab.balance, gab.user_id, u.user_name, u.id as uid
       FROM group_account_balances gab
       JOIN users u ON gab.user_id = u.id
       WHERE u.email = $1 AND gab.group_id = $2
         AND (gab.is_deleted IS NULL OR gab.is_deleted = false)`,
      [email, id]
    );

    const userResult = await pool.query(`SELECT id, user_name FROM users WHERE email = $1`, [email]);
    if (userResult.rows.length === 0) {
      res.json({ success: false, message: "User not found." });
      return;
    }
    const user = userResult.rows[0];

    if (groupBalance.rows.length === 0) {
      await pool.query(
        `INSERT INTO group_account_balances (user_id, group_id, balance) VALUES ($1, $2, 0)`,
        [user.id, id]
      );
      groupBalance = await pool.query(
        `SELECT id, balance, user_id FROM group_account_balances WHERE user_id = $1 AND group_id = $2`,
        [user.id, id]
      );
    }

    const currentGroupBalance = parseFloat(groupBalance.rows[0].balance) || 0;

    if (currentGroupBalance + accountBalance < 0) {
      res.json({ success: false, message: "Insufficient allocated fund." });
      return;
    }

    const adminUser = (req as any).user;
    const isAdmin = adminUser?.role?.toLowerCase() === "admin" || adminUser?.role?.toLowerCase() === "superadmin" || adminUser?.isSuperAdmin;
    const adminName = isAdmin
      ? `admin user: ${(adminUser.name || adminUser.email || "admin").trim().toLowerCase()}`
      : `group leader: ${(adminUser?.name || adminUser?.email || "user").trim().toLowerCase()}`;

    await pool.query(
      `INSERT INTO user_investments (user_id, payment_type, log_trigger_e_d)
       VALUES ($1, $2, false)`,
      [user.id, `Balance updated by ${adminName}`]
    );

    await pool.query(
      `INSERT INTO account_balance_change_logs (user_id, payment_type, old_value, user_name, new_value, group_id, fees, gross_amount, net_amount, comment, change_date)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7, $8, NOW())`,
      [
        user.id,
        `Balance updated by ${adminName}`,
        currentGroupBalance,
        user.user_name,
        currentGroupBalance + accountBalance,
        id,
        accountBalance,
        comment.trim() || null,
      ]
    );

    await pool.query(
      `UPDATE group_account_balances SET balance = balance + $1, last_updated = NOW() WHERE id = $2`,
      [accountBalance, groupBalance.rows[0].id]
    );

    await pool.query(
      `UPDATE users SET is_active = true, is_free_user = false WHERE id = $1`,
      [user.id]
    );

    const groupCurrentBalance = currentBal - accountBalance;

    res.json({ success: true, message: `Group current balance is ${groupCurrentBalance}` });
  } catch (err) {
    console.error("Update group account balance error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/investments", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);

    const groupResult = await pool.query(`SELECT id FROM groups WHERE id = $1`, [id]);
    if (groupResult.rows.length === 0) {
      res.status(404).json({ message: "Group not found" });
      return;
    }

    const groupCampaignsResult = await pool.query(
      `SELECT c.id, c.name, c.image_file_name as "imageFileName", c.stage
       FROM campaign_groups cg
       JOIN campaigns c ON cg.campaigns_id = c.id
       WHERE cg.groups_id = $1`,
      [id]
    );

    const groupCampaignIds = groupCampaignsResult.rows.map((c: any) => c.id);

    const allActiveCampaigns = await pool.query(
      `SELECT id, name, image_file_name as "imageFileName", stage
       FROM campaigns
       WHERE is_active = true AND (group_for_private_access_id IS NULL)`
    );

    const adminUser = (req as any).user;
    const isAdmin = adminUser?.role?.toLowerCase() === "admin" || adminUser?.role?.toLowerCase() === "superadmin" || adminUser?.isSuperAdmin;

    const publicCampaigns = allActiveCampaigns.rows
      .filter((c: any) => PUBLIC_STAGES.includes(c.stage))
      .filter((c: any) => !groupCampaignIds.includes(c.id));

    const completedCampaigns = isAdmin
      ? allActiveCampaigns.rows
          .filter((c: any) => c.stage === 3)
          .filter((c: any) => !groupCampaignIds.includes(c.id))
      : [];

    const mapStage = (c: any) => ({
      ...c,
      stage: STAGE_LABELS[c.stage] || String(c.stage),
    });

    res.json({
      groupCampaigns: groupCampaignsResult.rows.map(mapStage),
      publicCampaigns: publicCampaigns.map(mapStage),
      completedCampaigns: isAdmin ? completedCampaigns.map(mapStage) : null,
    });
  } catch (err) {
    console.error("Get group investments error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/:id/investments", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const campaignIds: number[] = req.body || [];

    const groupResult = await pool.query(`SELECT id, name, identifier, picture_file_name FROM groups WHERE id = $1`, [id]);
    if (groupResult.rows.length === 0) {
      res.status(404).json({ message: "Group not found" });
      return;
    }

    await pool.query(`DELETE FROM campaign_groups WHERE groups_id = $1`, [id]);

    if (campaignIds.length > 0) {
      const insertValues: string[] = [];
      const insertParams: number[] = [];
      let paramIdx = 1;
      for (const cid of campaignIds) {
        if (cid != null) {
          insertValues.push(`($${paramIdx}, $${paramIdx + 1})`);
          insertParams.push(cid, id);
          paramIdx += 2;
        }
      }
      if (insertValues.length > 0) {
        await pool.query(
          `INSERT INTO campaign_groups (campaigns_id, groups_id) VALUES ${insertValues.join(", ")}`,
          insertParams
        );
      }
    }

    res.status(200).send();
  } catch (err) {
    console.error("Save group investments error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

async function processGroupMembers(jsonData: string | null, ownerId?: string): Promise<any[]> {
  if (!jsonData) return [];

  let members: any[];
  try {
    members = JSON.parse(jsonData);
  } catch {
    return [];
  }

  if (!members || members.length === 0) return [];

  const userIds = members.map((m: any) => m.UserId || m.userId).filter(Boolean);
  if (userIds.length === 0) return [];

  const placeholders = userIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
  const usersResult = await pool.query(
    `SELECT id, COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') as full_name, picture_file_name
     FROM users WHERE id IN (${placeholders})`,
    userIds
  );

  const userLookup: Record<string, any> = {};
  for (const u of usersResult.rows) {
    userLookup[u.id] = u;
  }

  return members.map((m: any) => {
    const userId = m.UserId || m.userId;
    const user = userLookup[userId];
    const result: any = {
      userId,
      roleAndTitle: m.RoleAndTitle || m.roleAndTitle,
      description: m.Description || m.description,
      fullName: user?.full_name || null,
      pictureFileName: user?.picture_file_name || null,
    };

    if (m.LinkedInUrl !== undefined || m.linkedInUrl !== undefined) {
      result.linkedInUrl = m.LinkedInUrl || m.linkedInUrl;
      result.isOwner = ownerId ? userId === ownerId : false;
    }

    if (m.MemberSince !== undefined || m.memberSince !== undefined) {
      result.memberSince = m.MemberSince || m.memberSince;
    }

    return result;
  });
}

async function enrichMembers(members: any[], ownerId?: string): Promise<any[]> {
  return processGroupMembers(JSON.stringify(members), ownerId);
}

function handleBase64Image(pictureFileName: string | null | undefined, oldFileName: string | null): string {
  if (!pictureFileName) return "";

  if (pictureFileName.startsWith("data:")) {
    const matches = pictureFileName.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return oldFileName || "";

    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const base64Data = matches[2];
    const newFileName = crypto.randomUUID() + "." + ext;

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const filePath = path.join(UPLOADS_DIR, newFileName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));

    return `/api/uploads/${newFileName}`;
  }

  return pictureFileName;
}

export default router;
