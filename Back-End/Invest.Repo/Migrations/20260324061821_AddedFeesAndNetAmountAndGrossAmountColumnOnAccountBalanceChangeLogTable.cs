using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedFeesAndNetAmountAndGrossAmountColumnOnAccountBalanceChangeLogTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Fees",
                table: "AccountBalanceChangeLogs",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "GrossAmount",
                table: "AccountBalanceChangeLogs",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "NetAmount",
                table: "AccountBalanceChangeLogs",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Fees",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "GrossAmount",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "NetAmount",
                table: "AccountBalanceChangeLogs");
        }
    }
}
