using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedFieldsOnCampaignTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactInfoAddress2",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImpactAssetsFundingStatus",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvestmentRole",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "State",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "Campaigns",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ZipCode",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Campaigns_UserId",
                table: "Campaigns",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Campaigns_AspNetUsers_UserId",
                table: "Campaigns",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Campaigns_AspNetUsers_UserId",
                table: "Campaigns");

            migrationBuilder.DropIndex(
                name: "IX_Campaigns_UserId",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "City",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "ContactInfoAddress2",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "ImpactAssetsFundingStatus",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "InvestmentRole",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "State",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "ZipCode",
                table: "Campaigns");
        }
    }
}
