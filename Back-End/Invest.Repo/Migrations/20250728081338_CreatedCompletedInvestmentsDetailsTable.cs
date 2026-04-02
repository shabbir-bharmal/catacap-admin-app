using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedCompletedInvestmentsDetailsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CompletedInvestmentsDetails",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DateOfLastInvestment = table.Column<DateTime>(type: "date", nullable: false),
                    CampaignId = table.Column<int>(type: "int", nullable: false),
                    InvestmentDetail = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    TypeOfInvestment = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Donors = table.Column<int>(type: "int", nullable: true),
                    Themes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompletedInvestmentsDetails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompletedInvestmentsDetails_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CompletedInvestmentsDetails_Campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "Campaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentsDetails_CampaignId",
                table: "CompletedInvestmentsDetails",
                column: "CampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentsDetails_CreatedBy",
                table: "CompletedInvestmentsDetails",
                column: "CreatedBy");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CompletedInvestmentsDetails");
        }
    }
}
