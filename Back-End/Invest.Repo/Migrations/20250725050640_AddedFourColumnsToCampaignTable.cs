using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedFourColumnsToCampaignTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ExpectedTotal",
                table: "Campaigns",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasExistingInvestors",
                table: "Campaigns",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MissionAndVision",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonalizedThankYou",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExpectedTotal",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "HasExistingInvestors",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "MissionAndVision",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "PersonalizedThankYou",
                table: "Campaigns");
        }
    }
}
