using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedLogoAndHeroImageAndPitchDeckColumnOnInvestmentRequestTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HeroImage",
                table: "InvestmentRequest",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Logo",
                table: "InvestmentRequest",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PitchDeck",
                table: "InvestmentRequest",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HeroImage",
                table: "InvestmentRequest");

            migrationBuilder.DropColumn(
                name: "Logo",
                table: "InvestmentRequest");

            migrationBuilder.DropColumn(
                name: "PitchDeck",
                table: "InvestmentRequest");
        }
    }
}
