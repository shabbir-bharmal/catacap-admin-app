using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddCampaignColumn : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CampaignId",
                table: "PendingGrants",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PendingGrants_CampaignId",
                table: "PendingGrants",
                column: "CampaignId");

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrants_Campaigns_CampaignId",
                table: "PendingGrants",
                column: "CampaignId",
                principalTable: "Campaigns",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrants_Campaigns_CampaignId",
                table: "PendingGrants");

            migrationBuilder.DropIndex(
                name: "IX_PendingGrants_CampaignId",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "CampaignId",
                table: "PendingGrants");
        }
    }
}
