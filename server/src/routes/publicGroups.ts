import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const groupsResult = await pool.query(
      `SELECT g.id, g.name, g.identifier, g.description, g.website, g.is_approuve_required,
              g.is_deactivated, g.picture_file_name, g.original_balance, g.is_corporate_group,
              g.is_private_group, g.champions_and_catalysts, g.leaders, g.background_picture_file_name,
              g.our_why_description, g.video_link, g.did_you_know, g.featured_group, g.group_themes,
              g.meta_title, g.meta_description, g.owner_id
       FROM groups g
       WHERE (g.is_deleted IS NULL OR g.is_deleted = false)`
    );

    if (groupsResult.rows.length === 0) {
      res.json([]);
      return;
    }

    const groups = groupsResult.rows;
    const groupIds = groups.map((g: any) => g.id);

    let campaignsByGroup: Record<number, any[]> = {};
    if (groupIds.length > 0) {
      const placeholders = groupIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const cgResult = await pool.query(
        `SELECT cg.groups_id, c.id, c.name, c.stage, c.is_active, c.image_file_name
         FROM campaign_groups cg
         JOIN campaigns c ON cg.campaigns_id = c.id
         WHERE cg.groups_id IN (${placeholders})`,
        groupIds
      );
      for (const row of cgResult.rows) {
        if (!campaignsByGroup[row.groups_id]) campaignsByGroup[row.groups_id] = [];
        campaignsByGroup[row.groups_id].push({
          id: row.id,
          name: row.name,
          stage: row.stage,
          isActive: row.is_active,
          imageFileName: row.image_file_name,
        });
      }
    }

    const data = groups.map((g: any) => ({
      id: g.id,
      name: g.name,
      identifier: g.identifier,
      description: g.description,
      website: g.website,
      isApprouveRequired: g.is_approuve_required,
      isDeactivated: g.is_deactivated,
      pictureFileName: g.picture_file_name,
      originalBalance: g.original_balance ? parseFloat(g.original_balance) : null,
      isCorporateGroup: g.is_corporate_group,
      isPrivateGroup: g.is_private_group,
      backgroundPictureFileName: g.background_picture_file_name,
      ourWhyDescription: g.our_why_description,
      videoLink: g.video_link,
      didYouKnow: g.did_you_know,
      featuredGroup: g.featured_group,
      groupThemes: g.group_themes,
      metaTitle: g.meta_title,
      metaDescription: g.meta_description,
      campaigns: (campaignsByGroup[g.id] || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        stage: c.stage,
        isActive: c.isActive,
        imageFileName: c.imageFileName,
      })),
      privateCampaigns: [],
    }));

    res.json(data);
  } catch (err) {
    console.error("Get all groups error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
