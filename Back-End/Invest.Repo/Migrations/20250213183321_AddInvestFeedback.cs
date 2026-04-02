using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddInvestFeedback : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InvestmentFeedback",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Themes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AdditionalThemes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    InterestedInvestmentType = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RiskTolerance = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentFeedback", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvestmentFeedback_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentFeedback_UserId",
                table: "InvestmentFeedback",
                column: "UserId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvestmentFeedback");
        }
    }
}
