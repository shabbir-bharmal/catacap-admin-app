using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedPendingGrantsIdColumnOnRecommendationsAndAccountBalanceChangeLogs : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PendingGrantsId",
                table: "Recommendations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PendingGrantsId",
                table: "AccountBalanceChangeLogs",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Recommendations_PendingGrantsId",
                table: "Recommendations",
                column: "PendingGrantsId");

            migrationBuilder.CreateIndex(
                name: "IX_AccountBalanceChangeLogs_PendingGrantsId",
                table: "AccountBalanceChangeLogs",
                column: "PendingGrantsId");

            migrationBuilder.AddForeignKey(
                name: "FK_AccountBalanceChangeLogs_PendingGrants_PendingGrantsId",
                table: "AccountBalanceChangeLogs",
                column: "PendingGrantsId",
                principalTable: "PendingGrants",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Recommendations_PendingGrants_PendingGrantsId",
                table: "Recommendations",
                column: "PendingGrantsId",
                principalTable: "PendingGrants",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AccountBalanceChangeLogs_PendingGrants_PendingGrantsId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropForeignKey(
                name: "FK_Recommendations_PendingGrants_PendingGrantsId",
                table: "Recommendations");

            migrationBuilder.DropIndex(
                name: "IX_Recommendations_PendingGrantsId",
                table: "Recommendations");

            migrationBuilder.DropIndex(
                name: "IX_AccountBalanceChangeLogs_PendingGrantsId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "PendingGrantsId",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "PendingGrantsId",
                table: "AccountBalanceChangeLogs");
        }
    }
}
