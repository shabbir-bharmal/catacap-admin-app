using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class UpdateRecommendationTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "Recommendations",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Recommendations_UserId",
                table: "Recommendations",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Recommendations_AspNetUsers_UserId",
                table: "Recommendations",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Recommendations_AspNetUsers_UserId",
                table: "Recommendations");

            migrationBuilder.DropIndex(
                name: "IX_Recommendations_UserId",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Recommendations");
        }
    }
}
