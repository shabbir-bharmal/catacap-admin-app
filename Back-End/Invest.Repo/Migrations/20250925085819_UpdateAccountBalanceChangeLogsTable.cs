using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class UpdateAccountBalanceChangeLogsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrants_AspNetUsers_RejectedBy",
                table: "PendingGrants");

            migrationBuilder.AddColumn<int>(
                name: "CampaignId",
                table: "AccountBalanceChangeLogs",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AccountBalanceChangeLogs_CampaignId",
                table: "AccountBalanceChangeLogs",
                column: "CampaignId");

            migrationBuilder.AddForeignKey(
                name: "FK_AccountBalanceChangeLogs_Campaigns_CampaignId",
                table: "AccountBalanceChangeLogs",
                column: "CampaignId",
                principalTable: "Campaigns",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrants_AspNetUsers_RejectedBy",
                table: "PendingGrants",
                column: "RejectedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AccountBalanceChangeLogs_Campaigns_CampaignId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrants_AspNetUsers_RejectedBy",
                table: "PendingGrants");

            migrationBuilder.DropIndex(
                name: "IX_AccountBalanceChangeLogs_CampaignId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "CampaignId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrants_AspNetUsers_RejectedBy",
                table: "PendingGrants",
                column: "RejectedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
