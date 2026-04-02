using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedInvestmentTagAndInvestmentTagMappingTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InvestmentTag",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Tag = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentTag", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InvestmentTagMapping",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TagId = table.Column<int>(type: "int", nullable: false),
                    CampaignId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentTagMapping", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvestmentTagMapping_Campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "Campaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InvestmentTagMapping_InvestmentTag_TagId",
                        column: x => x.TagId,
                        principalTable: "InvestmentTag",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentTagMapping_CampaignId",
                table: "InvestmentTagMapping",
                column: "CampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentTagMapping_TagId",
                table: "InvestmentTagMapping",
                column: "TagId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvestmentTagMapping");

            migrationBuilder.DropTable(
                name: "InvestmentTag");
        }
    }
}
