using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class UpdatedUserInvestmentsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "UserId",
                table: "UserInvestments",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AddColumn<int>(
                name: "CampaignId",
                table: "UserInvestments",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserInvestments_CampaignId",
                table: "UserInvestments",
                column: "CampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_UserInvestments_UserId",
                table: "UserInvestments",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_UserInvestments_AspNetUsers_UserId",
                table: "UserInvestments",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_UserInvestments_Campaigns_CampaignId",
                table: "UserInvestments",
                column: "CampaignId",
                principalTable: "Campaigns",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UserInvestments_AspNetUsers_UserId",
                table: "UserInvestments");

            migrationBuilder.DropForeignKey(
                name: "FK_UserInvestments_Campaigns_CampaignId",
                table: "UserInvestments");

            migrationBuilder.DropIndex(
                name: "IX_UserInvestments_CampaignId",
                table: "UserInvestments");

            migrationBuilder.DropIndex(
                name: "IX_UserInvestments_UserId",
                table: "UserInvestments");

            migrationBuilder.DropColumn(
                name: "CampaignId",
                table: "UserInvestments");

            migrationBuilder.AlterColumn<string>(
                name: "UserId",
                table: "UserInvestments",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);
        }
    }
}
