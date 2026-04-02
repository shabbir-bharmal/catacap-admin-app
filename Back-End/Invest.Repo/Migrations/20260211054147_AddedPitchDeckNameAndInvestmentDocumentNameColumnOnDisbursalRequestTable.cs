using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedPitchDeckNameAndInvestmentDocumentNameColumnOnDisbursalRequestTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InvestmentDocumentName",
                table: "DisbursalRequest",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PitchDeckName",
                table: "DisbursalRequest",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InvestmentDocumentName",
                table: "DisbursalRequest");

            migrationBuilder.DropColumn(
                name: "PitchDeckName",
                table: "DisbursalRequest");
        }
    }
}
