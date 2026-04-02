using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedAssociatedFundIdAndIsPartOfFundColumnToCampaignTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AssociatedFundId",
                table: "Campaigns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPartOfFund",
                table: "Campaigns",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssociatedFundId",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "IsPartOfFund",
                table: "Campaigns");
        }
    }
}
