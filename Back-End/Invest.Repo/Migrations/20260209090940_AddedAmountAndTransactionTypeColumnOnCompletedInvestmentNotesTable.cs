using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedAmountAndTransactionTypeColumnOnCompletedInvestmentNotesTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "NewAmount",
                table: "CompletedInvestmentNotes",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "OldAmount",
                table: "CompletedInvestmentNotes",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "TransactionType",
                table: "CompletedInvestmentNotes",
                type: "int",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NewAmount",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropColumn(
                name: "OldAmount",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropColumn(
                name: "TransactionType",
                table: "CompletedInvestmentNotes");
        }
    }
}
